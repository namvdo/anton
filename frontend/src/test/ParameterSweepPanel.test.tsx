import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { ParameterSweepPanel } from '../components/sidebar/ParameterSweepPanel';

const defaultSweepState: ComponentProps<typeof ParameterSweepPanel>['sweepState'] = {
  results: null,
  isComputing: false,
  error: null,
  sweepParam: 'a',
  sweepMin: 0.1,
  sweepMax: 2.0,
  numSamples: 10,
  maxPeriod: 3,
};

const defaultProps = {
  wasmModule: null,
  params: { a: 1.4, b: 0.3 },
  viewRange: { xMin: -3, xMax: 3, yMin: -3, yMax: 3 },
  sweepState: defaultSweepState,
  setSweepState: vi.fn(),
  dynamicSystem: 'henon',
  customEquations: {
    custom: { xEq: '1 - a * x^2 + y', yEq: 'b * x' },
    custom_ode: { xEq: 'y', yEq: 'x - x^3 - delta * y' },
  },
  customParams: [],
} satisfies ComponentProps<typeof ParameterSweepPanel>;

describe('ParameterSweepPanel', () => {
  it('renders sweep controls', () => {
    render(<ParameterSweepPanel {...defaultProps} />);
    expect(screen.getByText('Run Sweep')).toBeInTheDocument();
  });

  it('renders parameter selector and sliders', () => {
    render(<ParameterSweepPanel {...defaultProps} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByText(/a min/)).toBeInTheDocument();
    expect(screen.getByText(/a max/)).toBeInTheDocument();
    expect(screen.getByText(/Samples/)).toBeInTheDocument();
    expect(screen.getByText(/Max period/)).toBeInTheDocument();
  });

  it('shows computing state', () => {
    render(
      <ParameterSweepPanel
        {...defaultProps}
        sweepState={{ ...defaultSweepState, isComputing: true }}
      />
    );
    expect(screen.getByText('Sweeping...')).toBeInTheDocument();
  });

  it('shows error message', () => {
    render(
      <ParameterSweepPanel
        {...defaultProps}
        sweepState={{ ...defaultSweepState, error: 'Test error' }}
      />
    );
    expect(screen.getByText(/Test error/)).toBeInTheDocument();
  });

  it('shows results table when data available', () => {
    const results = [
      { param_value: 0.5, total_orbits: 2, stable_count: 1, unstable_count: 0, saddle_count: 1, orbits: [] },
      { param_value: 1.0, total_orbits: 3, stable_count: 0, unstable_count: 1, saddle_count: 2, orbits: [] },
    ];
    render(
      <ParameterSweepPanel
        {...defaultProps}
        sweepState={{ ...defaultSweepState, results }}
      />
    );
    expect(screen.getByText('2 parameter values sampled')).toBeInTheDocument();
    expect(screen.getByText('5 total orbits found')).toBeInTheDocument();
    expect(screen.getByText('0.500')).toBeInTheDocument();
    expect(screen.getByText('1.000')).toBeInTheDocument();
  });

  it('shows export buttons when results available', () => {
    const results = [
      { param_value: 1.0, total_orbits: 1, stable_count: 1, unstable_count: 0, saddle_count: 0, orbits: [] },
    ];
    render(
      <ParameterSweepPanel
        {...defaultProps}
        sweepState={{ ...defaultSweepState, results }}
      />
    );
    expect(screen.getByText('Export CSV')).toBeInTheDocument();
    expect(screen.getByText('Export JSON')).toBeInTheDocument();
  });

  it('does not show export buttons when no results', () => {
    render(<ParameterSweepPanel {...defaultProps} />);
    expect(screen.queryByText('Export CSV')).toBeNull();
    expect(screen.queryByText('Export JSON')).toBeNull();
  });

  it('does not show results table when no data', () => {
    render(<ParameterSweepPanel {...defaultProps} />);
    expect(screen.queryByText(/parameter values sampled/)).toBeNull();
  });

  it('shows custom parameter names for user-defined systems', () => {
    render(
      <ParameterSweepPanel
        {...defaultProps}
        dynamicSystem="custom"
        customParams={[
          { name: 'alpha', value: 1.0 },
          { name: 'beta', value: 0.5 },
        ]}
        sweepState={{ ...defaultSweepState, sweepParam: 'alpha' }}
      />
    );
    // The dropdown should have alpha and beta options
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    const options = select.querySelectorAll('option');
    expect(options).toHaveLength(2);
    expect(options[0].textContent).toBe('alpha');
    expect(options[1].textContent).toBe('beta');
  });
});
