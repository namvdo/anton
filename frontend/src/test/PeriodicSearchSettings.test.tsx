import { describe, expect, it } from 'vitest';
import {
  estimatePeriodicGridSeedCount,
  forceFullGridSearchSettings,
  normalizePeriodicMaxPeriod,
  normalizePeriodicSearchSettings,
  PERIODIC_SEARCH_PRESETS,
} from '../utils/periodicSearchSettings';

describe('normalizePeriodicSearchSettings', () => {
  it('clamps grid and theta sizes to supported bounds', () => {
    const normalized = normalizePeriodicSearchSettings({
      gridSize: 1,
      thetaGridSize: 9999,
      residualThreshold: 1e-10
    });

    expect(normalized.gridSize).toBe(2);
    expect(normalized.thetaGridSize).toBe(256);
  });

  it('falls back to defaults for invalid threshold values', () => {
    const normalized = normalizePeriodicSearchSettings({
      gridSize: 10,
      thetaGridSize: 10,
      residualThreshold: NaN
    });

    expect(normalized.residualThreshold).toBe(1e-10);
  });

  it('normalizes the optional continuation flag', () => {
    expect(normalizePeriodicSearchSettings({ useContinuation: true }).useContinuation).toBe(true);
    expect(normalizePeriodicSearchSettings({ useContinuation: false }, { useContinuation: true }).useContinuation).toBe(false);
  });

  it('normalizes maximum period and estimates the complete seed budget', () => {
    expect(normalizePeriodicMaxPeriod(0)).toBe(1);
    expect(normalizePeriodicMaxPeriod(999)).toBe(20);
    expect(normalizePeriodicMaxPeriod(Number.NaN, 999)).toBe(20);
    expect(estimatePeriodicGridSeedCount(5, 10, 10)).toBe(5_000);
  });

  it('keeps every preset seed label accurate', () => {
    expect(PERIODIC_SEARCH_PRESETS.map(preset => (
      estimatePeriodicGridSeedCount(
        preset.maxPeriod,
        preset.settings.gridSize,
        preset.settings.thetaGridSize,
      ).toLocaleString('en-US')
    ))).toEqual(['41,472', '138,240', '393,216']);
  });

  it('forces the direct search action to bypass continuation', () => {
    expect(forceFullGridSearchSettings({
      gridSize: 16,
      thetaGridSize: 12,
      residualThreshold: 1e-9,
      useContinuation: true,
    })).toEqual({
      gridSize: 16,
      thetaGridSize: 12,
      residualThreshold: 1e-9,
      useContinuation: false,
    });
  });
});
