import { describe, expect, it } from 'vitest';
import type { InverseOffsetCurve } from '../types/domain';
import {
  computeContourVertexColors,
  computeInverseCurveVertexColors,
  computePointsSpacing,
} from './inverseOffsetColors';

describe('inverseOffsetColors', () => {
  it('computes central-difference spacing for open and closed curves', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 6, y: 0 },
    ];
    const openSpacings = computePointsSpacing(points, false);
    expect(openSpacings[0]).toBeCloseTo(2);
    expect(openSpacings[1]).toBeCloseTo(3);
    expect(openSpacings[2]).toBeCloseTo(4);

    const square = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ];
    const closedSpacings = computePointsSpacing(square, true);
    expect(closedSpacings).toHaveLength(4);
    closedSpacings.forEach(s => {
      expect(s).toBeCloseTo(Math.SQRT2);
    });
  });

  it('generates Float32 vertex colors with scientific Viridis correspondence', () => {
    const curve: InverseOffsetCurve = {
      inverse_iteration: 1,
      points: [
        { x: 0, y: 0 },
        { x: 0.1, y: 0 },
        { x: 0.2, y: 0 },
        { x: 1.0, y: 0 },
        { x: 2.0, y: 0 },
      ],
      is_closed: false,
    };

    const result = computeInverseCurveVertexColors(curve);
    expect(result.hasValidData).toBe(true);
    expect(result.colors).toHaveLength(5 * 3);

    // Verify all colors are valid normalized floats
    for (let i = 0; i < result.colors.length; i += 1) {
      expect(result.colors[i]).toBeGreaterThanOrEqual(0);
      expect(result.colors[i]).toBeLessThanOrEqual(1);
    }
  });

  it('flags non-finite points and renders them with fallback color', () => {
    const curve: InverseOffsetCurve = {
      inverse_iteration: 1,
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: Number.NaN, y: Number.POSITIVE_INFINITY },
      ],
      is_closed: false,
    };

    const result = computeInverseCurveVertexColors(curve);
    expect(result.divergedCount).toBe(1);
    expect(result.colors).toHaveLength(9);
  });

  it('generates matching point-by-point Viridis colors for contour and inverse curves', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ];
    const curve: InverseOffsetCurve = {
      inverse_iteration: 1,
      points,
      is_closed: false,
    };

    const inverseColors = computeInverseCurveVertexColors(curve);
    const contourColors = computeContourVertexColors(points);

    expect(inverseColors.colors).toHaveLength(points.length * 3);
    expect(contourColors).toHaveLength(points.length * 3);

    // Both should match point-by-point exactly
    for (let i = 0; i < points.length * 3; i += 1) {
      expect(inverseColors.colors[i]).toBeCloseTo(contourColors[i]);
    }
  });
});
