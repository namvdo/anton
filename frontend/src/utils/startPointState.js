const NORMAL_EPSILON = 1e-12;

export const normalizeExtendedStartPoint = (point) => {
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

export const applyStartPointUpdate = (prev, newStart) => {
  const normalizedStart = normalizeExtendedStartPoint(newStart);
  return {
    ...prev,
    startPoint: normalizedStart,
    currentPoint: normalizedStart,
    trajectoryPoints: [],
    iteration: 0,
    hasStarted: false,
    isRunning: false
  };
};
