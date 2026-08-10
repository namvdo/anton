import type {
  OrbitExtendedState,
  PeriodicOrbit,
  SolutionPoint,
} from '../types/domain';

const isFiniteExtendedTuple = (point: unknown): point is number[] => (
  Array.isArray(point)
  && point.length >= 4
  && point.slice(0, 4).every(Number.isFinite)
);

export const orbitExtendedStates = (orbit: PeriodicOrbit): OrbitExtendedState[] => {
  const projectedPoints = Array.isArray(orbit?.points) ? orbit.points : [];
  const extendedPoints = Array.isArray(orbit?.extended_points) ? orbit.extended_points : [];
  return projectedPoints.map((position, pointIndex) => {
    const extended = extendedPoints[pointIndex];
    if (isFiniteExtendedTuple(extended)) {
      return {
        x: extended[0],
        y: extended[1],
        nx: extended[2],
        ny: extended[3],
        pointIndex
      };
    }
    return {
      x: Number(position?.[0]),
      y: Number(position?.[1]),
      nx: null,
      ny: null,
      pointIndex
    };
  }).filter(state => Number.isFinite(state.x) && Number.isFinite(state.y));
};

export const fixedPointSolutionsFromOrbits = (orbits: PeriodicOrbit[]): SolutionPoint[] => (orbits || [])
  .filter(orbit => orbit?.period === 1)
  .flatMap(orbit => orbitExtendedStates(orbit).slice(0, 1).map(state => ({
    ...state,
    period: 1,
    stability: orbit.stability,
    eigenvalues: orbit.eigenvalues || []
  })));

export const enrichSolutionPointsWithOrbitNormals = (
  solutionPoints: SolutionPoint[],
  orbits: PeriodicOrbit[],
  positionTolerance = 1e-8
): SolutionPoint[] => {
  const candidates = (orbits || []).flatMap(orbit => orbitExtendedStates(orbit).map(state => ({
    ...state,
    period: orbit.period
  })));
  return (solutionPoints || []).map(point => {
    if (Number.isFinite(point?.nx) && Number.isFinite(point?.ny)) return point;
    const match = candidates.find(candidate => (
      Math.hypot(candidate.x - point.x, candidate.y - point.y) <= positionTolerance
      && Number.isFinite(candidate.nx)
      && Number.isFinite(candidate.ny)
    ));
    return match
      ? { ...point, nx: match.nx, ny: match.ny, period: point.period || match.period }
      : point;
  });
};
