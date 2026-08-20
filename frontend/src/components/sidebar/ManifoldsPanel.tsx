import { Collapsible } from '../ui/Collapsible';
import { Toggle } from '../ui/Toggle';
import { Slider } from '../ui/Slider';
import type { ManifoldState, StateSetter } from '../../types/domain';
import {
  BOUNDARY_LAYER_COLORS,
  type BoundarySamplingSummary,
} from '../../utils/boundaryLayers';

interface OrbitColors {
  manifold: string;
  stableManifold: string;
}

interface ManifoldsPanelProps {
  manifoldState: Pick<
    ManifoldState,
    | 'showUnstableManifold'
    | 'showDeterministicImageBoundary'
    | 'showNoiseBalls'
    | 'showBoundarySamplePoints'
    | 'maximumManifoldPointSpacing'
    | 'showStableManifold'
    | 'intersectionThreshold'
    | 'intersections'
  >;
  setManifoldState: StateSetter<ManifoldState>;
  ORBIT_COLORS: OrbitColors;
  hasBoundarySamples?: boolean;
  boundaryLayerError?: string | null;
  systemEpsilon?: number;
  boundarySampling?: {
    unstable: BoundarySamplingSummary | null;
    deterministic: BoundarySamplingSummary | null;
  };
}

export const ManifoldsPanel = ({
  manifoldState,
  setManifoldState,
  ORBIT_COLORS,
  hasBoundarySamples = false,
  boundaryLayerError = null,
  systemEpsilon = 0,
  boundarySampling,
}: ManifoldsPanelProps) => {
  const boundaryLayersAvailable = manifoldState.showUnstableManifold
    && hasBoundarySamples
    && !boundaryLayerError;

  return (
    <Collapsible title="Manifolds" defaultOpen={true}>
      <Toggle
        label="Unstable manifold"
        colorLine={BOUNDARY_LAYER_COLORS.invariant}
        checked={manifoldState.showUnstableManifold}
        onChange={(v) => setManifoldState(prev => ({ ...prev, showUnstableManifold: v }))}
      />

      {manifoldState.showUnstableManifold && (
        <div className="boundary-layer-section">
          {boundaryLayerError && (
            <div className="boundary-layer-status error" role="alert">
              {boundaryLayerError}
            </div>
          )}

          <Toggle
            label="Remove noise"
            colorLine={BOUNDARY_LAYER_COLORS.deterministicImage}
            checked={manifoldState.showDeterministicImageBoundary}
            disabled={!boundaryLayersAvailable}
            onChange={showDeterministicImageBoundary => setManifoldState(previous => ({
              ...previous,
              showDeterministicImageBoundary,
            }))}
          />

          <Toggle
            label="Show noise balls"
            colorLine={BOUNDARY_LAYER_COLORS.noiseBall}
            checked={manifoldState.showNoiseBalls}
            disabled={!boundaryLayersAvailable || systemEpsilon <= 0}
            onChange={showNoiseBalls => setManifoldState(previous => ({
              ...previous,
              showNoiseBalls,
            }))}
          />

          <Toggle
            label="Show points"
            checked={manifoldState.showBoundarySamplePoints}
            disabled={!boundaryLayersAvailable}
            onChange={showBoundarySamplePoints => setManifoldState(previous => ({
              ...previous,
              showBoundarySamplePoints,
            }))}
          />

          <div className="boundary-refinement-control">
            <Slider
              label="Maximum state spacing"
              hint="‖(Δx, Δn)‖; recomputes"
              min={0.0001}
              max={0.2}
              step={0.0001}
              value={manifoldState.maximumManifoldPointSpacing}
              onChange={maximumManifoldPointSpacing => setManifoldState(previous => ({
                ...previous,
                maximumManifoldPointSpacing,
              }))}
            />
            <div className="boundary-refinement-note">
              Smaller spacing performs more extended boundary-map calculations.
            </div>
          </div>

          {boundaryLayersAvailable && boundarySampling?.unstable && (
              <div className="boundary-sampling" aria-label="Boundary sampling density">
                <div className="boundary-sampling-title">Computed geometry</div>
                <div>
                  <span>Unstable</span>
                  <strong>{boundarySampling.unstable.sampleCount} · {boundarySampling.unstable.pointsPerUnit.toFixed(1)}/unit · Δx max {boundarySampling.unstable.maximumGap.toPrecision(2)}</strong>
                </div>
                {boundarySampling.deterministic && (
                  <div>
                    <span>Deterministic</span>
                    <strong>{boundarySampling.deterministic.sampleCount} · {boundarySampling.deterministic.pointsPerUnit.toFixed(1)}/unit · Δx max {boundarySampling.deterministic.maximumGap.toPrecision(2)}</strong>
                  </div>
                )}
              </div>
          )}

          {systemEpsilon <= 0 && (
            <div className="boundary-layer-status">
              ε = 0: the deterministic and noisy boundaries coincide.
            </div>
          )}
        </div>
      )}

      <Toggle
        label="Stable manifold"
        colorLine={ORBIT_COLORS.stableManifold}
        checked={manifoldState.showStableManifold}
        onChange={(v) => setManifoldState(prev => ({ ...prev, showStableManifold: v }))}
      />

      {manifoldState.showStableManifold && (
        <div id="intersect-panel" style={{ marginTop: '8px' }}>
          <Slider
            label="Detection threshold ε"
            min={0.001} max={0.2} step={0.001}
            value={manifoldState.intersectionThreshold}
            onChange={v => setManifoldState(prev => ({ ...prev, intersectionThreshold: v }))}
          />
          {(() => {
            const heteroClinic = manifoldState.intersections.filter(i => i.has_intersection);
            if (heteroClinic.length > 0) {
              const minDist = Math.min(...heteroClinic.map(i => i.min_distance));
              return (
                <div className="intersect-warn">
                  <div>⚠ Heteroclinic connection!</div>
                  <div style={{ fontSize: '9px', opacity: 0.8, marginTop: '2px' }}>
                    {heteroClinic.length} connection{heteroClinic.length > 1 ? 's' : ''} found (min d = {minDist.toFixed(4)})
                  </div>
                </div>
              );
            } else if (manifoldState.intersections.length > 0) {
              return <div className="intersect-ok">✓ No heteroclinic connections</div>;
            } else {
              return <div style={{ fontSize: '10px', color: 'var(--text-3)' }}>Need ≥2 saddles for detection</div>;
            }
          })()}
        </div>
      )}
    </Collapsible>
  );
};
