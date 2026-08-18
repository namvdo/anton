import type { PeriodicSearchSettings } from '../types/domain';

export const DEFAULT_PERIODIC_SEARCH_SETTINGS: PeriodicSearchSettings = {
  gridSize: 10,
  thetaGridSize: 10,
  residualThreshold: 1e-10,
  useContinuation: false
};

export const PERIODIC_SEARCH_LIMITS = {
  maxPeriodMin: 1,
  maxPeriodMax: 20,
  gridSizeMin: 2,
  gridSizeMax: 256,
  thetaGridSizeMin: 2,
  thetaGridSizeMax: 256,
  residualThresholdMin: 1e-14,
  residualThresholdMax: 1e-2
};

export interface PeriodicSearchPreset {
  id: 'quick' | 'balanced' | 'thorough';
  label: string;
  description: string;
  maxPeriod: number;
  settings: PeriodicSearchSettings;
}

export const PERIODIC_SEARCH_PRESETS: readonly PeriodicSearchPreset[] = Object.freeze([
  {
    id: 'quick',
    label: 'Quick',
    description: '864 seeds',
    maxPeriod: 3,
    settings: { gridSize: 6, thetaGridSize: 8, residualThreshold: 1e-8, useContinuation: false },
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: '5,000 seeds',
    maxPeriod: 5,
    settings: { ...DEFAULT_PERIODIC_SEARCH_SETTINGS },
  },
  {
    id: 'thorough',
    label: 'Thorough',
    description: '41,472 seeds',
    maxPeriod: 8,
    settings: { gridSize: 18, thetaGridSize: 16, residualThreshold: 1e-10, useContinuation: false },
  },
]);

export const normalizePeriodicMaxPeriod = (value: number, fallback = 5): number => {
  const parsed = Number.parseInt(`${value}`, 10);
  const parsedFallback = Number.parseInt(`${fallback}`, 10);
  const safeFallback = Number.isFinite(parsedFallback)
    ? Math.min(
      PERIODIC_SEARCH_LIMITS.maxPeriodMax,
      Math.max(PERIODIC_SEARCH_LIMITS.maxPeriodMin, parsedFallback),
    )
    : 5;
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

  return {
    gridSize,
    thetaGridSize,
    residualThreshold,
    useContinuation
  };
};

export const forceFullGridSearchSettings = (
  settings: PeriodicSearchSettings,
): PeriodicSearchSettings => ({
  ...normalizePeriodicSearchSettings(settings),
  useContinuation: false,
});
