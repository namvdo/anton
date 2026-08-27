import { describe, expect, it } from 'vitest';
import {
  buildGeometricOffsetBatchRequest,
  buildSingleGeometricOffsetRequest,
  geometricOffsetSampleSpacing,
  projectGeometricOffsetBoundaries,
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
    expect(buildGeometricOffsetBatchRequest([{ points: boundary, isClosed: false }], [
      { id: 'large', epsilon: 0.2 },
      { id: 'small', epsilon: 0.1 },
    ])).toEqual({
      boundaries: [{ points: boundary, isClosed: false }],
      contours: [
        { id: 'small', epsilon: 0.1 },
        { id: 'large', epsilon: 0.2 },
      ],
    });
    expect(() => buildGeometricOffsetBatchRequest([{ points: boundary, isClosed: false }], [
      { id: 'first', epsilon: 0.1 },
      { id: 'duplicate', epsilon: 0.1 },
    ])).toThrow(/unique/);
    expect(() => buildGeometricOffsetBatchRequest([{ points: boundary, isClosed: false }], [
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

  it('keeps separate open branches in separate offset components', () => {
    const result = projectGeometricOffsetBoundaries([
      { points: [[0, 0, 1, 0], [1, 0, 1, 0]], isClosed: false },
      { points: [[10, 0, 0, 1], [11, 0, 0, 1]], isClosed: false },
    ], 0.25);
    const components = result.levels[0].boundary_components!;

    expect(components).toHaveLength(2);
    expect(components.map(component => component.points)).toEqual([
      [{ x: 0.25, y: 0, nx: 1, ny: 0 }, { x: 1.25, y: 0, nx: 1, ny: 0 }],
      [{ x: 10, y: 0.25, nx: 0, ny: 1 }, { x: 11, y: 0.25, nx: 0, ny: 1 }],
    ]);
    expect(components.every(component => component.is_closed === false)).toBe(true);
  });

  it('uses only real open-curve segments when deriving inverse refinement spacing', () => {
    expect(geometricOffsetSampleSpacing({
      completed_levels: 1,
      levels: [{
        level: 1,
        target_distance: 0.1,
        boundary_components: [{
          is_closed: false,
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 2 },
            { x: 0, y: 2 }
          ]
        }]
      }]
    })).toBe(1);
  });
});
