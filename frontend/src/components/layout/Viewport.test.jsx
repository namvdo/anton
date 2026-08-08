import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Viewport } from './Viewport';

const baseProps = {
  type: 'continuous',
  canvasRef: { current: null },
  tooltip: { visible: false },
  manifoldState: {
    showUnstableManifold: false,
    showStableManifold: false,
    showOrbits: false
  },
  geometricOffsetState: { showContours: false },
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

  it('shows the start point tool for continuous systems', () => {
    render(<Viewport {...baseProps} type="continuous" />);
    expect(screen.getByTitle('Place start point')).toBeInTheDocument();
  });

  it('hides the start point tool for discrete systems', () => {
    render(<Viewport {...baseProps} type="discrete" />);
    expect(screen.queryByTitle('Place start point')).toBeNull();
  });

  it('labels dynamically inverted offset curves separately from geometric offsets', () => {
    render(<Viewport {...baseProps} geometricOffsetState={{
      showContours: true,
      result: { levels: [] },
      showInverseContours: true,
      inverseDisplayMode: 'final',
      inverseResult: { curves: [{ inverse_iteration: 2 }] }
    }} />);
    expect(screen.getByText('Geometric ε-offsets')).toBeInTheDocument();
    expect(screen.getByText('Boundary-map preimage · step 2')).toBeInTheDocument();
  });

  it('shows distinct legend colors when every inverse step is displayed', () => {
    const { container } = render(<Viewport {...baseProps} geometricOffsetState={{
      showContours: false,
      showInverseContours: true,
      inverseDisplayMode: 'all',
      inverseResult: { curves: [{ inverse_iteration: 1 }, { inverse_iteration: 2 }] }
    }} />);
    expect(screen.getByText('Boundary-map preimage · step 1')).toBeInTheDocument();
    expect(screen.getByText('Boundary-map preimage · step 2')).toBeInTheDocument();
    const swatches = container.querySelectorAll('.vp-legend .lg-line');
    expect(swatches[0].style.background).not.toBe(swatches[1].style.background);
  });

  it('shows all inverse steps when older state has no display preference', () => {
    render(<Viewport {...baseProps} geometricOffsetState={{
      showContours: false,
      showInverseContours: true,
      inverseResult: { curves: [{ inverse_iteration: 1 }, { inverse_iteration: 7 }] }
    }} />);
    expect(screen.getByText('Boundary-map preimage · step 1')).toBeInTheDocument();
    expect(screen.getByText('Boundary-map preimage · step 7')).toBeInTheDocument();
  });

  it('shows the complete extended state in a solution tooltip', () => {
    render(<Viewport {...baseProps} tooltip={{
      visible: true,
      x: 10,
      y: 10,
      data: {
        type: 'Periodic Point',
        period: 2,
        stability: 'saddle',
        pos: { x: 0.25, y: -0.5 },
        normal: { x: 0.6, y: 0.8 }
      }
    }} />);

    expect(screen.getByText('(0.2500, -0.5000)')).toBeInTheDocument();
    expect(screen.getByText('(0.6000, 0.8000)')).toBeInTheDocument();
  });
});
