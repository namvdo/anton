import type { ExtendedState } from '../types/domain';

const NORMAL_EPSILON = 1e-12;

export type ExtendedStateInput = Partial<Record<keyof ExtendedState, unknown>>;

export const normalizeExtendedStartPoint = (point: ExtendedStateInput): ExtendedState => {
  const values = [point?.x, point?.y, point?.nx, point?.ny].map(Number);
  if (!values.every(Number.isFinite)) {
    throw new Error('All extended-state components must be finite numbers.');
  }
  const [x, y, nx, ny] = values;
  const normalLength = Math.hypot(nx, ny);
  if (normalLength <= NORMAL_EPSILON) {
    throw new Error('The normal must have nonzero length.');
  }
  return { x, y, nx: nx / normalLength, ny: ny / normalLength };
};

interface StartPointState {
  startPoint: ExtendedState;
  currentPoint: ExtendedState;
  trajectoryPoints: ExtendedState[];
  iteration: number;
  hasStarted: boolean;
  isRunning: boolean;
}

export const applyStartPointUpdate = <T extends StartPointState>(
  prev: T,
  newStart: ExtendedStateInput,
): T => {
  const normalizedStart = normalizeExtendedStartPoint(newStart);
  return {
    ...prev,
    startPoint: normalizedStart,
    currentPoint: normalizedStart,
    trajectoryPoints: [],
    iteration: 0,
    hasStarted: false,
    isRunning: false
  } as T;
};
