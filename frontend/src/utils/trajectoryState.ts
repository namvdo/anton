interface HistoryDecision {
  isContinuous?: boolean;
  iteration?: number;
}

interface AppendHistoryInput<T> extends HistoryDecision {
  points?: T[];
  point?: T | null;
  maxHistory?: number | null;
}

export const shouldRecordTrajectoryHistoryPoint = ({
  isContinuous = false,
  iteration = 0,
}: HistoryDecision = {}): boolean => {
  if (isContinuous) return true;
  return Number.isFinite(iteration) && iteration > 0;
};

export const appendTrajectoryHistoryPoint = <T>({
  points = [],
  point,
  iteration = 0,
  isContinuous = false,
  maxHistory = null
}: AppendHistoryInput<T>): T[] => {
  const nextPoints = Array.isArray(points) ? [...points] : [];
  if (!point || !shouldRecordTrajectoryHistoryPoint({ isContinuous, iteration })) {
    return nextPoints;
  }

  nextPoints.push(point);
  if (isContinuous && typeof maxHistory === 'number'
    && Number.isFinite(maxHistory) && maxHistory > 0 && nextPoints.length > maxHistory) {
    return nextPoints.slice(nextPoints.length - maxHistory);
  }
  return nextPoints;
};
