import type { InverseOffsetCurve, InverseOffsetResult } from '../types/domain';

export const MAX_INVERSE_RESULT_POINTS = 100_000;

export const inverseResultPointBudget = (sourceCount: number): number => {
  const normalizedCount = Number.isSafeInteger(sourceCount) && sourceCount > 0
    ? sourceCount
    : 1;
  return Math.max(1, Math.floor(MAX_INVERSE_RESULT_POINTS / normalizedCount));
};

const evenlySpacedIndices = (length: number, retained: number, isClosed: boolean): number[] => {
  if (retained >= length) return Array.from({ length }, (_, index) => index);
  if (retained <= 0 || length <= 0) return [];
  if (retained === 1) return [0];
  const denominator = isClosed ? retained : retained - 1;
  const sourceSpan = isClosed ? length : length - 1;
  return Array.from(
    { length: retained },
    (_, index) => Math.floor(index * sourceSpan / denominator),
  );
};

const retainIndices = <T>(values: T[] | undefined, indices: number[]): T[] => {
  if (!Array.isArray(values)) return [];
  return indices.flatMap(index => index < values.length ? [values[index]] : []);
};

const compactCurve = (curve: InverseOffsetCurve, retained: number): void => {
  const points = Array.isArray(curve.points) ? curve.points : [];
  if (points.length <= retained) {
    curve.retained_point_count = points.length;
    curve.display_decimated = Boolean(curve.display_decimated)
      || points.length < Number(curve.output_point_count ?? points.length);
    return;
  }
  const indices = evenlySpacedIndices(points.length, retained, Boolean(curve.is_closed));
  curve.points = retainIndices(points, indices);
  curve.local_spacings = retainIndices(curve.local_spacings, indices);
  curve.step_ratios = retainIndices(curve.step_ratios, indices);
  curve.densities = retainIndices(curve.densities, indices);
  curve.retained_point_count = curve.points.length;
  curve.display_decimated = true;
};

/**
 * Final worker-side guard before structured cloning. Rust normally returns an
 * already bounded result, but this keeps an older/stale WASM build from sending
 * an unbounded object graph through postMessage.
 */
export const compactInverseOffsetResult = (
  result: InverseOffsetResult,
  pointBudget: number,
): InverseOffsetResult => {
  const curves = Array.isArray(result.curves) ? result.curves : [];
  const safeBudget = Number.isSafeInteger(pointBudget) && pointBudget > 0
    ? pointBudget
    : 1;
  const retainedTotal = curves.reduce(
    (sum, curve) => sum + (Array.isArray(curve.points) ? curve.points.length : 0),
    0,
  );
  if (retainedTotal > safeBudget && curves.length > 0) {
    const perCurveBudget = Math.max(1, Math.floor(safeBudget / curves.length));
    curves.forEach(curve => compactCurve(curve, perCurveBudget));
  } else {
    curves.forEach(curve => compactCurve(
      curve,
      Array.isArray(curve.points) ? curve.points.length : 0,
    ));
  }
  result.retained_output_points = curves.reduce(
    (sum, curve) => sum + (Array.isArray(curve.points) ? curve.points.length : 0),
    0,
  );
  result.result_point_budget = safeBudget;
  return result;
};
