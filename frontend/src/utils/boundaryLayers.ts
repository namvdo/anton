import type {
  ExtendedPointTuple,
  ExtendedState,
} from '../types/domain';

const NORMAL_TOLERANCE = 1e-14;

export const BOUNDARY_LAYER_COLORS = Object.freeze({
  invariant: '#6faee8',
  deterministicImage: '#d7d9dc',
  noiseBall: '#b87943',
});

export interface BoundarySamplingSummary {
  sampleCount: number;
  perimeter: number;
  pointsPerUnit: number;
  maximumGap: number;
}

const positionDistance = (
  left: Pick<ExtendedState, 'x' | 'y'>,
  right: Pick<ExtendedState, 'x' | 'y'>,
): number => Math.hypot(left.x - right.x, left.y - right.y);

/** Measure the sampling of a closed, ordered polygonal boundary. */
export const summarizeClosedBoundarySampling = (
  boundary: Array<Pick<ExtendedState, 'x' | 'y'>>,
): BoundarySamplingSummary | null => {
  if (!Array.isArray(boundary) || boundary.length < 3) return null;
  if (boundary.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    throw new Error('Boundary sampling requires finite positions.');
  }

  const gaps = boundary.map((point, index) => (
    positionDistance(point, boundary[(index + 1) % boundary.length])
  ));
  const perimeter = gaps.reduce((sum, gap) => sum + gap, 0);
  if (!Number.isFinite(perimeter) || perimeter <= NORMAL_TOLERANCE) return null;

  return {
    sampleCount: boundary.length,
    perimeter,
    pointsPerUnit: boundary.length / perimeter,
    maximumGap: Math.max(...gaps),
  };
};

/**
 * Recover the deterministic-image boundary from the Euclidean boundary-map
 * relation p = f(x) + epsilon n. The input is the ordered normal-bundle
 * approximation (p_i, n_i) on the noisy invariant boundary.
 */
export const reconstructDeterministicImageBoundary = (
  boundary: ExtendedPointTuple[],
  epsilonValue: number,
): ExtendedState[] => {
  const epsilon = Number(epsilonValue);
  if (!Number.isFinite(epsilon) || epsilon < 0) {
    throw new Error('System noise epsilon must be finite and nonnegative.');
  }
  if (!Array.isArray(boundary) || boundary.length < 3) {
    throw new Error('At least three ordered extended boundary samples are required.');
  }

  const cleaned: ExtendedState[] = [];
  boundary.forEach((sample, index) => {
    if (!Array.isArray(sample) || sample.length < 4) {
      throw new Error(`Boundary sample ${index} is not an extended state.`);
    }
    const [x, y, nx, ny] = sample.slice(0, 4).map(Number);
    if (![x, y, nx, ny].every(Number.isFinite)) {
      throw new Error(`Boundary sample ${index} contains a non-finite position or normal.`);
    }
    const normalLength = Math.hypot(nx, ny);
    if (normalLength < NORMAL_TOLERANCE) {
      throw new Error(`Boundary sample ${index} contains a degenerate normal.`);
    }
    const point = { x, y, nx: nx / normalLength, ny: ny / normalLength };
    const previous = cleaned.at(-1);
    if (!previous || positionDistance(previous, point) > NORMAL_TOLERANCE) {
      cleaned.push(point);
    }
  });

  const first = cleaned[0];
  const last = cleaned.at(-1);
  if (first && last && cleaned.length > 1
      && positionDistance(first, last) <= NORMAL_TOLERANCE) {
    cleaned.pop();
  }
  if (cleaned.length < 3) {
    throw new Error('The boundary needs at least three distinct positions.');
  }

  return cleaned.map(({ x, y, nx, ny }) => ({
    x: x - epsilon * nx,
    y: y - epsilon * ny,
    nx,
    ny,
  }));
};
