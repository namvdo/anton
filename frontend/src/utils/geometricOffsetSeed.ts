import type {
  ExtendedPointTuple,
  Manifold,
  ManifoldBranch,
} from '../types/domain';

const cleanExtendedPoints = (points: unknown): ExtendedPointTuple[] => {
  if (!Array.isArray(points)) return [];
  const valid = points.every((point): point is ExtendedPointTuple => (
    Array.isArray(point) && point.length >= 4 && point.slice(0, 4).every(Number.isFinite)
  ));
  // Never bridge across a rejected calculated state. The whole branch is
  // unavailable when its stored sequence is not a finite extended-state path.
  return valid ? points : [];
};

/** Preserve every calculated branch and its traversal order. */
export const collectExtendedManifoldBranches = (
  manifolds: Manifold[],
): ExtendedPointTuple[][] => (manifolds || []).flatMap(manifold => (
  [manifold.plus, manifold.minus]
    .map(branch => cleanExtendedPoints(branch?.extended_points))
    .filter(branch => branch.length > 0)
));

interface TopologyArc {
  sourceId: number;
  targetId: number;
  points: ExtendedPointTuple[];
}

const topologyArc = (
  manifold: Manifold,
  branch: ManifoldBranch | undefined,
): TopologyArc | null => {
  const sourceId = manifold.source_topology_id;
  const targetId = branch?.reached_target_id;
  const points = cleanExtendedPoints(branch?.extended_points);
  if (
    !Number.isSafeInteger(sourceId)
    || !Number.isSafeInteger(targetId)
    || branch?.stop_reason !== 'ApproachedTargetPoint'
    || points.length < 2
  ) {
    return null;
  }
  return {
    sourceId: sourceId as number,
    targetId: targetId as number,
    points,
  };
};

const appendOrderedArc = (
  ordered: ExtendedPointTuple[],
  points: ExtendedPointTuple[],
): void => {
  if (ordered.length === 0) {
    ordered.push(...points);
    return;
  }
  const previous = ordered[ordered.length - 1];
  const first = points[0];
  const identical = previous.slice(0, 4).every((value, index) => value === first[index]);
  ordered.push(...(identical ? points.slice(1) : points));
};

/**
 * Assemble every topology-verified cycle without geometric closure inference.
 *
 * A connected component is accepted only when every periodic-state node has
 * exactly one incoming and one outgoing branch, and every branch reports
 * ApproachedTargetPoint with explicit source and target identities. No
 * endpoint tolerance, area ranking, angular sort, branch reversal, or
 * artificial closing sample is used.
 */
export const buildVerifiedBoundaryCycles = (
  manifolds: Manifold[],
): ExtendedPointTuple[][] => {
  const arcs = (manifolds || []).flatMap(manifold => (
    [topologyArc(manifold, manifold.plus), topologyArc(manifold, manifold.minus)]
      .filter((arc): arc is TopologyArc => arc !== null)
  ));
  if (arcs.length === 0) return [];

  const outgoing = new Map<number, number[]>();
  const incoming = new Map<number, number[]>();
  arcs.forEach((arc, edgeIndex) => {
    outgoing.set(arc.sourceId, [...(outgoing.get(arc.sourceId) || []), edgeIndex]);
    incoming.set(arc.targetId, [...(incoming.get(arc.targetId) || []), edgeIndex]);
  });

  const unvisitedEdges = new Set(arcs.map((_, index) => index));
  const cycles: ExtendedPointTuple[][] = [];

  while (unvisitedEdges.size > 0) {
    const firstEdgeIndex = unvisitedEdges.values().next().value as number;
    const componentEdges = new Set<number>();
    const pendingNodes = [arcs[firstEdgeIndex].sourceId, arcs[firstEdgeIndex].targetId];
    const componentNodes = new Set<number>();

    while (pendingNodes.length > 0) {
      const node = pendingNodes.pop() as number;
      if (componentNodes.has(node)) continue;
      componentNodes.add(node);
      const adjacentEdges = [
        ...(outgoing.get(node) || []),
        ...(incoming.get(node) || []),
      ];
      for (const edgeIndex of adjacentEdges) {
        componentEdges.add(edgeIndex);
        const edge = arcs[edgeIndex];
        pendingNodes.push(edge.sourceId, edge.targetId);
      }
    }
    componentEdges.forEach(edgeIndex => unvisitedEdges.delete(edgeIndex));

    const directedCycleDegrees = [...componentNodes].every(node => (
      (outgoing.get(node) || []).filter(edgeIndex => componentEdges.has(edgeIndex)).length === 1
      && (incoming.get(node) || []).filter(edgeIndex => componentEdges.has(edgeIndex)).length === 1
    ));
    if (!directedCycleDegrees) continue;

    const remaining = new Set(componentEdges);
    // Choose the first calculated branch in the component as the traversal
    // origin. This fixes only the cyclic representation's starting index; it
    // does not rank or select among branches geometrically.
    const startIndex = firstEdgeIndex;
    const startArc = arcs[startIndex];
    remaining.delete(startIndex);

    const ordered: ExtendedPointTuple[] = [];
    appendOrderedArc(ordered, startArc.points);
    const startNode = startArc.sourceId;
    let currentNode = startArc.targetId;
    let valid = true;

    while (remaining.size > 0) {
      const nextIndex = [...remaining].find(edgeIndex => arcs[edgeIndex].sourceId === currentNode);
      if (nextIndex === undefined) {
        valid = false;
        break;
      }
      const nextArc = arcs[nextIndex];
      remaining.delete(nextIndex);
      appendOrderedArc(ordered, nextArc.points);
      currentNode = nextArc.targetId;
    }

    if (valid && currentNode === startNode && ordered.length >= 3) {
      cycles.push(ordered);
    }
  }

  return cycles;
};

/** Return a seed only when the topology identifies exactly one closed cycle. */
export const buildVerifiedBoundaryCycle = (
  manifolds: Manifold[],
): ExtendedPointTuple[] => {
  const cycles = buildVerifiedBoundaryCycles(manifolds);
  return cycles.length === 1 ? cycles[0] : [];
};
