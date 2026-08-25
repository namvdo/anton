import { describe, expect, it } from 'vitest';
import {
  enrichSolutionPointsWithOrbitNormals,
  fixedPointSolutionsFromOrbits,
  orbitExtendedStates
} from './extendedOrbitState';

const orbit = {
  period: 2,
  stability: 'saddle',
  points: [[1, 2], [3, 4]],
  extended_points: [[1, 2, 0.6, 0.8], [3, 4, -0.8, 0.6]],
  eigenvalues: [2, 0.5]
};

describe('extended periodic-orbit state', () => {
  it('uses all four stored components for every orbit state', () => {
    expect(orbitExtendedStates(orbit)).toEqual([
      { x: 1, y: 2, nx: 0.6, ny: 0.8, pointIndex: 0 },
      { x: 3, y: 4, nx: -0.8, ny: 0.6, pointIndex: 1 }
    ]);
  });

  it('creates fixed-point display records from period-one extended states', () => {
    const fixed = { ...orbit, period: 1, points: [orbit.points[0]], extended_points: [orbit.extended_points[0]] };
    expect(fixedPointSolutionsFromOrbits([fixed])[0]).toMatchObject({
      x: 1, y: 2, nx: 0.6, ny: 0.8, period: 1, stability: 'saddle'
    });
  });

  it('restores normals discarded by a projected manifold result', () => {
    expect(enrichSolutionPointsWithOrbitNormals([
      { x: 3, y: 4, stability: 'saddle' }
    ], [orbit])).toEqual([
      { x: 3, y: 4, nx: -0.8, ny: 0.6, period: 2, stability: 'saddle', eigenvalues: [2, 0.5] }
    ]);
  });
});
