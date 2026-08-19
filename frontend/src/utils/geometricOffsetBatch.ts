import type {
  GeometricOffsetContour,
  GeometricOffsetState,
} from '../types/domain';
import { categoricalCurveColor } from './categoricalCurveColor';

export const MIN_CONTOUR_EPSILON = 0;
export const MAX_CONTOUR_EPSILON = 2;
export const MAX_BATCH_CONTOURS = 12;

const EPSILON_PRECISION = 12;

export const normalizeContourEpsilon = (value: number): number => {
  const epsilon = Number(value);
  if (!Number.isFinite(epsilon)
    || epsilon < MIN_CONTOUR_EPSILON
    || epsilon > MAX_CONTOUR_EPSILON) {
    throw new Error(
      `Contour ε must lie between ${MIN_CONTOUR_EPSILON} and ${MAX_CONTOUR_EPSILON}.`,
    );
  }
  return Number(epsilon.toFixed(EPSILON_PRECISION));
};

export const geometricOffsetContourId = (epsilon: number): string => (
  `epsilon-${normalizeContourEpsilon(epsilon).toFixed(EPSILON_PRECISION).replace('.', 'p')}`
);

export const normalizeContourEpsilons = (values: number[]): number[] => {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('Add at least one geometric contour ε value.');
  }
  if (values.length > MAX_BATCH_CONTOURS) {
    throw new Error(`At most ${MAX_BATCH_CONTOURS} geometric contours can be computed together.`);
  }
  const normalized = values.map(normalizeContourEpsilon).sort((left, right) => left - right);
  const unique = normalized.filter((value, index) => index === 0 || value !== normalized[index - 1]);
  if (unique.length !== normalized.length) {
    throw new Error('Geometric contour ε values must be unique.');
  }
  return unique;
};

export const generateEvenlySpacedEpsilons = (
  startValue: number,
  endValue: number,
  countValue: number,
): number[] => {
  const start = normalizeContourEpsilon(startValue);
  const end = normalizeContourEpsilon(endValue);
  const count = Number(countValue);
  if (!Number.isSafeInteger(count) || count < 2 || count > MAX_BATCH_CONTOURS) {
    throw new Error(`Series count must be an integer between 2 and ${MAX_BATCH_CONTOURS}.`);
  }
  if (end <= start) {
    throw new Error('Series end ε must be greater than start ε.');
  }
  const step = (end - start) / (count - 1);
  return normalizeContourEpsilons(
    Array.from({ length: count }, (_, index) => (
      index === count - 1 ? end : start + index * step
    )),
  );
};

export const createGeometricOffsetContour = (epsilon: number): GeometricOffsetContour => ({
  id: geometricOffsetContourId(epsilon),
  epsilon: normalizeContourEpsilon(epsilon),
  visible: true,
  result: null,
  inverseResult: null,
  error: null,
  inverseError: null,
});

export const reconcileGeometricOffsetContours = (
  current: GeometricOffsetContour[],
  epsilonValues: number[],
): GeometricOffsetContour[] => {
  const values = normalizeContourEpsilons(epsilonValues);
  const existing = new Map(current.map(contour => [contour.id, contour]));
  return values.map(epsilon => {
    const id = geometricOffsetContourId(epsilon);
    return existing.get(id) ?? createGeometricOffsetContour(epsilon);
  });
};

export const replaceGeometricOffsetContours = (
  state: GeometricOffsetState,
  epsilonValues: number[],
): GeometricOffsetState => {
  const contours = reconcileGeometricOffsetContours(state.contours, epsilonValues);
  const availableIds = new Set(contours.map(contour => contour.id));
  const selectedContourId = state.selectedContourId && availableIds.has(state.selectedContourId)
    ? state.selectedContourId
    : contours[0]?.id ?? null;
  const preimageSourceIds = state.preimageSourceIds.filter(id => availableIds.has(id));
  if (selectedContourId && !preimageSourceIds.includes(selectedContourId)) {
    preimageSourceIds.push(selectedContourId);
  }
  return {
    ...state,
    contours,
    selectedContourId,
    preimageSourceIds,
    error: null,
    inverseError: null,
  };
};

export const selectGeometricOffsetContour = (
  state: GeometricOffsetState,
  contourId: string,
): GeometricOffsetState => {
  if (!state.contours.some(contour => contour.id === contourId)) return state;
  return {
    ...state,
    selectedContourId: contourId,
    preimageSourceIds: state.preimageSourceIds.includes(contourId)
      ? state.preimageSourceIds
      : [...state.preimageSourceIds, contourId],
  };
};

export const removeGeometricOffsetContour = (
  state: GeometricOffsetState,
  contourId: string,
): GeometricOffsetState => {
  if (state.contours.length <= 1) {
    return { ...state, error: 'At least one geometric contour is required.' };
  }
  const contours = state.contours.filter(contour => contour.id !== contourId);
  if (contours.length === state.contours.length) return state;
  const selectedContourId = state.selectedContourId === contourId
    ? contours[0].id
    : state.selectedContourId;
  const preimageSourceIds = state.preimageSourceIds.filter(id => id !== contourId);
  if (selectedContourId && !preimageSourceIds.includes(selectedContourId)) {
    preimageSourceIds.push(selectedContourId);
  }
  return {
    ...state,
    contours,
    selectedContourId,
    preimageSourceIds,
    error: null,
    inverseError: null,
  };
};

export const geometricOffsetSourceContours = (
  state: GeometricOffsetState,
): GeometricOffsetContour[] => {
  const ids = new Set(state.preimageSourceIds);
  if (state.selectedContourId) ids.add(state.selectedContourId);
  return state.contours.filter(contour => ids.has(contour.id) && contour.result !== null);
};

export const formatContourEpsilon = (epsilon: number): string => (
  normalizeContourEpsilon(epsilon).toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
);

export const geometricOffsetContourColor = (index: number): string => (
  categoricalCurveColor(index)
);
