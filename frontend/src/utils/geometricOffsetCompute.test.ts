import { describe, expect, it } from 'vitest';
import {
  buildGeometricOffsetBatchRequest,
  buildSingleGeometricOffsetRequest,
  geometricOffsetSampleSpacing
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
    expect(() => buildSingleGeometricOffsetRequest([[0, 0, 1, 0], [1, 0, 1, 0]], 0.1)).toThrow(/nondegenerate/);
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
