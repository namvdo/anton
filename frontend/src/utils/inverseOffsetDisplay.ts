import { MIN_VIEW_SPAN, normalizeViewRange, RANGE_LIMIT } from './viewRange';
import type {
  InverseOffsetCurve,
  InverseOffsetResult,
  ViewRange,
} from '../types/domain';

const GOLDEN_ANGLE_DEGREES = 137.50776405003785;

const hslToHex = (hue: number, saturation: number, lightness: number): string => {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const hueSector = hue / 60;
  const secondary = chroma * (1 - Math.abs((hueSector % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;

  if (hueSector < 1) [red, green] = [chroma, secondary];
  else if (hueSector < 2) [red, green] = [secondary, chroma];
  else if (hueSector < 3) [green, blue] = [chroma, secondary];
  else if (hueSector < 4) [green, blue] = [secondary, chroma];
  else if (hueSector < 5) [red, blue] = [secondary, chroma];
  else [red, blue] = [chroma, secondary];

  const lightnessOffset = lightness - chroma / 2;
  const channelHex = (channel: number) => Math.round((channel + lightnessOffset) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${channelHex(red)}${channelHex(green)}${channelHex(blue)}`;
};

export const inverseOffsetStepColor = (iteration: number | string): string => {
  const numericIteration = Number(iteration);
  const step = Number.isFinite(numericIteration) && numericIteration >= 1
    ? Math.trunc(numericIteration)
    : 1;
  const hue = (42 + (step - 1) * GOLDEN_ANGLE_DEGREES) % 360;
  return hslToHex(hue, 0.78, 0.62);
};

export const visibleInverseOffsetCurves = (
  inverseResult: InverseOffsetResult | null,
  displayMode: 'all' | 'final' = 'all',
): InverseOffsetCurve[] => {
  const curves = Array.isArray(inverseResult?.curves) ? inverseResult.curves : [];
  if (displayMode !== 'final' || curves.length === 0) return curves;

  const finalIteration = Math.max(
    ...curves.map(curve => Number(curve.inverse_iteration)).filter(Number.isFinite)
  );
  return curves.filter(curve => Number(curve.inverse_iteration) === finalIteration);
};

export const inverseCurveNestingSummary = (
  curves: Array<Pick<InverseOffsetCurve, 'source_relation'>>,
): {
  passed: boolean;
  message: string;
} => {
  const relations = (curves || []).map(curve => curve?.source_relation);
  if (relations.length === 0 || relations.some(relation => typeof relation !== 'string')) {
    return {
      passed: false,
      message: 'Raw boundary-map preimage; source nesting was not checked.'
    };
  }
  if (relations.includes('source_not_simple')) {
    return {
      passed: false,
      message: 'Source curve is not simple; this preimage is not a basin boundary.'
    };
  }
  if (relations.includes('inverse_not_simple')) {
    return {
      passed: false,
      message: 'Preimage self-intersects; it is not a simple basin boundary.'
    };
  }
  if (relations.includes('crosses_source')) {
    return {
      passed: false,
      message: 'Preimage crosses its source; it is not a nested basin boundary.'
    };
  }
  if (relations.includes('source_not_enclosed')) {
    return {
      passed: false,
      message: 'Preimage does not enclose its source; it is not an expanding basin boundary.'
    };
  }
  if (relations.every(relation => relation === 'nested_outside')) {
    return {
      passed: true,
      message: 'Polygonal source-nesting check passed.'
    };
  }
  return {
    passed: false,
    message: 'Raw boundary-map preimage; basin-boundary nesting is unverified.'
  };
};

type CurveWithPoints = Pick<InverseOffsetCurve, 'points'>;

export const inverseOffsetCurveBounds = (curves: CurveWithPoints[]): ViewRange | null => {
  const bounds: ViewRange = {
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
  curves: CurveWithPoints[],
  aspectRatio: number,
  paddingRatio = 0.14,
  limit = RANGE_LIMIT
): ViewRange | null => {
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
