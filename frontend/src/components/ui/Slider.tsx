interface SliderProps {
  label: string;
  hint?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export const Slider = ({ label, hint, min, max, step, value, onChange, disabled = false }: SliderProps) => {
  const clamp = (raw: string, fallback: number): number => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return fallback;
    if (parsed < min) return min;
    if (parsed > max) return max;
    return parsed;
  };

  return (
    <div className="p-row">
      <div className="p-head">
        <span className="p-name">
          <em>{label}</em>
          {hint && <small>{hint}</small>}
        </span>
        <input 
          className={`p-val ${disabled ? 'disabled' : ''}`}
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(clamp(e.target.value, value))}
          disabled={disabled}
        />
      </div>
      <input 
        type="range" 
        className={`p-track ${disabled ? 'disabled' : ''}`}
        min={min} 
        max={max} 
        step={step} 
        value={value} 
        onChange={(e) => onChange(clamp(e.target.value, min))}
        disabled={disabled}
      />
    </div>
  );
};
