import {
  BIST_VERSION,
  INITIAL_CUSTOM_EQUATIONS,
  INITIAL_CUSTOM_PARAMS,
  INITIAL_PARAMS,
  SYSTEM_CATALOG,
  isCustomSystem,
  systemTypeFor,
} from '../config/systems';
import {
  CONTINUOUS_BOUNDARY_FLOW_SETTINGS,
  DEFAULT_GEOMETRIC_OFFSET_SETTINGS,
  DEFAULT_MANIFOLD_SETTINGS,
  DEFAULT_ULAM_SETTINGS,
  INVERSE_OFFSET_POSITION_TOLERANCE_RULE,
  PERIODIC_SUPPORT_FILTER_SETTINGS,
  ULAM_OPERATOR_SETTINGS,
  continuousUlamIntegrationTime,
} from '../config/numericalSettings';
import {
  DEFAULT_PERIODIC_SEARCH_SETTINGS,
  normalizePeriodicSearchSettings,
  PERIODIC_SEARCH_LIMITS,
} from './periodicSearchSettings';
import { normalizeExtendedStartPoint } from './startPointState';
import { normalizeContourEpsilons } from './geometricOffsetBatch';
import { normalizeViewRange, RANGE_LIMIT } from './viewRange';
import type {
  BistParameters,
  CustomEquations,
  CustomParameter,
  CustomParameters,
  ExtendedState,
  JsonValue,
  PeriodicOrbit,
  PeriodicSearchSettings,
  SystemId,
  SystemType,
  UnknownRecord,
  ViewRange,
} from '../types/domain';

export const EXPERIMENT_SCHEMA = 'bist-experiment';
export const EXPERIMENT_SCHEMA_VERSION = 2;
export const SUPPORTED_EXPERIMENT_SCHEMA_VERSIONS = Object.freeze([1, 2]);

const SOFTWARE_NAME = 'Bounded Invariant Set Toolbox';

type WorkingTreeState = 'clean' | 'dirty' | 'unknown';
type EquationInterpretation = 'map' | 'vector_field';

interface EquationSpecification {
  interpretation: EquationInterpretation;
  x: string;
  y: string;
}

interface ExperimentSystem {
  id: SystemId;
  type: SystemType;
  equations: EquationSpecification;
  customParameters: CustomParameter[];
  boundedNoiseExtension: {
    radiusParameter: 'epsilon';
    noiseNorm: 'euclidean';
    method: 'boundary_map' | 'boundary_differential_equation';
  };
}

interface SolverConfiguration {
  trajectory: { maximumIterations: number };
  periodicSearch: PeriodicSearchSettings & {
    maximumPeriod: number;
    supportFilter: {
      subdivisions: number;
      pointsPerBox: number;
      supportThreshold: number;
    };
  };
  manifold: {
    intersectionThreshold: number;
    maximumPointSpacing: number;
    computeStable: boolean;
    computeUnstable: boolean;
  };
  continuousBoundaryFlow: {
    integrator: string;
    stepSize: number;
    initialRadius: number;
    sampleCount: number;
    stepsPerAnimationFrame: number;
    reparameterizeEveryFrames: number;
  };
  ulam: {
    subdivisions: number;
    pointsPerBox: number;
    epsilon: number;
    integrationTime: number | null;
    stationaryIterations: number;
    supportRelativeThreshold: number;
    absorptionMaximumIterations: number;
    absorptionTolerance: number;
  };
  geometricOffsets: {
    contourEpsilon: number;
    contourEpsilons: number[];
    inverseIterations: number;
    inversePositionTolerance: number | null;
    inversePositionToleranceRule: string;
    inverseNormalTolerance: number;
    inverseMaximumSubdivisionDepth: number;
    maximumSeedPoints: number;
  };
}

export interface ExperimentConfiguration {
  system: ExperimentSystem;
  parameters: BistParameters;
  initialExtendedState: ExtendedState;
  view: {
    computationDomain: ViewRange;
    viewport: ViewRange;
  };
  solvers: SolverConfiguration;
}

type ResultOrbit = Partial<PeriodicOrbit> & UnknownRecord;

interface ExperimentResults {
  periodic: {
    orbits: ResultOrbit[];
    computeMethod: string | null;
    support: JsonValue | undefined;
  };
  manifolds: {
    unstable: UnknownRecord[];
    stable: UnknownRecord[];
    fixedPoints: UnknownRecord[];
    intersections: UnknownRecord[];
  };
  continuousBoundary: { points: unknown[] };
  geometricOffsets: {
    direct: UnknownRecord | null | undefined;
    inverse: UnknownRecord | null | undefined;
  };
  ulam: {
    gridBoxes: UnknownRecord[];
    stationaryDensity: number[] | null;
    absorptionProbabilities: number[] | null;
  };
  parameterSweep: JsonValue | undefined;
}

interface ExperimentProvenance {
  software: { name: string; version: string };
  source: { commit: string; workingTree: WorkingTreeState };
  exportedAt: string;
  migration?: JsonValue;
}

interface BuildExperimentBundleInput {
  configuration: unknown;
  results?: unknown;
  commit?: string;
  createdAt?: string;
  exportedAt?: string;
}

const SYSTEM_IDS = new Set(
  [...SYSTEM_CATALOG.discrete, ...SYSTEM_CATALOG.continuous].map(({ id }) => id),
);

const BUILTIN_EQUATIONS: Partial<Record<SystemId, EquationSpecification>> = Object.freeze({
  henon: Object.freeze({
    interpretation: 'map',
    x: '1 - a * x^2 + y',
    y: 'b * x',
  }),
  duffing: Object.freeze({
    interpretation: 'map',
    x: 'y',
    y: '-b * x + a * y - y^3',
  }),
  duffing_ode: Object.freeze({
    interpretation: 'vector_field',
    x: 'y',
    y: 'x - x^3 - delta * y',
  }),
});

const assertJsonCompatible = (
  value: unknown,
  path = 'value',
  ancestors: WeakSet<object> = new WeakSet<object>(),
): void => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${path} must contain only finite numbers.`);
    return;
  }
  if (value === undefined) throw new TypeError(`${path} must not contain undefined.`);
  if (typeof value !== 'object') {
    throw new TypeError(`${path} contains a value that cannot be represented in JSON.`);
  }
  if (ancestors.has(value)) throw new TypeError(`${path} contains a circular reference.`);
  ancestors.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertJsonCompatible(entry, `${path}[${index}]`, ancestors));
  } else {
    Object.entries(value).forEach(([name, entry]) => (
      assertJsonCompatible(entry, `${path}.${name}`, ancestors)
    ));
  }
  ancestors.delete(value);
};

const cloneJsonValue = <T>(value: T): T => {
  if (value === undefined) return value;
  assertJsonCompatible(value);
  return JSON.parse(JSON.stringify(value)) as T;
};

const requireObject = (value: unknown, label: string): UnknownRecord => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value as UnknownRecord;
};

const requireString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value.trim();
};

interface NumericBounds {
  minimum?: number;
  maximum?: number;
}

const requireFinite = (
  value: unknown,
  label: string,
  { minimum = -Infinity, maximum = Infinity }: NumericBounds = {},
): number => {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite.`);
  }
  if ((value as number) < minimum || (value as number) > maximum) {
    throw new RangeError(`${label} must lie between ${minimum} and ${maximum}.`);
  }
  return value as number;
};

const requirePositive = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be positive and finite.`);
  }
  return value as number;
};

const requireInteger = (
  value: unknown,
  label: string,
  { minimum = 1, maximum = Number.MAX_SAFE_INTEGER }: NumericBounds = {},
): number => {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new RangeError(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value as number;
};

const requireImplementedValue = <T>(value: T, implemented: T, label: string): T => {
  if (value !== implemented) {
    throw new Error(`${label} must be ${String(implemented)} in this BIST build.`);
  }
  return value;
};

const normalizeTimestamp = (value: unknown, label: string): string => {
  const text = requireString(value, label);
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) {
    throw new TypeError(`${label} must be an ISO-8601 timestamp.`);
  }
  return new Date(timestamp).toISOString();
};

const normalizeFiniteParams = (params: unknown): BistParameters => {
  const candidate = {
    ...INITIAL_PARAMS,
    ...requireObject(params, 'Parameters'),
  } as unknown as BistParameters;
  Object.entries(candidate).forEach(([name, value]) => {
    if (!Number.isFinite(value)) {
      throw new TypeError(`Parameter ${name} must be finite.`);
    }
  });
  if (candidate.epsilon < 0) {
    throw new RangeError('Parameter epsilon must be non-negative.');
  }
  if (candidate.h <= 0) {
    throw new RangeError('Parameter h must be positive.');
  }
  if (candidate.delta < 0) {
    throw new RangeError('Parameter delta must be non-negative.');
  }
  requireInteger(candidate.maxIterations, 'Parameter maxIterations');
  requireInteger(candidate.maxPeriod, 'Parameter maxPeriod', { minimum: 1, maximum: 20 });
  return candidate;
};

const normalizeSearchSettings = (settings: unknown): PeriodicSearchSettings => {
  const value = requireObject(settings, 'Periodic search settings');
  const { gridSize, thetaGridSize, residualThreshold } = value;
  if (typeof gridSize !== 'number' || !Number.isSafeInteger(gridSize)
    || gridSize < PERIODIC_SEARCH_LIMITS.gridSizeMin
    || gridSize > PERIODIC_SEARCH_LIMITS.gridSizeMax) {
    throw new RangeError('Periodic grid size is outside the supported range.');
  }
  if (typeof thetaGridSize !== 'number' || !Number.isSafeInteger(thetaGridSize)
    || thetaGridSize < PERIODIC_SEARCH_LIMITS.thetaGridSizeMin
    || thetaGridSize > PERIODIC_SEARCH_LIMITS.thetaGridSizeMax) {
    throw new RangeError('Periodic theta grid size is outside the supported range.');
  }
  if (typeof residualThreshold !== 'number' || !Number.isFinite(residualThreshold)
    || residualThreshold < PERIODIC_SEARCH_LIMITS.residualThresholdMin
    || residualThreshold > PERIODIC_SEARCH_LIMITS.residualThresholdMax) {
    throw new RangeError('Periodic residual threshold is outside the supported range.');
  }
  return normalizePeriodicSearchSettings(value as unknown as Partial<PeriodicSearchSettings>);
};

const normalizeCustomEquationsV1 = (equations: unknown): CustomEquations => {
  const candidate = {
    ...INITIAL_CUSTOM_EQUATIONS,
    ...requireObject(equations, 'Custom equations'),
  } as unknown as CustomEquations;
  (['custom', 'custom_ode'] as const).forEach((systemId) => {
    const systemEquations = requireObject(candidate[systemId], `Equations for ${systemId}`);
    if (typeof systemEquations.xEq !== 'string' || typeof systemEquations.yEq !== 'string') {
      throw new TypeError(`Equations for ${systemId} must contain xEq and yEq strings.`);
    }
  });
  return cloneJsonValue(candidate);
};

const normalizeCustomParameterList = (
  customParams: unknown,
  label = 'Custom parameters',
): CustomParameter[] => {
  if (!Array.isArray(customParams)) {
    throw new TypeError(`${label} must be an array.`);
  }
  const names = new Set();
  const normalized = customParams.map((rawEntry, index) => {
    const entry = requireObject(rawEntry, `${label} entry ${index + 1}`);
    if (typeof entry.name !== 'string' || !entry.name.trim()) {
      throw new TypeError(`${label} entry ${index + 1} needs a name.`);
    }
    const name = entry.name.trim();
    if (names.has(name)) {
      throw new TypeError(`${label} contains the duplicate name ${name}.`);
    }
    names.add(name);
    if (!Number.isFinite(entry.value)) {
      throw new TypeError(`${label} value ${name} must be finite.`);
    }
    return { name, value: entry.value as number };
  });
  return normalized;
};

const normalizeCustomParamsV1 = (customParams: unknown): CustomParameters => {
  const candidate = { ...INITIAL_CUSTOM_PARAMS, ...requireObject(customParams, 'Custom parameters') };
  return {
    custom: normalizeCustomParameterList(candidate.custom, 'Custom map parameters'),
    custom_ode: normalizeCustomParameterList(candidate.custom_ode, 'Custom ODE parameters'),
  };
};

const normalizeDomain = (range: unknown, label: string): ViewRange => {
  const rawRange = requireObject(range, label);
  ['xMin', 'xMax', 'yMin', 'yMax'].forEach((name) => {
    if (!Number.isFinite(rawRange[name])) {
      throw new TypeError(`${label} ${name} must be finite.`);
    }
  });
  const checkedRange = rawRange as unknown as ViewRange;
  if (checkedRange.xMin >= checkedRange.xMax || checkedRange.yMin >= checkedRange.yMax) {
    throw new RangeError(`${label} minimums must be smaller than maximums.`);
  }
  if (Object.values(rawRange).some(
    (coordinate) => typeof coordinate === 'number' && Math.abs(coordinate) > RANGE_LIMIT,
  )) {
    throw new RangeError(`${label} coordinates must lie within ±${RANGE_LIMIT}.`);
  }
  return normalizeViewRange(rawRange as unknown as ViewRange, RANGE_LIMIT);
};

const equationsForSystem = (
  systemId: SystemId,
  customEquations: unknown = null,
): EquationSpecification => {
  if (isCustomSystem(systemId)) {
    const equations = requireObject(customEquations, `Equations for ${systemId}`);
    return {
      interpretation: systemTypeFor(systemId) === 'continuous' ? 'vector_field' : 'map',
      x: requireString(equations.x ?? equations.xEq, `${systemId} x equation`),
      y: requireString(equations.y ?? equations.yEq, `${systemId} y equation`),
    };
  }
  const equations = BUILTIN_EQUATIONS[systemId];
  if (!equations) throw new Error(`Built-in equations are unavailable for ${systemId}.`);
  return cloneJsonValue(equations);
};

const normalizeSystem = (
  system: unknown,
  { requireAllFields = false }: { requireAllFields?: boolean } = {},
): ExperimentSystem => {
  const value = requireObject(system, 'System');
  const idText = requireString(value.id, 'System id');
  if (!SYSTEM_IDS.has(idText as SystemId)) {
    throw new TypeError(`Unsupported dynamical system: ${idText}`);
  }
  const id = idText as SystemId;
  const type = systemTypeFor(id);
  if (value.type !== undefined && value.type !== type) {
    throw new TypeError(`System ${id} must have type ${type}.`);
  }
  if (requireAllFields) {
    requireObject(value.equations, `Equations for ${id}`);
    if (!Array.isArray(value.customParameters)) {
      throw new TypeError(`Custom parameters for ${id} must be an array.`);
    }
    const extension = requireObject(
      value.boundedNoiseExtension,
      `Bounded-noise extension for ${id}`,
    );
    const expectedMethod = type === 'discrete'
      ? 'boundary_map'
      : 'boundary_differential_equation';
    if (extension.radiusParameter !== 'epsilon'
      || extension.noiseNorm !== 'euclidean'
      || extension.method !== expectedMethod) {
      throw new Error(`Bounded-noise extension for ${id} does not match this schema version.`);
    }
  }
  const equations = equationsForSystem(id, value.equations);
  if (!isCustomSystem(id) && value.equations !== undefined) {
    const recorded = requireObject(value.equations, `Equations for ${id}`);
    if (recorded.interpretation !== equations.interpretation
      || recorded.x !== equations.x
      || recorded.y !== equations.y) {
      throw new Error(`Built-in equations for ${id} do not match this schema version.`);
    }
  }
  const customParameters = isCustomSystem(id)
    ? normalizeCustomParameterList(value.customParameters, `${id} custom parameters`)
    : [];
  return {
    id,
    type,
    equations,
    customParameters,
    boundedNoiseExtension: {
      radiusParameter: 'epsilon',
      noiseNorm: 'euclidean',
      method: type === 'discrete' ? 'boundary_map' : 'boundary_differential_equation',
    },
  };
};

const defaultSolverConfiguration = (
  parameters: BistParameters,
  periodicSearchSettings: Partial<PeriodicSearchSettings> = {},
): SolverConfiguration => ({
  trajectory: {
    maximumIterations: parameters.maxIterations,
  },
  periodicSearch: {
    maximumPeriod: parameters.maxPeriod,
    ...DEFAULT_PERIODIC_SEARCH_SETTINGS,
    ...periodicSearchSettings,
    supportFilter: PERIODIC_SUPPORT_FILTER_SETTINGS,
  },
  manifold: DEFAULT_MANIFOLD_SETTINGS,
  continuousBoundaryFlow: {
    ...CONTINUOUS_BOUNDARY_FLOW_SETTINGS,
    stepSize: parameters.h,
  },
  ulam: {
    ...DEFAULT_ULAM_SETTINGS,
    ...ULAM_OPERATOR_SETTINGS,
    epsilon: parameters.epsilon,
    integrationTime: null,
  },
  geometricOffsets: {
    ...DEFAULT_GEOMETRIC_OFFSET_SETTINGS,
    inversePositionTolerance: null,
    inversePositionToleranceRule: INVERSE_OFFSET_POSITION_TOLERANCE_RULE,
  },
});

const mergeSolverConfiguration = (
  defaults: SolverConfiguration,
  overrides: unknown = {},
): UnknownRecord => {
  const value = requireObject(overrides, 'Solver settings');
  return Object.fromEntries(Object.entries(defaults).map(([name, section]) => [
    name,
    {
      ...section,
      ...(value[name] === undefined ? {} : requireObject(value[name], `Solver settings.${name}`)),
    },
  ]));
};

const normalizeSolvers = (
  solvers: unknown,
  parameters: BistParameters,
  { requireAllSections = false }: { requireAllSections?: boolean } = {},
): SolverConfiguration => {
  const value = requireObject(solvers, 'Solver settings');
  const suppliedGeometricOffsets = value.geometricOffsets === undefined
    ? {}
    : requireObject(value.geometricOffsets, 'Geometric-offset settings');
  const sectionNames = [
    'trajectory',
    'periodicSearch',
    'manifold',
    'continuousBoundaryFlow',
    'ulam',
    'geometricOffsets',
  ];
  if (requireAllSections) {
    sectionNames.forEach((name) => requireObject(value[name], `Solver settings.${name}`));
  }
  const merged = mergeSolverConfiguration(defaultSolverConfiguration(parameters), value);

  const trajectory = requireObject(merged.trajectory, 'Trajectory settings');
  const maximumIterations = requireInteger(
    trajectory.maximumIterations,
    'Trajectory maximum iterations',
  );
  if (maximumIterations !== parameters.maxIterations) {
    throw new Error('Trajectory maximum iterations must match parameters.maxIterations.');
  }

  const periodic = requireObject(merged.periodicSearch, 'Periodic search settings');
  const maximumPeriod = requireInteger(
    periodic.maximumPeriod,
    'Periodic maximum period',
    { minimum: 1, maximum: 20 },
  );
  if (maximumPeriod !== parameters.maxPeriod) {
    throw new Error('Periodic maximum period must match parameters.maxPeriod.');
  }
  const periodicSettings = normalizeSearchSettings(periodic);
  const supportFilter = requireObject(periodic.supportFilter, 'Periodic support filter settings');

  const manifold = requireObject(merged.manifold, 'Manifold settings');
  const continuous = requireObject(merged.continuousBoundaryFlow, 'Continuous boundary-flow settings');
  const ulam = requireObject(merged.ulam, 'Ulam settings');
  const geometric = requireObject(merged.geometricOffsets, 'Geometric-offset settings');

  const integrationTime = ulam.integrationTime === null
    ? null
    : requirePositive(ulam.integrationTime, 'Ulam integration time');
  const positionTolerance = geometric.inversePositionTolerance === null
    ? null
    : requirePositive(
      geometric.inversePositionTolerance,
      'Inverse-offset position tolerance',
    );
  const contourEpsilon = requirePositive(
    geometric.contourEpsilon,
    'Geometric contour epsilon',
  );
  const contourEpsilons = normalizeContourEpsilons(
    Array.isArray(suppliedGeometricOffsets.contourEpsilons)
      ? suppliedGeometricOffsets.contourEpsilons.map(value => requirePositive(
        value,
        'Geometric contour epsilon',
      ))
      : [contourEpsilon],
  );

  return {
    trajectory: { maximumIterations },
    periodicSearch: {
      maximumPeriod,
      ...periodicSettings,
      supportFilter: {
        subdivisions: requireImplementedValue(requireInteger(
          supportFilter.subdivisions,
          'Periodic support-filter subdivisions',
        ), PERIODIC_SUPPORT_FILTER_SETTINGS.subdivisions, 'Periodic support-filter subdivisions'),
        pointsPerBox: requireImplementedValue(requireInteger(
          supportFilter.pointsPerBox,
          'Periodic support-filter samples per box',
        ), PERIODIC_SUPPORT_FILTER_SETTINGS.pointsPerBox, 'Periodic support-filter samples per box'),
        supportThreshold: requireImplementedValue(requirePositive(
          supportFilter.supportThreshold,
          'Periodic support-filter threshold',
        ), PERIODIC_SUPPORT_FILTER_SETTINGS.supportThreshold, 'Periodic support-filter threshold'),
      },
    },
    manifold: {
      intersectionThreshold: requireFinite(
        manifold.intersectionThreshold,
        'Manifold intersection threshold',
        { minimum: 0 },
      ),
      maximumPointSpacing: requireFinite(
        manifold.maximumPointSpacing ?? DEFAULT_MANIFOLD_SETTINGS.maximumPointSpacing,
        'Maximum manifold point spacing',
        { minimum: 0.0001, maximum: 0.05 },
      ),
      computeStable: Boolean(manifold.computeStable),
      computeUnstable: Boolean(manifold.computeUnstable),
    },
    continuousBoundaryFlow: {
      integrator: requireImplementedValue(
        requireString(continuous.integrator, 'Continuous boundary-flow integrator'),
        CONTINUOUS_BOUNDARY_FLOW_SETTINGS.integrator,
        'Continuous boundary-flow integrator',
      ),
      stepSize: requireImplementedValue(
        requirePositive(continuous.stepSize, 'Continuous boundary-flow step size'),
        parameters.h,
        'Continuous boundary-flow step size',
      ),
      initialRadius: requireImplementedValue(requirePositive(
        continuous.initialRadius,
        'Continuous boundary-flow initial radius',
      ), CONTINUOUS_BOUNDARY_FLOW_SETTINGS.initialRadius, 'Continuous boundary-flow initial radius'),
      sampleCount: requireImplementedValue(requireInteger(
        continuous.sampleCount,
        'Continuous boundary-flow sample count',
        { minimum: 3 },
      ), CONTINUOUS_BOUNDARY_FLOW_SETTINGS.sampleCount, 'Continuous boundary-flow sample count'),
      stepsPerAnimationFrame: requireImplementedValue(requireInteger(
        continuous.stepsPerAnimationFrame,
        'Continuous boundary-flow steps per frame',
      ), CONTINUOUS_BOUNDARY_FLOW_SETTINGS.stepsPerAnimationFrame, 'Continuous boundary-flow steps per frame'),
      reparameterizeEveryFrames: requireImplementedValue(requireInteger(
        continuous.reparameterizeEveryFrames,
        'Continuous boundary-flow reparameterization interval',
      ), CONTINUOUS_BOUNDARY_FLOW_SETTINGS.reparameterizeEveryFrames, 'Continuous boundary-flow reparameterization interval'),
    },
    ulam: {
      subdivisions: requireInteger(ulam.subdivisions, 'Ulam subdivisions'),
      pointsPerBox: requireInteger(ulam.pointsPerBox, 'Ulam samples per box'),
      epsilon: requireImplementedValue(
        requireFinite(ulam.epsilon, 'Ulam noise radius', { minimum: 0 }),
        parameters.epsilon,
        'Ulam noise radius',
      ),
      integrationTime,
      stationaryIterations: requireImplementedValue(requireInteger(
        ulam.stationaryIterations,
        'Ulam stationary iterations',
      ), ULAM_OPERATOR_SETTINGS.stationaryIterations, 'Ulam stationary iterations'),
      supportRelativeThreshold: requireImplementedValue(requirePositive(
        ulam.supportRelativeThreshold,
        'Ulam support threshold',
      ), ULAM_OPERATOR_SETTINGS.supportRelativeThreshold, 'Ulam support threshold'),
      absorptionMaximumIterations: requireImplementedValue(requireInteger(
        ulam.absorptionMaximumIterations,
        'Ulam absorption maximum iterations',
      ), ULAM_OPERATOR_SETTINGS.absorptionMaximumIterations, 'Ulam absorption maximum iterations'),
      absorptionTolerance: requireImplementedValue(requirePositive(
        ulam.absorptionTolerance,
        'Ulam absorption tolerance',
      ), ULAM_OPERATOR_SETTINGS.absorptionTolerance, 'Ulam absorption tolerance'),
    },
    geometricOffsets: {
      contourEpsilon,
      contourEpsilons,
      inverseIterations: requireInteger(
        geometric.inverseIterations,
        'Inverse-offset iterations',
        { minimum: 1, maximum: 8 },
      ),
      inversePositionTolerance: positionTolerance,
      inversePositionToleranceRule: requireImplementedValue(
        requireString(
          geometric.inversePositionToleranceRule,
          'Inverse-offset position-tolerance rule',
        ),
        INVERSE_OFFSET_POSITION_TOLERANCE_RULE,
        'Inverse-offset position-tolerance rule',
      ),
      inverseNormalTolerance: requireImplementedValue(requireFinite(
        geometric.inverseNormalTolerance,
        'Inverse-offset normal tolerance',
        { minimum: Number.MIN_VALUE, maximum: 0.5 },
      ), DEFAULT_GEOMETRIC_OFFSET_SETTINGS.inverseNormalTolerance, 'Inverse-offset normal tolerance'),
      inverseMaximumSubdivisionDepth: requireImplementedValue(requireInteger(
        geometric.inverseMaximumSubdivisionDepth,
        'Inverse-offset maximum subdivision depth',
        { minimum: 0, maximum: 10 },
      ), DEFAULT_GEOMETRIC_OFFSET_SETTINGS.inverseMaximumSubdivisionDepth, 'Inverse-offset maximum subdivision depth'),
      maximumSeedPoints: requireImplementedValue(requireInteger(
        geometric.maximumSeedPoints,
        'Geometric-offset maximum seed points',
        { minimum: 3 },
      ), DEFAULT_GEOMETRIC_OFFSET_SETTINGS.maximumSeedPoints, 'Geometric-offset maximum seed points'),
    },
  };
};

const configurationFromLegacyShape = (configuration: unknown): ExperimentConfiguration => {
  const value = requireObject(configuration, 'Experiment configuration');
  if (!SYSTEM_IDS.has(value.dynamicSystem as SystemId)) {
    throw new TypeError(`Unsupported dynamical system: ${String(value.dynamicSystem)}`);
  }
  const parameters = normalizeFiniteParams(value.params);
  const customEquations = normalizeCustomEquationsV1(value.customEquations);
  const customParams = normalizeCustomParamsV1(value.customParams);
  const periodicSearchSettings = normalizeSearchSettings(value.periodicSearchSettings);
  const dynamicSystem = value.dynamicSystem as SystemId;
  const customKey = isCustomSystem(dynamicSystem) ? dynamicSystem : 'custom';
  const defaults = defaultSolverConfiguration(parameters, periodicSearchSettings);
  if (systemTypeFor(dynamicSystem) === 'continuous') {
    defaults.ulam.integrationTime = continuousUlamIntegrationTime(parameters.h);
  }
  const solvers = normalizeSolvers(
    mergeSolverConfiguration(defaults, value.solverSettings || {}),
    parameters,
  );
  return {
    system: normalizeSystem({
      id: dynamicSystem,
      type: systemTypeFor(dynamicSystem),
      equations: isCustomSystem(dynamicSystem)
        ? customEquations[customKey]
        : BUILTIN_EQUATIONS[dynamicSystem],
      customParameters: isCustomSystem(dynamicSystem) ? customParams[customKey] : [],
    }),
    parameters,
    initialExtendedState: normalizeExtendedStartPoint(requireObject(value.startPoint, 'Initial extended state')),
    view: {
      computationDomain: normalizeDomain(value.viewRange, 'Computation domain'),
      viewport: normalizeDomain(value.viewportRange || value.viewRange, 'Viewport'),
    },
    solvers,
  };
};

const normalizeConfigurationV2 = (
  configuration: unknown,
  { requireAllSections = false }: { requireAllSections?: boolean } = {},
): ExperimentConfiguration => {
  const value = requireObject(configuration, 'Experiment configuration');
  if ('dynamicSystem' in value) {
    return configurationFromLegacyShape(value);
  }
  const parameters = normalizeFiniteParams(value.parameters);
  const view = requireObject(value.view, 'View configuration');
  const system = normalizeSystem(value.system, { requireAllFields: requireAllSections });
  const solvers = normalizeSolvers(value.solvers, parameters, { requireAllSections });
  const expectedIntegrationTime = system.type === 'continuous'
    ? continuousUlamIntegrationTime(parameters.h)
    : null;
  if (solvers.ulam.integrationTime !== expectedIntegrationTime) {
    throw new Error(
      `Ulam integration time must be ${String(expectedIntegrationTime)} for system ${system.id}.`,
    );
  }
  return {
    system,
    parameters,
    initialExtendedState: normalizeExtendedStartPoint(
      requireObject(value.initialExtendedState, 'Initial extended state'),
    ),
    view: {
      computationDomain: normalizeDomain(view.computationDomain, 'Computation domain'),
      viewport: normalizeDomain(view.viewport, 'Viewport'),
    },
    solvers,
  };
};

const emptyResults = (): ExperimentResults => ({
  periodic: { orbits: [], computeMethod: null, support: null },
  manifolds: {
    unstable: [],
    stable: [],
    fixedPoints: [],
    intersections: [],
  },
  continuousBoundary: { points: [] },
  geometricOffsets: { direct: null, inverse: null },
  ulam: {
    gridBoxes: [],
    stationaryDensity: null,
    absorptionProbabilities: null,
  },
  parameterSweep: null,
});

const normalizeArray = <T>(value: unknown, label: string): T[] => {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array.`);
  }
  return cloneJsonValue(value) as T[];
};

const normalizeNullableArray = <T>(value: unknown, label: string): T[] | null => (
  value === null || value === undefined ? null : normalizeArray<T>(value, label)
);

const cloneJsonData = (value: unknown): JsonValue | undefined => (
  cloneJsonValue(value) as JsonValue | undefined
);

const normalizeNullableResultObject = (value: unknown): UnknownRecord | null | undefined => {
  if (value === null || value === undefined) return value;
  return cloneJsonValue(requireObject(value, 'Result object'));
};

const normalizeResults = (results: unknown = {}): ExperimentResults => {
  const value = requireObject(results, 'Experiment results');
  const defaults = emptyResults();
  const isV2Shape = 'periodic' in value
    || 'continuousBoundary' in value
    || 'parameterSweep' in value;
  if (!isV2Shape) {
    return {
      periodic: {
        orbits: normalizeArray<ResultOrbit>(value.periodicOrbits || [], 'Periodic orbits'),
        computeMethod: typeof value.periodicComputeMethod === 'string'
          ? value.periodicComputeMethod
          : null,
        support: cloneJsonData(value.periodicSupport ?? null),
      },
      manifolds: {
        unstable: normalizeArray<UnknownRecord>(value.manifolds || [], 'Unstable manifolds'),
        stable: normalizeArray<UnknownRecord>(value.stableManifolds || [], 'Stable manifolds'),
        fixedPoints: normalizeArray<UnknownRecord>(value.fixedPoints || [], 'Fixed points'),
        intersections: normalizeArray<UnknownRecord>(value.intersections || [], 'Intersections'),
      },
      continuousBoundary: {
        points: normalizeArray<unknown>(value.continuousBoundaryPoints || [], 'Continuous boundary points'),
      },
      geometricOffsets: {
        direct: normalizeNullableResultObject(value.geometricOffsets ?? null),
        inverse: normalizeNullableResultObject(value.inverseGeometricOffsets ?? null),
      },
      ulam: {
        gridBoxes: normalizeArray<UnknownRecord>(
          requireObject(value.ulam ?? {}, 'Ulam results').gridBoxes || [],
          'Ulam grid boxes',
        ),
        stationaryDensity: normalizeNullableArray<number>(
          requireObject(value.ulam ?? {}, 'Ulam results').stationaryDensity
            ?? requireObject(value.ulam ?? {}, 'Ulam results').invariantMeasure,
          'Ulam stationary density',
        ),
        absorptionProbabilities: normalizeNullableArray<number>(
          requireObject(value.ulam ?? {}, 'Ulam results').absorptionProbabilities
            ?? requireObject(value.ulam ?? {}, 'Ulam results').leftEigenvector,
          'Ulam absorption probabilities',
        ),
      },
      parameterSweep: cloneJsonData(value.parameterSweep ?? null),
    };
  }

  const periodic = requireObject(value.periodic, 'Periodic results');
  const manifolds = requireObject(value.manifolds, 'Manifold results');
  const continuousBoundary = requireObject(
    value.continuousBoundary,
    'Continuous-boundary results',
  );
  const geometricOffsets = requireObject(value.geometricOffsets, 'Geometric-offset results');
  const ulam = requireObject(value.ulam, 'Ulam results');
  return {
    periodic: {
      orbits: normalizeArray<ResultOrbit>(periodic.orbits, 'Periodic orbits'),
      computeMethod: typeof periodic.computeMethod === 'string' ? periodic.computeMethod : null,
      support: cloneJsonData(periodic.support ?? null),
    },
    manifolds: {
      unstable: normalizeArray<UnknownRecord>(manifolds.unstable, 'Unstable manifolds'),
      stable: normalizeArray<UnknownRecord>(manifolds.stable, 'Stable manifolds'),
      fixedPoints: normalizeArray<UnknownRecord>(manifolds.fixedPoints, 'Fixed points'),
      intersections: normalizeArray<UnknownRecord>(manifolds.intersections, 'Intersections'),
    },
    continuousBoundary: {
      points: normalizeArray<unknown>(continuousBoundary.points, 'Continuous boundary points'),
    },
    geometricOffsets: {
      direct: normalizeNullableResultObject(geometricOffsets.direct ?? null),
      inverse: normalizeNullableResultObject(geometricOffsets.inverse ?? null),
    },
    ulam: {
      gridBoxes: normalizeArray<UnknownRecord>(ulam.gridBoxes, 'Ulam grid boxes'),
      stationaryDensity: normalizeNullableArray<number>(ulam.stationaryDensity, 'Ulam stationary density'),
      absorptionProbabilities: normalizeNullableArray<number>(
        ulam.absorptionProbabilities,
        'Ulam absorption probabilities',
      ),
    },
    parameterSweep: cloneJsonData(value.parameterSweep ?? defaults.parameterSweep),
  };
};

const finiteValues = (values: unknown[] | null | undefined): number[] => (
  values || []
).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

const normalLengthError = (point: unknown): number | null => {
  const record = point !== null && typeof point === 'object'
    ? point as UnknownRecord
    : {};
  const values = Array.isArray(point) ? point : [record.x, record.y, record.nx, record.ny];
  if (!values.slice(0, 4).every(Number.isFinite)) return null;
  return Math.abs(Math.hypot(values[2], values[3]) - 1);
};

const vectorRange = (values: unknown[] | null | undefined): {
  minimum: number | null;
  maximum: number | null;
} => {
  const finite = finiteValues(values);
  if (finite.length === 0) return { minimum: null, maximum: null };
  return { minimum: Math.min(...finite), maximum: Math.max(...finite) };
};

const requireOptionalDiagnosticNumber = (value: unknown): number | null => (
  typeof value === 'number' && Number.isFinite(value) ? value : null
);

const buildDiagnostics = (
  configuration: ExperimentConfiguration,
  results: ExperimentResults,
  provenance: ExperimentProvenance,
) => {
  const orbits = results.periodic.orbits;
  const orbitResiduals = orbits.map((orbit, index) => ({
    orbitIndex: index,
    period: Number.isSafeInteger(orbit.period) ? orbit.period : null,
    closureResidual: Number.isFinite(orbit.residual) ? orbit.residual : null,
    multiplierRelationResidual: Number.isFinite(orbit.multiplier_relation_residual)
      ? orbit.multiplier_relation_residual
      : null,
    maximumNormalLengthError: Math.max(
      ...finiteValues((orbit.extended_points || []).map(normalLengthError)),
      requireOptionalDiagnosticNumber(orbit.maximum_normal_length_error) ?? 0,
    ),
  }));
  const reportedClosureResiduals = finiteValues(
    orbitResiduals.map(({ closureResidual }) => closureResidual),
  );
  const normalErrors = finiteValues(
    orbitResiduals.map(({ maximumNormalLengthError }) => maximumNormalLengthError),
  );
  const stationaryDensity = results.ulam.stationaryDensity;
  const absorptionProbabilities = results.ulam.absorptionProbabilities;
  const stationaryMass = stationaryDensity
    ? finiteValues(stationaryDensity).reduce((sum, value) => sum + value, 0)
    : null;
  const absorptionRange = vectorRange(absorptionProbabilities);
  const direct = results.geometricOffsets.direct;
  const inverse = results.geometricOffsets.inverse;
  const batchResultRecords = (value: UnknownRecord | null | undefined): UnknownRecord[] => (
    Array.isArray(value?.contours)
      ? value.contours.flatMap(item => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
        const result = (item as UnknownRecord).result;
        return result && typeof result === 'object' && !Array.isArray(result)
          ? [result as UnknownRecord]
          : [];
      })
      : value ? [value] : []
  );
  const directResults = batchResultRecords(direct);
  const inverseResults = batchResultRecords(inverse);
  const directLevelCounts = finiteValues(directResults.map(result => result.completed_levels));
  const inverseIterationCounts = finiteValues(
    inverseResults.map(result => result.completed_iterations),
  );
  const inversePositionErrors = finiteValues(
    inverseResults.map(result => result.max_position_chord_error),
  );
  const inverseNormalErrors = finiteValues(
    inverseResults.map(result => result.max_normal_chord_error),
  );
  const warnings = [];
  if (orbits.length > 0 && reportedClosureResiduals.length !== orbits.length) {
    warnings.push('Some periodic-orbit residuals were unavailable in the exported result snapshot.');
  }
  if (provenance.source.workingTree !== 'clean') {
    warnings.push('The source commit does not identify a verified clean working tree.');
  }

  return {
    summary: {
      periodicOrbitCount: orbits.length,
      fixedPointCount: results.manifolds.fixedPoints.length,
      unstableManifoldCount: results.manifolds.unstable.length,
      stableManifoldCount: results.manifolds.stable.length,
      intersectionCount: results.manifolds.intersections.length,
      continuousBoundaryPointCount: results.continuousBoundary.points.length,
      ulamBoxCount: results.ulam.gridBoxes.length,
    },
    periodic: {
      acceptanceThreshold: configuration.solvers.periodicSearch.residualThreshold,
      orbitResiduals,
      maximumClosureResidual: reportedClosureResiduals.length > 0
        ? Math.max(...reportedClosureResiduals)
        : null,
      allReportedResidualsAccepted: reportedClosureResiduals.length > 0
        ? reportedClosureResiduals.every(
          (value) => value <= configuration.solvers.periodicSearch.residualThreshold,
        )
        : null,
      maximumNormalLengthError: normalErrors.length > 0 ? Math.max(...normalErrors) : null,
    },
    ulam: {
      stationaryMass,
      stationaryMassError: stationaryMass === null ? null : Math.abs(stationaryMass - 1),
      absorptionMinimum: absorptionRange.minimum,
      absorptionMaximum: absorptionRange.maximum,
      absorptionOutOfRangeCount: absorptionProbabilities
        ? finiteValues(absorptionProbabilities).filter((value) => value < 0 || value > 1).length
        : null,
    },
    geometricOffsets: {
      completedDirectLevels: directLevelCounts.length > 0
        ? directLevelCounts.reduce((sum, value) => sum + value, 0)
        : null,
      completedInverseIterations: inverseIterationCounts.length > 0
        ? Math.max(...inverseIterationCounts)
        : null,
      maximumInversePositionChordError: inversePositionErrors.length > 0
        ? Math.max(...inversePositionErrors)
        : null,
      maximumInverseNormalChordError: inverseNormalErrors.length > 0
        ? Math.max(...inverseNormalErrors)
        : null,
      inverseSubdivisionLimitReached: inverseResults.length > 0
        ? inverseResults.some(result => result.subdivision_limit_reached === true)
        : null,
    },
    warnings,
  };
};

const workingTreeStateForCommit = (commit: string): WorkingTreeState => {
  if (commit.endsWith('-dirty')) return 'dirty';
  if (commit === 'development' || commit === 'unknown' || commit === 'reference-configuration') {
    return 'unknown';
  }
  return 'clean';
};

interface BuildProvenanceInput {
  commit: unknown;
  exportedAt: unknown;
  software?: {
    name?: unknown;
    version?: unknown;
    workingTree?: unknown;
  };
  migration?: unknown;
}

const buildProvenance = ({
  commit,
  exportedAt,
  software = {},
  migration = undefined,
}: BuildProvenanceInput): ExperimentProvenance => {
  const normalizedCommit = requireString(commit, 'Source commit');
  const result: ExperimentProvenance = {
    software: {
      name: requireString(software.name || SOFTWARE_NAME, 'Software name'),
      version: requireString(software.version || BIST_VERSION, 'Software version'),
    },
    source: {
      commit: normalizedCommit,
      workingTree: (software.workingTree || workingTreeStateForCommit(normalizedCommit)) as WorkingTreeState,
    },
    exportedAt: normalizeTimestamp(exportedAt, 'Export timestamp'),
  };
  if (!['clean', 'dirty', 'unknown'].includes(result.source.workingTree)) {
    throw new TypeError('Source working-tree state must be clean, dirty, or unknown.');
  }
  if (migration) result.migration = cloneJsonData(migration);
  return result;
};

const normalizeProvenance = (provenance: unknown): ExperimentProvenance => {
  const value = requireObject(provenance, 'Experiment provenance');
  const software = requireObject(value.software, 'Experiment software provenance');
  const source = requireObject(value.source, 'Experiment source provenance');
  return buildProvenance({
    commit: source.commit,
    exportedAt: value.exportedAt,
    software: {
      name: software.name,
      version: software.version,
      workingTree: source.workingTree,
    },
    migration: value.migration,
  });
};

export const buildExperimentBundle = ({
  configuration,
  results = {},
  commit = 'development',
  createdAt,
  exportedAt = createdAt || new Date().toISOString(),
}: BuildExperimentBundleInput) => {
  const normalizedConfiguration = normalizeConfigurationV2(configuration);
  const normalizedResults = normalizeResults(results);
  const provenance = buildProvenance({ commit, exportedAt });
  return {
    schema: EXPERIMENT_SCHEMA,
    schemaVersion: EXPERIMENT_SCHEMA_VERSION,
    provenance,
    configuration: normalizedConfiguration,
    results: normalizedResults,
    diagnostics: buildDiagnostics(normalizedConfiguration, normalizedResults, provenance),
  };
};

const migrateVersion1 = (parsed: UnknownRecord) => {
  const configuration = configurationFromLegacyShape(parsed.configuration);
  const results = normalizeResults(parsed.results || {});
  const software = requireObject(parsed.software, 'Version-1 software provenance');
  const provenance = buildProvenance({
    commit: software.commit,
    exportedAt: parsed.createdAt,
    software,
    migration: { fromSchemaVersion: 1 },
  });
  return {
    schema: EXPERIMENT_SCHEMA,
    schemaVersion: EXPERIMENT_SCHEMA_VERSION,
    provenance,
    configuration,
    results,
    diagnostics: buildDiagnostics(configuration, results, provenance),
  };
};

const normalizeVersion2 = (parsed: UnknownRecord) => {
  const provenance = normalizeProvenance(parsed.provenance);
  const configuration = normalizeConfigurationV2(parsed.configuration, { requireAllSections: true });
  const results = normalizeResults(parsed.results);
  requireObject(parsed.diagnostics, 'Experiment diagnostics');
  return {
    schema: EXPERIMENT_SCHEMA,
    schemaVersion: EXPERIMENT_SCHEMA_VERSION,
    provenance,
    configuration,
    results,
    diagnostics: buildDiagnostics(configuration, results, provenance),
  };
};

export const parseExperimentBundle = (text: string) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`Experiment file is not valid JSON: ${
      error instanceof Error ? error.message : String(error)
    }`);
  }

  const value = requireObject(parsed, 'Experiment');
  if (value.schema !== EXPERIMENT_SCHEMA) {
    throw new Error(`Unsupported experiment schema: ${String(value.schema)}`);
  }
  if (value.schemaVersion === 1) return migrateVersion1(value);
  if (value.schemaVersion === EXPERIMENT_SCHEMA_VERSION) return normalizeVersion2(value);
  throw new Error(
    `Unsupported experiment schema version ${String(value.schemaVersion)}; supported versions are ${SUPPORTED_EXPERIMENT_SCHEMA_VERSIONS.join(', ')}.`,
  );
};

export const experimentConfigurationToUiState = (configuration: unknown) => {
  const value = normalizeConfigurationV2(configuration, { requireAllSections: true });
  const customEquations = cloneJsonValue(INITIAL_CUSTOM_EQUATIONS);
  const customParams = cloneJsonValue(INITIAL_CUSTOM_PARAMS);
  if (isCustomSystem(value.system.id)) {
    customEquations[value.system.id] = {
      xEq: value.system.equations.x,
      yEq: value.system.equations.y,
    };
    customParams[value.system.id] = cloneJsonValue(value.system.customParameters);
  }
  return {
    dynamicSystem: value.system.id,
    params: cloneJsonValue(value.parameters),
    customEquations,
    customParams,
    viewRange: cloneJsonValue(value.view.computationDomain),
    viewportRange: cloneJsonValue(value.view.viewport),
    periodicSearchSettings: {
      gridSize: value.solvers.periodicSearch.gridSize,
      thetaGridSize: value.solvers.periodicSearch.thetaGridSize,
      residualThreshold: value.solvers.periodicSearch.residualThreshold,
      useContinuation: value.solvers.periodicSearch.useContinuation,
    },
    startPoint: cloneJsonValue(value.initialExtendedState),
    manifoldSettings: cloneJsonValue(value.solvers.manifold),
    continuousBoundaryFlowSettings: cloneJsonValue(value.solvers.continuousBoundaryFlow),
    ulamSettings: cloneJsonValue(value.solvers.ulam),
    geometricOffsetSettings: cloneJsonValue(value.solvers.geometricOffsets),
  };
};
