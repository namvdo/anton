import { Collapsible } from '../ui/Collapsible';
import { Toggle } from '../ui/Toggle';
import { Slider } from '../ui/Slider';
import type { StateSetter, UlamState } from '../../types/domain';

interface UlamPanelProps {
  ulamState: UlamState;
  setUlamState: StateSetter<UlamState>;
}

export const UlamPanel = ({ ulamState, setUlamState }: UlamPanelProps) => {
  return (
    <Collapsible title="Ulam / Markov" defaultOpen={false}>
      <Toggle
        label="Grid overlay"
        checked={ulamState.showUlamOverlay}
        onChange={v => setUlamState(prev => ({ ...prev, showUlamOverlay: v }))}
      />

      {ulamState.showUlamOverlay && (
        <>
          <Toggle
            label="Show transitions"
            checked={ulamState.showTransitions}
            onChange={v => setUlamState(prev => ({ ...prev, showTransitions: v }))}
          />
          <Toggle
            label="Track current box"
            checked={ulamState.showCurrentBox}
            onChange={v => setUlamState(prev => ({ ...prev, showCurrentBox: v }))}
          />
          <div className="spacer"></div>

          <Slider
            label="Grid size"
            min={10} max={200} step={5}
            value={ulamState.subdivisions}
            onChange={v => setUlamState(prev => ({ ...prev, subdivisions: v }))}
            disabled={ulamState.isComputing}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-3)', marginTop: '2px' }}>
            <span>10</span><span>100</span>
          </div>

          <div style={{ marginBottom: '4px' }}>
            <Slider
              label="Samples / box"
              min={16} max={256} step={16}
              value={ulamState.pointsPerBox}
              onChange={v => setUlamState(prev => ({ ...prev, pointsPerBox: v }))}
              disabled={ulamState.isComputing}
            />
          </div>

          {ulamState.isComputing ? (
            <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="spinner"></span>
              Computing Ulam Grid...
            </div>
          ) : (
            <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--green)' }}>✓ Grid up to date</div>
          )}

          {ulamState.gridBoxes.length > 0 && (
            <>
              <div className="small-label">Invariant measure</div>
              <div className="colorbar"></div>
              <div className="colorbar-labels"><span>low</span><span>high</span></div>
            </>
          )}

          {ulamState.currentBoxIndex >= 0 && (
            <div className="ulam-info">
              <div className="ulam-info-row">
                <span className="ulam-info-k">Box</span>
                <span className="ulam-info-v">#{ulamState.currentBoxIndex}</span>
              </div>
              {/* Optional: Add more info like measure tracking in the future */}
            </div>
          )}
        </>
      )}
    </Collapsible>
  );
};
