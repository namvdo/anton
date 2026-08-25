import { Collapsible } from '../ui/Collapsible';
import { Toggle } from '../ui/Toggle';
import { fixedPointSolutionsFromOrbits, orbitExtendedStates } from '../../utils/extendedOrbitState';
import type {
  ManifoldState,
  OrbitExtendedState,
  OrbitFilters,
  PeriodicState,
  StateSetter,
} from '../../types/domain';

type PeriodFilterKey = keyof OrbitFilters;

interface PeriodCount {
  label: number | '6+';
  key: PeriodFilterKey;
  count: number;
  active: boolean;
}

interface PeriodicOrbitsPanelProps {
  manifoldState: Pick<ManifoldState, 'showOrbits' | 'showTrail' | 'fixedPoints'>;
  setManifoldState: StateSetter<ManifoldState>;
  filters: OrbitFilters;
  setFilters: StateSetter<OrbitFilters>;
  periodicState: Pick<PeriodicState, 'orbits'> & Partial<Pick<PeriodicState, 'isReady'>>;
}

const formatComponent = (value: number | null | undefined): string => Number.isFinite(value) ? Number(value).toFixed(4) : '—';

interface DisplayedExtendedState {
  x: number;
  y: number;
  nx?: number | null;
  ny?: number | null;
}

const ExtendedCoordinates = ({ state }: { state: DisplayedExtendedState }) => (
  <div className="solution-coordinates">
    <span>p = ({formatComponent(state.x)}, {formatComponent(state.y)})</span>
    <span>n = ({formatComponent(state.nx)}, {formatComponent(state.ny)})</span>
  </div>
);

export const PeriodicOrbitsPanel = ({
  manifoldState,
  setManifoldState,
  filters,
  setFilters,
  periodicState
}: PeriodicOrbitsPanelProps) => {

  const toggleFilter = (period: PeriodFilterKey): void => {
    setFilters(prev => ({ ...prev, [period]: !prev[period] }));
  };

  const periods: Array<number | '6+'> = [1, 2, 3, 4, 5, '6+'];
  const periodCounts: PeriodCount[] = periods.map(period => {
    const key = (period === '6+' ? 'period6plus' : `period${period}`) as PeriodFilterKey;

    // Count how many orbits match this period
    let count = 0;
    if (periodicState.orbits) {
      if (period === '6+') {
        count = periodicState.orbits.filter(o => o.period >= 6).length;
      } else {
        count = periodicState.orbits.filter(o => o.period === period).length;
      }
    }

    return {
      label: period,
      key: key,
      count,
      active: filters[key]
    };
  });
  const periodicOrbits = periodicState.orbits || [];
  const fixedSolutions = fixedPointSolutionsFromOrbits(periodicOrbits);
  const displayedFixedPoints = fixedSolutions.length > 0
    ? fixedSolutions
    : (manifoldState.fixedPoints || []);
  const higherPeriodSolutions = periodicOrbits.filter(orbit => orbit.period > 1);

  return (
    <Collapsible title="Periodic orbits" defaultOpen={false}>
      <Toggle
        label="Orbit markers"
        checked={manifoldState.showOrbits}
        onChange={v => setManifoldState(prev => ({ ...prev, showOrbits: v }))}
      />
      <Toggle
        label="Trajectory trail"
        checked={manifoldState.showTrail}
        onChange={v => setManifoldState(prev => ({ ...prev, showTrail: v }))}
      />

      <div className="small-label">Period filter</div>
      <div className="period-filter">
        {periodCounts.map(p => (
          <button
            key={p.label}
            className={`per-btn ${p.active ? 'on' : ''}`}
            onClick={() => toggleFilter(p.key)}
          >
            {p.label}<span className="per-count">{p.count}</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '10px', marginTop: '7px', fontSize: '10px', color: 'var(--text-3)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#5a9668', display: 'inline-block' }}></span>Stable
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#b8904a', display: 'inline-block' }}></span>Saddle
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#a85252', display: 'inline-block' }}></span>Unstable
        </span>
      </div>

      {displayedFixedPoints.length > 0 && (
        <>
          <div className="small-label solution-label">Extended fixed points ({displayedFixedPoints.length})</div>
          <div className="fp-list">
            {displayedFixedPoints.map((fp, i) => {
              const stability = (fp.stability || '').toLowerCase();
              const isDual = stability === 'dualrepeller' || stability === 'dual_repeller';
              const bg = stability === 'stable' ? '#5a9668' : stability === 'saddle' ? '#b8904a' : isDual ? '#800080' : '#a85252';
              const label = isDual ? 'Dual repeller' : stability ? stability.charAt(0).toUpperCase() + stability.slice(1) : 'Unknown';
              return (
                <div key={i} className="fp-row">
                  <div className="fp-dot" style={{ background: bg }}></div>
                  <ExtendedCoordinates state={fp} />
                  <span className="fp-stab">
                    {label}
                    {fp.eigenvalues && fp.eigenvalues.length > 0 && ` · λ=${Math.max(...fp.eigenvalues).toFixed(2)}`}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {higherPeriodSolutions.length > 0 && (
        <>
          <div className="small-label solution-label">Extended periodic orbits ({higherPeriodSolutions.length})</div>
          <div className="solution-orbit-list">
            {higherPeriodSolutions.map((orbit, orbitIndex) => {
              const states = orbitExtendedStates(orbit);
              const stability = (orbit.stability || '').toLowerCase();
              return (
                <details className="solution-orbit" key={`${orbit.period}-${orbitIndex}`}>
                  <summary>
                    <span>Period {orbit.period}</span>
                    <span>{stability || 'unclassified'} · {states.length} states</span>
                  </summary>
                  <div className="solution-state-list">
                    {states.map(state => (
                      <div className="solution-state-row" key={state.pointIndex}>
                        <span className="solution-state-index">z{state.pointIndex}</span>
                        <ExtendedCoordinates state={state} />
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        </>
      )}

    </Collapsible>
  );
};
