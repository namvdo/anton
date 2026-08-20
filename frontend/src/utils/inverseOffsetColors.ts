import type {
  InverseOffsetCurve,
  PointLike,
} from '../types/domain';
import { sampleColormap } from './colormaps';

export interface CurveColoringResult {
  colors: Float32Array;
  minDisplayVal: number;
  maxDisplayVal: number;
  midDisplayVal: number;
  unit: string;
  hasValidData: boolean;
  divergedCount: number;
}

const pointX = (p: PointLike): number => (Array.isArray(p) ? Number(p[0]) : Number(p?.x));
const pointY = (p: PointLike): number => (Array.isArray(p) ? Number(p[1]) : Number(p?.y));

/** Compute central-difference local spacing for a list of 2D points */
export const computePointsSpacing = (
  points: ReadonlyArray<PointLike>,
  isClosed = false,
): number[] => {
  const n = points.length;
  if (n < 2) return new Array(n).fill(0);

  const spacings = new Array<number>(n);
  for (let i = 0; i < n; i += 1) {
    if (isClosed) {
      const prev = points[(i + n - 1) % n];
      const next = points[(i + 1) % n];
      spacings[i] = Math.hypot(pointX(next) - pointX(prev), pointY(next) - pointY(prev)) / 2;
    } else if (i === 0) {
      spacings[0] = Math.hypot(pointX(points[1]) - pointX(points[0]), pointY(points[1]) - pointY(points[0]));
    } else if (i === n - 1) {
      spacings[n - 1] = Math.hypot(pointX(points[n - 1]) - pointX(points[n - 2]), pointY(points[n - 1]) - pointY(points[n - 2]));
    } else {
      spacings[i] = Math.hypot(pointX(points[i + 1]) - pointX(points[i - 1]), pointY(points[i + 1]) - pointY(points[i - 1])) / 2;
    }
  }
  return spacings;
};

/**
 * Computes per-vertex RGB colors for an inverse geometric offset curve
 * using standard scientific Viridis point-to-point correspondence with C0.
 * All finite points retain their exact tracer spectrum color across the whole domain.
 */
export const computeInverseCurveVertexColors = (
  curve: InverseOffsetCurve,
): CurveColoringResult => {
  const points = curve.points || [];
  const count = points.length;
  const colors = new Float32Array(count * 3);

  if (count === 0) {
    return {
      colors,
      minDisplayVal: 0,
      maxDisplayVal: 1,
      midDisplayVal: 0.5,
      unit: '',
      hasValidData: false,
      divergedCount: 0,
    };
  }

  let divergedCount = 0;
  for (let i = 0; i < count; i += 1) {
    const pt = points[i];
    if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) {
      colors[i * 3] = 0.35;
      colors[i * 3 + 1] = 0.35;
      colors[i * 3 + 2] = 0.38;
      divergedCount += 1;
      continue;
    }
    const t = count > 1 ? i / (count - 1) : 0.5;
    const [r, g, b] = sampleColormap('viridis', t);
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }

  return {
    colors,
    minDisplayVal: 0,
    maxDisplayVal: Math.max(1, count - 1),
    midDisplayVal: Math.floor(count / 2),
    unit: 'tracer index (point correspondence)',
    hasValidData: true,
    divergedCount,
  };
};

/**
 * Computes per-vertex RGB colors for the source geometric offset contour C0 itself
 * using the identical scientific Viridis point correspondence spectrum.
 */
export const computeContourVertexColors = (
  points: ReadonlyArray<PointLike>,
): Float32Array => {
  const count = points.length;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const t = count > 1 ? i / (count - 1) : 0.5;
    const [r, g, b] = sampleColormap('viridis', t);
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  return colors;
};
