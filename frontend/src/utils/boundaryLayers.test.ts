import { describe, expect, it } from 'vitest';
import {
  reconstructDeterministicImageBoundary,
  summarizeClosedBoundarySampling,
} from './boundaryLayers';
import type { ExtendedPointTuple } from '../types/domain';

describe('Wei boundary-layer construction', () => {
  const boundary: ExtendedPointTuple[] = [
    [2, 0, 2, 0],
    [0, 2, 0, 2],
    [-2, 0, -2, 0],
    [0, -2, 0, -2],
  ];

  it('recovers f(partial M) by subtracting epsilon along unit normals', () => {
    const deterministic = reconstructDeterministicImageBoundary(boundary, 0.5);
    expect(deterministic).toEqual([
      { x: 1.5, y: 0, nx: 1, ny: 0 },
      { x: 0, y: 1.5, nx: 0, ny: 1 },
      { x: -1.5, y: 0, nx: -1, ny: 0 },
      { x: 0, y: -1.5, nx: 0, ny: -1 },
    ]);
    deterministic.forEach((point, index) => {
      expect(Math.hypot(
        boundary[index][0] - point.x,
        boundary[index][1] - point.y,
      )).toBeCloseTo(0.5, 12);
    });
  });

  it('preserves the boundary positions in deterministic zero-noise mode', () => {
    const deterministic = reconstructDeterministicImageBoundary(boundary, 0);
    deterministic.forEach((point, index) => {
      expect(point.x).toBe(boundary[index][0]);
      expect(point.y).toBe(boundary[index][1]);
    });
  });

  it('fails fast for invalid normals and noise radii', () => {
    expect(() => reconstructDeterministicImageBoundary(boundary, -0.1)).toThrow(/nonnegative/);
    expect(() => reconstructDeterministicImageBoundary([
      [0, 0, 1, 0],
      [1, 0, 0, 0],
      [0, 1, 0, 1],
    ], 0.1)).toThrow(/degenerate normal/);
  });

  it('reports closed-curve sample density from count and perimeter', () => {
    const summary = summarizeClosedBoundarySampling([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ]);
    expect(summary).toEqual({
      sampleCount: 4,
      perimeter: 8,
      pointsPerUnit: 0.5,
      maximumGap: 2,
    });
  });

  it('rejects non-finite sampling geometry', () => {
    expect(() => summarizeClosedBoundarySampling([
      { x: 0, y: 0 },
      { x: Number.NaN, y: 0 },
      { x: 0, y: 1 },
    ])).toThrow(/finite positions/);
  });
});
