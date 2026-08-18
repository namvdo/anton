import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PeriodicOrbitsPanel } from './PeriodicOrbitsPanel';

const baseProps = {
  manifoldState: {
    showOrbits: true,
    showTrail: true,
    showAttractingRegions: true,
    fixedPoints: []
  },
  setManifoldState: vi.fn(),
  filters: {
    period1: true,
    period2: true,
    period3: true,
    period4: true,
    period5: true,
    period6plus: false
  },
  setFilters: vi.fn(),
  periodicState: {
    isReady: true,
    orbits: []
  }
};

describe('PeriodicOrbitsPanel', () => {
  it('keeps orbit markers and trajectory controls without the redundant orbit-lines toggle', () => {
    render(<PeriodicOrbitsPanel {...baseProps} />);

    expect(screen.getByLabelText('Orbit markers')).toBeInTheDocument();
    expect(screen.getByLabelText('Trajectory trail')).toBeInTheDocument();
    expect(screen.queryByLabelText('Orbit lines')).toBeNull();
  });

  it('shows period counts from periodic orbit data', () => {
    const periodicState = {
      isReady: true,
      orbits: [
        {
          period: 1,
          stability: 'saddle',
          points: [[1.219, 0.789]],
          extended_points: [[1.219, 0.789, 0.6, 0.8]],
          eigenvalues: [0.43]
        },
        {
          period: 2,
          stability: 'stable',
          points: [[1.522, -0.184], [-1.331, 1.154]],
          extended_points: [[1.522, -0.184, 1, 0], [-1.331, 1.154, 0, 1]],
          eigenvalues: [0.22, 0.31]
        }
      ]
    };

    render(<PeriodicOrbitsPanel {...baseProps} periodicState={periodicState} />);

    expect(screen.getByText('Period filter')).toBeInTheDocument();
    const periodFilter = document.querySelector('.period-filter');
    expect(periodFilter).not.toBeNull();
    expect(within(periodFilter as HTMLElement).getAllByRole('button')).toHaveLength(6);
    expect(screen.getByRole('button', { name: /6\+/ })).toBeInTheDocument();
  });

  it('shows fixed points with their complete extended state', () => {
    const periodicState = {
      orbits: [{
        period: 1,
        stability: 'saddle',
        points: [[0.5, 0.25]],
        extended_points: [[0.5, 0.25, 0.6, 0.8]],
        eigenvalues: [1.2]
      }]
    };

    render(
      <PeriodicOrbitsPanel
        {...baseProps}
        periodicState={periodicState}
      />
    );

    expect(screen.getByText('Extended fixed points (1)')).toBeInTheDocument();
    expect(screen.getByText('p = (0.5000, 0.2500)')).toBeInTheDocument();
    expect(screen.getByText('n = (0.6000, 0.8000)')).toBeInTheDocument();
  });

  it('provides compact expandable extended states for higher-period solutions', () => {
    render(<PeriodicOrbitsPanel {...baseProps} periodicState={{
      orbits: [{
        period: 2,
        stability: 'stable',
        points: [[1, 2], [3, 4]],
        extended_points: [[1, 2, 0.6, 0.8], [3, 4, -0.8, 0.6]],
        eigenvalues: [0.2, 0.3]
      }]
    }} />);

    expect(screen.getByText('Extended periodic orbits (1)')).toBeInTheDocument();
    expect(screen.getByText('Period 2')).toBeInTheDocument();
    expect(screen.getByText('stable · 2 states')).toBeInTheDocument();
    expect(screen.getByText('n = (-0.8000, 0.6000)')).toBeInTheDocument();
  });

  it('does not render periodic search controls in this panel', () => {
    render(<PeriodicOrbitsPanel {...baseProps} />);
    expect(screen.queryByLabelText('Grid size')).toBeNull();
    expect(screen.queryByLabelText('Theta grid')).toBeNull();
    expect(screen.queryByLabelText('Residual threshold')).toBeNull();
  });
});
