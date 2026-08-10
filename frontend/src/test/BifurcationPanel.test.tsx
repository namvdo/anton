import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { BifurcationPanel } from '../components/sidebar/BifurcationPanel';

describe('BifurcationPanel', () => {
  const defaultParams = { a: 1.4, b: 0.3, epsilon: 0.01 };

  const defaultBifurcationState = {
    data: [],
    isComputing: false,
    error: null,
    aMin: 0.1,
    aMax: 2.0,
    numSamples: 30,
    threshold: 0.2,
    intersectionCount: 0,
    criticalValues: [],
  };

  it('renders the compute button', () => {
    const setBifurcationState = vi.fn();
    render(
      <BifurcationPanel
        params={defaultParams}
        wasmModule={null}
        bifurcationState={defaultBifurcationState}
        setBifurcationState={setBifurcationState}
      />
    );

    expect(screen.getByText('Compute Bifurcation Diagram')).toBeInTheDocument();
  });

  it('renders parameter sliders', () => {
    const setBifurcationState = vi.fn();
    render(
      <BifurcationPanel
        params={defaultParams}
        wasmModule={null}
        bifurcationState={defaultBifurcationState}
        setBifurcationState={setBifurcationState}
      />
    );

    expect(screen.getByText('a min')).toBeInTheDocument();
    expect(screen.getByText('a max')).toBeInTheDocument();
    expect(screen.getByText('Samples')).toBeInTheDocument();
  });

  it('shows computing state when isComputing is true', () => {
    const setBifurcationState = vi.fn();
    render(
      <BifurcationPanel
        params={defaultParams}
        wasmModule={null}
        bifurcationState={{ ...defaultBifurcationState, isComputing: true }}
        setBifurcationState={setBifurcationState}
      />
    );

    const button = screen.getByText('Computing...');
    expect(button).toBeDisabled();
  });

  it('renders chart canvas', () => {
    const setBifurcationState = vi.fn();
    const { container } = render(
      <BifurcationPanel
        params={defaultParams}
        wasmModule={null}
        bifurcationState={defaultBifurcationState}
        setBifurcationState={setBifurcationState}
      />
    );

    const canvas = container.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
    expect(canvas).toHaveAttribute('width', '240');
    expect(canvas).toHaveAttribute('height', '140');
  });

  it('shows results summary when data is available', () => {
    const setBifurcationState = vi.fn();
    render(
      <BifurcationPanel
        params={defaultParams}
        wasmModule={null}
        bifurcationState={{
          ...defaultBifurcationState,
          data: [
            { a: 0.5, hausdorff_distance: 0.1, has_intersection: false },
            { a: 1.0, hausdorff_distance: 0.01, has_intersection: true },
            { a: 1.5, hausdorff_distance: 0.05, has_intersection: false },
          ],
          intersectionCount: 1,
          criticalValues: [1.0],
        }}
        setBifurcationState={setBifurcationState}
      />
    );

    expect(screen.getByText('3 samples computed')).toBeInTheDocument();
    expect(screen.getByText(/1 bifurcation point detected/)).toBeInTheDocument();
    expect(screen.getByText(/Critical a values: 1.000/)).toBeInTheDocument();
  });

  it('shows no bifurcations message when none found', () => {
    const setBifurcationState = vi.fn();
    render(
      <BifurcationPanel
        params={defaultParams}
        wasmModule={null}
        bifurcationState={{
          ...defaultBifurcationState,
          data: [
            { a: 0.5, hausdorff_distance: 0.5, has_intersection: false },
          ],
          intersectionCount: 0,
          criticalValues: [],
        }}
        setBifurcationState={setBifurcationState}
      />
    );

    expect(screen.getByText('No bifurcations in range')).toBeInTheDocument();
  });

  it('shows error message when computation fails', () => {
    const setBifurcationState = vi.fn();
    render(
      <BifurcationPanel
        params={defaultParams}
        wasmModule={null}
        bifurcationState={{
          ...defaultBifurcationState,
          error: 'num_samples must be positive',
        }}
        setBifurcationState={setBifurcationState}
      />
    );

    expect(screen.getByText(/num_samples must be positive/)).toBeInTheDocument();
  });

  it('calls WASM compute when button clicked with module available', () => {
    const mockCompute = vi.fn().mockReturnValue([
      { a: 0.5, hausdorff_distance: 0.3, has_intersection: false },
    ]);
    const wasmModule = { compute_bifurcation_hausdorff: mockCompute };
    const setBifurcationState = vi.fn();

    render(
      <BifurcationPanel
        params={defaultParams}
        wasmModule={wasmModule}
        bifurcationState={defaultBifurcationState}
        setBifurcationState={setBifurcationState}
      />
    );

    fireEvent.click(screen.getByText('Compute Bifurcation Diagram'));

    // Should have been called with correct params
    expect(mockCompute).toHaveBeenCalledWith(
      defaultParams.b,
      defaultParams.epsilon,
      defaultBifurcationState.aMin,
      defaultBifurcationState.aMax,
      defaultBifurcationState.numSamples
    );
  });

  it('shows description text', () => {
    const setBifurcationState = vi.fn();
    render(
      <BifurcationPanel
        params={defaultParams}
        wasmModule={null}
        bifurcationState={defaultBifurcationState}
        setBifurcationState={setBifurcationState}
      />
    );

    expect(screen.getByText(/Hausdorff distance/)).toBeInTheDocument();
  });
});
