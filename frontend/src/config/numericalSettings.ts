export const DEFAULT_MANIFOLD_SETTINGS = Object.freeze({
  intersectionThreshold: 0.05,
  computeStable: false,
  computeUnstable: false,
});

export const CONTINUOUS_BOUNDARY_FLOW_SETTINGS = Object.freeze({
  initialRadius: 0.05,
  sampleCount: 1000,
  stepsPerAnimationFrame: 3,
  reparameterizeEveryFrames: 20,
  integrator: 'rk4',
});

export const DEFAULT_ULAM_SETTINGS = Object.freeze({
  subdivisions: 20,
  pointsPerBox: 64,
  epsilon: 0.05,
});

export const ULAM_OPERATOR_SETTINGS = Object.freeze({
  stationaryIterations: 100,
  supportRelativeThreshold: 1e-10,
  absorptionMaximumIterations: 1000,
  absorptionTolerance: 1e-12,
});

export const PERIODIC_SUPPORT_FILTER_SETTINGS = Object.freeze({
  subdivisions: 64,
  pointsPerBox: 64,
  supportThreshold: 1e-10,
});

export const DEFAULT_GEOMETRIC_OFFSET_SETTINGS = Object.freeze({
  contourEpsilon: 0.1,
  inverseIterations: 1,
  inverseNormalTolerance: 0.02,
  inverseMaximumSubdivisionDepth: 7,
  maximumSeedPoints: 4000,
});

export const INVERSE_OFFSET_POSITION_TOLERANCE_RULE = (
  'max(1e-5, 0.25 * directContourSampleSpacing)'
);

export const continuousUlamIntegrationTime = (stepSize: number): number => Math.max(stepSize * 10, 0.5);

export const inverseOffsetPositionTolerance = (sampleSpacing: number): number => (
  Math.max(1e-5, 0.25 * sampleSpacing)
);
