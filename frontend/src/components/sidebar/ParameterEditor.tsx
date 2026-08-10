import type { CustomParameter, StateSetter } from '../../types/domain';

const nextParamName = (params: CustomParameter[]): string => {
  let idx = 1;
  const existing = new Set(params.map(p => (p.name || '').trim()));
  while (existing.has(`p${idx}`)) idx += 1;
  return `p${idx}`;
};

interface ParameterEditorProps {
  params: CustomParameter[];
  setParams: StateSetter<CustomParameter[]>;
  errors: Array<string | null>;
  disabled: boolean;
}

export const ParameterEditor = ({ params, setParams, errors, disabled }: ParameterEditorProps) => {
  const updateParam = <K extends keyof CustomParameter>(
    index: number,
    key: K,
    value: CustomParameter[K],
  ): void => {
    setParams(prev => prev.map((p, i) => (i === index ? { ...p, [key]: value } : p)));
  };

  const removeParam = (index: number): void => {
    setParams(prev => prev.filter((_, i) => i !== index));
  };

  const addParam = (): void => {
    setParams(prev => ([
      ...prev,
      { name: nextParamName(prev), value: 0 }
    ]));
  };

  return (
    <div className="param-editor">
      {params.length === 0 && (
        <div className="param-empty">No parameters yet. Add one below.</div>
      )}
      {params.map((param, idx) => (
        <div key={`${param.name}-${idx}`} className={`param-row ${errors?.[idx] ? 'has-error' : ''}`}>
          <input
            className="param-name"
            value={param.name}
            onChange={(e) => updateParam(idx, 'name', e.target.value)}
            placeholder="name"
            disabled={disabled}
          />
          <input
            className="param-value"
            type="number"
            value={Number.isFinite(param.value) ? param.value : ''}
            onChange={(e) => updateParam(idx, 'value', parseFloat(e.target.value))}
            placeholder="0"
            disabled={disabled}
          />
          <button className="param-remove" onClick={() => removeParam(idx)} disabled={disabled}>
            ×
          </button>
          {errors?.[idx] && <div className="param-error">{errors[idx]}</div>}
        </div>
      ))}
      <button className="param-add" onClick={addParam} disabled={disabled}>Add parameter</button>
    </div>
  );
};
