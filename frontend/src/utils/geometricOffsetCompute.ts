import type {
  ExtendedPointLike,
  ExtendedPointTuple,
  GeometricOffsetLevel,
  GeometricOffsetResult,
  InverseOffsetResult,
  PointLike,
} from '../types/domain';
import type { GeometricOffsetBatchComputePayload } from '../protocol/computeContracts';
import { normalizeContourEpsilons } from './geometricOffsetBatch';
import { computePointsSpacing } from './inverseOffsetColors';

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

const inverseHenonExtendedPoint = (
  point: ExtendedPointLike,
  a: number,
  b: number,
  epsilon: number,
): { x: number; y: number; nx: number; ny: number } => {
  const [mappedX, mappedY, mappedNx, mappedNy] = extendedPoint(point);
  if (![a, b, epsilon, mappedX, mappedY, mappedNx, mappedNy].every(Number.isFinite)
    || Math.abs(b) < 1e-12 || epsilon < 0) {
    throw new Error('Open preimage mapping requires finite parameters and nonzero Hénon b.');
  }
  const mappedNormalLength = Math.hypot(mappedNx, mappedNy);
  if (mappedNormalLength < 1e-14) {
    throw new Error('Open preimage source contains a degenerate normal.');
  }
  const mx = mappedNx / mappedNormalLength;
  const my = mappedNy / mappedNormalLength;
  const x = (mappedY - epsilon * my) / b;
  const y = mappedX - epsilon * mx - 1 + a * x * x;
  const rawNx = -2 * a * x * mx + b * my;
  const rawNy = mx;
  const normalLength = Math.hypot(rawNx, rawNy);
  if (!Number.isFinite(normalLength) || normalLength < 1e-14) {
    throw new Error('Open preimage mapping produced a degenerate normal.');
  }
  return { x, y, nx: rawNx / normalLength, ny: rawNy / normalLength };
};

/** Map open offset samples through the inverse extended Hénon map point by point. */
export const computeOpenGeometricOffsetPreimages = (
  levels: GeometricOffsetLevel[],
  params: { a: number; b: number; epsilon: number },
  iterations: number,
): InverseOffsetResult => {
  if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 8) {
    throw new Error('Inverse offset iterations must lie between 1 and 8.');
  }
  const curves: NonNullable<InverseOffsetResult['curves']> = [];
  let totalOutputPoints = 0;
  for (const level of levels) {
    for (const [componentIndex, component] of (level.boundary_components || []).entries()) {
      let source = component.points || [];
      if (source.length === 0) {
        throw new Error('An open preimage source requires at least one point.');
      }
      let previousSpacing = computePointsSpacing(source, component.is_closed ?? false);
      for (let inverseIteration = 1; inverseIteration <= iterations; inverseIteration += 1) {
        const points = source.map(point => inverseHenonExtendedPoint(
          point as ExtendedPointLike,
          params.a,
          params.b,
          params.epsilon,
        ));
        const currentSpacing = computePointsSpacing(points, component.is_closed ?? false);
        const densities = currentSpacing.map(s => (s > 1e-14 ? 1 / s : 0));
        const stepRatios = previousSpacing.map((prev, idx) => (
          prev > 1e-14 ? currentSpacing[idx] / prev : 1.0
        ));
        totalOutputPoints += points.length;
        curves.push({
          source_level: level.level,
          source_component_id: component.id ?? componentIndex,
          inverse_iteration: inverseIteration,
          is_closed: component.is_closed ?? false,
          points,
          input_point_count: source.length,
          output_point_count: points.length,
          closure_position_residual: 0,
          closure_normal_residual: 0,
          max_position_chord_error: 0,
          max_normal_chord_error: 0,
          subdivision_limit_reached: false,
          source_relation: 'open_point_set',
          local_spacings: currentSpacing,
          step_ratios: stepRatios,
          densities,
        });
        previousSpacing = currentSpacing;
        source = points;
      }
    }
  }
  return {
    curves,
    source_curve_count: levels.reduce(
      (count, level) => count + (level.boundary_components || []).length,
      0,
    ),
    completed_iterations: iterations,
    total_output_points: totalOutputPoints,
    max_position_chord_error: 0,
    max_normal_chord_error: 0,
    subdivision_limit_reached: false,
  };
};

export const buildGeometricOffsetBatchRequest = (
  boundary: ExtendedPointLike[],
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
  const normalizedBoundary = buildSingleGeometricOffsetRequest(boundary, epsilonValues[0]).boundary;
  const contoursByEpsilon = new Map(contours.map(contour => [
    normalizeContourEpsilons([contour.epsilon])[0],
    contour,
  ]));
  return {
    boundary: normalizedBoundary,
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
