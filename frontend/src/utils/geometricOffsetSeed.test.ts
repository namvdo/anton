import { describe, expect, it } from 'vitest';
import type { ExtendedPointTuple, Manifold } from '../types/domain';
import {
  buildGeometricOffsetSeed,
  buildVerifiedBoundaryCycle,
  buildVerifiedBoundaryCycles,
  collectExtendedManifoldBranches,
} from './geometricOffsetSeed';

const point = (x: number, y: number): ExtendedPointTuple => [x, y, 1, 0];

const arc = (
  sourceId: number,
  targetId: number,
  points: ExtendedPointTuple[],
): Manifold => ({
  source_topology_id: sourceId,
  plus: {
    reached_target_id: targetId,
    stop_reason: 'ApproachedTargetPoint',
    extended_points: points,
  },
});

describe('verified geometric-offset seed', () => {
  it('preserves calculated branches and traversal order', () => {
    const plus = [point(0, 0), point(1, 0), point(2, 0)];
    const minus = [point(0, 0), point(-1, 0), point(-2, 0)];
    expect(collectExtendedManifoldBranches([{ plus: { extended_points: plus }, minus: { extended_points: minus } }]))
      .toEqual([plus, minus]);
  });

  it('does not bridge across an invalid calculated state', () => {
    expect(collectExtendedManifoldBranches([{
      plus: { extended_points: [point(0, 0), [Number.NaN, 0, 1, 0], point(2, 0)] },
    }])).toEqual([]);
  });

  it('does not infer closure from geometric proximity', () => {
    const nearlyClosed = [point(0, 0), point(1, 0), point(1, 1), point(0, 1), point(1e-8, 0)];
    const manifolds = [{ plus: { extended_points: nearlyClosed } }];
    expect(buildVerifiedBoundaryCycles(manifolds)).toEqual([]);
    expect(buildGeometricOffsetSeed(manifolds)).toEqual([]);
  });

  it('assembles a cycle only from explicit source and target topology', () => {
    const first = arc(0, 1, [point(0, 0), point(1, 0), point(2, 0)]);
    const second = arc(1, 0, [point(2, 1), point(1, 1), point(0, 1)]);
    const cycles = buildVerifiedBoundaryCycles([first, second]);
    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toEqual([
      point(0, 0), point(1, 0), point(2, 0),
      point(2, 1), point(1, 1), point(0, 1),
    ]);
    expect(buildVerifiedBoundaryCycle([first, second])).toEqual(cycles[0]);
  });

  it('rejects an open branch graph', () => {
    expect(buildVerifiedBoundaryCycle([
      arc(0, 1, [point(0, 0), point(1, 0)]),
      arc(1, 2, [point(1, 0), point(2, 0)]),
    ])).toEqual([]);
  });

  it('rejects an undirected loop whose branch directions do not form a cycle', () => {
    expect(buildVerifiedBoundaryCycle([
      arc(0, 1, [point(0, 0), point(1, 0)]),
      arc(0, 1, [point(0, 1), point(1, 1)]),
    ])).toEqual([]);
  });

  it('does not choose among multiple verified cycles', () => {
    const manifolds = [
      arc(0, 1, [point(0, 0), point(1, 0)]),
      arc(1, 0, [point(1, 1), point(0, 1)]),
      arc(2, 3, [point(3, 0), point(4, 0)]),
      arc(3, 2, [point(4, 1), point(3, 1)]),
    ];
    expect(buildVerifiedBoundaryCycles(manifolds)).toHaveLength(2);
    expect(buildVerifiedBoundaryCycle(manifolds)).toEqual([]);
  });

  it('caps only an unambiguous verified cycle for worker transfer', () => {
    const upper = Array.from({ length: 60 }, (_, index) => point(index / 59, 0));
    const lower = Array.from({ length: 60 }, (_, index) => point(1 - index / 59, 1));
    const manifolds = [arc(0, 1, upper), arc(1, 0, lower)];
    expect(buildVerifiedBoundaryCycle(manifolds)).toHaveLength(120);
    expect(buildGeometricOffsetSeed(manifolds, 20).length).toBeLessThanOrEqual(20);
  });
});
