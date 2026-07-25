import { describe, expect, it } from 'vitest';
import {
  fitInverseOffsetCurveRange,
  inverseOffsetCurveBounds,
  inverseOffsetStepColor,
  visibleInverseOffsetCurves
} from './inverseOffsetDisplay';

describe('inverse offset display utilities', () => {
  const curves = [
    { inverse_iteration: 1, points: [{ x: -1, y: -0.5 }, { x: 1, y: 0.5 }] },
    { inverse_iteration: 2, points: [{ x: -2, y: -1 }, { x: 2, y: 1 }] }
  ];

  it('shows only the final inverse iteration unless all steps are requested', () => {
    expect(visibleInverseOffsetCurves({ curves }, 'final')).toEqual([curves[1]]);
    expect(visibleInverseOffsetCurves({ curves }, 'all')).toEqual(curves);
  });

  it('uses a distinct high-contrast color for each supported step', () => {
    expect(inverseOffsetStepColor(1)).toBe('#ffd45a');
    expect(inverseOffsetStepColor(6)).toBe('#c54848');
    expect(inverseOffsetStepColor(99)).toBe('#c54848');
  });

  it('computes finite bounds and an aspect-aware padded camera range', () => {
    expect(inverseOffsetCurveBounds(curves)).toEqual({ xMin: -2, xMax: 2, yMin: -1, yMax: 1 });
    const range = fitInverseOffsetCurveRange(curves, 2, 0.1);
    expect(range).toEqual({ xMin: -2.4, xMax: 2.4, yMin: -1.2, yMax: 1.2 });
  });

  it('returns null when no finite curve samples exist', () => {
    expect(fitInverseOffsetCurveRange([], 1)).toBeNull();
  });

  it('lets the camera fit finite curves outside the guarded computation domain', () => {
    const outsideCurve = [{ points: [{ x: -14, y: -2 }, { x: 18, y: 12 }] }];
    const range = fitInverseOffsetCurveRange(outsideCurve, 2);
    expect(range.xMin).toBeLessThan(-14);
    expect(range.xMax).toBeGreaterThan(18);
    expect(range.yMax).toBeGreaterThan(12);
  });
});
