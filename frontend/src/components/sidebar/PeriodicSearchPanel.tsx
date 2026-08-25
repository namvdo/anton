import type { ChangeEvent } from 'react';
import { Collapsible } from '../ui/Collapsible';
import { Toggle } from '../ui/Toggle';
import {
  estimatePeriodicGridSeedCount,
  normalizePeriodicMaxPeriod,
  PERIODIC_SEARCH_PRESETS,
} from '../../utils/periodicSearchSettings';
import type {
  BistParameters,
  PeriodicSearchSettings,
  PeriodicState,
  SystemId,
  ViewRange,
} from '../../types/domain';

interface PeriodicSearchPanelProps {
  dynamicSystem: SystemId;
  periodicSearchSettings: PeriodicSearchSettings;
  appliedPeriodicSearchSettings: PeriodicSearchSettings;
  maxPeriod: number;
  appliedMaxPeriod: number;
  appliedParameters: Pick<BistParameters, 'a' | 'b' | 'epsilon'>;
  viewRange: ViewRange;
  periodicState: Pick<PeriodicState, 'orbits' | 'isReady' | 'computeMethod'>;
  updatePeriodicSearchSettings: (patch: Partial<PeriodicSearchSettings>) => void;
  updateMaxPeriod: (maxPeriod: number) => void;
  runGridSearch: () => void;
  hasPendingChanges: boolean;
  disabled: boolean;
}

export const PeriodicSearchPanel = ({
  dynamicSystem,
  periodicSearchSettings,
  appliedPeriodicSearchSettings,
  maxPeriod,
  appliedMaxPeriod,
  appliedParameters,
  viewRange,
  periodicState,
  updatePeriodicSearchSettings,
  updateMaxPeriod,
  runGridSearch,
  hasPendingChanges,
  disabled
}: PeriodicSearchPanelProps) => {
  const supportsBoundarySearchSettings = dynamicSystem === 'henon' || dynamicSystem === 'custom';

  if (!supportsBoundarySearchSettings) {
    return null;
  }

  const updateGridSize = (e: ChangeEvent<HTMLInputElement>): void => {
    updatePeriodicSearchSettings?.({ gridSize: parseInt(e.target.value, 10) });
  };

  const updateThetaGridSize = (e: ChangeEvent<HTMLInputElement>): void => {
    updatePeriodicSearchSettings?.({ thetaGridSize: parseInt(e.target.value, 10) });
  };

  const updateResidualThreshold = (e: ChangeEvent<HTMLInputElement>): void => {
    updatePeriodicSearchSettings?.({ residualThreshold: Number(e.target.value) });
  };

  const updateUseContinuation = (value: boolean): void => {
    updatePeriodicSearchSettings?.({ useContinuation: value });
  };

  const updateMaxNewtonIterations = (e: ChangeEvent<HTMLInputElement>): void => {
    const val = parseInt(e.target.value, 10);
    updatePeriodicSearchSettings?.({ maxNewtonIterations: Number.isFinite(val) ? val : 100 });
  };

  const updateNewtonBeta = (e: ChangeEvent<HTMLInputElement>): void => {
    const raw = e.target.value.trim();
    if (raw === '' || raw.toLowerCase() === 'auto') {
      updatePeriodicSearchSettings?.({ newtonBeta: null });
    } else {
      const val = parseFloat(raw);
      updatePeriodicSearchSettings?.({ newtonBeta: Number.isFinite(val) ? val : null });
    }
  };

  const updateDeduplicationTolerance = (e: ChangeEvent<HTMLInputElement>): void => {
    updatePeriodicSearchSettings?.({ deduplicationTolerance: Number(e.target.value) });
  };

  const seedCount = estimatePeriodicGridSeedCount(
    maxPeriod,
    periodicSearchSettings.gridSize,
    periodicSearchSettings.thetaGridSize,
  );
  const runMethod = periodicState.computeMethod === 'continuation'
    ? 'continuation'
    : periodicState.computeMethod === 'grid'
      ? 'full grid search'
      : 'not run';
  const currentPresetId = PERIODIC_SEARCH_PRESETS.find(preset => (
    preset.maxPeriod === maxPeriod
    && preset.settings.gridSize === periodicSearchSettings.gridSize
    && preset.settings.thetaGridSize === periodicSearchSettings.thetaGridSize
    && preset.settings.residualThreshold === periodicSearchSettings.residualThreshold
    && preset.settings.useContinuation === periodicSearchSettings.useContinuation
  ))?.id ?? null;

  return (
    <Collapsible title="Periodic search" defaultOpen={true}>
      <p className="periodic-search-intro">
        Find boundary-map periodic orbits with Newton solves seeded across position and unit-normal angle.
      </p>

      <div className="small-label">Search preset</div>
      <div className="periodic-search-presets" role="group" aria-label="Periodic search presets">
        {PERIODIC_SEARCH_PRESETS.map(preset => (
          <button
            type="button"
            key={preset.id}
            aria-pressed={currentPresetId === preset.id}
            disabled={disabled}
            onClick={() => {
              updateMaxPeriod(preset.maxPeriod);
              updatePeriodicSearchSettings(preset.settings);
            }}
          >
            <span>{preset.label}</span>
            <small>{preset.description}</small>
          </button>
        ))}
      </div>

      <div className="periodic-search-grid">
        <div className="start-field">
          <label htmlFor="periodic-max-period">Maximum period</label>
          <input
            id="periodic-max-period"
            type="number"
            min="1"
            max="20"
            step="1"
            value={maxPeriod}
            onChange={event => updateMaxPeriod(normalizePeriodicMaxPeriod(
              Number(event.target.value),
              maxPeriod,
            ))}
            disabled={disabled}
          />
          <small>Search periods 1 through {maxPeriod}</small>
        </div>
        <div className="start-field">
          <label htmlFor="periodic-grid-size">Position grid</label>
          <input
            id="periodic-grid-size"
            type="number"
            min="2"
            max="256"
            step="1"
            value={periodicSearchSettings?.gridSize ?? 10}
            onChange={updateGridSize}
            disabled={disabled}
          />
          <small>{periodicSearchSettings.gridSize} × {periodicSearchSettings.gridSize} points</small>
        </div>
        <div className="start-field">
          <label htmlFor="periodic-theta-grid-size">Normal-angle grid</label>
          <input
            id="periodic-theta-grid-size"
            type="number"
            min="2"
            max="256"
            step="1"
            value={periodicSearchSettings?.thetaGridSize ?? 10}
            onChange={updateThetaGridSize}
            disabled={disabled}
          />
          <small>{periodicSearchSettings.thetaGridSize} angles over 0–2π</small>
        </div>
        <div className="start-field periodic-search-threshold">
          <label htmlFor="periodic-residual-threshold">Residual tolerance</label>
          <input
            id="periodic-residual-threshold"
            type="number"
            min="1e-14"
            max="1e-2"
            step="any"
            value={periodicSearchSettings?.residualThreshold ?? 1e-10}
            onChange={updateResidualThreshold}
            disabled={disabled}
          />
          <small>Accept ‖B<sup>p</sup>(z) − z‖ below this value</small>
        </div>
      </div>

      <div className="periodic-search-budget" aria-label="Periodic grid search summary">
        <div><span>Search domain</span><strong>x [{viewRange.xMin}, {viewRange.xMax}], y [{viewRange.yMin}, {viewRange.yMax}]</strong></div>
        <div><span>Newton starts</span><strong>{seedCount.toLocaleString()}</strong></div>
      </div>

      <Collapsible title="Advanced solver settings" defaultOpen={false}>
        <div className="periodic-search-grid">
          <div className="start-field">
            <label htmlFor="periodic-max-iterations">Max Newton iterations</label>
            <input
              id="periodic-max-iterations"
              type="number"
              min="10"
              max="1000"
              step="10"
              value={periodicSearchSettings?.maxNewtonIterations ?? 100}
              onChange={updateMaxNewtonIterations}
              disabled={disabled}
            />
            <small>Steps per seed before giving up</small>
          </div>
          <div className="start-field">
            <label htmlFor="periodic-newton-beta">Damping β (Davidchack-Lai)</label>
            <input
              id="periodic-newton-beta"
              type="text"
              placeholder="Auto (15·1.3^p)"
              value={periodicSearchSettings?.newtonBeta !== null && periodicSearchSettings?.newtonBeta !== undefined ? periodicSearchSettings.newtonBeta : ''}
              onChange={updateNewtonBeta}
              disabled={disabled}
            />
            <small>0 for pure Newton; leave blank for Auto</small>
          </div>
          <div className="start-field">
            <label htmlFor="periodic-dedup-tolerance">Deduplication tolerance</label>
            <input
              id="periodic-dedup-tolerance"
              type="number"
              min="1e-6"
              max="1e-1"
              step="any"
              value={periodicSearchSettings?.deduplicationTolerance ?? 1e-3}
              onChange={updateDeduplicationTolerance}
              disabled={disabled}
            />
            <small>Cluster radius to merge duplicate orbits</small>
          </div>
        </div>
      </Collapsible>

      <Toggle
        label="Use cached-orbit continuation"
        checked={Boolean(periodicSearchSettings?.useContinuation)}
        onChange={updateUseContinuation}
        disabled={disabled}
      />
      <p className="periodic-search-note">
        Continuation reuses the previous orbit set when compatible. The action below always performs a new grid search.
      </p>

      <button
        type="button"
        className="param-apply-btn periodic-search-run"
        onClick={runGridSearch}
        disabled={disabled}
      >
        {hasPendingChanges ? 'Apply configuration & run full grid search' : 'Run full grid search'}
      </button>

      <div className="periodic-search-last-run" aria-label="Current periodic orbit result configuration">
        <span>{periodicState.isReady ? `${periodicState.orbits.length} orbit${periodicState.orbits.length === 1 ? '' : 's'}` : 'Computing orbits…'}</span>
        <span>{runMethod}</span>
        <small>
          Current result: {dynamicSystem === 'henon' ? `a = ${appliedParameters.a}, b = ${appliedParameters.b}, ` : ''}ε = {appliedParameters.epsilon};
          {' '}P ≤ {appliedMaxPeriod}, {appliedPeriodicSearchSettings.gridSize} × {appliedPeriodicSearchSettings.gridSize} positions,
          {' '}{appliedPeriodicSearchSettings.thetaGridSize} angles, tolerance {appliedPeriodicSearchSettings.residualThreshold}
        </small>
      </div>
    </Collapsible>
  );
};
