import type {
  BistParameters,
  CustomEquation,
  CustomParameter,
  ExtendedPointTuple,
  GeometricOffsetLevel,
  GeometricOffsetResult,
  InverseOffsetResult,
  Manifold,
  ManifoldState,
  PeriodicOrbit,
  PeriodicSearchSettings,
  ProjectedState,
  SolutionPoint,
  SystemId,
  UlamBox,
  UlamTransition,
  ViewRange,
} from '../types/domain';

export interface SupportGrid extends ViewRange {
  subdivisions: number;
  invariantMeasure: number[];
  threshold: number;
}

interface BaseComputePayload {
  dynamicSystem: SystemId;
  viewRange: ViewRange;
}

export interface PeriodicComputePayload extends BaseComputePayload {
  params: Pick<BistParameters, 'a' | 'b' | 'delta' | 'h' | 'epsilon' | 'maxPeriod'>;
  periodicSearchSettings: PeriodicSearchSettings;
}

export interface PeriodicComputeResult {
  orbits: PeriodicOrbit[];
  support: SupportGrid | null;
  usedContinuation?: boolean;
  unavailableReason?: string;
}

export interface ManifoldComputePayload extends BaseComputePayload {
  params: Pick<BistParameters, 'a' | 'b' | 'epsilon'>;
  periodicOrbits: PeriodicOrbit[];
  customEquations: CustomEquation;
  customParams: CustomParameter[];
  showStableManifold: boolean;
  showUnstableManifold: boolean;
  intersectionThreshold: number;
}

export interface ManifoldComputeResult {
  manifolds: Manifold[];
  stableManifolds: Manifold[];
  fixedPoints: SolutionPoint[];
  intersections: ManifoldState['intersections'];
}

export interface UlamComputePayload extends BaseComputePayload {
  params: Pick<BistParameters, 'a' | 'b' | 'delta' | 'h'>;
  ulam: Pick<BistParameters, 'epsilon'> & {
    subdivisions: number;
    pointsPerBox: number;
  };
  customEquations: CustomEquation;
  customParams: CustomParameter[];
  currentPoint?: ProjectedState | null;
}

export interface UlamComputeResult {
  boxes: UlamBox[];
  invariantMeasure: number[];
  leftEigenvector: number[];
  currentBoxIndex: number;
}

export interface GeometricOffsetsComputePayload {
  boundary: ExtendedPointTuple[];
  params: Pick<BistParameters, 'epsilon'>;
}

export interface GeometricOffsetBatchInput {
  id: string;
  epsilon: number;
}

export interface GeometricOffsetBatchOutput extends GeometricOffsetBatchInput {
  result: GeometricOffsetResult;
}

export interface GeometricOffsetBatchComputePayload {
  boundary: ExtendedPointTuple[];
  contours: GeometricOffsetBatchInput[];
}

export interface GeometricOffsetBatchComputeResult {
  contours: GeometricOffsetBatchOutput[];
}

export interface InverseGeometricOffsetsComputePayload {
  levels: GeometricOffsetLevel[];
  params: Pick<BistParameters, 'a' | 'b' | 'epsilon'>;
  settings: {
    iterations: number;
    positionTolerance: number;
    normalTolerance: number;
    maxSubdivisionDepth: number;
  };
}

export interface InverseGeometricOffsetBatchSource {
  id: string;
  levels: GeometricOffsetLevel[];
  positionTolerance: number;
}

export interface InverseGeometricOffsetBatchComputePayload {
  sources: InverseGeometricOffsetBatchSource[];
  params: Pick<BistParameters, 'a' | 'b' | 'epsilon'>;
  settings: {
    iterations: number;
    normalTolerance: number;
    maxSubdivisionDepth: number;
  };
}

export interface InverseGeometricOffsetBatchComputeResult {
  sources: Array<{
    id: string;
    result: InverseOffsetResult;
  }>;
}

export interface UlamTransitionsPayload {
  index: number;
}

export interface ComputeTaskMap {
  computePeriodic: {
    payload: PeriodicComputePayload;
    result: PeriodicComputeResult;
  };
  computeManifolds: {
    payload: ManifoldComputePayload;
    result: ManifoldComputeResult;
  };
  computeUlam: {
    payload: UlamComputePayload;
    result: UlamComputeResult;
  };
  computeGeometricOffsets: {
    payload: GeometricOffsetsComputePayload;
    result: GeometricOffsetResult;
  };
  computeGeometricOffsetBatch: {
    payload: GeometricOffsetBatchComputePayload;
    result: GeometricOffsetBatchComputeResult;
  };
  computeInverseGeometricOffsets: {
    payload: InverseGeometricOffsetsComputePayload;
    result: InverseOffsetResult;
  };
  computeInverseGeometricOffsetBatch: {
    payload: InverseGeometricOffsetBatchComputePayload;
    result: InverseGeometricOffsetBatchComputeResult;
  };
  getUlamTransitions: {
    payload: UlamTransitionsPayload;
    result: UlamTransition[];
  };
}

export type ComputeTaskKind = keyof ComputeTaskMap;
export type ComputeTaskPayload<TKind extends ComputeTaskKind> = ComputeTaskMap[TKind]['payload'];
export type ComputeTaskResult<TKind extends ComputeTaskKind> = ComputeTaskMap[TKind]['result'];
