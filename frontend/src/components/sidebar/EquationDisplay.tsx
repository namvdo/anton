import type { ReactNode } from 'react';
import type { CustomEquations, StateSetter, SystemId } from '../../types/domain';

interface EquationDisplayProps {
  systemId: SystemId;
  customEquations: CustomEquations;
  setCustomEquations: StateSetter<CustomEquations>;
  equationError: string | null;
  disabled: boolean;
}

export const EquationDisplay = ({ systemId, customEquations, setCustomEquations, equationError, disabled }: EquationDisplayProps) => {
  if (systemId === 'custom' || systemId === 'custom_ode') {
    const isContinuous = systemId === 'custom_ode';
    const equations = customEquations[systemId] || { xEq: '', yEq: '' };
    return (
      <div className="eq-display">
        <div className="eq-display-label">Equation</div>
        <div className="eq-lines">
          <div className="eq-custom-inputs">
            <div className="eq-custom-row">
              <span className="eq-custom-label">{isContinuous ? 'ẋ =' : 'x′ ='}</span>
              <input
                className="eq-custom-input"
                value={equations.xEq}
                onChange={(e) => setCustomEquations(prev => ({ ...prev, [systemId]: { ...prev[systemId], xEq: e.target.value } }))}
                disabled={disabled}
              />
            </div>
            <div className="eq-custom-row">
              <span className="eq-custom-label">{isContinuous ? 'ẏ =' : 'y′ ='}</span>
              <input
                className="eq-custom-input"
                value={equations.yEq}
                onChange={(e) => setCustomEquations(prev => ({ ...prev, [systemId]: { ...prev[systemId], yEq: e.target.value } }))}
                disabled={disabled}
              />
            </div>
          </div>
          <div className="eq-hint">Variables: x, y. Parameters: use names from the list below. Functions: sin, cos, exp, sqrt, abs, tan, ln. Power: ^.</div>
          {equationError && (
            <div style={{ fontSize: '11px', color: '#e74c3c', marginTop: '4px', padding: '4px 6px', backgroundColor: '#2a1a1a', borderRadius: '3px' }}>
              {equationError}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Predefined equations
  const htmlMap: Partial<Record<SystemId, ReactNode>> = {
    'henon': (
      <>
        <div className="eq-line"><span className="prime">x′</span> = 1 − <span className="sym">a</span>x² + y</div>
        <div className="eq-line"><span className="prime">y′</span> = <span className="sym">b</span>x</div>
      </>
    ),
    'duffing': (
      <>
        <div className="eq-line"><span className="prime">x′</span> = y</div>
        <div className="eq-line"><span className="prime">y′</span> = −<span className="sym">b</span>x + <span className="sym">a</span>y − y³</div>
      </>
    ),
    'duffing_ode': (
      <>
        <div className="eq-line">ẍ + <span className="sym">δ</span>ẋ − x + x³ = 0</div>
        <div className="eq-line" style={{ marginTop: '4px', fontSize: '10px', color: 'var(--text-3)' }}> discretised via RK4 (step h)</div>
      </>
    )
  };

  return (
    <div className="eq-display">
      <div className="eq-display-label">Equation</div>
      <div className="eq-lines">
        {htmlMap[systemId]}
      </div>
    </div>
  );
};
