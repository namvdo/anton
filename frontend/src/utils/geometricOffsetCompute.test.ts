import { describe, expect, it } from 'vitest';
import {
  buildGeometricOffsetBatchRequest,
  buildSingleGeometricOffsetRequest,
  computeOpenGeometricOffsetPreimages,
  geometricOffsetSampleSpacing,
  projectGeometricOffsetBoundary,
} from './geometricOffsetCompute';

describe('single geometric-offset computation settings', () => {
  const boundary = [
    [-1, -0.5, -1, 0],
    [2, -0.25, 1, 0],
    [0.5, 1.5, 0, 1]
  ];

  it('preserves the extended boundary and attached normals in the request', () => {
    const request = buildSingleGeometricOffsetRequest(boundary, 0.2);
    expect(request).toEqual({
      boundary,
      params: { epsilon: 0.2 }
    });
  });

  it('validates and sorts a complete contour batch before worker execution', () => {
    expect(buildGeometricOffsetBatchRequest(boundary, [
      { id: 'large', epsilon: 0.2 },
      { id: 'small', epsilon: 0.1 },
    ])).toEqual({
      boundary,
      contours: [
        { id: 'small', epsilon: 0.1 },
        { id: 'large', epsilon: 0.2 },
      ],
    });
    expect(() => buildGeometricOffsetBatchRequest(boundary, [
      { id: 'first', epsilon: 0.1 },
      { id: 'duplicate', epsilon: 0.1 },
    ])).toThrow(/unique/);
    expect(() => buildGeometricOffsetBatchRequest(boundary, [
      { id: 'same', epsilon: 0.1 },
      { id: 'same', epsilon: 0.2 },
    ])).toThrow(/identifiers must be unique/);
  });

  it('rejects invalid input before starting the worker', () => {
    expect(() => buildSingleGeometricOffsetRequest(boundary, 0)).toThrow(/positive and finite/);
    expect(() => buildSingleGeometricOffsetRequest([], 0.1)).toThrow(/at least one/i);
    expect(() => buildSingleGeometricOffsetRequest([
      [0, 0, 1, 0],
      [1, 0, 1, 0],
      [NaN, 1, 0, 1]
    ], 0.1)).toThrow(/non-finite/);
    expect(() => buildSingleGeometricOffsetRequest([
      [0, 0, 1, 0],
      [1, 0, 0, 0],
      [0, 1, 0, 1]
    ], 0.1)).toThrow(/degenerate attached normal/);
  });

  it('preserves one-to-one point correspondence, including repeats', () => {
    const points = [[0, 0, 1, 0], [0, 0, 1, 0]];
    expect(buildSingleGeometricOffsetRequest(points, 0.1).boundary).toEqual(points);
  });

  it('maps every point by epsilon times its attached unit normal', () => {
    const result = projectGeometricOffsetBoundary([
      [1, 2, 3, 4],
      [-1, 0, 0, -2],
      [1, 2, 3, 4],
    ], 0.5);
    const component = result.levels[0].boundary_components![0];
    expect(component.points).toEqual([
      { x: 1.3, y: 2.4, nx: 0.6, ny: 0.8 },
      { x: -1, y: -0.5, nx: 0, ny: -1 },
      { x: 1.3, y: 2.4, nx: 0.6, ny: 0.8 },
    ]);
    expect(component.is_closed).toBe(true);
  });

  it('computes open preimages point to point without closing or resampling', () => {
    const a = 0.4;
    const b = 0.3;
    const epsilon = 0.1;
    const source = { x: 0.7, y: -0.2, nx: 0.6, ny: 0.8 };
    const rawNx = source.ny;
    const rawNy = (source.nx + 2 * a * source.x * source.ny) / b;
    const normalLength = Math.hypot(rawNx, rawNy);
    const nx = rawNx / normalLength;
    const ny = rawNy / normalLength;
    const mapped = {
      x: 1 - a * source.x * source.x + source.y + epsilon * nx,
      y: b * source.x + epsilon * ny,
      nx,
      ny,
    };
    const result = computeOpenGeometricOffsetPreimages([{
      level: 1,
      target_distance: 0.1,
      boundary_components: [{ is_closed: false, points: [mapped, mapped] }],
    }], { a, b, epsilon }, 1);
    const curve = result.curves[0];
    expect(curve.is_closed).toBe(false);
    expect(curve.points).toHaveLength(2);
    expect(curve.output_point_count).toBe(2);
    curve.points!.forEach(point => {
      expect(point.x).toBeCloseTo(source.x, 12);
      expect(point.y).toBeCloseTo(source.y, 12);
      const extended = point as unknown as { nx: number; ny: number };
      expect(extended.nx).toBeCloseTo(source.nx, 12);
      expect(extended.ny).toBeCloseTo(source.ny, 12);
    });
  });

  it('uses median projected segment length for inverse-curve refinement', () => {
    expect(geometricOffsetSampleSpacing({
      completed_levels: 1,
      levels: [{
        level: 1,
        target_distance: 0.1,
        boundary_components: [{
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 2 },
            { x: 0, y: 2 }
          ]
        }]
      }]
    })).toBe(2);
  });
});
