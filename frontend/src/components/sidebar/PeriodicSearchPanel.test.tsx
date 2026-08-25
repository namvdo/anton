import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { PeriodicSearchPanel } from './PeriodicSearchPanel';

const baseProps = {
  dynamicSystem: 'henon' as const,
  periodicSearchSettings: {
    gridSize: 10,
    thetaGridSize: 10,
    residualThreshold: 1e-10,
    useContinuation: false,
  },
  appliedPeriodicSearchSettings: {
    gridSize: 8,
    thetaGridSize: 12,
    residualThreshold: 1e-9,
    useContinuation: false,
  },
  maxPeriod: 5,
  appliedMaxPeriod: 4,
  appliedParameters: { a: 0.4, b: 0.3, epsilon: 0.0625 },
  viewRange: { xMin: -2, xMax: 2, yMin: -1.5, yMax: 1.5 },
  periodicState: {
    orbits: [{ period: 1, stability: 'stable', points: [] }],
    isReady: true,
    computeMethod: 'grid' as const,
  },
  updatePeriodicSearchSettings: vi.fn(),
  updateMaxPeriod: vi.fn(),
  runGridSearch: vi.fn(),
  hasPendingChanges: false,
  disabled: false,
};

describe('PeriodicSearchPanel', () => {
  it('makes every Hénon grid-search input and its cost explicit', () => {
    render(<PeriodicSearchPanel {...baseProps} />);

    expect(screen.getByLabelText('Maximum period')).toBeInTheDocument();
    expect(screen.getByLabelText('Position grid')).toBeInTheDocument();
    expect(screen.getByLabelText('Normal-angle grid')).toBeInTheDocument();
    expect(screen.getByLabelText('Residual tolerance')).toBeInTheDocument();
    expect(screen.getByText('Use cached-orbit continuation')).toBeInTheDocument();
    expect(screen.getByLabelText('Periodic grid search summary')).toHaveTextContent('x [-2, 2], y [-1.5, 1.5]');
    expect(screen.getByLabelText('Periodic grid search summary')).toHaveTextContent('5,000');
  });

  it('emits normalized updates when search settings change', () => {
    const onUpdate = vi.fn();
    const onMaxPeriod = vi.fn();
    render(<PeriodicSearchPanel {...baseProps}
      updatePeriodicSearchSettings={onUpdate}
      updateMaxPeriod={onMaxPeriod} />);

    fireEvent.change(screen.getByLabelText('Maximum period'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Position grid'), { target: { value: '24' } });
    fireEvent.change(screen.getByLabelText('Normal-angle grid'), { target: { value: '32' } });
    fireEvent.change(screen.getByLabelText('Residual tolerance'), { target: { value: '1e-8' } });
    fireEvent.click(screen.getByText('Use cached-orbit continuation'));

    expect(onMaxPeriod).toHaveBeenCalledWith(7);
    expect(onUpdate).toHaveBeenCalledWith({ gridSize: 24 });
    expect(onUpdate).toHaveBeenCalledWith({ thetaGridSize: 32 });
    expect(onUpdate).toHaveBeenCalledWith({ residualThreshold: 1e-8 });
    expect(onUpdate).toHaveBeenCalledWith({ useContinuation: true });
  });

  it('applies a complete search preset', () => {
    const onUpdate = vi.fn();
    const onMaxPeriod = vi.fn();
    render(<PeriodicSearchPanel {...baseProps}
      updatePeriodicSearchSettings={onUpdate}
      updateMaxPeriod={onMaxPeriod} />);

    fireEvent.click(screen.getByRole('button', { name: 'Deep 138,240 seeds' }));
    expect(onMaxPeriod).toHaveBeenCalledWith(10);
    expect(onUpdate).toHaveBeenCalledWith({
      gridSize: 24,
      thetaGridSize: 24,
      residualThreshold: 1e-10,
      useContinuation: false,
      maxNewtonIterations: 100,
      newtonBeta: null,
      deduplicationTolerance: 1e-3,
      supportFilterSubdivisions: 64,
      supportThreshold: 1e-10,
    });
  });

  it('runs a full grid search directly and identifies pending configuration', () => {
    const runGridSearch = vi.fn();
    render(<PeriodicSearchPanel {...baseProps}
      runGridSearch={runGridSearch}
      hasPendingChanges />);

    fireEvent.click(screen.getByRole('button', { name: 'Apply configuration & run full grid search' }));
    expect(runGridSearch).toHaveBeenCalledOnce();
  });

  it('states the exact configuration that produced the current result', () => {
    render(<PeriodicSearchPanel {...baseProps} />);
    const result = screen.getByLabelText('Current periodic orbit result configuration');

    expect(result).toHaveTextContent('1 orbit');
    expect(result).toHaveTextContent('full grid search');
    expect(result).toHaveTextContent('a = 0.4, b = 0.3, ε = 0.0625; P ≤ 4, 8 × 8 positions, 12 angles, tolerance 1e-9');
  });

  it('is hidden for systems without configurable boundary periodic search', () => {
    const { container } = render(<PeriodicSearchPanel {...baseProps} dynamicSystem="duffing" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders for custom discrete systems and formats parameters appropriately', () => {
    render(<PeriodicSearchPanel {...baseProps} dynamicSystem="custom" />);
    expect(screen.getByLabelText('Maximum period')).toBeInTheDocument();
    const result = screen.getByLabelText('Current periodic orbit result configuration');
    expect(result).toHaveTextContent('ε = 0.0625; P ≤ 4, 8 × 8 positions, 12 angles, tolerance 1e-9');
  });

  it('allows configuring advanced solver settings', () => {
    const onUpdate = vi.fn();
    render(<PeriodicSearchPanel {...baseProps} updatePeriodicSearchSettings={onUpdate} />);

    fireEvent.change(screen.getByLabelText('Max Newton iterations'), { target: { value: '250' } });
    expect(onUpdate).toHaveBeenCalledWith({ maxNewtonIterations: 250 });

    fireEvent.change(screen.getByLabelText('Damping β (Davidchack-Lai)'), { target: { value: '1.5' } });
    expect(onUpdate).toHaveBeenCalledWith({ newtonBeta: 1.5 });

    fireEvent.change(screen.getByLabelText('Damping β (Davidchack-Lai)'), { target: { value: 'auto' } });
    expect(onUpdate).toHaveBeenCalledWith({ newtonBeta: null });

    fireEvent.change(screen.getByLabelText('Deduplication tolerance'), { target: { value: '1e-4' } });
    expect(onUpdate).toHaveBeenCalledWith({ deduplicationTolerance: 1e-4 });
  });
});
