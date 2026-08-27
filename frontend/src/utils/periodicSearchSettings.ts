import type { PeriodicSearchSettings } from '../types/domain';

export const DEFAULT_PERIODIC_SEARCH_SETTINGS: PeriodicSearchSettings = {
  gridSize: 18,
  thetaGridSize: 16,
  residualThreshold: 1e-10,
  useContinuation: false,
  maxNewtonIterations: 100,
  newtonBeta: null,
  deduplicationTolerance: 1e-3,
  supportFilterSubdivisions: 64,
  supportThreshold: 1e-10,
};

export const PERIODIC_SEARCH_LIMITS = {
  maxPeriodMin: 1,
  maxPeriodMax: 50,
  gridSizeMin: 2,
  gridSizeMax: 256,
  thetaGridSizeMin: 2,
  thetaGridSizeMax: 256,
  residualThresholdMin: 1e-14,
  residualThresholdMax: 1e-2,
  maxNewtonIterationsMin: 10,
  maxNewtonIterationsMax: 1000,
  deduplicationToleranceMin: 1e-6,
  deduplicationToleranceMax: 1e-1,
  supportFilterSubdivisionsMin: 8,
  supportFilterSubdivisionsMax: 256,
  supportThresholdMin: 1e-14,
  supportThresholdMax: 1e-2,
};

export interface PeriodicSearchPreset {
  id: 'standard' | 'deep' | 'ultra';
  label: string;
  description: string;
  maxPeriod: number;
  settings: PeriodicSearchSettings;
}

export const PERIODIC_SEARCH_PRESETS: readonly PeriodicSearchPreset[] = Object.freeze([
  {
    id: 'standard',
    label: 'Standard',
    description: '41,472 seeds',
    maxPeriod: 8,
    settings: { ...DEFAULT_PERIODIC_SEARCH_SETTINGS },
  },
  {
    id: 'deep',
    label: 'Deep',
    description: '138,240 seeds',
    maxPeriod: 10,
    settings: {
      ...DEFAULT_PERIODIC_SEARCH_SETTINGS,
      gridSize: 24,
      thetaGridSize: 24,
      residualThreshold: 1e-10,
      useContinuation: false,
    },
  },
  {
    id: 'ultra',
    label: 'Ultra',
    description: '393,216 seeds',
    maxPeriod: 12,
    settings: {
      ...DEFAULT_PERIODIC_SEARCH_SETTINGS,
      gridSize: 32,
      thetaGridSize: 32,
      residualThreshold: 1e-10,
      useContinuation: false,
    },
  },
]);

export const normalizePeriodicMaxPeriod = (value: number, fallback = 8): number => {
  const parsed = Number.parseInt(`${value}`, 10);
  const parsedFallback = Number.parseInt(`${fallback}`, 10);
  const safeFallback = Number.isFinite(parsedFallback)
    ? Math.min(
      PERIODIC_SEARCH_LIMITS.maxPeriodMax,
      Math.max(PERIODIC_SEARCH_LIMITS.maxPeriodMin, parsedFallback),
    )
    : 8;
  return Number.isFinite(parsed)
    ? Math.min(PERIODIC_SEARCH_LIMITS.maxPeriodMax, Math.max(PERIODIC_SEARCH_LIMITS.maxPeriodMin, parsed))
    : safeFallback;
};

export const estimatePeriodicGridSeedCount = (
  maxPeriod: number,
  gridSize: number,
  thetaGridSize: number,
): number => {
  const periodCount = normalizePeriodicMaxPeriod(maxPeriod);
  const settings = normalizePeriodicSearchSettings({ gridSize, thetaGridSize });
  return periodCount * settings.gridSize * settings.gridSize * settings.thetaGridSize;
};

export const normalizePeriodicSearchSettings = (
  next: Partial<PeriodicSearchSettings> | null | undefined,
  fallback: Partial<PeriodicSearchSettings> = DEFAULT_PERIODIC_SEARCH_SETTINGS,
): PeriodicSearchSettings => {
  const safeFallback: PeriodicSearchSettings = {
    ...DEFAULT_PERIODIC_SEARCH_SETTINGS,
    ...(fallback || {}),
  };
  const parsedGrid = Number.parseInt(`${next?.gridSize ?? safeFallback.gridSize}`, 10);
  const parsedTheta = Number.parseInt(`${next?.thetaGridSize ?? safeFallback.thetaGridSize}`, 10);
  const parsedThreshold = Number(next?.residualThreshold ?? safeFallback.residualThreshold);
  const useContinuation = Boolean(next?.useContinuation ?? safeFallback.useContinuation);

  const gridSize = Number.isFinite(parsedGrid)
    ? Math.min(PERIODIC_SEARCH_LIMITS.gridSizeMax, Math.max(PERIODIC_SEARCH_LIMITS.gridSizeMin, parsedGrid))
    : safeFallback.gridSize;

  const thetaGridSize = Number.isFinite(parsedTheta)
    ? Math.min(PERIODIC_SEARCH_LIMITS.thetaGridSizeMax, Math.max(PERIODIC_SEARCH_LIMITS.thetaGridSizeMin, parsedTheta))
    : safeFallback.thetaGridSize;

  const residualThreshold = Number.isFinite(parsedThreshold) && parsedThreshold > 0
    ? Math.min(PERIODIC_SEARCH_LIMITS.residualThresholdMax, Math.max(PERIODIC_SEARCH_LIMITS.residualThresholdMin, parsedThreshold))
    : safeFallback.residualThreshold;

  const rawMaxIters = next?.maxNewtonIterations ?? safeFallback.maxNewtonIterations;
  const parsedMaxIters = Number.parseInt(`${rawMaxIters}`, 10);
  const maxNewtonIterations = Number.isFinite(parsedMaxIters)
    ? Math.min(PERIODIC_SEARCH_LIMITS.maxNewtonIterationsMax, Math.max(PERIODIC_SEARCH_LIMITS.maxNewtonIterationsMin, parsedMaxIters))
    : (safeFallback.maxNewtonIterations ?? 100);

  const rawBeta = next?.newtonBeta !== undefined ? next.newtonBeta : safeFallback.newtonBeta;
  const newtonBeta = rawBeta === null || rawBeta === undefined || !Number.isFinite(Number(rawBeta))
    ? null
    : Math.max(0, Math.min(1000, Number(rawBeta)));

  const rawDedup = next?.deduplicationTolerance ?? safeFallback.deduplicationTolerance;
  const parsedDedup = Number(rawDedup);
  const deduplicationTolerance = Number.isFinite(parsedDedup) && parsedDedup > 0
    ? Math.min(PERIODIC_SEARCH_LIMITS.deduplicationToleranceMax, Math.max(PERIODIC_SEARCH_LIMITS.deduplicationToleranceMin, parsedDedup))
    : (safeFallback.deduplicationTolerance ?? 1e-3);

  const rawSubdiv = next?.supportFilterSubdivisions ?? safeFallback.supportFilterSubdivisions;
  const parsedSubdiv = Number.parseInt(`${rawSubdiv}`, 10);
  const supportFilterSubdivisions = Number.isFinite(parsedSubdiv)
    ? Math.min(PERIODIC_SEARCH_LIMITS.supportFilterSubdivisionsMax, Math.max(PERIODIC_SEARCH_LIMITS.supportFilterSubdivisionsMin, parsedSubdiv))
    : (safeFallback.supportFilterSubdivisions ?? 64);

  const rawSupportThresh = next?.supportThreshold ?? safeFallback.supportThreshold;
  const parsedSupportThresh = Number(rawSupportThresh);
  const supportThreshold = Number.isFinite(parsedSupportThresh) && parsedSupportThresh > 0
    ? Math.min(PERIODIC_SEARCH_LIMITS.supportThresholdMax, Math.max(PERIODIC_SEARCH_LIMITS.supportThresholdMin, parsedSupportThresh))
    : (safeFallback.supportThreshold ?? 1e-10);

  return {
    gridSize,
    thetaGridSize,
    residualThreshold,
    useContinuation,
    maxNewtonIterations,
    newtonBeta,
    deduplicationTolerance,
    supportFilterSubdivisions,
    supportThreshold,
  };
};

export const forceFullGridSearchSettings = (
  settings: PeriodicSearchSettings,
): PeriodicSearchSettings => ({
  ...normalizePeriodicSearchSettings(settings),
  useContinuation: false,
});
