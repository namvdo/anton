import React from 'react';
import { Collapsible } from '../ui/Collapsible';
import { Slider } from '../ui/Slider';
import { Toggle } from '../ui/Toggle';
import { inverseOffsetStepColor, visibleInverseOffsetCurves } from '../../utils/inverseOffsetDisplay';

export const GeometricOffsetsPanel = ({ state, setState, canCompute, compute, canComputeInverse, computeInverse, fitInverse }) => {
  const result = state.result;
  const inverseResult = state.inverseResult;
  const inverseDisplayMode = state.inverseDisplayMode || 'final';
  const visibleInverseCurves = visibleInverseOffsetCurves(inverseResult, inverseDisplayMode);
  const visibleIteration = visibleInverseCurves.at(-1)?.inverse_iteration || state.inverseIterations;
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
          <Slider label="Inverse steps" min={1} max={6} step={1} value={state.inverseIterations}
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
                const inverseDisplayMode = event.target.value;
                setState(previous => ({ ...previous, inverseDisplayMode }));
              }}>
              <option value="final">Final inverse step only</option>
              <option value="all">All inverse steps</option>
            </select>
          </label>
          <Toggle label="Show inverse offset curves" colorLine={inverseOffsetStepColor(visibleIteration)}
            checked={state.showInverseContours} disabled={!inverseResult}
            onChange={showInverseContours => setState(previous => ({ ...previous, showInverseContours }))} />
          <button className="param-apply-btn inverse-offset-compute" type="button" onClick={computeInverse}
            disabled={!canComputeInverse || state.isComputingInverse}>
            {state.isComputingInverse ? 'Generating inverse curves…' : 'Show inverse curve'}
          </button>
          {inverseResult && (
            <button className="param-apply-btn inverse-offset-fit" type="button" onClick={fitInverse}>
              Fit inverse curve in view
            </button>
          )}
          {state.inverseError && <div className="geometric-offset-status error" role="alert">{state.inverseError}</div>}
          {inverseResult && !state.inverseError && (
            <div className={`geometric-offset-status ${inverseResult.subdivision_limit_reached ? 'warning' : 'ready'}`}
              aria-live="polite">
              <div>{visibleInverseCurves.length} shown · {inverseResult.curves.length} generated closed curve{inverseResult.curves.length === 1 ? '' : 's'}</div>
              <div className="geometric-offset-metrics">
                <span>{inverseResult.total_output_points.toLocaleString()} stored samples</span>
                <span>position chord error {inverseResult.max_position_chord_error.toExponential(2)}</span>
                <span>normal chord error {inverseResult.max_normal_chord_error.toExponential(2)} rad</span>
                <span>subdivision limit {inverseResult.subdivision_limit_reached ? 'reached' : 'clear'}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </Collapsible>
  );
};
