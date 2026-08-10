import { useEffect, useState, type KeyboardEvent } from 'react';
import { Collapsible } from '../ui/Collapsible';
import { normalizeExtendedStartPoint } from '../../utils/startPointState';
import type { ExtendedState, SystemType } from '../../types/domain';

type DraftComponent = keyof ExtendedState;
type ExtendedStateDraft = Record<DraftComponent, string>;

interface StartingPointProps {
  type: SystemType;
  startPoint: ExtendedState;
  updateStartPoint: (point: ExtendedState) => void;
  disabled?: boolean;
}

const displayValue = (value: unknown): string => Number.isFinite(Number(value)) ? String(Number(value)) : '';

export const StartingPoint = ({ type, startPoint, updateStartPoint, disabled = false }: StartingPointProps) => {
  const isContinuous = type === 'continuous';
  const [draft, setDraft] = useState(() => ({
    x: displayValue(startPoint.x),
    y: displayValue(startPoint.y),
    nx: displayValue(startPoint.nx),
    ny: displayValue(startPoint.ny)
  }));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft({
      x: displayValue(startPoint.x),
      y: displayValue(startPoint.y),
      nx: displayValue(startPoint.nx),
      ny: displayValue(startPoint.ny)
    });
    setError(null);
  }, [startPoint.x, startPoint.y, startPoint.nx, startPoint.ny]);

  const updateDraft = (component: DraftComponent, value: string): void => {
    setDraft(previous => ({ ...previous, [component]: value }));
    setError(null);
  };

  const apply = (): void => {
    try {
      const normalized = normalizeExtendedStartPoint(draft);
      updateStartPoint(normalized);
      setDraft({
        x: displayValue(normalized.x),
        y: displayValue(normalized.y),
        nx: displayValue(normalized.nx),
        ny: displayValue(normalized.ny)
      });
      setError(null);
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : String(applyError));
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') apply();
  };

  return (
    <Collapsible title="Extended start state" defaultOpen={true}>
      <div className="start-group-label">Position</div>
      <div className="start-grid">
        <div className="start-field">
          <label>{isContinuous ? 'x₀ (position)' : 'x₀'}</label>
          <input
            type="number"
            step="any"
            aria-label="x0-position"
            value={draft.x}
            disabled={disabled}
            onChange={event => updateDraft('x', event.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div className="start-field">
          <label>{isContinuous ? 'y₀ (velocity)' : 'y₀'}</label>
          <input
            type="number"
            step="any"
            aria-label="y0-position"
            value={draft.y}
            disabled={disabled}
            onChange={event => updateDraft('y', event.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
      </div>
      <div className="start-group-label">Unit normal</div>
      <div id="normal-inputs" className="start-grid">
        <div className="start-field">
          <label>nₓ</label>
          <input
            type="number"
            step="any"
            aria-label="nx-normal"
            value={draft.nx}
            disabled={disabled}
            onChange={event => updateDraft('nx', event.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div className="start-field">
          <label>nᵧ</label>
          <input
            type="number"
            step="any"
            aria-label="ny-normal"
            value={draft.ny}
            disabled={disabled}
            onChange={event => updateDraft('ny', event.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
      </div>
      <button className="param-apply-btn extended-state-apply" type="button"
        disabled={disabled} onClick={apply}>
        Apply extended state
      </button>
      <div className="start-hint">The normal is normalized automatically when applied.</div>
      {error && <div className="start-error" role="alert">{error}</div>}
    </Collapsible>
  );
};
