import type { BistParameters, ManifoldState, PeriodicState, SystemType } from '../../types/domain';

interface InfoStripProps {
  type: SystemType;
  manifoldState: Pick<ManifoldState, 'isComputing' | 'isRunning' | 'currentPoint' | 'iteration'>;
  params: Pick<BistParameters, 'h' | 'maxIterations'>;
  periodicState: Pick<PeriodicState, 'orbits'>;
}

export const InfoStrip = ({ type, manifoldState, params, periodicState }: InfoStripProps) => {
  return (
    <div className="info-strip">
      <div className="info-cell">
        <span className="info-cell-k">Status</span>
        <span className={`info-cell-v ${!manifoldState.isComputing && !manifoldState.isRunning ? 'hi' : ''}`}>
          {manifoldState.isRunning ? 'Running' : (manifoldState.isComputing ? 'Computing' : 'Ready')}
        </span>
      </div>
      
      {type === 'continuous' ? (
        <div className="info-cell">
          <span className="info-cell-k">Time (t)</span>
          <span className="info-cell-v">{(manifoldState.iteration * params.h).toFixed(2)}s</span>
        </div>
      ) : (
        <div className="info-cell">
          <span className="info-cell-k">Orbits</span>
          <span className="info-cell-v">{(periodicState?.orbits?.length || 0)} found</span>
        </div>
      )}

      <div className="info-cell">
        <span className="info-cell-k">Position</span>
        <span className="info-cell-v">({manifoldState.currentPoint.x.toFixed(3)}, {manifoldState.currentPoint.y.toFixed(3)})</span>
      </div>

      <div className="info-cell">
        <span className="info-cell-k">Normal</span>
        <span className="info-cell-v">({manifoldState.currentPoint.nx.toFixed(3)}, {manifoldState.currentPoint.ny.toFixed(3)})</span>
      </div>

      <div className="info-cell info-cell-wide">
        <span className="info-cell-k">Iteration</span>
        <span className="info-cell-v">{type === 'continuous' ? manifoldState.iteration : `${manifoldState.iteration} / ${params.maxIterations}`}</span>
      </div>
    </div>
  );
};
