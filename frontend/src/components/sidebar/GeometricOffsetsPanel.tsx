import { Collapsible } from '../ui/Collapsible';
import { Slider } from '../ui/Slider';
import { Toggle } from '../ui/Toggle';
import {
  formatContourEpsilon,
  generateEvenlySpacedEpsilons,
  geometricOffsetContourColor,
  geometricOffsetContourId,
  MAX_BATCH_CONTOURS,
  MAX_CONTOUR_EPSILON,
  MIN_CONTOUR_EPSILON,
  normalizeContourEpsilon,
  removeGeometricOffsetContour,
  replaceGeometricOffsetContours,
  selectGeometricOffsetContour,
} from '../../utils/geometricOffsetBatch';
import type { GeometricOffsetState, StateSetter } from '../../types/domain';
import { MAX_INVERSE_OFFSET_ITERATIONS } from '../../config/numericalSettings';

interface GeometricOffsetsPanelProps {
  state: GeometricOffsetState;
  setState: StateSetter<GeometricOffsetState>;
  systemEpsilon?: number;
  canCompute: boolean;
  compute: () => void;
  canComputeInverse?: boolean;
  computeInverse?: () => void;
  fitInverse?: () => void;
}

const updateNumber = (
  rawValue: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number => {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
};

export const GeometricOffsetsPanel = ({
  state,
  setState,
  systemEpsilon,
  canCompute,
  compute,
  canComputeInverse = false,
  computeInverse = () => undefined,
  fitInverse = () => undefined,
}: GeometricOffsetsPanelProps) => {
  const selectedId = state.selectedContourId;
  const selectedSources = new Set(state.preimageSourceIds);
  if (selectedId) selectedSources.add(selectedId);
  const readyContours = state.contours.filter(contour => contour.result !== null);
  const inverseSourceCount = readyContours.filter(contour => selectedSources.has(contour.id)).length;
  const hasInverseResults = state.contours.some(contour => (
    selectedSources.has(contour.id) && contour.inverseResult !== null
  ));
  const allVisible = state.contours.length > 0 && state.contours.every(contour => contour.visible);

  const setEditorMode = (editorMode: GeometricOffsetState['editorMode']) => {
    setState(previous => ({ ...previous, editorMode, error: null }));
  };

  const generateSeries = () => {
    setState(previous => {
      try {
        const values = generateEvenlySpacedEpsilons(
          previous.seriesStart,
          previous.seriesEnd,
          previous.seriesCount,
        );
        return replaceGeometricOffsetContours(previous, values);
      } catch (error) {
        return {
          ...previous,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
  };

  const addIndividual = () => {
    setState(previous => {
      try {
        const epsilon = normalizeContourEpsilon(previous.individualEpsilon);
        if (previous.contours.some(contour => contour.id === geometricOffsetContourId(epsilon))) {
          throw new Error(`A contour for ε = ${formatContourEpsilon(epsilon)} already exists.`);
        }
        if (previous.contours.length >= MAX_BATCH_CONTOURS) {
          throw new Error(`At most ${MAX_BATCH_CONTOURS} geometric contours can be computed together.`);
        }
        return replaceGeometricOffsetContours(
          previous,
          [...previous.contours.map(contour => contour.epsilon), epsilon],
        );
      } catch (error) {
        return {
          ...previous,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
  };

  return (
    <Collapsible title="Geometric offsets" defaultOpen={false}>
      <div className="geometric-offset-context">
        <span>Geometric distance ε<sub>g</sub></span>
        {Number.isFinite(systemEpsilon) && (
          <span>System noise ε<sub>s</sub> = {formatContourEpsilon(Number(systemEpsilon))}</span>
        )}
      </div>

      <div className="geometric-offset-mode" role="group" aria-label="Contour entry mode">
        <button type="button" className={state.editorMode === 'series' ? 'active' : ''}
          aria-pressed={state.editorMode === 'series'} onClick={() => setEditorMode('series')}>
          Series
        </button>
        <button type="button" className={state.editorMode === 'individual' ? 'active' : ''}
          aria-pressed={state.editorMode === 'individual'} onClick={() => setEditorMode('individual')}>
          Individual
        </button>
      </div>

      {state.editorMode === 'series' ? (
        <div className="geometric-offset-editor">
          <div className="geometric-offset-series-grid">
            <label>
              <span>Start ε</span>
              <input aria-label="Series start epsilon" type="number" min={MIN_CONTOUR_EPSILON}
                max={MAX_CONTOUR_EPSILON} step="0.001" value={state.seriesStart}
                disabled={state.isComputing || state.isComputingInverse}
                onChange={event => setState(previous => ({
                  ...previous,
                  seriesStart: updateNumber(
                    event.target.value,
                    previous.seriesStart,
                    MIN_CONTOUR_EPSILON,
                    MAX_CONTOUR_EPSILON,
                  ),
                  error: null,
                }))} />
            </label>
            <label>
              <span>End ε</span>
              <input aria-label="Series end epsilon" type="number" min={MIN_CONTOUR_EPSILON}
                max={MAX_CONTOUR_EPSILON} step="0.001" value={state.seriesEnd}
                disabled={state.isComputing || state.isComputingInverse}
                onChange={event => setState(previous => ({
                  ...previous,
                  seriesEnd: updateNumber(
                    event.target.value,
                    previous.seriesEnd,
                    MIN_CONTOUR_EPSILON,
                    MAX_CONTOUR_EPSILON,
                  ),
                  error: null,
                }))} />
            </label>
            <label>
              <span>Count</span>
              <input aria-label="Series contour count" type="number" min="2"
                max={MAX_BATCH_CONTOURS} step="1" value={state.seriesCount}
                disabled={state.isComputing || state.isComputingInverse}
                onChange={event => setState(previous => ({
                  ...previous,
                  seriesCount: Math.round(updateNumber(
                    event.target.value,
                    previous.seriesCount,
                    2,
                    MAX_BATCH_CONTOURS,
                  )),
                  error: null,
                }))} />
            </label>
          </div>
          <button className="geometric-offset-secondary" type="button" onClick={generateSeries}
            disabled={state.isComputing || state.isComputingInverse}>
            Use evenly spaced series
          </button>
        </div>
      ) : (
        <div className="geometric-offset-individual">
          <label>
            <span>Contour ε</span>
            <input aria-label="Individual contour epsilon" type="number" min={MIN_CONTOUR_EPSILON}
              max={MAX_CONTOUR_EPSILON} step="0.001" value={state.individualEpsilon}
              disabled={state.isComputing || state.isComputingInverse}
              onChange={event => setState(previous => ({
                ...previous,
                individualEpsilon: updateNumber(
                  event.target.value,
                  previous.individualEpsilon,
                  MIN_CONTOUR_EPSILON,
                  MAX_CONTOUR_EPSILON,
                ),
                error: null,
              }))} />
          </label>
          <button className="geometric-offset-secondary" type="button" onClick={addIndividual}
            disabled={state.isComputing || state.isComputingInverse}>
            Add
          </button>
        </div>
      )}

      <div className="geometric-offset-list-head">
        <span>{state.contours.length} contour{state.contours.length === 1 ? '' : 's'}</span>
        <button type="button" onClick={() => setState(previous => ({
          ...previous,
          contours: previous.contours.map(contour => ({ ...contour, visible: !allVisible })),
        }))}>
          {allVisible ? 'Hide all' : 'Show all'}
        </button>
      </div>

      <div className="geometric-offset-list" aria-label="Geometric offset contours">
        <div className="geometric-offset-list-labels" aria-hidden="true">
          <span>Show</span><span>Contour</span><span>Preimage</span><span></span>
        </div>
        {state.contours.map((contour, index) => {
          const selected = contour.id === selectedId;
          const isSource = selectedSources.has(contour.id);
          const status = contour.error
            ? 'error'
            : contour.result
              ? contour.inverseError ? 'inverse error' : 'ready'
              : 'draft';
          return (
            <div className={`geometric-offset-row ${selected ? 'selected' : ''}`} key={contour.id}>
              <input className="geometric-offset-checkbox" type="checkbox"
                aria-label={`Show contour epsilon ${formatContourEpsilon(contour.epsilon)}`}
                checked={contour.visible}
                onChange={event => setState(previous => ({
                  ...previous,
                  contours: previous.contours.map(item => item.id === contour.id
                    ? { ...item, visible: event.target.checked }
                    : item),
                }))} />
              <button className="geometric-offset-select" type="button"
                aria-label={`Select contour epsilon ${formatContourEpsilon(contour.epsilon)}`}
                aria-pressed={selected}
                disabled={state.isComputingInverse}
                onClick={() => setState(previous => selectGeometricOffsetContour(previous, contour.id))}>
                <span className="geometric-offset-swatch"
                  style={{ background: geometricOffsetContourColor(index) }}></span>
                <span>ε<sub>g</sub> = {formatContourEpsilon(contour.epsilon)}</span>
                <small>{status}</small>
              </button>
              <input className="geometric-offset-checkbox" type="checkbox"
                aria-label={`Use contour epsilon ${formatContourEpsilon(contour.epsilon)} for preimages`}
                checked={isSource}
                disabled={selected || state.isComputingInverse}
                onChange={event => setState(previous => ({
                  ...previous,
                  preimageSourceIds: event.target.checked
                    ? [...new Set([...previous.preimageSourceIds, contour.id])]
                    : previous.preimageSourceIds.filter(id => id !== contour.id),
                }))} />
              <button className="geometric-offset-remove" type="button"
                aria-label={`Remove contour epsilon ${formatContourEpsilon(contour.epsilon)}`}
                disabled={state.contours.length <= 1 || state.isComputing || state.isComputingInverse}
                onClick={() => setState(previous => removeGeometricOffsetContour(previous, contour.id))}>
                ×
              </button>
            </div>
          );
        })}
      </div>

      <button className="param-apply-btn geometric-offset-compute" type="button" onClick={compute}
        disabled={!canCompute || state.isComputing || state.isComputingInverse}>
        {state.isComputing
          ? `Computing ${state.contours.length} contour${state.contours.length === 1 ? '' : 's'}…`
          : `Compute ${state.contours.length} contour${state.contours.length === 1 ? '' : 's'}`}
      </button>
      {state.error && <div className="geometric-offset-status error" role="alert">{state.error}</div>}

      {readyContours.length > 0 && (
        <div className="inverse-offset-controls">
          <div className="inverse-offset-source-summary">
            {inverseSourceCount} preimage source{inverseSourceCount === 1 ? '' : 's'} selected
          </div>
          <Slider label="Preimage steps" min={1} max={MAX_INVERSE_OFFSET_ITERATIONS} step={1} value={state.inverseIterations}
            disabled={state.isComputingInverse}
            onChange={inverseIterations => setState(previous => ({
              ...previous,
              inverseIterations,
              contours: previous.contours.map(contour => ({
                ...contour,
                inverseResult: null,
                inverseError: null,
              })),
              inverseError: null,
            }))} />
          <label className="inverse-offset-field" htmlFor="inverse-offset-display">
            <span>Display</span>
            <select id="inverse-offset-display" value={state.inverseDisplayMode}
              disabled={!hasInverseResults}
              onChange={event => setState(previous => ({
                ...previous,
                inverseDisplayMode: event.target.value as GeometricOffsetState['inverseDisplayMode'],
              }))}>
              <option value="all">All computed preimage steps</option>
              <option value="final">Latest preimage step only</option>
            </select>
          </label>
          <Toggle label="Show selected-source preimages"
            checked={state.showInverseContours} disabled={!hasInverseResults}
            onChange={showInverseContours => setState(previous => ({
              ...previous,
              showInverseContours,
            }))} />
          <button className="param-apply-btn inverse-offset-compute" type="button"
            onClick={computeInverse}
            disabled={!canComputeInverse || inverseSourceCount === 0 || state.isComputingInverse}>
            {state.isComputingInverse
              ? `Computing preimages from ${inverseSourceCount} source${inverseSourceCount === 1 ? '' : 's'}…`
              : `Compute preimages from ${inverseSourceCount} source${inverseSourceCount === 1 ? '' : 's'}`}
          </button>
          {hasInverseResults && (
            <button className="param-apply-btn inverse-offset-fit" type="button" onClick={fitInverse}>
              Fit visible preimages
            </button>
          )}
          {state.inverseError && (
            <div className="geometric-offset-status error" role="alert">{state.inverseError}</div>
          )}
        </div>
      )}
    </Collapsible>
  );
};
