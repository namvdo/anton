const coordinatePair = (point) => (
  Array.isArray(point)
    ? [Number(point[0]), Number(point[1])]
    : [Number(point?.x), Number(point?.y)]
);

const validateDirectProjectionInput = (boundary, contourEpsilon) => {
  const epsilon = Number(contourEpsilon);
  if (!Number.isFinite(epsilon) || epsilon <= 0) {
    throw new Error('Contour ε must be positive and finite.');
  }
  if (!Array.isArray(boundary) || boundary.length < 3) {
    throw new Error('A nondegenerate unstable-manifold boundary is required.');
  }

  boundary.forEach(point => {
    const [x, y] = coordinatePair(point);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error('The unstable-manifold boundary contains a non-finite point.');
    }
  });
  return epsilon;
};

export const buildSingleGeometricOffsetRequest = (boundary, contourEpsilon) => {
  const epsilon = validateDirectProjectionInput(boundary, contourEpsilon);
  return {
    boundary,
    params: { epsilon }
  };
};

export const geometricOffsetSampleSpacing = (result) => {
  const lengths = [];
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
