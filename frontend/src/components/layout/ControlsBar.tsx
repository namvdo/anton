import type { BdeState, ManifoldState, SystemId } from '../../types/domain';

interface ControlsBarProps {
  dynamicSystem: SystemId;
  manifoldState: Pick<ManifoldState, 'isRunning' | 'isReady'>;
  bdeState: Pick<BdeState, 'isRunning'>;
  stepForwardManifold: () => void;
  runToConvergenceManifold: () => void;
  resetManifold: () => void;
  resetBdeFlow: () => void;
  applyInputsAndRecompute?: () => void;
  hasPendingInputChanges: boolean;
}

export const ControlsBar = ({
  dynamicSystem,
  manifoldState,
  bdeState,
  stepForwardManifold,
  runToConvergenceManifold,
  resetManifold,
  resetBdeFlow,
  applyInputsAndRecompute,
  hasPendingInputChanges
}: ControlsBarProps) => {
  const recomputeDisabled = manifoldState.isRunning || bdeState.isRunning || typeof applyInputsAndRecompute !== 'function';
  const playDisabled = bdeState.isRunning;
  const stepDisabled = !manifoldState.isReady || manifoldState.isRunning || bdeState.isRunning;
  const resetDisabled = manifoldState.isRunning || bdeState.isRunning;

  return (
    <div className="ctrl-bar">
      <div className="ctrl-row">
        <button
          className={`ctrl-btn compute ${hasPendingInputChanges ? 'pending' : ''}`}
          onClick={applyInputsAndRecompute}
          disabled={recomputeDisabled}
        >
          Compute
        </button>
        <button
          className="ctrl-btn primary"
          onClick={runToConvergenceManifold}
          disabled={playDisabled}
        >
          Play
        </button>
      </div>
      <div className="ctrl-row">
        <button
          className="ctrl-btn"
          onClick={stepForwardManifold}
          disabled={stepDisabled}
          title="Step forward"
        >
          Step
        </button>
        <button
          className="ctrl-btn danger"
          onClick={() => { resetManifold(); if (dynamicSystem === 'duffing_ode') resetBdeFlow(); }}
          disabled={resetDisabled}
        >
          Reset
        </button>
      </div>
    </div>
  );
};
