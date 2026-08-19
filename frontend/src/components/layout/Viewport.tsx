import React, { type RefObject } from 'react';
import {
  inverseOffsetCurveColor,
  visibleInverseOffsetCurves,
} from '../../utils/inverseOffsetDisplay';
import {
  formatContourEpsilon,
  geometricOffsetContourColor,
} from '../../utils/geometricOffsetBatch';
import type {
  GeometricOffsetContour,
  GeometricOffsetState,
  ManifoldState,
  SystemType,
  TooltipData,
  TooltipState,
  UlamState,
  ViewRange,
} from '../../types/domain';
import { BOUNDARY_LAYER_COLORS } from '../../utils/boundaryLayers';

interface ViewportProps {
  type: SystemType;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  tooltip: Pick<TooltipState, 'visible'> & Partial<Omit<TooltipState, 'visible'>>;
  manifoldState: Pick<
    ManifoldState,
    | 'showUnstableManifold'
    | 'showDeterministicImageBoundary'
    | 'showNoiseBalls'
    | 'showBoundarySamplePoints'
    | 'showStableManifold'
    | 'showOrbits'
  >;
  hasBoundarySamples?: boolean;
  geometricOffsetState: {
    contours?: GeometricOffsetContour[];
    selectedContourId?: string | null;
    preimageSourceIds?: string[];
    showInverseContours?: boolean;
    inverseDisplayMode?: GeometricOffsetState['inverseDisplayMode'];
  };
  ulamState: Pick<UlamState, 'showUlamOverlay'>;
  displayRange?: ViewRange;
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleResetView: () => void;
  handlePanMode: () => void;
  isPanMode?: boolean;
  savePNG: () => void;
}

export const Viewport = ({ type, canvasRef, tooltip, manifoldState, geometricOffsetState, ulamState, hasBoundarySamples = false, displayRange, handleZoomIn, handleZoomOut, handleResetView, handlePanMode, isPanMode = false, savePNG }: ViewportProps) => {
  const tooltipData: TooltipData | null = tooltip.data ?? null;
  const tooltipX = tooltip.x ?? 0;
  const tooltipY = tooltip.y ?? 0;
  const serializedDisplayRange = displayRange
    ? `${displayRange.xMin},${displayRange.xMax},${displayRange.yMin},${displayRange.yMax}`
    : undefined;
  const contours = geometricOffsetState?.contours ?? [];
  const sourceIds = new Set(geometricOffsetState?.preimageSourceIds ?? []);
  if (geometricOffsetState?.selectedContourId) {
    sourceIds.add(geometricOffsetState.selectedContourId);
  }
  const inverseLegendEntries = geometricOffsetState?.showInverseContours
    ? contours.flatMap((contour, contourIndex) => {
      if (!sourceIds.has(contour.id) || !contour.inverseResult) return [];
      const inverseCurves = visibleInverseOffsetCurves(
        contour.inverseResult,
        geometricOffsetState?.inverseDisplayMode || 'all',
      );
      const iterations = [...new Set(inverseCurves.map(curve => (
        Number(curve.inverse_iteration) || 1
      )))].sort((left, right) => left - right);
      if (iterations.length === 0) return [];
      return iterations.map(iteration => ({ contour, contourIndex, iteration }));
    })
    : [];

  return (
    <div className="viewport" data-view-range={serializedDisplayRange}>
      <div className="vp-tools">
        <button type="button" className="vp-btn" title="Zoom in" aria-label="Zoom in" onClick={handleZoomIn}>+</button>
        <button type="button" className="vp-btn" title="Zoom out" aria-label="Zoom out" onClick={handleZoomOut}>−</button>
        <button type="button" className="vp-btn" title="Fit view" aria-label="Fit view" onClick={handleResetView}>⌂</button>
        <div className="vp-sep"></div>
        {type === 'continuous' && (
          <button type="button" className="vp-btn active" title="Place start point" aria-label="Place start point">◎</button>
        )}
        <button type="button" className={`vp-btn ${isPanMode ? 'active' : ''}`} title="Pan view (Hold & drag)" aria-label="Pan view" onClick={handlePanMode}>⊹</button>
        <div className="vp-sep"></div>
        <button type="button" className="vp-btn" title="Save PNG" aria-label="Save PNG" onClick={savePNG}>↓</button>
      </div>



      <div className="vp-legend">
        <div className="vp-legend-title">Legend</div>
        {manifoldState.showUnstableManifold && (
          <div className="lg-item">
            <div
              className={manifoldState.showBoundarySamplePoints ? 'lg-dot' : 'lg-line'}
              style={{ background: BOUNDARY_LAYER_COLORS.invariant }}
            ></div>
            Unstable manifold
          </div>
        )}
        {hasBoundarySamples && manifoldState.showUnstableManifold
          && manifoldState.showDeterministicImageBoundary && (
          <div className="lg-item">
            <div
              className={manifoldState.showBoundarySamplePoints ? 'lg-dot' : 'lg-line'}
              style={{ background: BOUNDARY_LAYER_COLORS.deterministicImage }}
            ></div>
            Deterministic image boundary
          </div>
        )}
        {hasBoundarySamples && manifoldState.showUnstableManifold
          && manifoldState.showNoiseBalls && (
          <div className="lg-item">
            <div className="lg-ring" style={{ borderColor: BOUNDARY_LAYER_COLORS.noiseBall }}></div>
            Noise balls
          </div>
        )}
        {manifoldState.showStableManifold && <div className="lg-item"><div className="lg-line" style={{ background: '#b8904a' }}></div>Stable manifold</div>}
        {contours.map((contour, contourIndex) => contour.visible && contour.result ? (
          <div className="lg-item" key={`geometric-offset-${contour.id}`}
            aria-label={`Geometric contour epsilon ${formatContourEpsilon(contour.epsilon)}${contour.id === geometricOffsetState.selectedContourId ? ' selected' : ''}`}>
            <div className="lg-dot" data-testid="geometric-offset-point-swatch" style={{
              background: geometricOffsetContourColor(contourIndex),
              width: contour.id === geometricOffsetState.selectedContourId ? '9px' : '7px',
              height: contour.id === geometricOffsetState.selectedContourId ? '9px' : '7px',
            }}></div>
            ε<sub>g</sub> = {formatContourEpsilon(contour.epsilon)}
            {contour.id === geometricOffsetState.selectedContourId ? ' · selected' : ''}
          </div>
        ) : null)}
        {inverseLegendEntries.map(({ contour, contourIndex, iteration }) => (
          <div className="lg-item" key={`inverse-offset-${contour.id}-${iteration}`}
            aria-label={`Preimage epsilon ${formatContourEpsilon(contour.epsilon)} step ${iteration}`}>
            <div className="lg-line" style={{
              background: inverseOffsetCurveColor(contourIndex, contours.length, iteration),
              height: '3px',
            }}></div>
            Preimage ε<sub>g</sub> = {formatContourEpsilon(contour.epsilon)} · step {iteration}
          </div>
        ))}
        {manifoldState.showOrbits && (
          <>
            <div className="lg-item"><div className="lg-dot" style={{ background: '#b8904a' }}></div>Saddle</div>
            <div className="lg-item"><div className="lg-dot" style={{ background: '#5a9668' }}></div>Stable</div>
            <div className="lg-item"><div className="lg-dot" style={{ background: '#a85252' }}></div>Unstable</div>
          </>
        )}
        <div className="lg-item"><div className="lg-dot" style={{ background: '#8a5faa' }}></div>Trajectory</div>
      </div>

      {tooltip.visible && tooltipData && !ulamState.showUlamOverlay && tooltipData.type !== 'Ulam Box' && (
        <div className="vp-tooltip" style={{ top: Math.min(tooltipY, window.innerHeight - 150), left: Math.min(tooltipX + 15, window.innerWidth - 200) }}>
          <div className="vp-tt-head">
            <div className="t-swatch" style={{ background: tooltipData.stability === 'stable' ? '#5a9668' : tooltipData.stability === 'saddle' ? '#b8904a' : '#a85252', width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 }}></div>
            {tooltipData.type === 'Fixed Point' ? 'Fixed point' : `Period-${tooltipData.period} orbit`}
          </div>
          <div className="vp-tt-grid">
            <span className="tt-k">Position</span><span className="tt-v em">({tooltipData.pos.x.toFixed(4)}, {tooltipData.pos.y.toFixed(4)})</span>
            {tooltipData.normal && (
              <>
                <span className="tt-k">Normal</span>
                <span className="tt-v em">({tooltipData.normal.x.toFixed(4)}, {tooltipData.normal.y.toFixed(4)})</span>
              </>
            )}
            <span className="tt-k">Stability</span>
            <span className="tt-v" style={{ color: tooltipData.stability === 'stable' ? 'var(--green)' : tooltipData.stability === 'saddle' ? 'var(--amber)' : 'var(--red)' }}>
              {tooltipData.stability?.charAt(0).toUpperCase() + tooltipData.stability?.slice(1)}
            </span>
            {tooltipData.eigenvalues && (
              <>
                <span className="tt-k">Eigenvalues</span>
                <span className="tt-v">{tooltipData.eigenvalues.map(v => v.toFixed(3)).join(', ')}</span>
              </>
            )}
            {tooltipData.jacobian && (
              <>
                <span className="tt-k">det(J)</span><span className="tt-v">{tooltipData.jacobian.det.toFixed(3)}</span>
                <span className="tt-k">tr(J)</span><span className="tt-v">{tooltipData.jacobian.trace.toFixed(3)}</span>
              </>
            )}
          </div>
        </div>
      )}

      {tooltip.visible && tooltipData && tooltipData.type === 'Ulam Box' && (
        <div className="vp-tooltip" style={{ top: Math.min(tooltipY, window.innerHeight - 150), left: Math.min(tooltipX + 15, window.innerWidth - 200) }}>
          <div className="vp-tt-head">
            <div className="t-swatch" style={{ background: '#5b88b5', width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 }}></div>
            Ulam Box #{tooltipData.boxIndex}
          </div>
          <div className="vp-tt-grid">
            <span className="tt-k">Center</span><span className="tt-v em">({tooltipData.pos.x.toFixed(3)}, {tooltipData.pos.y.toFixed(3)})</span>
            <span className="tt-k">Measure</span><span className="tt-v" style={{ color: 'var(--amber)' }}>{tooltipData.measurePercent.toFixed(1)}% of max</span>
            <span className="tt-k">Transitions</span><span className="tt-v">{tooltipData.numTransitions} paths</span>
            {tooltipData.topTransitions && tooltipData.topTransitions.length > 0 && (
              <>
                <span className="tt-k" style={{ gridColumn: '1 / -1', marginTop: '4px' }}>Top targets:</span>
                {tooltipData.topTransitions.map((t, idx) => (
                  <React.Fragment key={idx}>
                    <span className="tt-k" style={{ paddingLeft: '10px' }}>Box #{t.index}</span>
                    <span className="tt-v">{(t.probability * 100).toFixed(1)}%</span>
                  </React.Fragment>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      <canvas
        ref={canvasRef}
        className="vp-canvas"
      />
    </div>
  );
};
