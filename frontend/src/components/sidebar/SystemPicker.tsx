import type { SystemCatalog, SystemId, SystemType } from '../../types/domain';

interface SystemPickerProps {
  type: SystemType;
  setType: (type: SystemType) => void;
  systemId: SystemId;
  setSystemId: (systemId: SystemId) => void;
  systems: SystemCatalog;
  disabled?: boolean;
}

export const SystemPicker = ({ type, setType, systemId, setSystemId, systems, disabled = false }: SystemPickerProps) => {
  return (
    <>
      <div className="type-toggle-wrap">
        <div className="type-toggle-label">System type</div>
        <div className="type-toggle" role="group" aria-label="System type">
          <button
            type="button"
            className={`type-btn ${type === 'discrete' ? 'active' : ''}`} 
            onClick={() => !disabled && setType('discrete')}
            disabled={disabled}
            aria-pressed={type === 'discrete'}
          >
            Discrete
            <span className="type-sub">maps &amp; iterations</span>
          </button>
          <button
            type="button"
            className={`type-btn ${type === 'continuous' ? 'active' : ''}`} 
            onClick={() => !disabled && setType('continuous')}
            disabled={disabled}
            aria-pressed={type === 'continuous'}
          >
            Continuous
            <span className="type-sub">ODEs &amp; flows</span>
          </button>
        </div>
      </div>
      <div className="system-pick-wrap">
        <div className="sys-pick-label">System</div>
        <div className="sys-options" role="group" aria-label="Dynamical system">
          {systems[type].map(s => (
            <button
              type="button"
              key={s.id}
              className={`sys-opt ${s.id === systemId ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
              onClick={() => !disabled && setSystemId(s.id)}
              disabled={disabled}
              aria-pressed={s.id === systemId}
            >
              <span className="sys-opt-name">{s.name}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
};
