import { describe, expect, it } from 'vitest';
import { randomHenonInvariantSeed } from './invariantSetSeed';

describe('randomHenonInvariantSeed', () => {
  it('returns a reproducible in-domain seed whose initial noise circle fits', () => {
    const values = [0.5, 0.5];
    let index = 0;
    const seed = randomHenonInvariantSeed(
      { xMin: -2, xMax: 2, yMin: -2, yMax: 2 },
      0.4,
      0.3,
      0.1,
      () => values[index++] ?? 0.5,
    );
    expect(seed).toEqual({ x: 0, y: 0 });
    const image = { x: 1 - 0.4 * seed.x * seed.x + seed.y, y: 0.3 * seed.x };
    expect(image.x - 0.1).toBeGreaterThanOrEqual(-2);
    expect(image.x + 0.1).toBeLessThanOrEqual(2);
  });

  it('fails clearly when the domain cannot contain the first noise circle', () => {
    expect(() => randomHenonInvariantSeed(
      { xMin: -0.1, xMax: 0.1, yMin: -0.1, yMax: 0.1 },
      0.4,
      0.3,
      0.2,
      () => 0.5,
    )).toThrow('Could not place a random seed');
  });
});

