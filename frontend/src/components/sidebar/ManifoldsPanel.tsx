import { Collapsible } from '../ui/Collapsible';
import { Toggle } from '../ui/Toggle';
import { Slider } from '../ui/Slider';
import type { ManifoldState, PeriodicOrbit, StateSetter } from '../../types/domain';
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
    | 'selectedOrbitPeriod'
  >;
  setManifoldState: StateSetter<ManifoldState>;
  periodicOrbits?: PeriodicOrbit[];
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
  periodicOrbits = [],
  ORBIT_COLORS,
  hasBoundarySamples = false,
  boundaryLayerError = null,
  systemEpsilon = 0,
  boundarySampling,
}: ManifoldsPanelProps) => {
  const boundaryLayersAvailable = manifoldState.showUnstableManifold
    && hasBoundarySamples
    && !boundaryLayerError;

  const relevantOrbits = (periodicOrbits || []).filter(o => {
    const stab = (o.stability || '').toLowerCase();
    return stab === 'saddle' || stab === 'unstable' || stab === 'dualrepeller' || stab === 'dual_repeller';
  });
  const candidateOrbits = relevantOrbits.length > 0 ? relevantOrbits : (periodicOrbits || []);
  const availablePeriods = Array.from(
    new Set(candidateOrbits.map(o => o.period))
  ).sort((a, b) => a - b);

  return (
    <Collapsible title="Manifolds" defaultOpen={true}>
      {candidateOrbits.length > 0 && (
        <div className="start-field" style={{ marginBottom: '12px' }}>
          <label htmlFor="manifold-orbit-source">Orbit source (saddles & dual repellers)</label>
          <select
            id="manifold-orbit-source"
            className="param-select"
            value={manifoldState.selectedOrbitPeriod ?? 'all'}
            onChange={(e) => {
              const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
              setManifoldState(prev => ({ ...prev, selectedOrbitPeriod: val }));
            }}
          >
            <option value="all">
              All periods ({candidateOrbits.length} orbit{candidateOrbits.length === 1 ? '' : 's'})
            </option>
            {availablePeriods.map(period => {
              const count = candidateOrbits.filter(o => o.period === period).length;
              const totalPoints = candidateOrbits
                .filter(o => o.period === period)
                .reduce((sum, o) => sum + (o.points?.length || period), 0);
              return (
                <option key={period} value={period}>
                  Period {period} ({count} orbit{count === 1 ? '' : 's'}, {totalPoints} pt{totalPoints === 1 ? '' : 's'})
                </option>
              );
            })}
          </select>
          <small>Compute manifolds for all saddle & dual repeller orbits of the selected period</small>
        </div>
      )}

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
    </Collapsible>
  );
};
