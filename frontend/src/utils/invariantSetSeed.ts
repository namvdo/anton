import type { ProjectedState, ViewRange } from '../types/domain';

const MAX_RANDOM_SEED_ATTEMPTS = 256;

const deterministicHenonImage = (
  seed: ProjectedState,
  a: number,
  b: number,
): ProjectedState => ({
  x: 1 - a * seed.x * seed.x + seed.y,
  y: b * seed.x,
});

const noiseCircleFitsDomain = (
  center: ProjectedState,
  epsilon: number,
  domain: ViewRange,
): boolean => (
  center.x - epsilon >= domain.xMin
  && center.x + epsilon <= domain.xMax
  && center.y - epsilon >= domain.yMin
  && center.y + epsilon <= domain.yMax
);

export const randomHenonInvariantSeed = (
  domain: ViewRange,
  a: number,
  b: number,
  epsilon: number,
  random: () => number = Math.random,
): ProjectedState => {
  if (![domain.xMin, domain.xMax, domain.yMin, domain.yMax, a, b, epsilon]
    .every(Number.isFinite)
    || domain.xMin >= domain.xMax
    || domain.yMin >= domain.yMax
    || epsilon <= 0) {
    throw new Error('Random invariant-set seed requires a valid domain and positive noise radius.');
  }
  for (let attempt = 0; attempt < MAX_RANDOM_SEED_ATTEMPTS; attempt += 1) {
    const seed = {
      x: domain.xMin + random() * (domain.xMax - domain.xMin),
      y: domain.yMin + random() * (domain.yMax - domain.yMin),
    };
    if (noiseCircleFitsDomain(deterministicHenonImage(seed, a, b), epsilon, domain)) {
      return seed;
    }
  }
  throw new Error(
    'Could not place a random seed whose first noise circle fits the computation domain. '
    + 'Enlarge the domain, reduce epsilon, or use the manual start point.',
  );
};

