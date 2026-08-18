import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Viewport } from './Viewport';
import { createGeometricOffsetContour } from '../../utils/geometricOffsetBatch';

const readyContour = (epsilon: number, inverseIterations: number[] = []) => ({
  ...createGeometricOffsetContour(epsilon),
  result: {
    completed_levels: 1,
    levels: [{ level: 1, target_distance: epsilon, boundary_components: [] }],
  },
  inverseResult: inverseIterations.length > 0
    ? { curves: inverseIterations.map(inverse_iteration => ({ inverse_iteration })) }
    : null,
});

const baseProps = {
  type: 'continuous' as const,
  canvasRef: { current: null },
  tooltip: { visible: false },
  manifoldState: {
    showUnstableManifold: false,
    showDeterministicImageBoundary: false,
    showNoiseBalls: false,
    showBoundarySamplePoints: false,
    showStableManifold: false,
    showOrbits: false
  },
  geometricOffsetState: { contours: [] },
  ulamState: { showUlamOverlay: false },
  displayRange: { xMin: -2, xMax: 2, yMin: -1.5, yMax: 1.5 },
  handleZoomIn: vi.fn(),
  handleZoomOut: vi.fn(),
  handleResetView: vi.fn(),
  handlePanMode: vi.fn(),
  savePNG: vi.fn()
};

describe('Viewport', () => {
  it('exposes the visual range independently from computation controls', () => {
    const { container } = render(<Viewport {...baseProps} />);
    expect(container.querySelector('.viewport')).toHaveAttribute('data-view-range', '-2,2,-1.5,1.5');
  });

  it('invokes the viewport range controls', () => {
    const handleZoomIn = vi.fn();
    const handleZoomOut = vi.fn();
    const handleResetView = vi.fn();
    render(<Viewport {...baseProps} handleZoomIn={handleZoomIn} handleZoomOut={handleZoomOut} handleResetView={handleResetView} />);

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset view' }));

    expect(handleZoomIn).toHaveBeenCalledOnce();
    expect(handleZoomOut).toHaveBeenCalledOnce();
    expect(handleResetView).toHaveBeenCalledOnce();
  });

  it('presents the current plot context and a clear fit action', () => {
    const handleResetView = vi.fn();
    render(<Viewport {...baseProps} type="discrete" handleResetView={handleResetView} />);

    expect(screen.getByRole('heading', { name: 'Discrete boundary-map phase space' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fit view' }));
    expect(handleResetView).toHaveBeenCalledOnce();
  });

  it('identifies a computed geometric-offset comparison', () => {
    const contour = readyContour(0.05);
    render(<Viewport {...baseProps} type="discrete" geometricOffsetState={{ contours: [contour] }} />);

    expect(screen.getByRole('heading', { name: 'Geometric ε-offset comparison' })).toBeInTheDocument();
  });

  it('labels unstable, deterministic-image, noise-ball, and mapped-point layers', () => {
    render(<Viewport {...baseProps} type="discrete" hasClosedMisBoundary manifoldState={{
      ...baseProps.manifoldState,
      showUnstableManifold: true,
      showDeterministicImageBoundary: true,
      showNoiseBalls: true,
    }} />);

    expect(screen.getByRole('heading', { name: 'Discrete boundary-map phase space' })).toBeInTheDocument();
    expect(screen.getByText('Unstable manifold')).toBeInTheDocument();
    expect(screen.getByText('Deterministic image boundary')).toBeInTheDocument();
    expect(screen.getByText('Noise balls')).toBeInTheDocument();
    expect(screen.queryByText('Mapped boundary points')).not.toBeInTheDocument();
  });

  it('shows the start point tool for continuous systems', () => {
    render(<Viewport {...baseProps} type="continuous" />);
    expect(screen.getByTitle('Place start point')).toBeInTheDocument();
  });

  it('hides the start point tool for discrete systems', () => {
    render(<Viewport {...baseProps} type="discrete" />);
    expect(screen.queryByTitle('Place start point')).toBeNull();
  });

  it('labels dynamically inverted offset curves separately from geometric offsets', () => {
    const contour = readyContour(0.05, [2]);
    render(<Viewport {...baseProps} geometricOffsetState={{
      contours: [contour],
      selectedContourId: contour.id,
      preimageSourceIds: [contour.id],
      showInverseContours: true,
      inverseDisplayMode: 'final',
    }} />);
    expect(screen.getByLabelText('Geometric contour epsilon 0.05 selected')).toBeInTheDocument();
    expect(screen.getByLabelText('Preimage epsilon 0.05 step 2')).toBeInTheDocument();
  });

  it('shows distinct legend colors for multiple preimage sources', () => {
    const first = readyContour(0.025, [1, 2]);
    const second = readyContour(0.075, [1, 2]);
    const { container } = render(<Viewport {...baseProps} geometricOffsetState={{
      contours: [first, second],
      selectedContourId: first.id,
      preimageSourceIds: [first.id, second.id],
      showInverseContours: true,
      inverseDisplayMode: 'all',
    }} />);
    expect(screen.getByLabelText('Preimage epsilon 0.025 step 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Preimage epsilon 0.025 step 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Preimage epsilon 0.075 step 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Preimage epsilon 0.075 step 2')).toBeInTheDocument();
    const swatches = container.querySelectorAll<HTMLElement>('.vp-legend .lg-line');
    const inverseSwatches = Array.from(swatches).slice(2).map(swatch => swatch.style.background);
    expect(new Set(inverseSwatches).size).toBe(4);
  });

  it('shows all inverse steps when older state has no display preference', () => {
    const contour = readyContour(0.1, [1, 7]);
    render(<Viewport {...baseProps} geometricOffsetState={{
      contours: [contour],
      selectedContourId: contour.id,
      preimageSourceIds: [contour.id],
      showInverseContours: true,
    }} />);
    expect(screen.getByLabelText('Preimage epsilon 0.1 step 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Preimage epsilon 0.1 step 7')).toBeInTheDocument();
  });

  it('shows the complete extended state in a solution tooltip', () => {
    render(<Viewport {...baseProps} tooltip={{
      visible: true,
      x: 10,
      y: 10,
      data: {
        type: 'Periodic Point',
        period: 2,
        stability: 'saddle' as const,
        pos: { x: 0.25, y: -0.5 },
        normal: { x: 0.6, y: 0.8 }
      }
    }} />);

    expect(screen.getByText('(0.2500, -0.5000)')).toBeInTheDocument();
    expect(screen.getByText('(0.6000, 0.8000)')).toBeInTheDocument();
  });
});
