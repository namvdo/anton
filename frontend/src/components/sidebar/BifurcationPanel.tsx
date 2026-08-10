import { useRef, useEffect, useCallback } from 'react';
import { Collapsible } from '../ui/Collapsible';
import { Slider } from '../ui/Slider';
import type {
  BifurcationDatum,
  BifurcationState,
  BistParameters,
  BistWasmModule,
  StateSetter,
} from '../../types/domain';

const CHART_WIDTH = 240;
const CHART_HEIGHT = 140;
const PADDING = { top: 10, right: 10, bottom: 25, left: 40 };

const drawChart = (
  canvas: HTMLCanvasElement | null,
  data: BifurcationDatum[],
  threshold: number,
): void => {
  if (!canvas || !data || data.length === 0) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return; 
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  const plotW = w - PADDING.left - PADDING.right;
  const plotH = h - PADDING.top - PADDING.bottom;

  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(PADDING.left, PADDING.top, plotW, plotH);

  if (data.length < 2) return;

  const aMin = Math.min(...data.map(d => d.a));
  const aMax = Math.max(...data.map(d => d.a));
  const dMax = Math.max(...data.map(d => d.hausdorff_distance), threshold * 1.2);

  const toX = (a: number): number => PADDING.left + ((a - aMin) / (aMax - aMin)) * plotW;
  const toY = (d: number): number => PADDING.top + plotH - (d / dMax) * plotH;

  ctx.strokeStyle = '#333355';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = PADDING.top + (i / 4) * plotH;
    ctx.beginPath();
    ctx.moveTo(PADDING.left, y);
    ctx.lineTo(PADDING.left + plotW, y);
    ctx.stroke();
  }

  if (threshold < dMax) {
    const threshY = toY(threshold);
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(PADDING.left, threshY);
    ctx.lineTo(PADDING.left + plotW, threshY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#ff6b6b';
    ctx.font = '8px monospace';
    ctx.fillText('threshold', PADDING.left + 2, threshY - 3);
  }

  ctx.strokeStyle = '#1e90ff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  data.forEach((d, i) => {
    const x = toX(d.a);
    const y = toY(d.hausdorff_distance);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  data.forEach(d => {
    if (d.has_intersection) {
      const x = toX(d.a);
      const y = toY(d.hausdorff_distance);
      ctx.fillStyle = '#ff4444';
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  ctx.fillStyle = '#aaaacc';
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`a=${aMin.toFixed(2)}`, PADDING.left, h - 3);
  ctx.fillText(`a=${aMax.toFixed(2)}`, w - PADDING.right, h - 3);
  ctx.fillText('param a', PADDING.left + plotW / 2, h - 3);

  ctx.save();
  ctx.translate(10, PADDING.top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText('d_H', 0, 0);
  ctx.restore();

  ctx.textAlign = 'right';
  ctx.fillText('0', PADDING.left - 3, PADDING.top + plotH + 3);
  ctx.fillText(dMax.toFixed(2), PADDING.left - 3, PADDING.top + 8);
};

interface BifurcationPanelProps {
  params: Pick<BistParameters, 'a' | 'b' | 'epsilon'>;
  wasmModule: Pick<BistWasmModule, 'compute_bifurcation_hausdorff'> | null;
  bifurcationState: BifurcationState;
  setBifurcationState: StateSetter<BifurcationState>;
}

export const BifurcationPanel = ({
  params,
  wasmModule,
  bifurcationState,
  setBifurcationState
}: BifurcationPanelProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    drawChart(canvasRef.current, bifurcationState.data, bifurcationState.threshold);
  }, [bifurcationState.data, bifurcationState.threshold]);

  const computeBifurcation = useCallback(() => {
    if (!wasmModule || !wasmModule.compute_bifurcation_hausdorff) {
      console.warn('WASM module not ready or compute_bifurcation_hausdorff not available');
      return;
    }

    setBifurcationState(prev => ({ ...prev, isComputing: true, error: null }));

    try {
      const result = wasmModule.compute_bifurcation_hausdorff(
        params.b,
        params.epsilon,
        bifurcationState.aMin,
        bifurcationState.aMax,
        bifurcationState.numSamples
      ) as unknown;

      const data = Array.isArray(result) ? result as BifurcationDatum[] : [];
      const intersections = data.filter(d => d.has_intersection);

      setBifurcationState(prev => ({
        ...prev,
        data,
        isComputing: false,
        intersectionCount: intersections.length,
        criticalValues: intersections.map(d => d.a)
      }));
    } catch (e) {
      console.error('Bifurcation computation failed:', e);
      setBifurcationState(prev => ({
        ...prev,
        isComputing: false,
        error: String(e)
      }));
    }
  }, [wasmModule, params.b, params.epsilon, bifurcationState.aMin, bifurcationState.aMax, bifurcationState.numSamples, setBifurcationState]);

  return (
    <Collapsible title="Bifurcation Analysis" defaultOpen={false}>
      <div style={{ fontSize: '10px', color: 'var(--text-2)', marginBottom: '6px' }}>
        Hausdorff distance d_H(W^u, W^s) vs parameter a.
        Red dots indicate heteroclinic connections.
      </div>

      <Slider
        label="a min"
        min={0.01} max={2.0} step={0.01}
        value={bifurcationState.aMin}
        onChange={v => setBifurcationState(prev => ({ ...prev, aMin: v }))}
      />
      <Slider
        label="a max"
        min={0.1} max={3.0} step={0.01}
        value={bifurcationState.aMax}
        onChange={v => setBifurcationState(prev => ({ ...prev, aMax: v }))}
      />
      <Slider
        label="Samples"
        min={10} max={100} step={1}
        value={bifurcationState.numSamples}
        onChange={v => setBifurcationState(prev => ({ ...prev, numSamples: v }))}
      />

      <button
        onClick={computeBifurcation}
        disabled={bifurcationState.isComputing}
        style={{
          width: '100%',
          padding: '6px',
          marginTop: '4px',
          marginBottom: '6px',
          background: bifurcationState.isComputing ? '#333' : '#1e90ff',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          cursor: bifurcationState.isComputing ? 'wait' : 'pointer',
          fontSize: '11px'
        }}
      >
        {bifurcationState.isComputing ? 'Computing...' : 'Compute Bifurcation Diagram'}
      </button>

      {bifurcationState.error && (
        <div style={{ color: '#ff6b6b', fontSize: '10px', marginBottom: '4px' }}>
          Error: {bifurcationState.error}
        </div>
      )}

      <canvas
        ref={canvasRef}
        width={CHART_WIDTH}
        height={CHART_HEIGHT}
        style={{
          width: '100%',
          height: `${CHART_HEIGHT}px`,
          borderRadius: '4px',
          border: '1px solid #333'
        }}
      />

      {bifurcationState.data.length > 0 && (
        <div style={{ fontSize: '10px', color: 'var(--text-2)', marginTop: '4px' }}>
          <div>{bifurcationState.data.length} samples computed</div>
          {bifurcationState.intersectionCount > 0 ? (
            <div style={{ color: '#ff6b6b' }}>
              {bifurcationState.intersectionCount} bifurcation point{bifurcationState.intersectionCount > 1 ? 's' : ''} detected
              {bifurcationState.criticalValues.length > 0 && (
                <div style={{ marginTop: '2px' }}>
                  Critical a values: {bifurcationState.criticalValues.map(a => a.toFixed(3)).join(', ')}
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: '#27ae60' }}>No bifurcations in range</div>
          )}
        </div>
      )}
    </Collapsible>
  );
};
