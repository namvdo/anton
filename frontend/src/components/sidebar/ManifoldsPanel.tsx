import { Collapsible } from '../ui/Collapsible';
import { Toggle } from '../ui/Toggle';
import { Slider } from '../ui/Slider';
import type { ManifoldState, StateSetter } from '../../types/domain';

interface OrbitColors {
  manifold: string;
  stableManifold: string;
}

interface ManifoldsPanelProps {
  manifoldState: Pick<
    ManifoldState,
    'showUnstableManifold' | 'showStableManifold' | 'intersectionThreshold' | 'intersections'
  >;
  setManifoldState: StateSetter<ManifoldState>;
  ORBIT_COLORS: OrbitColors;
}

export const ManifoldsPanel = ({ manifoldState, setManifoldState, ORBIT_COLORS }: ManifoldsPanelProps) => {
  return (
    <Collapsible title="Manifolds" defaultOpen={true}>
      <Toggle
        label="Unstable manifold"
        colorLine={ORBIT_COLORS.manifold}
        checked={manifoldState.showUnstableManifold}
        onChange={(v) => setManifoldState(prev => ({ ...prev, showUnstableManifold: v }))}
      />

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
