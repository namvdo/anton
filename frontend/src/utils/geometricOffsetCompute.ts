import type {
  ExtendedPointLike,
  ExtendedPointTuple,
  GeometricOffsetResult,
  PointLike,
} from '../types/domain';

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
  if (!Array.isArray(boundary) || boundary.length < 3) {
    throw new Error('A nondegenerate unstable-manifold boundary is required.');
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

export const geometricOffsetSampleSpacing = (result: GeometricOffsetResult | null): number => {
  const lengths: number[] = [];
  for (const level of result?.levels || []) {
    for (const component of level?.boundary_components || []) {
      const points = component?.points || [];
      for (let index = 0; index < points.length; index += 1) {
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
