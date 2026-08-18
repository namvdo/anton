import type { UnknownRecord } from '../types/domain';
import type { ComputeTaskKind } from './computeContracts';

export type {
  ComputeTaskKind,
  ComputeTaskPayload,
  ComputeTaskResult,
} from './computeContracts';

export const COMPUTE_TASK_KINDS = Object.freeze([
  'computePeriodic',
  'computeManifolds',
  'computeUlam',
  'computeGeometricOffsets',
  'computeGeometricOffsetBatch',
  'computeInverseGeometricOffsets',
  'computeInverseGeometricOffsetBatch',
  'getUlamTransitions',
] as const);

type ListedComputeTaskKind = typeof COMPUTE_TASK_KINDS[number];
const _taskKindListIsComplete: ComputeTaskKind extends ListedComputeTaskKind ? true : never = true;
const _taskKindMapIsComplete: ListedComputeTaskKind extends ComputeTaskKind ? true : never = true;
void _taskKindListIsComplete;
void _taskKindMapIsComplete;

export interface ComputeRequest {
  id: number;
  kind: ComputeTaskKind;
  payload: UnknownRecord;
}

export interface ComputeSuccessResponse {
  id: number;
  kind: ComputeTaskKind;
  ok: true;
  result: unknown;
}

export interface ComputeFailureResponse {
  id: number;
  kind: ComputeTaskKind;
  ok: false;
  error: string;
}

export type ComputeResponse = ComputeSuccessResponse | ComputeFailureResponse;

const COMPUTE_TASK_KIND_SET = new Set<ComputeTaskKind>(COMPUTE_TASK_KINDS);

const isRecord = (value: unknown): value is UnknownRecord => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

export const isComputeTaskKind = (value: unknown): value is ComputeTaskKind => (
  typeof value === 'string' && COMPUTE_TASK_KIND_SET.has(value as ComputeTaskKind)
);

function assertRequestId(id: unknown): asserts id is number {
  if (!Number.isSafeInteger(id) || Number(id) <= 0) {
    throw new TypeError('Compute request id must be a positive safe integer.');
  }
}

function assertPayload(payload: unknown): asserts payload is UnknownRecord {
  if (!isRecord(payload)) {
    throw new TypeError('Compute request payload must be an object.');
  }
}

export const createComputeRequest = (
  id: unknown,
  kind: unknown,
  payload: unknown,
): ComputeRequest => {
  assertRequestId(id);
  if (!isComputeTaskKind(kind)) {
    throw new TypeError(`Unknown compute task: ${String(kind)}`);
  }
  assertPayload(payload);
  return { id, kind, payload };
};

export const parseComputeRequest = (value: unknown): ComputeRequest => {
  if (!isRecord(value)) {
    throw new TypeError('Compute request must be an object.');
  }
  assertRequestId(value.id);
  if (!isComputeTaskKind(value.kind)) {
    throw new TypeError(`Unknown compute task: ${String(value.kind)}`);
  }
  assertPayload(value.payload);
  return { id: value.id, kind: value.kind, payload: value.payload };
};

export const createComputeSuccess = (
  request: ComputeRequest,
  result: unknown,
): ComputeSuccessResponse => ({
  id: request.id,
  kind: request.kind,
  ok: true,
  result,
});

export const createComputeFailure = (
  request: ComputeRequest,
  error: unknown,
): ComputeFailureResponse => ({
  id: request.id,
  kind: request.kind,
  ok: false,
  error: error instanceof Error ? error.message : String(error),
});

export const parseComputeResponse = (value: unknown): ComputeResponse => {
  if (!isRecord(value)) {
    throw new TypeError('Compute response must be an object.');
  }
  assertRequestId(value.id);
  if (!isComputeTaskKind(value.kind)) {
    throw new TypeError(`Unknown compute response task: ${String(value.kind)}`);
  }
  if (typeof value.ok !== 'boolean') {
    throw new TypeError('Compute response ok flag must be boolean.');
  }
  if (value.ok) {
    return { id: value.id, kind: value.kind, ok: true, result: value.result };
  }
  if (typeof value.error !== 'string' || value.error.length === 0) {
    throw new TypeError('Failed compute response must include a non-empty error.');
  }
  return { id: value.id, kind: value.kind, ok: false, error: value.error };
};
