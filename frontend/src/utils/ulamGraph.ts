import type { UlamTransition } from '../types/domain';

export const DEFAULT_TRANSITION_THRESHOLD = 0;

const isValidIndex = (index: number, boxCount: number): boolean => (
  Number.isInteger(index) && index >= 0 && index < boxCount
);

const normalizeThreshold = (threshold: number): number => (
  Number.isFinite(threshold) && threshold > 0 ? threshold : DEFAULT_TRANSITION_THRESHOLD
);

const getTransitionTarget = (transition: UlamTransition): number => Number(transition?.index);

const getTransitionProbability = (transition: UlamTransition): number => Number(transition?.probability ?? 0);

interface TransitionGraphInput {
  transitionsByBox: UlamTransition[][];
  boxCount: number;
  probabilityThreshold?: number;
}

export const buildReverseTransitions = ({
  transitionsByBox,
  boxCount,
  probabilityThreshold = DEFAULT_TRANSITION_THRESHOLD
}: TransitionGraphInput): number[][] => {
  const nBoxes = Math.max(0, Math.floor(boxCount || 0));
  const threshold = normalizeThreshold(probabilityThreshold);
  const reverseTransitions: number[][] = Array.from({ length: nBoxes }, () => []);

  for (let source = 0; source < nBoxes; source += 1) {
    const transitions = transitionsByBox[source] || [];
    transitions.forEach((transition) => {
      const target = getTransitionTarget(transition);
      const probability = getTransitionProbability(transition);
      if (isValidIndex(target, nBoxes) && probability >= threshold) {
        reverseTransitions[target].push(source);
      }
    });
  }

  return reverseTransitions;
};

export const computeReachabilityLayers = ({
  transitionsByBox,
  targetIndices,
  boxCount,
  maxDepth,
  probabilityThreshold = DEFAULT_TRANSITION_THRESHOLD
}: TransitionGraphInput & { targetIndices: number[]; maxDepth: number }): {
  depthByBox: number[];
  layers: number[][];
} => {
  const nBoxes = Math.max(0, Math.floor(boxCount || 0));
  const depthLimit = Math.max(0, Math.floor(maxDepth || 0));
  const depthByBox = Array(nBoxes).fill(-1);
  const layers: number[][] = Array.from({ length: depthLimit + 1 }, () => []);

  if (nBoxes === 0) {
    return { depthByBox, layers };
  }

  const reverseTransitions = buildReverseTransitions({
    transitionsByBox,
    boxCount: nBoxes,
    probabilityThreshold
  });

  let frontier: number[] = [];
  const targetSet = new Set(targetIndices || []);
  targetSet.forEach((target) => {
    if (isValidIndex(target, nBoxes) && depthByBox[target] === -1) {
      depthByBox[target] = 0;
      layers[0].push(target);
      frontier.push(target);
    }
  });

  for (let depth = 1; depth <= depthLimit && frontier.length > 0; depth += 1) {
    const nextFrontier: number[] = [];
    frontier.forEach((target) => {
      reverseTransitions[target].forEach((source) => {
        if (depthByBox[source] === -1) {
          depthByBox[source] = depth;
          layers[depth].push(source);
          nextFrontier.push(source);
        }
      });
    });
    frontier = nextFrontier;
  }

  return { depthByBox, layers };
};

export const getGridNeighbors = (
  index: number,
  subdivisions: number,
  includeDiagonal = false,
): number[] => {
  const n = Math.max(0, Math.floor(subdivisions || 0));
  if (!isValidIndex(index, n * n)) return [];

  const ix = index % n;
  const iy = Math.floor(index / n);
  const offsets = includeDiagonal
    ? [
        [-1, -1], [0, -1], [1, -1],
        [-1, 0], [1, 0],
        [-1, 1], [0, 1], [1, 1]
      ]
    : [[0, -1], [-1, 0], [1, 0], [0, 1]];

  return offsets
    .map(([dx, dy]) => [ix + dx, iy + dy])
    .filter(([x, y]) => x >= 0 && x < n && y >= 0 && y < n)
    .map(([x, y]) => y * n + x);
};

export const findReachabilityBoundary = ({
  depthByBox,
  subdivisions,
  includeDiagonal = false
}: { depthByBox: number[]; subdivisions: number; includeDiagonal?: boolean }): {
  insideBoundary: number[];
  outsideBoundary: number[];
} => {
  const insideBoundary: number[] = [];
  const outsideBoundary: number[] = [];
  const nBoxes = depthByBox?.length || 0;

  for (let index = 0; index < nBoxes; index += 1) {
    const reachable = depthByBox[index] >= 0;
    const neighbors = getGridNeighbors(index, subdivisions, includeDiagonal);
    const touchesOppositeRegion = neighbors.some((neighbor) => (
      reachable ? depthByBox[neighbor] < 0 : depthByBox[neighbor] >= 0
    ));

    if (touchesOppositeRegion) {
      if (reachable) {
        insideBoundary.push(index);
      } else {
        outsideBoundary.push(index);
      }
    }
  }

  return { insideBoundary, outsideBoundary };
};

export const computeAbsorptionProbabilities = ({
  transitionsByBox,
  targetIndices,
  boxCount,
  iterations
}: Omit<TransitionGraphInput, 'probabilityThreshold'> & {
  targetIndices: number[];
  iterations: number;
}): number[] => {
  const nBoxes = Math.max(0, Math.floor(boxCount || 0));
  const nIterations = Math.max(0, Math.floor(iterations || 0));
  const targetSet = new Set((targetIndices || []).filter((target) => isValidIndex(target, nBoxes)));
  let probability: number[] = Array(nBoxes).fill(0);

  targetSet.forEach((target) => {
    probability[target] = 1;
  });

  for (let iter = 0; iter < nIterations; iter += 1) {
    const next = probability.slice();
    for (let source = 0; source < nBoxes; source += 1) {
      if (targetSet.has(source)) {
        next[source] = 1;
        continue;
      }

      const transitions = transitionsByBox[source] || [];
      next[source] = transitions.reduce((sum, transition) => {
        const target = getTransitionTarget(transition);
        const transitionProbability = getTransitionProbability(transition);
        if (!isValidIndex(target, nBoxes) || transitionProbability <= 0) return sum;
        return sum + transitionProbability * probability[target];
      }, 0);
    }
    probability = next;
  }

  return probability;
};
