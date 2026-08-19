import type { Dispatch, SetStateAction } from 'react';

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type UnknownRecord = Record<string, unknown>;

export type SystemId = 'henon' | 'duffing' | 'custom' | 'duffing_ode' | 'custom_ode';
export type SystemType = 'discrete' | 'continuous';
export type Stability = 'stable' | 'unstable' | 'saddle' | string;

export interface ViewRange {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface ExtendedState {
  x: number;
  y: number;
  nx: number;
  ny: number;
}

export interface ProjectedState {
  x: number;
  y: number;
}

export type PointTuple = number[];
export type ExtendedPointTuple = number[];
export type PointLike = PointTuple | ProjectedState;
export type ExtendedPointLike = ExtendedPointTuple | ExtendedState;

export interface BistParameters {
  a: number;
  b: number;
  delta: number;
  h: number;
  epsilon: number;
  startX: number;
  startY: number;
  maxIterations: number;
  maxPeriod: number;
}

export interface CustomEquation {
  xEq: string;
  yEq: string;
}

export interface CustomEquations {
  custom: CustomEquation;
  custom_ode: CustomEquation;
}

export interface CustomParameter {
  name: string;
  value: number;
}

export interface CustomParameters {
  custom: CustomParameter[];
  custom_ode: CustomParameter[];
}

export interface PeriodicSearchSettings {
  gridSize: number;
  thetaGridSize: number;
  residualThreshold: number;
  useContinuation: boolean;
}

export interface PeriodicOrbit extends UnknownRecord {
  points: PointTuple[];
  extended_points?: ExtendedPointTuple[];
  period: number;
  stability: Stability;
  eigenvalues?: number[];
  residual?: number | null;
  maximum_normal_length_error?: number;
  multiplier_relation_residual?: number | null;
}

export interface OrbitExtendedState {
  x: number;
  y: number;
  nx: number | null;
  ny: number | null;
  pointIndex: number;
}

export interface SolutionPoint extends UnknownRecord {
  x: number;
  y: number;
  nx?: number | null;
  ny?: number | null;
  period?: number;
  stability?: Stability;
  eigenvalues?: number[];
}

export interface ManifoldBranch extends UnknownRecord {
  points?: PointTuple[];
  extended_points?: ExtendedPointTuple[];
  eigenvalue?: number;
  stop_reason?: string;
  reached_target_id?: number | null;
}

export interface Manifold extends UnknownRecord {
  plus?: ManifoldBranch;
  minus?: ManifoldBranch;
  eigenvalue?: number;
  source_topology_id?: number | null;
}

export interface IntersectionDiagnostic extends UnknownRecord {
  has_intersection: boolean;
  min_distance: number;
}

export interface PeriodicState {
  orbits: PeriodicOrbit[];
  isReady: boolean;
  showOrbits: boolean;
  computeMethod: 'continuation' | 'grid' | null;
  resultRevision: number;
  renderedRevision: number;
  renderedPointCount: number;
}

export interface ManifoldState {
  manifolds: Manifold[];
  rawManifolds: Manifold[];
  stableManifolds: Manifold[];
  fixedPoints: SolutionPoint[];
  intersections: IntersectionDiagnostic[];
  isComputing: boolean;
  isReady: boolean;
  sourcePeriodicRevision: number;
  showOrbits: boolean;
  showUnstableManifold: boolean;
  showDeterministicImageBoundary: boolean;
  showNoiseBalls: boolean;
  showBoundarySamplePoints: boolean;
  maximumManifoldPointSpacing: number;
  showStableManifold: boolean;
  intersectionThreshold: number;
  currentPoint: ExtendedState;
  trajectoryPoints: ExtendedState[];
  iteration: number;
  isRunning: boolean;
  hasStarted: boolean;
  showTrail: boolean;
  startPoint: ExtendedState;
}

export interface BoundaryComponent extends UnknownRecord {
  id?: number;
  is_hole?: boolean;
  points: Array<ProjectedState | ExtendedState | ExtendedPointTuple>;
}

export interface GeometricOffsetLevel extends UnknownRecord {
  level: number;
  target_distance: number;
  boundary_components?: BoundaryComponent[];
  component_count?: number;
}

export interface GeometricOffsetResult extends UnknownRecord {
  levels: GeometricOffsetLevel[];
  completed_levels: number;
  epsilon?: number;
  stop_reason?: string;
}

export interface InverseOffsetCurve extends UnknownRecord {
  source_level?: number;
  source_component_id?: number;
  inverse_iteration: number;
  points?: ProjectedState[];
  source_relation?: string;
  closure_position_residual?: number;
  closure_normal_residual?: number;
  max_position_chord_error?: number;
  max_normal_chord_error?: number;
  subdivision_limit_reached?: boolean;
}

export interface InverseOffsetResult extends UnknownRecord {
  curves: InverseOffsetCurve[];
  completed_iterations?: number;
  max_position_chord_error?: number;
  max_normal_chord_error?: number;
  subdivision_limit_reached?: boolean;
}

export type GeometricOffsetEditorMode = 'series' | 'individual';

export interface GeometricOffsetContour {
  id: string;
  epsilon: number;
  visible: boolean;
  result: GeometricOffsetResult | null;
  inverseResult: InverseOffsetResult | null;
  error: string | null;
  inverseError: string | null;
}

export interface GeometricOffsetState {
  editorMode: GeometricOffsetEditorMode;
  seriesStart: number;
  seriesEnd: number;
  seriesCount: number;
  individualEpsilon: number;
  contours: GeometricOffsetContour[];
  selectedContourId: string | null;
  preimageSourceIds: string[];
  inverseIterations: number;
  inverseDisplayMode: 'all' | 'final';
  showInverseContours: boolean;
  isComputing: boolean;
  isComputingInverse: boolean;
  error: string | null;
  inverseError: string | null;
}

export interface UlamBox extends UnknownRecord {
  x_min?: number;
  x_max?: number;
  y_min?: number;
  y_max?: number;
  center: PointTuple;
  radius: PointTuple;
}

export interface UlamTransition {
  index: number;
  probability: number;
}

export interface UlamState {
  gridBoxes: UlamBox[];
  invariantMeasure: number[] | null;
  leftEigenvector: number[] | null;
  transitions: UlamTransition[] | null;
  selectedBoxIndex: number | null;
  currentBoxIndex: number;
  isComputing: boolean;
  subdivisions: number;
  pointsPerBox: number;
  epsilon: number;
  showUlamOverlay: boolean;
  showTransitions: boolean;
  showCurrentBox: boolean;
  needsRecompute: boolean;
}

export interface BdeState {
  points: ExtendedState[];
  isRunning: boolean;
}

export interface AnimationState {
  isAnimating: boolean;
  isPreparing: boolean;
  parameter: 'a' | 'b' | 'epsilon';
  rangeValue: number;
  direction: number;
  steps: number;
  currentStep: number;
  baseValue: number | null;
  targetValue: number | null;
  awaitingResult: boolean;
  expectedPeriodicRevision: number | null;
}

export interface RecordingState {
  isRecording: boolean;
  isEncoding: boolean;
  frameCount: number;
  recordingEnabled: boolean;
  encodingProgress: number;
  error: string | null;
}

export interface SweepOrbit extends PeriodicOrbit {
  extended_points: ExtendedPointTuple[];
}

export interface SweepResult {
  param_value: number;
  total_orbits: number;
  stable_count: number;
  saddle_count: number;
  unstable_count: number;
  orbits: SweepOrbit[];
}

export interface SweepState {
  results: SweepResult[] | null;
  isComputing: boolean;
  error: string | null;
  sweepParam: string;
  sweepMin: number;
  sweepMax: number;
  numSamples: number;
  maxPeriod: number;
}

export interface BifurcationDatum {
  a: number;
  hausdorff_distance: number;
  has_intersection: boolean;
}

export interface BifurcationState {
  data: BifurcationDatum[];
  threshold: number;
  aMin: number;
  aMax: number;
  numSamples: number;
  isComputing: boolean;
  error: string | null;
  intersectionCount: number;
  criticalValues: number[];
}

export interface OrbitTooltipData {
  type: 'Fixed Point' | 'Periodic Orbit' | 'Periodic Point';
  period?: number;
  pos: ProjectedState;
  normal?: ProjectedState;
  stability: Stability;
  eigenvalues?: number[];
  jacobian?: {
    j11?: number;
    j12?: number;
    j21?: number;
    j22?: number;
    det: number;
    trace: number;
  };
  orbitSize?: number;
}

export interface UlamTooltipData {
  type: 'Ulam Box';
  boxIndex: number;
  pos: ProjectedState;
  measurePercent: number;
  measure?: number;
  numTransitions: number;
  topTransitions?: UlamTransition[];
  isCurrentBox?: boolean;
}

export type TooltipData = OrbitTooltipData | UlamTooltipData;

export interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  data: TooltipData | null;
}

export interface ExperimentStatus {
  type: 'success' | 'error';
  message: string;
}

export interface OrbitFilters {
  period1: boolean;
  period2: boolean;
  period3: boolean;
  period4: boolean;
  period5: boolean;
  period6plus: boolean;
}

export interface SystemPreset {
  name: string;
  vals: Partial<BistParameters>;
}

export interface SystemDefinition {
  id: SystemId;
  name: string;
  presets: readonly SystemPreset[];
}

export interface SystemCatalog {
  discrete: readonly SystemDefinition[];
  continuous: readonly SystemDefinition[];
}

export type StateSetter<T> = Dispatch<SetStateAction<T>>;
export type BistWasmModule = typeof import('../../pkg/bist');
