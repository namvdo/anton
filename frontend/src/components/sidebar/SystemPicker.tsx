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
        <div className="type-toggle">
          <button 
            className={`type-btn ${type === 'discrete' ? 'active' : ''}`} 
            onClick={() => !disabled && setType('discrete')}
            disabled={disabled}
          >
            Discrete
            <span className="type-sub">maps &amp; iterations</span>
          </button>
          <button 
            className={`type-btn ${type === 'continuous' ? 'active' : ''}`} 
            onClick={() => !disabled && setType('continuous')}
            disabled={disabled}
          >
            Continuous
            <span className="type-sub">ODEs &amp; flows</span>
          </button>
        </div>
      </div>
      <div className="system-pick-wrap">
        <div className="sys-pick-label">System</div>
        <div className="sys-options">
          {systems[type].map(s => (
            <div 
              key={s.id}
              className={`sys-opt ${s.id === systemId ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
              onClick={() => !disabled && setSystemId(s.id)}
              aria-disabled={disabled}
            >
              <span className="sys-opt-name">{s.name}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};
