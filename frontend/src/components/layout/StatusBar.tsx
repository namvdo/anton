import type {
  BistParameters,
  ManifoldBranch,
  ManifoldState,
  PeriodicState,
  SystemCatalog,
  SystemId,
  UlamState,
} from '../../types/domain';

interface StatusBarProps {
  dynamicSystem: SystemId;
  manifoldState: ManifoldState;
  ulamState: UlamState;
  params: BistParameters;
  systems: SystemCatalog;
  periodicState: PeriodicState;
}

const branchPointCount = (branch?: ManifoldBranch): number => (
  branch?.extended_points?.length ?? branch?.points?.length ?? 0
);

export const StatusBar = ({ dynamicSystem, manifoldState, ulamState, params, systems, periodicState }: StatusBarProps) => {
  const sys = Object.values(systems).flat().find(s => s.id === dynamicSystem);
  
  let paramString = '';
  if (dynamicSystem === 'duffing_ode') {
    paramString = `δ=${params.delta.toFixed(2)}, h=${params.h.toFixed(3)}`;
  } else if (dynamicSystem === 'custom') {
    paramString = `a=${params.a.toFixed(2)}, b=${params.b.toFixed(2)}, ε=${params.epsilon.toFixed(4)}`;
  } else {
    paramString = `a=${params.a.toFixed(2)}, b=${params.b.toFixed(2)}, ε=${params.epsilon.toFixed(4)}`;
  }

  const orbitCount = periodicState?.orbits?.length || 0;
  const manifoldPts = manifoldState.manifolds.reduce((count, manifold) => (
    count + branchPointCount(manifold.plus) + branchPointCount(manifold.minus)
  ), 0);
  const iteration = manifoldState.iteration || 0;
  const maxIter = params.maxIterations;

  return (
    <div className="statusbar">
      <div className="sb-cell">
        <div className={`sb-dot ${manifoldState.isComputing || ulamState.isComputing ? 'busy' : ''}`}></div>
        <span className="sb-v">{manifoldState.isComputing ? 'Computing...' : 'Ready'}</span>
      </div>
      <div className="sb-cell">
        <span className="sb-v">{sys?.name} · {paramString}</span>
      </div>
      <div className="sb-cell"><span className="sb-v">{orbitCount} orbits</span></div>
      <div className="sb-cell"><span className="sb-v">{manifoldPts} manifold pts</span></div>
      <div className="sb-cell"><span className="sb-v">iter {iteration} / {maxIter}</span></div>
      <div className="sb-keys">
        <span><kbd>Space</kbd> step</span>
        <span><kbd>P</kbd> play</span>
        <span><kbd>R</kbd> reset</span>
        <span><kbd>U</kbd> ulam</span>
      </div>
    </div>
  );
};
