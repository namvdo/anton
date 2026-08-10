import { Collapsible } from '../ui/Collapsible';
import { Slider } from '../ui/Slider';
import type {
  AnimationState,
  ManifoldState,
  PeriodicState,
  RecordingState,
  StateSetter,
} from '../../types/domain';

interface AnimationPanelProps {
  animationState: AnimationState;
  setAnimationState: StateSetter<AnimationState>;
  manifoldState: Pick<ManifoldState, 'isComputing' | 'sourcePeriodicRevision'>;
  periodicState: Pick<PeriodicState, 'isReady' | 'resultRevision' | 'renderedRevision'>;
  recordingState: Pick<RecordingState, 'recordingEnabled' | 'isEncoding' | 'frameCount'>;
  startAnimation: () => void;
  stopAnimation: () => void;
  toggleRecording: () => void;
}

export const AnimationPanel = ({ animationState, setAnimationState, manifoldState, periodicState, recordingState, startAnimation, stopAnimation, toggleRecording }: AnimationPanelProps) => {
  const controlsLocked = animationState.isAnimating || animationState.isPreparing;
  const resultsReady = periodicState.isReady
    && !manifoldState.isComputing
    && periodicState.renderedRevision === periodicState.resultRevision
    && manifoldState.sourcePeriodicRevision === periodicState.resultRevision;

  return (
    <Collapsible title="Parameter animation" defaultOpen={false}>
      <div className="anim-row">
        <div style={{ flex: 1 }}>
          <div className="small-label" style={{ marginTop: 0 }}>Animate</div>
          <select 
            value={animationState.parameter}
            onChange={(e) => setAnimationState(prev => ({
              ...prev,
              parameter: e.target.value as AnimationState['parameter'],
            }))}
            disabled={controlsLocked}
          >
            <option value="a">a</option>
            <option value="b">b</option>
            <option value="epsilon">ε</option>
          </select>
        </div>
        <div>
          <div className="small-label" style={{ marginTop: 0 }}>Direction</div>
          <div className="dir-btns">
            <button 
              className={`dir-btn ${animationState.direction === -1 ? 'active' : ''} ${controlsLocked ? 'disabled' : ''}`}
              onClick={() => !controlsLocked && setAnimationState(prev => ({ ...prev, direction: -1 }))}
              disabled={controlsLocked}
            >−</button>
            <button 
              className={`dir-btn ${animationState.direction === 1 ? 'active' : ''} ${controlsLocked ? 'disabled' : ''}`}
              onClick={() => !controlsLocked && setAnimationState(prev => ({ ...prev, direction: 1 }))}
              disabled={controlsLocked}
            >+</button>
          </div>
        </div>
      </div>

      <Slider 
        label="Range" min={0.01} max={0.5} step={0.01} 
        value={animationState.rangeValue} 
        onChange={v => setAnimationState(prev => ({ ...prev, rangeValue: v }))} 
        disabled={controlsLocked}
      />

      <Slider 
        label="Steps" min={5} max={30} step={1} 
        value={animationState.steps} 
        onChange={v => setAnimationState(prev => ({ ...prev, steps: v }))} 
        disabled={controlsLocked}
      />

      <div style={{ display: 'flex', gap: '5px', marginBottom: '6px' }}>
        <button 
          className="ctrl-btn primary" 
          style={{ fontSize: '11px', flex: 1, backgroundColor: animationState.isAnimating ? '#4a3030' : '', borderColor: animationState.isAnimating ? '#7a5050' : '', color: animationState.isAnimating ? 'var(--red)' : '' }}
          onClick={animationState.isAnimating ? stopAnimation : startAnimation}
          disabled={animationState.isPreparing || (!resultsReady && !animationState.isAnimating)}
        >
          {animationState.isPreparing ? 'Preparing…' : (animationState.isAnimating ? '⏹ Stop' : '▶ Play')}
        </button>
        <button 
          className="ctrl-btn" 
          style={{ width: '34px', flex: 'none', fontSize: '12px', background: recordingState.recordingEnabled ? 'rgba(168,82,82,.15)' : '', borderColor: recordingState.recordingEnabled ? 'var(--red)' : '', color: recordingState.recordingEnabled ? 'var(--red)' : '' }} 
          title="Toggle Recording"
          onClick={toggleRecording}
          disabled={controlsLocked}
        >
          {recordingState.recordingEnabled ? '🔴' : '⏺'}
        </button>
      </div>

      {animationState.isAnimating && (
        <>
          <div className="prog-track">
            <div className="prog-fill" style={{ width: `${(animationState.currentStep / animationState.steps) * 100}%` }}></div>
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>
            step {animationState.currentStep} / {animationState.steps} · {animationState.parameter}: {animationState.baseValue?.toFixed(3)} → {animationState.targetValue?.toFixed(3)}
          </div>
        </>
      )}

      {recordingState.isEncoding && (
        <div style={{ marginTop: '8px', padding: '8px', background: 'var(--bg)', borderRadius: '4px', border: '1px solid var(--blue)' }}>
          <div style={{ fontSize: '11px', color: 'var(--blue)', marginBottom: '4px' }}>
            🔄 Encoding video... ({recordingState.frameCount} frames)
          </div>
          <div className="prog-track">
            <div className="prog-fill" style={{ width: '100%', animation: 'pulse 1s infinite' }}></div>
          </div>
        </div>
      )}
    </Collapsible>
  );
};
