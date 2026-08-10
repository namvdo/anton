import { Collapsible } from '../ui/Collapsible';
import { Slider } from '../ui/Slider';
import { Toggle } from '../ui/Toggle';
import {
  inverseOffsetStepColor,
  visibleInverseOffsetCurves
} from '../../utils/inverseOffsetDisplay';
import type { GeometricOffsetState, StateSetter } from '../../types/domain';

interface GeometricOffsetsPanelProps {
  state: GeometricOffsetState;
  setState: StateSetter<GeometricOffsetState>;
  canCompute: boolean;
  compute: () => void;
  canComputeInverse?: boolean;
  computeInverse?: () => void;
  fitInverse?: () => void;
}

export const GeometricOffsetsPanel = ({
  state,
  setState,
  canCompute,
  compute,
  canComputeInverse = false,
  computeInverse = () => undefined,
  fitInverse = () => undefined,
}: GeometricOffsetsPanelProps) => {
  const result = state.result;
  const inverseResult = state.inverseResult;
  const inverseDisplayMode = state.inverseDisplayMode || 'all';
  const visibleInverseCurves = visibleInverseOffsetCurves(inverseResult, inverseDisplayMode);
  const visibleIterations = [...new Set(visibleInverseCurves.map(curve => (
    Number(curve.inverse_iteration) || 1
  )))].sort((left, right) => left - right);
  const inverseToggleSwatch = visibleIterations.length > 1
    ? `linear-gradient(90deg, ${visibleIterations.map(inverseOffsetStepColor).join(', ')})`
    : inverseOffsetStepColor(visibleIterations[0] || state.inverseIterations);
  return (
    <Collapsible title="Geometric offsets" defaultOpen={true}>
      <Slider label="Contour ε" hint="normal distance" min={0.001} max={1} step={0.001}
        value={state.contourEpsilon} disabled={state.isComputing || state.isComputingInverse}
        onChange={contourEpsilon => setState(previous => ({
          ...previous,
          contourEpsilon,
          result: null,
          inverseResult: null,
          error: null,
          inverseError: null
        }))} />
      <Toggle label="Show geometric offset contours" checked={state.showContours}
        onChange={showContours => setState(prev => ({ ...prev, showContours }))} />
      <button className="param-apply-btn geometric-offset-compute" type="button" onClick={compute}
        disabled={!canCompute || state.isComputing || state.isComputingInverse}>
        {state.isComputing ? 'Computing ε contours…' : 'Compute ε contours'}
      </button>
      {state.error && <div className="geometric-offset-status error" role="alert">{state.error}</div>}
      {result && !state.error && (
        <div className="inverse-offset-controls">
          <Slider label="Preimage steps" min={1} max={8} step={1} value={state.inverseIterations}
            disabled={state.isComputingInverse}
            onChange={inverseIterations => setState(previous => ({
              ...previous,
              inverseIterations,
              inverseResult: null,
              inverseError: null
            }))} />
          <label className="inverse-offset-field" htmlFor="inverse-offset-display">
            <span>Display</span>
            <select id="inverse-offset-display" value={inverseDisplayMode}
              disabled={!inverseResult}
              onChange={event => {
                const inverseDisplayMode = event.target.value as GeometricOffsetState['inverseDisplayMode'];
                setState(previous => ({ ...previous, inverseDisplayMode }));
              }}>
              <option value="all">All computed preimage steps</option>
              <option value="final">Latest preimage step only</option>
            </select>
          </label>
          <Toggle label="Show inverse-map curves" colorLine={inverseToggleSwatch}
            checked={state.showInverseContours} disabled={!inverseResult}
            onChange={showInverseContours => setState(previous => ({ ...previous, showInverseContours }))} />
          <button className="param-apply-btn inverse-offset-compute" type="button" onClick={computeInverse}
            disabled={!canComputeInverse || state.isComputingInverse}>
            {state.isComputingInverse ? 'Computing preimages…' : 'Compute boundary-map preimage'}
          </button>
          {inverseResult && (
            <button className="param-apply-btn inverse-offset-fit" type="button" onClick={fitInverse}>
              Fit preimage in view
            </button>
          )}
          {state.inverseError && <div className="geometric-offset-status error" role="alert">{state.inverseError}</div>}
        </div>
      )}
    </Collapsible>
  );
};
