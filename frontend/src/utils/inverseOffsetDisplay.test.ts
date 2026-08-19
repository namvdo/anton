import { describe, expect, it } from 'vitest';
import {
  fitInverseOffsetCurveRange,
  inverseOffsetCurveBounds,
  inverseOffsetCurveColor,
  inverseCurveNestingSummary,
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
    expect(visibleInverseOffsetCurves({ curves })).toEqual(curves);
  });

  it('distinguishes nested preimages from crossing raw inverse images', () => {
    expect(inverseCurveNestingSummary([
      { source_relation: 'nested_outside' }
    ])).toEqual({
      passed: true,
      message: 'Polygonal source-nesting check passed.'
    });
    expect(inverseCurveNestingSummary([
      { source_relation: 'crosses_source' }
    ])).toEqual({
      passed: false,
      message: 'Preimage crosses its source; it is not a nested basin boundary.'
    });
    expect(inverseCurveNestingSummary([
      { source_relation: 'open_point_set' }
    ])).toEqual({
      passed: false,
      message: 'Open pointwise preimage computed; polygonal nesting does not apply.'
    });
  });

  it('generates deterministic distinct colors without a fixed palette size', () => {
    const colors = Array.from({ length: 32 }, (_, index) => inverseOffsetStepColor(index + 1));
    expect(new Set(colors).size).toBe(colors.length);
    expect(colors.every(color => /^#[0-9a-f]{6}$/.test(color))).toBe(true);
    expect(inverseOffsetStepColor(32)).toBe(colors[31]);
    expect(inverseOffsetStepColor('invalid')).toBe(colors[0]);
  });

  it('assigns a distinct color to every source and inverse-step combination', () => {
    const sourceCount = 12;
    const colors = Array.from({ length: 8 }, (_, stepIndex) => (
      Array.from({ length: sourceCount }, (_, sourceIndex) => (
        inverseOffsetCurveColor(sourceIndex, sourceCount, stepIndex + 1)
      ))
    )).flat();
    expect(new Set(colors).size).toBe(colors.length);
    expect(inverseOffsetCurveColor(0, sourceCount, 'invalid')).toBe(colors[0]);
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
    expect(range).not.toBeNull();
    expect(range!.xMin).toBeLessThan(-14);
    expect(range!.xMax).toBeGreaterThan(18);
    expect(range!.yMax).toBeGreaterThan(12);
  });
});
