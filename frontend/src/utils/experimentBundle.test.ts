import { describe, expect, it } from 'vitest';
import { INITIAL_CUSTOM_EQUATIONS, INITIAL_CUSTOM_PARAMS, INITIAL_PARAMS } from '../config/systems';
import {
  EXPERIMENT_SCHEMA_VERSION,
  buildExperimentBundle,
  experimentConfigurationToUiState,
  parseExperimentBundle,
} from './experimentBundle';
import { DEFAULT_PERIODIC_SEARCH_SETTINGS } from './periodicSearchSettings';
import { DEFAULT_VIEW_RANGE } from './viewRange';

const legacyConfigurationInput = {
  dynamicSystem: 'henon',
  params: INITIAL_PARAMS,
  customEquations: INITIAL_CUSTOM_EQUATIONS,
  customParams: INITIAL_CUSTOM_PARAMS,
  viewRange: DEFAULT_VIEW_RANGE,
  viewportRange: { xMin: -1, xMax: 1, yMin: -1, yMax: 1 },
  periodicSearchSettings: DEFAULT_PERIODIC_SEARCH_SETTINGS,
  startPoint: { x: 0.1, y: 0.2, nx: 3, ny: 4 },
};

const buildReferenceBundle = (overrides = {}) => buildExperimentBundle({
  configuration: legacyConfigurationInput,
  commit: 'abc123',
  exportedAt: '2026-08-10T00:00:00.000Z',
  ...overrides,
});

describe('experiment bundle schema v2', () => {
  it('round-trips a normalized, structured reproducibility record', () => {
    const bundle = buildReferenceBundle({ results: { periodicOrbits: [] } });
    const parsed = parseExperimentBundle(JSON.stringify(bundle));

    expect(parsed.schemaVersion).toBe(EXPERIMENT_SCHEMA_VERSION);
    expect(parsed.provenance.source).toEqual({ commit: 'abc123', workingTree: 'clean' });
    expect(parsed.provenance.exportedAt).toBe('2026-08-10T00:00:00.000Z');
    expect(parsed.configuration.system).toMatchObject({
      id: 'henon',
      type: 'discrete',
      equations: {
        interpretation: 'map',
        x: '1 - a * x^2 + y',
        y: 'b * x',
      },
    });
    expect(parsed.configuration.initialExtendedState).toEqual({
      x: 0.1,
      y: 0.2,
      nx: 0.6,
      ny: 0.8,
    });
    expect(parsed.configuration.view.viewport).toEqual({
      xMin: -1,
      xMax: 1,
      yMin: -1,
      yMax: 1,
    });
    expect(parsed.configuration.solvers.periodicSearch).toMatchObject({
      maximumPeriod: INITIAL_PARAMS.maxPeriod,
      residualThreshold: 1e-10,
      supportFilter: { subdivisions: 64, pointsPerBox: 64, supportThreshold: 1e-10 },
    });
    expect(parsed.diagnostics.summary.periodicOrbitCount).toBe(0);
  });

  it('restores v2 configuration into the existing UI state without result snapshots', () => {
    const bundle = buildReferenceBundle();
    const ui = experimentConfigurationToUiState(bundle.configuration);

    expect(ui.dynamicSystem).toBe('henon');
    expect(ui.params).toEqual(INITIAL_PARAMS);
    expect(ui.startPoint).toEqual({ x: 0.1, y: 0.2, nx: 0.6, ny: 0.8 });
    expect(ui.periodicSearchSettings).toEqual(DEFAULT_PERIODIC_SEARCH_SETTINGS);
    expect(ui.ulamSettings).toMatchObject({
      subdivisions: 20,
      pointsPerBox: 64,
      stationaryIterations: 100,
      absorptionTolerance: 1e-12,
    });
    expect(ui.geometricOffsetSettings.contourEpsilons).toEqual([0.025, 0.05, 0.075, 0.1, 0.125]);

    const oldV2 = buildReferenceBundle();
    Reflect.deleteProperty(oldV2.configuration.solvers.geometricOffsets, 'contourEpsilons');
    const oldUi = experimentConfigurationToUiState(
      parseExperimentBundle(JSON.stringify(oldV2)).configuration,
    );
    expect(oldUi.geometricOffsetSettings.contourEpsilons).toEqual([0.1]);
  });

  it('round-trips the complete geometric contour epsilon batch', () => {
    const bundle = buildReferenceBundle({
      configuration: {
        ...legacyConfigurationInput,
        solverSettings: {
          geometricOffsets: {
            contourEpsilon: 0.05,
            contourEpsilons: [0.025, 0.05, 0.075],
          },
        },
      },
    });
    const ui = experimentConfigurationToUiState(bundle.configuration);
    expect(ui.geometricOffsetSettings.contourEpsilon).toBe(0.05);
    expect(ui.geometricOffsetSettings.contourEpsilons).toEqual([0.025, 0.05, 0.075]);
  });

  it('derives residual, normal, Ulam, and geometric diagnostics from results', () => {
    const bundle = buildReferenceBundle({
      commit: 'abc123-dirty',
      results: {
        periodicOrbits: [{
          period: 1,
          residual: 2e-10,
          multiplier_relation_residual: 4e-12,
          extended_points: [[0, 0, 1.01, 0]],
        }],
        fixedPoints: [{}],
        ulam: {
          gridBoxes: [{}, {}],
          invariantMeasure: [0.25, 0.75],
          leftEigenvector: [0, 1.0001],
        },
        inverseGeometricOffsets: {
          completed_iterations: 2,
          max_position_chord_error: 1e-5,
          max_normal_chord_error: 2e-3,
          subdivision_limit_reached: false,
        },
      },
    });

    expect(bundle.diagnostics.periodic.maximumNormalLengthError).toBeCloseTo(0.01);
    expect(bundle.diagnostics.periodic.maximumClosureResidual).toBe(2e-10);
    expect(bundle.diagnostics.periodic.allReportedResidualsAccepted).toBe(false);
    expect(bundle.diagnostics.ulam.stationaryMassError).toBe(0);
    expect(bundle.diagnostics.ulam.absorptionOutOfRangeCount).toBe(1);
    expect(bundle.diagnostics.geometricOffsets.completedInverseIterations).toBe(2);
    expect(bundle.diagnostics.warnings).toContain(
      'The source commit does not identify a verified clean working tree.',
    );
  });

  it('aggregates diagnostics from batched direct and inverse contour snapshots', () => {
    const bundle = buildReferenceBundle({
      results: {
        geometricOffsets: {
          batchVersion: 1,
          contours: [
            { id: 'a', result: { completed_levels: 1 } },
            { id: 'b', result: { completed_levels: 1 } },
          ],
        },
        inverseGeometricOffsets: {
          batchVersion: 1,
          contours: [
            { id: 'a', result: {
              completed_iterations: 2,
              max_position_chord_error: 2e-4,
              max_normal_chord_error: 3e-3,
              subdivision_limit_reached: false,
            } },
            { id: 'b', result: {
              completed_iterations: 3,
              max_position_chord_error: 4e-4,
              max_normal_chord_error: 1e-3,
              subdivision_limit_reached: true,
            } },
          ],
        },
      },
    });

    expect(bundle.diagnostics.geometricOffsets).toEqual({
      completedDirectLevels: 2,
      completedInverseIterations: 3,
      maximumInversePositionChordError: 4e-4,
      maximumInverseNormalChordError: 3e-3,
      inverseSubdivisionLimitReached: true,
    });
  });

  it('migrates a version-1 bundle into the canonical v2 shape', () => {
    const version1 = {
      schema: 'bist-experiment',
      schemaVersion: 1,
      software: {
        name: 'Bounded Invariant Set Toolbox',
        version: '0.2.0',
        commit: 'legacy123',
      },
      createdAt: '2026-08-09T00:00:00.000Z',
      configuration: legacyConfigurationInput,
      diagnostics: {},
      results: { periodicOrbits: [], fixedPoints: [] },
    };

    const migrated = parseExperimentBundle(JSON.stringify(version1));
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.provenance.migration).toEqual({ fromSchemaVersion: 1 });
    expect(migrated.provenance.source.commit).toBe('legacy123');
    expect(migrated.configuration.system.id).toBe('henon');
    expect(migrated.results.periodic.orbits).toEqual([]);
  });

  it('rejects incompatible, incomplete, or unsupported settings before recomputation', () => {
    expect(() => parseExperimentBundle('{}')).toThrow('Unsupported experiment schema');
    expect(() => buildExperimentBundle({
      configuration: { ...legacyConfigurationInput, dynamicSystem: 'unknown' },
    })).toThrow('Unsupported dynamical system');
    expect(() => buildExperimentBundle({
      configuration: {
        ...legacyConfigurationInput,
        params: { ...INITIAL_PARAMS, epsilon: Infinity },
      },
    })).toThrow('must be finite');
    expect(() => buildExperimentBundle({
      configuration: {
        ...legacyConfigurationInput,
        params: { ...INITIAL_PARAMS, epsilon: -0.1 },
      },
    })).toThrow('must be non-negative');
    expect(() => buildExperimentBundle({
      configuration: {
        ...legacyConfigurationInput,
        viewRange: { xMin: 2, xMax: -2, yMin: -1, yMax: 1 },
      },
    })).toThrow('minimums must be smaller');
    expect(() => buildExperimentBundle({
      configuration: {
        ...legacyConfigurationInput,
        periodicSearchSettings: { ...DEFAULT_PERIODIC_SEARCH_SETTINGS, gridSize: 1000 },
      },
    })).toThrow('grid size is outside');
    expect(() => buildReferenceBundle({
      results: { periodicOrbits: [{ period: 1, residual: Number.NaN }] },
    })).toThrow('must contain only finite numbers');

    const v2 = buildReferenceBundle();
    Reflect.deleteProperty(v2.configuration.solvers, 'ulam');
    expect(() => parseExperimentBundle(JSON.stringify(v2))).toThrow('Solver settings.ulam');

    const unsupportedFixedSetting = buildReferenceBundle();
    unsupportedFixedSetting.configuration.solvers.ulam.absorptionTolerance = 1e-8;
    expect(() => parseExperimentBundle(JSON.stringify(unsupportedFixedSetting)))
      .toThrow('must be 1e-12 in this BIST build');

    const future = { ...buildReferenceBundle(), schemaVersion: 99 };
    expect(() => parseExperimentBundle(JSON.stringify(future)))
      .toThrow('supported versions are 1, 2');
  });

  it('exports cleanly when given flat GUI results with undefined parameterSweep', () => {
    const bundle = buildReferenceBundle({
      results: {
        periodicOrbits: [],
        periodicComputeMethod: 'newton',
        periodicSupport: null,
        manifolds: [],
        stableManifolds: [],
        fixedPoints: [],
        intersections: [],
        continuousBoundaryPoints: [],
        geometricOffsets: null,
        inverseGeometricOffsets: null,
        ulam: {
          gridBoxes: [],
          invariantMeasure: null,
          leftEigenvector: null,
        },
        parameterSweep: undefined,
      },
    });
    expect(bundle.results.periodic.orbits).toEqual([]);
    expect(bundle.results.parameterSweep).toBeNull();
  });

  it('exports cleanly when manifold branches contain undefined optional fields from WASM', () => {
    const bundle = buildReferenceBundle({
      results: {
        manifolds: [{
          plus: {
            points: [[0.1, 0.2]],
            extended_points: [[0.1, 0.2, 1.0, 0.0]],
            stop_reason: 'MaxIter',
            reached_target_id: undefined,
          },
          minus: {
            points: [[-0.1, -0.2]],
            extended_points: [[-0.1, -0.2, -1.0, 0.0]],
            stop_reason: 'MaxIter',
            reached_target_id: undefined,
          },
          saddle_point: [0.0, 0.0],
          eigenvalue: 1.5,
          source_topology_id: undefined,
        }],
      },
    });

    expect(bundle.results.manifolds.unstable).toHaveLength(1);
    const parsed = parseExperimentBundle(JSON.stringify(bundle));
    expect(parsed.results.manifolds.unstable).toHaveLength(1);
  });
});
