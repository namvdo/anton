import { useCallback, useMemo } from 'react';
import { Collapsible } from '../ui/Collapsible';
import { Slider } from '../ui/Slider';
import type {
  BistParameters,
  BistWasmModule,
  CustomEquations,
  CustomParameter,
  StateSetter,
  SweepResult,
  SweepState,
  SystemId,
  ViewRange,
} from '../../types/domain';

interface ParameterSweepPanelProps {
  wasmModule: Pick<BistWasmModule, 'parameterSweepGeneric'> | null;
  params: Pick<BistParameters, 'a' | 'b'> & Partial<Pick<BistParameters, 'epsilon'>>;
  viewRange: ViewRange;
  sweepState: SweepState;
  setSweepState: StateSetter<SweepState>;
  dynamicSystem: SystemId;
  customEquations: CustomEquations;
  customParams: CustomParameter[];
}

interface SweepBoundaryResult {
  results?: SweepResult[];
}

export const ParameterSweepPanel = ({
  wasmModule,
  params,
  viewRange,
  sweepState,
  setSweepState,
  dynamicSystem,
  customEquations,
  customParams,
}: ParameterSweepPanelProps) => {
  const parameterList = useMemo(() => {
    if (dynamicSystem === 'custom') {
      return (customParams || []).map(p => p.name);
    }
    return ['a', 'b'];
  }, [dynamicSystem, customParams]);

  const getEquations = useCallback(() => {
    if (dynamicSystem === 'henon') return { xEq: '1 - a * x^2 + y', yEq: 'b * x' };
    if (dynamicSystem === 'duffing') return { xEq: 'y', yEq: '-b * x + a * y - y^3' };
    if (dynamicSystem === 'custom' && customEquations?.custom) {
      return customEquations.custom;
    }
    return { xEq: '1 - a * x^2 + y', yEq: 'b * x' };
  }, [dynamicSystem, customEquations]);

  const getParamArray = useCallback(() => {
    if (dynamicSystem === 'custom') {
      return (customParams || []).map(p => ({ name: p.name, value: p.value }));
    }
    const result: CustomParameter[] = [];
    result.push({ name: 'a', value: params.a });
    result.push({ name: 'b', value: params.b });
    return result;
  }, [dynamicSystem, params, customParams]);

  const computeSweep = useCallback(() => {
    if (!wasmModule || !wasmModule.parameterSweepGeneric) {
      console.warn('WASM module not ready or parameterSweepGeneric not available');
      return;
    }

    const sweepParam = sweepState.sweepParam;
    if (!sweepParam) {
      setSweepState(prev => ({ ...prev, error: 'No parameter selected for sweep' }));
      return;
    }

    setSweepState(prev => ({ ...prev, isComputing: true, error: null }));

    setTimeout(() => {
      try {
        const eqs = getEquations();
        const paramArray = getParamArray();

        const result = wasmModule.parameterSweepGeneric(
          dynamicSystem,
          eqs.xEq,
          eqs.yEq,
          paramArray,
          sweepParam,
          sweepState.sweepMin,
          sweepState.sweepMax,
          sweepState.numSamples,
          params.epsilon || 0.01,
          sweepState.maxPeriod,
          viewRange.xMin,
          viewRange.xMax,
          viewRange.yMin,
          viewRange.yMax
        ) as SweepBoundaryResult;

        setSweepState(prev => ({
          ...prev,
          results: result.results || [],
          isComputing: false,
        }));
      } catch (e) {
        console.error('Parameter sweep failed:', e);
        setSweepState(prev => ({
          ...prev,
          isComputing: false,
          error: String(e),
        }));
      }
    }, 50);
  }, [wasmModule, sweepState.sweepParam, sweepState.sweepMin, sweepState.sweepMax,
      sweepState.numSamples, sweepState.maxPeriod, params, viewRange,
      dynamicSystem, getEquations, getParamArray, setSweepState]);

  const exportCsv = useCallback(() => {
    if (!sweepState.results || sweepState.results.length === 0) return;

    const sweepParam = sweepState.sweepParam || 'a';
    let csv = `parameter_${sweepParam},period,stability,x,y,nx,ny\n`;
    for (const result of sweepState.results) {
      for (const orbit of result.orbits) {
        for (const [x, y, nx, ny] of orbit.extended_points) {
          csv += `${result.param_value},${orbit.period},${orbit.stability},${x},${y},${nx},${ny}\n`;
        }
      }
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sweep_${sweepParam}_${sweepState.sweepMin}-${sweepState.sweepMax}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sweepState.results, sweepState.sweepParam, sweepState.sweepMin, sweepState.sweepMax]);

  const exportJson = useCallback(() => {
    if (!sweepState.results || sweepState.results.length === 0) return;

    const data = {
      param_name: sweepState.sweepParam,
      param_min: sweepState.sweepMin,
      param_max: sweepState.sweepMax,
      system: dynamicSystem,
      max_period: sweepState.maxPeriod,
      results: sweepState.results,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sweep_${sweepState.sweepParam}_${sweepState.sweepMin}-${sweepState.sweepMax}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sweepState.results, sweepState.sweepParam, sweepState.sweepMin, sweepState.sweepMax,
      sweepState.maxPeriod, dynamicSystem]);

  const totalOrbits = sweepState.results
    ? sweepState.results.reduce((sum, r) => sum + r.total_orbits, 0)
    : 0;

  const activeSweepParam = parameterList.includes(sweepState.sweepParam)
    ? sweepState.sweepParam
    : parameterList[0] || 'a';

  return (
    <Collapsible title="Parameter Sweep" defaultOpen={false}>
      <div style={{ fontSize: '10px', color: 'var(--text-2)', marginBottom: '6px' }}>
        Sweep a parameter to find periodic orbits and classify stability.
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
        <span style={{ fontSize: '10px', color: 'var(--text-2)', minWidth: '50px' }}>Sweep</span>
        <select
          value={activeSweepParam}
          onChange={e => setSweepState(prev => ({ ...prev, sweepParam: e.target.value }))}
          style={{
            flex: 1,
            fontSize: '10px',
            padding: '2px 4px',
            background: 'var(--surface)',
            color: 'var(--text)',
            border: '1px solid var(--line)',
            borderRadius: '4px',
            outline: 'none',
          }}
        >
          {parameterList.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>

      <Slider
        label={`${activeSweepParam} min`}
        min={-5.0} max={5.0} step={0.01}
        value={sweepState.sweepMin}
        onChange={v => setSweepState(prev => ({ ...prev, sweepMin: v }))}
      />
      <Slider
        label={`${activeSweepParam} max`}
        min={-5.0} max={10.0} step={0.01}
        value={sweepState.sweepMax}
        onChange={v => setSweepState(prev => ({ ...prev, sweepMax: v }))}
      />
      <Slider
        label="Samples"
        min={3} max={50} step={1}
        value={sweepState.numSamples}
        onChange={v => setSweepState(prev => ({ ...prev, numSamples: v }))}
      />
      <Slider
        label="Max period"
        min={1} max={8} step={1}
        value={sweepState.maxPeriod}
        onChange={v => setSweepState(prev => ({ ...prev, maxPeriod: v }))}
      />

      <div style={{ display: 'flex', gap: '5px', marginTop: '4px', marginBottom: '6px' }}>
        <button
          className="ctrl-btn primary"
          onClick={computeSweep}
          disabled={sweepState.isComputing || parameterList.length === 0}
        >
          {sweepState.isComputing ? 'Sweeping...' : 'Run Sweep'}
        </button>
      </div>

      {sweepState.error && (
        <div style={{ color: 'var(--red)', fontSize: '10px', marginBottom: '4px' }}>
          Error: {sweepState.error}
        </div>
      )}

      {sweepState.results && sweepState.results.length > 0 && (
        <>
          <div style={{ fontSize: '10px', color: 'var(--text-2)', marginBottom: '6px' }}>
            <div>{sweepState.results.length} parameter values sampled</div>
            <div>{totalOrbits} total orbits found</div>
          </div>

          {/* Summary table */}
          <div style={{
            fontSize: '9px',
            maxHeight: '140px',
            overflowY: 'auto',
            border: '1px solid var(--line)',
            borderRadius: '4px',
            marginBottom: '6px',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface)', position: 'sticky', top: 0 }}>
                  <th style={{ padding: '3px 4px', textAlign: 'left', color: 'var(--text-2)' }}>{activeSweepParam}</th>
                  <th style={{ padding: '3px 4px', textAlign: 'right', color: 'var(--text-2)' }}>Total</th>
                  <th style={{ padding: '3px 4px', textAlign: 'right', color: 'var(--green)' }}>Stable</th>
                  <th style={{ padding: '3px 4px', textAlign: 'right', color: 'var(--amber)' }}>Saddle</th>
                  <th style={{ padding: '3px 4px', textAlign: 'right', color: 'var(--red)' }}>Unstable</th>
                </tr>
              </thead>
              <tbody>
                {sweepState.results.map((r, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ padding: '2px 4px', color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{r.param_value.toFixed(3)}</td>
                    <td style={{ padding: '2px 4px', textAlign: 'right', color: 'var(--text)' }}>{r.total_orbits}</td>
                    <td style={{ padding: '2px 4px', textAlign: 'right', color: 'var(--green)' }}>{r.stable_count}</td>
                    <td style={{ padding: '2px 4px', textAlign: 'right', color: 'var(--amber)' }}>{r.saddle_count}</td>
                    <td style={{ padding: '2px 4px', textAlign: 'right', color: 'var(--red)' }}>{r.unstable_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Export buttons */}
          <div style={{ display: 'flex', gap: '5px' }}>
            <button className="ctrl-btn" onClick={exportCsv}>
              Export CSV
            </button>
            <button className="ctrl-btn" onClick={exportJson}>
              Export JSON
            </button>
          </div>
        </>
      )}
    </Collapsible>
  );
};
