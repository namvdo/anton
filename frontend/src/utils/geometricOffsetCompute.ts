import type {
  ExtendedPointLike,
  ExtendedPointTuple,
  GeometricOffsetResult,
  PointLike,
} from '../types/domain';
import type { GeometricOffsetBatchComputePayload } from '../protocol/computeContracts';
import { normalizeContourEpsilons } from './geometricOffsetBatch';

const coordinatePair = (point: PointLike): [number, number] => (
  Array.isArray(point)
    ? [Number(point[0]), Number(point[1])]
    : [Number(point?.x), Number(point?.y)]
);

const extendedPoint = (point: ExtendedPointLike): [number, number, number, number] => (
  Array.isArray(point)
    ? [Number(point[0]), Number(point[1]), Number(point[2]), Number(point[3])]
    : [Number(point?.x), Number(point?.y), Number(point?.nx), Number(point?.ny)]
);

const validateDirectProjectionInput = (
  boundary: ExtendedPointLike[],
  contourEpsilon: number,
): number => {
  const epsilon = Number(contourEpsilon);
  if (!Number.isFinite(epsilon) || epsilon <= 0) {
    throw new Error('Contour ε must be positive and finite.');
  }
  if (!Array.isArray(boundary) || boundary.length === 0) {
    throw new Error('At least one unstable-manifold boundary point is required.');
  }

  boundary.forEach(point => {
    const [x, y, nx, ny] = extendedPoint(point);
    if (![x, y, nx, ny].every(Number.isFinite)) {
      throw new Error('The unstable-manifold boundary contains a non-finite position or normal.');
    }
    if (Math.hypot(nx, ny) < 1e-14) {
      throw new Error('The unstable-manifold boundary contains a degenerate attached normal.');
    }
  });
  return epsilon;
};

export const buildSingleGeometricOffsetRequest = (
  boundary: ExtendedPointLike[],
  contourEpsilon: number,
): { boundary: ExtendedPointTuple[]; params: { epsilon: number } } => {
  const epsilon = validateDirectProjectionInput(boundary, contourEpsilon);
  return {
    boundary: boundary.map(extendedPoint),
    params: { epsilon }
  };
};

/** Apply the geometric offset as an index-preserving point map. */
export const projectGeometricOffsetBoundary = (
  boundary: ExtendedPointLike[],
  contourEpsilon: number,
): GeometricOffsetResult => {
  const { boundary: points, params } = buildSingleGeometricOffsetRequest(
    boundary,
    contourEpsilon,
  );
  const projected = points.map(([x, y, nx, ny]) => {
    const length = Math.hypot(nx, ny);
    const unitNx = nx / length;
    const unitNy = ny / length;
    return {
      x: x + params.epsilon * unitNx,
      y: y + params.epsilon * unitNy,
      nx: unitNx,
      ny: unitNy,
    };
  });
  const first = projected[0];
  const last = projected[projected.length - 1];
  const isClosed = projected.length >= 2
    && Math.hypot(first.x - last.x, first.y - last.y) <= 1e-14
    && Math.hypot(first.nx - last.nx, first.ny - last.ny) <= 1e-14;

  return {
    levels: [{
      level: 1,
      target_distance: params.epsilon,
      boundary_components: [{
        id: 0,
        points: projected,
        is_closed: isClosed,
        is_hole: false,
      }],
      component_count: 1,
    }],
    completed_levels: 1,
    epsilon: params.epsilon,
    stop_reason: 'requested_levels_completed',
  };
};

export const projectGeometricOffsetBoundaries = (
  boundaries: GeometricOffsetBatchComputePayload['boundaries'],
  contourEpsilon: number,
): GeometricOffsetResult => {
  if (!Array.isArray(boundaries) || boundaries.length === 0) {
    throw new Error('At least one unstable-manifold boundary branch is required.');
  }
  const components = boundaries.map(({ points, isClosed }, id) => {
    const result = projectGeometricOffsetBoundary(points, contourEpsilon);
    const component = result.levels[0].boundary_components?.[0];
    if (!component) {
      throw new Error('Geometric projection did not return a boundary component.');
    }
    return {
      ...component,
      id,
      is_closed: isClosed || component.is_closed === true,
    };
  });
  return {
    levels: [{
      level: 1,
      target_distance: contourEpsilon,
      boundary_components: components,
      component_count: components.length,
    }],
    completed_levels: 1,
    epsilon: contourEpsilon,
    stop_reason: 'requested_levels_completed',
  };
};

export const buildGeometricOffsetBatchRequest = (
  boundaries: Array<{ points: ExtendedPointLike[]; isClosed: boolean }>,
  contours: Array<{ id: string; epsilon: number }>,
): GeometricOffsetBatchComputePayload => {
  if (!Array.isArray(contours) || contours.length === 0) {
    throw new Error('Add at least one geometric contour ε value.');
  }
  const contourIds = contours.map(contour => contour.id);
  if (contourIds.some(id => typeof id !== 'string' || id.trim().length === 0)) {
    throw new Error('Each geometric contour requires a stable identifier.');
  }
  if (new Set(contourIds).size !== contourIds.length) {
    throw new Error('Geometric contour identifiers must be unique.');
  }
  const epsilonValues = normalizeContourEpsilons(contours.map(contour => contour.epsilon));
  if (!Array.isArray(boundaries) || boundaries.length === 0) {
    throw new Error('At least one unstable-manifold boundary branch is required.');
  }
  const normalizedBoundaries = boundaries.map(({ points, isClosed }) => ({
    points: buildSingleGeometricOffsetRequest(points, epsilonValues[0]).boundary,
    isClosed: isClosed === true,
  }));
  const contoursByEpsilon = new Map(contours.map(contour => [
    normalizeContourEpsilons([contour.epsilon])[0],
    contour,
  ]));
  return {
    boundaries: normalizedBoundaries,
    contours: epsilonValues.map(epsilon => {
      const contour = contoursByEpsilon.get(epsilon);
      if (!contour) {
        throw new Error('Each geometric contour requires a stable identifier.');
      }
      return { id: contour.id, epsilon };
    }),
  };
};

export const geometricOffsetSampleSpacing = (result: GeometricOffsetResult | null): number => {
  const lengths: number[] = [];
  for (const level of result?.levels || []) {
    for (const component of level?.boundary_components || []) {
      const points = component?.points || [];
      const segmentCount = component.is_closed === true
        ? points.length
        : Math.max(0, points.length - 1);
      for (let index = 0; index < segmentCount; index += 1) {
        const current = coordinatePair(points[index]);
        const next = coordinatePair(points[(index + 1) % points.length]);
        const length = Math.hypot(next[0] - current[0], next[1] - current[1]);
        if (Number.isFinite(length) && length > 0) lengths.push(length);
      }
    }
  }
  if (!lengths.length) {
    throw new Error('The stored geometric-offset contour has no valid segments.');
  }
  lengths.sort((left, right) => left - right);
  return lengths[Math.floor(lengths.length / 2)];
};
