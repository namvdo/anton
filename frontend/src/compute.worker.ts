import {
  createComputeFailure,
  createComputeSuccess,
  parseComputeRequest,
} from './protocol/computeProtocol';
import {
  PERIODIC_SUPPORT_FILTER_SETTINGS,
  continuousUlamIntegrationTime,
} from './config/numericalSettings';
import type { ComputeTaskKind } from './protocol/computeProtocol';
import type {
  ComputeTaskPayload,
  GeometricOffsetBatchComputePayload,
  GeometricOffsetBatchComputeResult,
  GeometricOffsetsComputePayload,
  InverseGeometricOffsetBatchComputePayload,
  InverseGeometricOffsetBatchComputeResult,
  InverseGeometricOffsetsComputePayload,
  ManifoldComputePayload,
  ManifoldComputeResult,
  PeriodicComputePayload,
  PeriodicComputeResult,
  SupportGrid,
  UlamComputePayload,
  UlamComputeResult,
  UlamTransitionsPayload,
} from './protocol/computeContracts';
import {
  computeOpenGeometricOffsetPreimages,
  projectGeometricOffsetBoundary,
} from './utils/geometricOffsetCompute';
import type {
  BistWasmModule,
  GeometricOffsetResult,
  InverseOffsetResult,
  PeriodicOrbit,
  PeriodicSearchSettings,
  UlamBox,
  UlamTransition,
  UnknownRecord,
  ViewRange,
} from './types/domain';

const MIS_SUPPORT_THRESHOLD = PERIODIC_SUPPORT_FILTER_SETTINGS.supportThreshold;
const MIS_FILTER_SUBDIVISIONS = PERIODIC_SUPPORT_FILTER_SETTINGS.subdivisions;
const MIS_FILTER_POINTS_PER_BOX = PERIODIC_SUPPORT_FILTER_SETTINGS.pointsPerBox;

interface UlamComputerLike {
  free(): void;
  get_grid_boxes(): unknown;
  get_invariant_measure(): unknown;
  get_left_eigenvector(): unknown;
  get_box_index(x: number, y: number): number;
  get_transitions(index: number): unknown;
}

interface PeriodicSystemLike {
  free(): void;
  getPeriodicOrbits(): unknown;
}

interface PeriodicCache {
  dynamicSystem: 'henon';
  params: Pick<PeriodicComputePayload['params'], 'a' | 'b' | 'epsilon' | 'maxPeriod'>;
  viewRange: ViewRange;
  periodicSearchSettings: Pick<PeriodicSearchSettings, 'gridSize' | 'thetaGridSize' | 'residualThreshold'>;
  allOrbits: PeriodicOrbit[];
}

let wasmPromise: Promise<BistWasmModule> | null = null;
let cachedUlamComputer: UlamComputerLike | null = null;
let cachedPeriodicComputation: PeriodicCache | null = null;

const ensureWasm = async (): Promise<BistWasmModule> => {
  if (!wasmPromise) {
    wasmPromise = import('../pkg/bist').then(async (mod) => {
      await mod.default();
      return mod;
    });
  }
  return wasmPromise;
};

const cleanupCachedUlamComputer = (): void => {
  if (cachedUlamComputer && typeof cachedUlamComputer.free === 'function') {
    cachedUlamComputer.free();
  }
  cachedUlamComputer = null;
};

const getSupportIndex = (x: number, y: number, support: SupportGrid | null): number => {
  if (!support) return -1;
  const { xMin, xMax, yMin, yMax, subdivisions } = support;
  if (x < xMin || x > xMax || y < yMin || y > yMax) return -1;

  const dx = (xMax - xMin) / subdivisions;
  const dy = (yMax - yMin) / subdivisions;
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || dx <= 0 || dy <= 0) {
    return -1;
  }

  let ix = Math.floor((x - xMin) / dx);
  let iy = Math.floor((y - yMin) / dy);
  if (ix >= subdivisions) ix -= 1;
  if (iy >= subdivisions) iy -= 1;
  if (ix < 0 || iy < 0) return -1;
  return iy * subdivisions + ix;
};

const isSupportedPoint = (x: number, y: number, support: SupportGrid | null): boolean => {
  if (!support) return true;
  const idx = getSupportIndex(x, y, support);
  if (idx < 0) return false;
  return (support.invariantMeasure?.[idx] ?? 0) > support.threshold;
};

const filterOrbitsBySupport = (orbits: PeriodicOrbit[], support: SupportGrid | null): PeriodicOrbit[] => {
  return (orbits || []).filter((orbit) =>
    (orbit.points || []).every(([x, y]) => isSupportedPoint(x, y, support))
  );
};

const sameNumber = (a?: number, b?: number): boolean => Math.abs((a ?? 0) - (b ?? 0)) < 1e-12;

const sameViewRange = (a?: ViewRange, b?: ViewRange): boolean => (
  sameNumber(a?.xMin, b?.xMin)
  && sameNumber(a?.xMax, b?.xMax)
  && sameNumber(a?.yMin, b?.yMin)
  && sameNumber(a?.yMax, b?.yMax)
);

const samePeriodicSearchSettings = (
  a?: Partial<PeriodicSearchSettings>,
  b?: Partial<PeriodicSearchSettings>,
): boolean => (
  sameNumber(a?.gridSize, b?.gridSize)
  && sameNumber(a?.thetaGridSize, b?.thetaGridSize)
  && sameNumber(a?.residualThreshold, b?.residualThreshold)
);

const canContinueHenonPeriodic = (wasm: BistWasmModule, payload: PeriodicComputePayload): boolean => {
  const previous = cachedPeriodicComputation;
  return (
    payload.dynamicSystem === 'henon'
    && payload.periodicSearchSettings?.useContinuation === true
    && previous?.dynamicSystem === 'henon'
    && typeof wasm.continueBoundaryHenonOrbits === 'function'
    && (previous.allOrbits || []).length > 0
    && previous.params?.maxPeriod === payload.params?.maxPeriod
    && sameViewRange(previous.viewRange, payload.viewRange)
    && samePeriodicSearchSettings(previous.periodicSearchSettings, payload.periodicSearchSettings)
  );
};

const describePeriodicContinuationSkip = (wasm: BistWasmModule, payload: PeriodicComputePayload): string | null => {
  const previous = cachedPeriodicComputation;
  if (payload.dynamicSystem !== 'henon') return 'system is not Hénon';
  if (payload.periodicSearchSettings?.useContinuation !== true) return 'continuation is disabled';
  if (!previous) return 'no previous Hénon orbit cache';
  if (previous.dynamicSystem !== 'henon') return 'previous cache is not Hénon';
  if (typeof wasm.continueBoundaryHenonOrbits !== 'function') return 'WASM continuation export is unavailable';
  if ((previous.allOrbits || []).length === 0) return 'previous orbit cache is empty';
  if (previous.params?.maxPeriod !== payload.params?.maxPeriod) return 'max period changed';
  if (!sameViewRange(previous.viewRange, payload.viewRange)) return 'view range changed';
  if (!samePeriodicSearchSettings(previous.periodicSearchSettings, payload.periodicSearchSettings)) {
    return 'periodic search settings changed';
  }
  return null;
};

const computePeriodic = async (payload: PeriodicComputePayload): Promise<PeriodicComputeResult> => {
  const wasm = await ensureWasm();
  const { dynamicSystem, params, viewRange, periodicSearchSettings } = payload;

  if (dynamicSystem === 'custom' || dynamicSystem === 'custom_ode') {
    return {
      orbits: [],
      support: null,
      unavailableReason: 'Periodic-orbit search is not available for user-defined systems yet.'
    };
  }

  if (dynamicSystem === 'duffing_ode') {
    return {
      orbits: [],
      support: null,
      unavailableReason: 'Periodic-orbit search is not available for continuous systems yet.'
    };
  }

  let system: PeriodicSystemLike | null = null;
  let supportComputer: UlamComputerLike | null = null;

  try {
    let allOrbits: PeriodicOrbit[] | null = null;
    let usedContinuation = false;

    if (canContinueHenonPeriodic(wasm, payload)) {
      try {
        const previous = cachedPeriodicComputation;
        if (!previous) throw new Error('Continuation cache disappeared before use.');
        const continued = wasm.continueBoundaryHenonOrbits(
          previous.allOrbits,
          previous.params.a,
          previous.params.b,
          previous.params.epsilon,
          params.a,
          params.b,
          params.epsilon,
          params.maxPeriod,
          periodicSearchSettings.residualThreshold
        ) as PeriodicOrbit[];
        if ((continued || []).length > 0) {
          allOrbits = continued;
          usedContinuation = true;
          console.log(
            `Periodic orbits: used continuation from a=${previous.params.a}, b=${previous.params.b}, ε=${previous.params.epsilon} to a=${params.a}, b=${params.b}, ε=${params.epsilon}`
          );
        }
      } catch (err) {
        console.warn('Periodic orbit continuation failed; falling back to full search.', err);
      }
    } else if (dynamicSystem === 'henon') {
      console.log(`Periodic orbits: running full grid search (${describePeriodicContinuationSkip(wasm, payload)})`);
    }

    if (!allOrbits && dynamicSystem === 'duffing') {
      system = new wasm.DuffingSystemWasm(params.a, params.b, params.maxPeriod);
    } else if (!allOrbits) {
      system = new wasm.BoundaryHenonSystemWasm(
        params.a,
        params.b,
        params.epsilon,
        params.maxPeriod,
        viewRange.xMin,
        viewRange.xMax,
        viewRange.yMin,
        viewRange.yMax,
        periodicSearchSettings.gridSize,
        periodicSearchSettings.thetaGridSize,
        periodicSearchSettings.residualThreshold
      );
    }

    if (!allOrbits) {
      if (!system) throw new Error('Periodic system was not initialized.');
      allOrbits = system.getPeriodicOrbits() as PeriodicOrbit[];
    }

    let orbits = allOrbits;
    let support = null;

    if (dynamicSystem === 'henon') {
      supportComputer = new wasm.UlamComputer(
        params.a,
        params.b,
        MIS_FILTER_SUBDIVISIONS,
        MIS_FILTER_POINTS_PER_BOX,
        params.epsilon,
        viewRange.xMin,
        viewRange.xMax,
        viewRange.yMin,
        viewRange.yMax
      );

      support = {
        invariantMeasure: supportComputer.get_invariant_measure() as number[],
        subdivisions: MIS_FILTER_SUBDIVISIONS,
        xMin: viewRange.xMin,
        xMax: viewRange.xMax,
        yMin: viewRange.yMin,
        yMax: viewRange.yMax,
        threshold: MIS_SUPPORT_THRESHOLD
      };

      orbits = filterOrbitsBySupport(orbits, support);
    }

    if (dynamicSystem === 'henon') {
      cachedPeriodicComputation = {
        dynamicSystem,
        params: {
          a: params.a,
          b: params.b,
          epsilon: params.epsilon,
          maxPeriod: params.maxPeriod
        },
        viewRange: { ...viewRange },
        periodicSearchSettings: {
          gridSize: periodicSearchSettings.gridSize,
          thetaGridSize: periodicSearchSettings.thetaGridSize,
          residualThreshold: periodicSearchSettings.residualThreshold
        },
        allOrbits
      };
    } else {
      cachedPeriodicComputation = null;
    }

    return { orbits, support, usedContinuation };
  } finally {
    if (supportComputer && typeof supportComputer.free === 'function') {
      supportComputer.free();
    }
    if (system && typeof system.free === 'function') {
      system.free();
    }
  }
};

const computeManifolds = async (payload: ManifoldComputePayload): Promise<ManifoldComputeResult> => {
  const wasm = await ensureWasm();
  const {
    dynamicSystem,
    params,
    viewRange,
    periodicOrbits,
    customEquations,
    customParams,
    showStableManifold,
    showUnstableManifold,
    intersectionThreshold,
    maximumPointSpacing,
  } = payload;

  if (dynamicSystem === 'duffing') {
    const result = wasm.compute_duffing_manifold_simple(
      params.a,
      params.b,
      params.epsilon,
      viewRange.xMin,
      viewRange.xMax,
      viewRange.yMin,
      viewRange.yMax
    );
    return {
      manifolds: result.manifolds || [],
      stableManifolds: [],
      fixedPoints: result.fixed_points || [],
      intersections: []
    };
  }

  if (dynamicSystem === 'custom') {
    if ((periodicOrbits || []).length > 0) {
      if (showStableManifold || showUnstableManifold) {
        const result = wasm.compute_stable_and_unstable_manifolds_user_defined(
          customEquations.xEq,
          customEquations.yEq,
          customParams,
          params.epsilon,
          viewRange.xMin,
          viewRange.xMax,
          viewRange.yMin,
          viewRange.yMax,
          periodicOrbits,
          intersectionThreshold,
          maximumPointSpacing,
        );
        return {
          manifolds: result.unstable_manifolds || [],
          stableManifolds: result.stable_manifolds || [],
          fixedPoints: result.fixed_points || [],
          intersections: result.intersections || []
        };
      }
      return {
        manifolds: [],
        stableManifolds: [],
        fixedPoints: [],
        intersections: []
      };
    }

    const result = wasm.compute_user_defined_manifold(
      customEquations.xEq,
      customEquations.yEq,
      customParams,
      params.epsilon,
      viewRange.xMin,
      viewRange.xMax,
      viewRange.yMin,
      viewRange.yMax
    );

    return {
      manifolds: result.manifolds || [],
      stableManifolds: [],
      fixedPoints: result.fixed_points || [],
      intersections: []
    };
  }

  if ((periodicOrbits || []).length > 0) {
    if (showStableManifold || showUnstableManifold) {
      const result = wasm.compute_stable_and_unstable_manifolds(
        params.a,
        params.b,
        params.epsilon,
        viewRange.xMin,
        viewRange.xMax,
        viewRange.yMin,
        viewRange.yMax,
        periodicOrbits,
        intersectionThreshold,
        maximumPointSpacing,
      );
      return {
        manifolds: result.unstable_manifolds || [],
        stableManifolds: result.stable_manifolds || [],
        fixedPoints: result.fixed_points || [],
        intersections: result.intersections || []
      };
    }
    return {
      manifolds: [],
      stableManifolds: [],
      fixedPoints: [],
      intersections: []
    };
  }

  const result = wasm.compute_manifold_simple(
    params.a,
    params.b,
    params.epsilon,
    viewRange.xMin,
    viewRange.xMax,
    viewRange.yMin,
    viewRange.yMax,
    maximumPointSpacing,
  );

  return {
    manifolds: result.manifolds || [],
    stableManifolds: [],
    fixedPoints: result.fixed_points || [],
    intersections: []
  };
};

const buildUlamComputer = (wasm: BistWasmModule, payload: UlamComputePayload): UlamComputerLike => {
  const {
    dynamicSystem,
    params,
    viewRange,
    ulam,
    customEquations,
    customParams
  } = payload;

  if (dynamicSystem === 'custom') {
    return new wasm.UlamComputerUserDefined(
      customEquations.xEq,
      customEquations.yEq,
      customParams,
      ulam.subdivisions,
      ulam.pointsPerBox,
      ulam.epsilon,
      viewRange.xMin,
      viewRange.xMax,
      viewRange.yMin,
      viewRange.yMax
    );
  }

  if (dynamicSystem === 'custom_ode') {
    const capitalT = continuousUlamIntegrationTime(params.h);
    return new wasm.UlamComputerContinuousUserDefined(
      customEquations.xEq,
      customEquations.yEq,
      customParams,
      capitalT,
      ulam.subdivisions,
      ulam.pointsPerBox,
      ulam.epsilon,
      viewRange.xMin,
      viewRange.xMax,
      viewRange.yMin,
      viewRange.yMax
    );
  }

  if (dynamicSystem === 'duffing_ode') {
    const capitalT = continuousUlamIntegrationTime(params.h);
    return new wasm.UlamComputerContinuous(
      params.delta,
      capitalT,
      ulam.subdivisions,
      ulam.pointsPerBox,
      ulam.epsilon,
      viewRange.xMin,
      viewRange.xMax,
      viewRange.yMin,
      viewRange.yMax
    );
  }

  return new wasm.UlamComputer(
    params.a,
    params.b,
    ulam.subdivisions,
    ulam.pointsPerBox,
    ulam.epsilon,
    viewRange.xMin,
    viewRange.xMax,
    viewRange.yMin,
    viewRange.yMax
  );
};

const computeUlam = async (payload: UlamComputePayload): Promise<UlamComputeResult> => {
  const wasm = await ensureWasm();
  cleanupCachedUlamComputer();
  cachedUlamComputer = buildUlamComputer(wasm, payload);

  const boxes = cachedUlamComputer.get_grid_boxes() as UlamBox[];
  const invariantMeasure = cachedUlamComputer.get_invariant_measure() as number[];
  const leftEigenvector = cachedUlamComputer.get_left_eigenvector() as number[];

  let currentBoxIndex = -1;
  if (payload.currentPoint) {
    currentBoxIndex = cachedUlamComputer.get_box_index(
      payload.currentPoint.x,
      payload.currentPoint.y
    );
  }

  return {
    boxes,
    invariantMeasure,
    leftEigenvector,
    currentBoxIndex
  };
};

const getUlamTransitions = async (payload: UlamTransitionsPayload): Promise<UlamTransition[]> => {
  if (!cachedUlamComputer) {
    return [];
  }
  return cachedUlamComputer.get_transitions(payload.index) as UlamTransition[] || [];
};

const computeGeometricOffsets = async (
  payload: GeometricOffsetsComputePayload,
): Promise<GeometricOffsetResult> => {
  const { boundary, params } = payload;
  return projectGeometricOffsetBoundary(boundary, params.epsilon);
};

const computeGeometricOffsetBatch = async (
  payload: GeometricOffsetBatchComputePayload,
): Promise<GeometricOffsetBatchComputeResult> => {
  if (!Array.isArray(payload.contours) || payload.contours.length === 0) {
    throw new Error('A geometric-offset batch requires at least one contour.');
  }
  return {
    contours: payload.contours.map(({ id, epsilon }) => ({
      id,
      epsilon,
      result: projectGeometricOffsetBoundary(payload.boundary, epsilon),
    })),
  };
};

const computeInverseGeometricOffsets = async (
  payload: InverseGeometricOffsetsComputePayload,
): Promise<InverseOffsetResult> => {
  const hasOpenComponent = payload.levels.some(level => (
    (level.boundary_components || []).some(component => component.is_closed !== true)
  ));
  if (hasOpenComponent) {
    return computeOpenGeometricOffsetPreimages(
      payload.levels,
      payload.params,
      payload.settings.iterations,
    );
  }
  const wasm = await ensureWasm();
  if (typeof wasm.computeInverseGeometricOffsetContours !== 'function') {
    throw new Error('Inverse geometric offset export is unavailable; rebuild WebAssembly');
  }
  const { levels, params, settings } = payload;
  return wasm.computeInverseGeometricOffsetContours(
    levels,
    params.a,
    params.b,
    params.epsilon,
    settings.iterations,
    settings.positionTolerance,
    settings.normalTolerance,
    settings.maxSubdivisionDepth
  ) as InverseOffsetResult;
};

const computeInverseGeometricOffsetBatch = async (
  payload: InverseGeometricOffsetBatchComputePayload,
): Promise<InverseGeometricOffsetBatchComputeResult> => {
  const wasm = await ensureWasm();
  if (typeof wasm.computeInverseGeometricOffsetContours !== 'function') {
    throw new Error('Inverse geometric offset export is unavailable; rebuild WebAssembly');
  }
  if (!Array.isArray(payload.sources) || payload.sources.length === 0) {
    throw new Error('An inverse geometric-offset batch requires at least one source contour.');
  }
  const { params, settings } = payload;
  return {
    sources: payload.sources.map(source => {
      const hasOpenComponent = source.levels.some(level => (
        (level.boundary_components || []).some(component => component.is_closed !== true)
      ));
      return {
        id: source.id,
        result: hasOpenComponent
          ? computeOpenGeometricOffsetPreimages(source.levels, params, settings.iterations)
          : wasm.computeInverseGeometricOffsetContours(
            source.levels,
            params.a,
            params.b,
            params.epsilon,
            settings.iterations,
            source.positionTolerance,
            settings.normalTolerance,
            settings.maxSubdivisionDepth,
          ) as InverseOffsetResult,
      };
    }),
  };
};

type TaskHandler = (payload: UnknownRecord) => Promise<unknown>;

const TASK_HANDLERS: Readonly<Record<ComputeTaskKind, TaskHandler>> = Object.freeze({
  computePeriodic: payload => computePeriodic(payload as unknown as ComputeTaskPayload<'computePeriodic'>),
  computeManifolds: payload => computeManifolds(payload as unknown as ComputeTaskPayload<'computeManifolds'>),
  computeUlam: payload => computeUlam(payload as unknown as ComputeTaskPayload<'computeUlam'>),
  computeGeometricOffsets: payload => computeGeometricOffsets(
    payload as unknown as ComputeTaskPayload<'computeGeometricOffsets'>,
  ),
  computeGeometricOffsetBatch: payload => computeGeometricOffsetBatch(
    payload as unknown as ComputeTaskPayload<'computeGeometricOffsetBatch'>,
  ),
  computeInverseGeometricOffsets: payload => computeInverseGeometricOffsets(
    payload as unknown as ComputeTaskPayload<'computeInverseGeometricOffsets'>,
  ),
  computeInverseGeometricOffsetBatch: payload => computeInverseGeometricOffsetBatch(
    payload as unknown as ComputeTaskPayload<'computeInverseGeometricOffsetBatch'>,
  ),
  getUlamTransitions: payload => getUlamTransitions(
    payload as unknown as ComputeTaskPayload<'getUlamTransitions'>,
  ),
});

self.onmessage = async (event: MessageEvent<unknown>): Promise<void> => {
  let request;
  try {
    request = parseComputeRequest(event.data);
  } catch (error) {
    console.error('Rejected invalid compute request.', error);
    return;
  }

  try {
    const result = await TASK_HANDLERS[request.kind](request.payload);
    self.postMessage(createComputeSuccess(request, result));
  } catch (error) {
    self.postMessage(createComputeFailure(request, error));
  }
};
