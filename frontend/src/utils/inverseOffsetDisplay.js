import { MIN_VIEW_SPAN, normalizeViewRange, RANGE_LIMIT } from './viewRange';

export const INVERSE_OFFSET_STEP_COLORS = [
  '#ffd45a',
  '#f5b942',
  '#ed9638',
  '#e27635',
  '#d45a3d',
  '#c54848'
];

export const inverseOffsetStepColor = (iteration) => {
  const index = Math.max(0, Math.min(
    INVERSE_OFFSET_STEP_COLORS.length - 1,
    Math.trunc(Number(iteration) || 1) - 1
  ));
  return INVERSE_OFFSET_STEP_COLORS[index];
};

export const visibleInverseOffsetCurves = (inverseResult, displayMode = 'final') => {
  const curves = Array.isArray(inverseResult?.curves) ? inverseResult.curves : [];
  if (displayMode === 'all' || curves.length === 0) return curves;

  const finalIteration = Math.max(
    ...curves.map(curve => Number(curve.inverse_iteration)).filter(Number.isFinite)
  );
  return curves.filter(curve => Number(curve.inverse_iteration) === finalIteration);
};

export const inverseOffsetCurveBounds = (curves) => {
  const bounds = {
    xMin: Number.POSITIVE_INFINITY,
    xMax: Number.NEGATIVE_INFINITY,
    yMin: Number.POSITIVE_INFINITY,
    yMax: Number.NEGATIVE_INFINITY
  };

  (curves || []).forEach(curve => {
    (curve.points || []).forEach(point => {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
      bounds.xMin = Math.min(bounds.xMin, point.x);
      bounds.xMax = Math.max(bounds.xMax, point.x);
      bounds.yMin = Math.min(bounds.yMin, point.y);
      bounds.yMax = Math.max(bounds.yMax, point.y);
    });
  });

  return Object.values(bounds).every(Number.isFinite) ? bounds : null;
};

export const fitInverseOffsetCurveRange = (
  curves,
  aspectRatio,
  paddingRatio = 0.14,
  limit = RANGE_LIMIT
) => {
  const bounds = inverseOffsetCurveBounds(curves);
  if (!bounds) return null;

  const aspect = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 4 / 3;
  const centerX = (bounds.xMin + bounds.xMax) / 2;
  const centerY = (bounds.yMin + bounds.yMax) / 2;
  const contentWidth = Math.max(MIN_VIEW_SPAN, bounds.xMax - bounds.xMin);
  const contentHeight = Math.max(MIN_VIEW_SPAN, bounds.yMax - bounds.yMin);
  const height = Math.max(contentHeight, contentWidth / aspect) * (1 + 2 * paddingRatio);
  const width = height * aspect;
  const targetRange = {
    xMin: centerX - width / 2,
    xMax: centerX + width / 2,
    yMin: centerY - height / 2,
    yMax: centerY + height / 2
  };
  const displayLimit = Math.max(
    limit,
    ...Object.values(targetRange).map(value => Math.abs(value))
  );
  return normalizeViewRange(targetRange, displayLimit);
};
