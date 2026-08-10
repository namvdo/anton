import { Collapsible } from '../ui/Collapsible';
import { Slider } from '../ui/Slider';
import { ParameterEditor } from './ParameterEditor';
import type {
  BistParameters,
  CustomParameter,
  StateSetter,
  SystemCatalog,
  SystemId,
} from '../../types/domain';

interface ParametersPanelProps {
  systemId: SystemId;
  params: BistParameters;
  setParams: StateSetter<BistParameters>;
  disabled: boolean;
  systems: SystemCatalog;
  applyPreset: (values: Partial<BistParameters>) => void;
  customParams: CustomParameter[];
  setCustomParams: StateSetter<CustomParameter[]>;
  paramErrors: Array<string | null>;
}

export const ParametersPanel = ({
  systemId,
  params,
  setParams,
  disabled,
  systems,
  applyPreset,
  customParams,
  setCustomParams,
  paramErrors
}: ParametersPanelProps) => {

  const sys = [...systems.discrete, ...systems.continuous].find(s => s.id === systemId);
  const presets = sys?.presets || [];
  const isCustom = systemId === 'custom' || systemId === 'custom_ode';
  const isContinuous = systemId === 'duffing_ode' || systemId === 'custom_ode';

  return (
    <Collapsible title="Parameters" defaultOpen={true}>
      {presets.length > 0 && (
        <div className="presets">
          {presets.map(p => (
            <button
              key={p.name}
              className="preset"
              onClick={() => applyPreset(p.vals)}
              disabled={disabled}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      {!isCustom && !isContinuous && (
        <>
          <Slider label="a" hint="nonlinearity" min={-10.0} max={10.0} step={0.01} value={params.a} onChange={v => setParams(prev => ({ ...prev, a: v }))} disabled={disabled} />
          <Slider label="b" hint="contraction" min={-10.0} max={10.0} step={0.01} value={params.b} onChange={v => setParams(prev => ({ ...prev, b: v }))} disabled={disabled} />
        </>
      )}

      {systemId === 'duffing_ode' && (
        <>
          <Slider label="δ" hint="damping" min={0.01} max={2.0} step={0.01} value={params.delta} onChange={v => setParams(prev => ({ ...prev, delta: v }))} disabled={disabled} />
          <Slider label="h" hint="step size" min={0.001} max={0.5} step={0.001} value={params.h} onChange={v => setParams(prev => ({ ...prev, h: v }))} disabled={disabled} />
        </>
      )}

      {systemId === 'custom_ode' && (
        <>
          <Slider label="h" hint="step size" min={0.001} max={0.5} step={0.001} value={params.h} onChange={v => setParams(prev => ({ ...prev, h: v }))} disabled={disabled} />
        </>
      )}

      {isCustom && (
        <div style={{ marginTop: '6px' }}>
          <div className="small-label">Custom parameters</div>
          <ParameterEditor
            params={customParams}
            setParams={setCustomParams}
            errors={paramErrors}
            disabled={disabled}
          />
        </div>
      )}

      <Slider label="ε" hint="ball radius" min={0.000} max={(systemId === 'duffing_ode' || systemId === 'custom_ode') ? 0.5 : 0.2} step={0.001} value={params.epsilon} onChange={v => setParams(prev => ({ ...prev, epsilon: v }))} disabled={disabled} />


      {!isContinuous && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '2px' }}>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text)', marginBottom: '3px' }}>Max period</div>
            <input
              className={`p-val ${disabled ? 'disabled' : ''}`}
              style={{ width: '100%' }}
              type="number"
              min="1" max="20" step="1"
              value={params.maxPeriod}
              onChange={(e) => setParams(prev => ({ ...prev, maxPeriod: parseInt(e.target.value) || 2 }))}
              disabled={disabled}
            />
            <input
              type="range"
              className={`p-track ${disabled ? 'disabled' : ''}`}
              style={{ marginTop: '4px' }}
              min="1" max="10" step="1"
              value={params.maxPeriod}
              onChange={(e) => setParams(prev => ({ ...prev, maxPeriod: parseInt(e.target.value) }))}
              disabled={disabled}
            />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text)', marginBottom: '3px' }}>Max iter</div>
            <input
              className={`p-val ${disabled ? 'disabled' : ''}`}
              style={{ width: '100%' }}
              type="number"
              min="100" max="10000" step="100"
              value={params.maxIterations}
              onChange={(e) => setParams(prev => ({ ...prev, maxIterations: parseInt(e.target.value) || 100 }))}
              disabled={disabled}
            />
            <input
              type="range"
              className={`p-track ${disabled ? 'disabled' : ''}`}
              style={{ marginTop: '4px' }}
              min="100" max="5000" step="100"
              value={params.maxIterations}
              onChange={(e) => setParams(prev => ({ ...prev, maxIterations: parseInt(e.target.value) }))}
              disabled={disabled}
            />
          </div>
        </div>
      )}

    </Collapsible>
  );
};
