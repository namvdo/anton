import { describe, expect, it } from 'vitest';
import { reconstructDeterministicImageBoundary } from './deterministicImageBoundary';

describe('deterministic-image compatibility export', () => {
  it('uses the validated boundary-layer reconstruction', () => {
    expect(reconstructDeterministicImageBoundary([
      [2, 0, 2, 0],
      [0, 2, 0, 2],
      [-2, 0, -2, 0],
      [0, -2, 0, -2],
    ], 0.5)).toEqual([
      { x: 1.5, y: 0, nx: 1, ny: 0 },
      { x: 0, y: 1.5, nx: 0, ny: 1 },
      { x: -1.5, y: 0, nx: -1, ny: 0 },
      { x: 0, y: -1.5, nx: 0, ny: -1 },
    ]);
  });
});
