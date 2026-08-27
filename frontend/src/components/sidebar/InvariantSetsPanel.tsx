import { Collapsible } from '../ui/Collapsible';
import { Toggle } from '../ui/Toggle';
import { StartingPoint } from './StartingPoint';
import { INVARIANT_SET_LIMITS } from '../../config/numericalSettings';
import type { ExtendedState, InvariantSetState, StateSetter } from '../../types/domain';

interface InvariantSetsPanelProps {
  state: InvariantSetState;
  setState: StateSetter<InvariantSetState>;
  initialState: ExtendedState;
  updateInitialState: (point: ExtendedState) => void;
  epsilon: number;
  compute: () => void;
}

const boundedInteger = (raw: string, fallback: number, minimum: number, maximum: number): number => {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
};

const stopReasonLabel = (reason: 'requested_iterations_completed' | 'point_set_left_domain'): string => ({
  requested_iterations_completed: 'requested iterations completed',
  point_set_left_domain: 'projected points reached the domain boundary',
})[reason];

export const InvariantSetsPanel = ({
  state,
  setState,
  initialState,
  updateInitialState,
  epsilon,
  compute,
}: InvariantSetsPanelProps) => {
  const disabled = state.isComputing || epsilon <= 0;
  return (
    <Collapsible title="Invariant-set propagation" defaultOpen>
      <div className="invariant-set-mode" role="group" aria-label="Invariant-set seed mode">
        <button type="button" className={state.seedMode === 'random' ? 'active' : ''}
          aria-pressed={state.seedMode === 'random'} disabled={state.isComputing}
          onClick={() => setState(previous => ({ ...previous, seedMode: 'random', error: null }))}>
          Random in domain
        </button>
        <button type="button" className={state.seedMode === 'manual' ? 'active' : ''}
          aria-pressed={state.seedMode === 'manual'} disabled={state.isComputing}
          onClick={() => setState(previous => ({ ...previous, seedMode: 'manual', error: null }))}>
          Set initial state
        </button>
      </div>

      {state.seedMode === 'manual' && (
        <StartingPoint
          type="discrete"
          startPoint={initialState}
          updateStartPoint={updateInitialState}
          disabled={state.isComputing}
          embedded
        />
      )}

      <div className="invariant-set-grid">
        <label>
          <span>Boundary points</span>
          <input aria-label="Invariant boundary points" type="number"
            min={INVARIANT_SET_LIMITS.minimumBoundaryPoints}
            max={INVARIANT_SET_LIMITS.maximumBoundaryPoints} step="8"
            value={state.boundaryPointCount} disabled={state.isComputing}
            onChange={event => setState(previous => ({
              ...previous,
              boundaryPointCount: boundedInteger(
                event.target.value,
                previous.boundaryPointCount,
                INVARIANT_SET_LIMITS.minimumBoundaryPoints,
                INVARIANT_SET_LIMITS.maximumBoundaryPoints,
              ),
              error: null,
            }))} />
        </label>
        <label>
          <span>Forward iterations</span>
          <input aria-label="Invariant forward iterations" type="number"
            min={INVARIANT_SET_LIMITS.minimumForwardIterations}
            max={INVARIANT_SET_LIMITS.maximumForwardIterations} step="1"
            value={state.forwardIterations} disabled={state.isComputing}
            onChange={event => setState(previous => ({
              ...previous,
              forwardIterations: boundedInteger(
                event.target.value,
                previous.forwardIterations,
                INVARIANT_SET_LIMITS.minimumForwardIterations,
                INVARIANT_SET_LIMITS.maximumForwardIterations,
              ),
              error: null,
            }))} />
        </label>
      </div>

      <button type="button" className="invariant-set-compute" disabled={disabled} onClick={compute}>
        {state.isComputing ? 'Propagating…' : 'Approximate invariant boundary'}
      </button>
      {epsilon <= 0 && <div className="invariant-set-note">Set ε &gt; 0 before propagation.</div>}
      {state.error && <div className="invariant-set-error" role="alert">{state.error}</div>}

      {state.result && (
        <div className="invariant-set-result" aria-label="Invariant-set result summary">
          <div>
            <span>Seed</span>
            <strong>({state.result.seed.x.toFixed(4)}, {state.result.seed.y.toFixed(4)})</strong>
          </div>
          <div><span>Completed</span><strong>{state.result.completed_iterations} / {state.result.requested_iterations}</strong></div>
          <div>
            <span>Initial normal</span>
            <strong>({state.result.seed.nx.toFixed(4)}, {state.result.seed.ny.toFixed(4)})</strong>
          </div>
          <small>{stopReasonLabel(state.result.stop_reason)}</small>
          <Toggle label="Show projected points" checked={state.showResult}
            onChange={showResult => setState(previous => ({ ...previous, showResult }))} />
        </div>
      )}
    </Collapsible>
  );
};
