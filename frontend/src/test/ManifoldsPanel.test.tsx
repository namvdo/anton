import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ManifoldsPanel } from '../components/sidebar/ManifoldsPanel';

const ORBIT_COLORS = {
  manifold: '#1e90ff',
  stableManifold: '#ffa500',
  repellerManifold: '#ff4444',
  attractor: '#27ae60',
  repeller: '#e74c3c',
  saddlePoint: '#eedf32',
};

describe('ManifoldsPanel', () => {
  const defaultManifoldState = {
    showUnstableManifold: false,
    showDeterministicImageBoundary: false,
    showNoiseBalls: false,
    showBoundarySamplePoints: false,
    maximumManifoldPointSpacing: 0.005,
    showStableManifold: false,
    showRepellerManifold: false,
    intersectionThreshold: 0.05,
    intersections: [],
  };

  it('renders the stable and unstable manifold toggles', () => {
    const setManifoldState = vi.fn();
    render(
      <ManifoldsPanel
        manifoldState={defaultManifoldState}
        setManifoldState={setManifoldState}
        ORBIT_COLORS={ORBIT_COLORS}
      />
    );

    expect(screen.getByText('Unstable manifold')).toBeInTheDocument();
    expect(screen.getByText('Stable manifold')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });

  it('shows simple boundary-layer controls and branch sampling density', () => {
    const setManifoldState = vi.fn();
    render(
      <ManifoldsPanel
        manifoldState={{ ...defaultManifoldState, showUnstableManifold: true }}
        setManifoldState={setManifoldState}
        ORBIT_COLORS={ORBIT_COLORS}
        hasBoundarySamples
        systemEpsilon={0.0625}
        boundarySampling={{
          unstable: { sampleCount: 320, perimeter: 8, pointsPerUnit: 40, maximumGap: 0.031 },
          deterministic: { sampleCount: 320, perimeter: 6.4, pointsPerUnit: 50, maximumGap: 0.027 },
        }}
      />
    );

    expect(screen.getByLabelText('Remove noise')).toBeEnabled();
    expect(screen.getByLabelText('Show noise balls')).toBeEnabled();
    expect(screen.getByLabelText('Show points')).toBeEnabled();
    expect(screen.getByRole('spinbutton', { name: '' })).toHaveValue(0.005);
    expect(screen.getByText('Smaller spacing performs more extended boundary-map calculations.')).toBeInTheDocument();
    expect(screen.getByText('Maximum state spacing')).toBeInTheDocument();
    expect(screen.getByText('‖(Δx, Δn)‖; recomputes')).toBeInTheDocument();
    expect(screen.getByLabelText('Boundary sampling density')).toHaveTextContent('Unstable320 · 40.0/unit · Δx max 0.031');
    expect(screen.getByLabelText('Boundary sampling density')).toHaveTextContent('Deterministic320 · 50.0/unit · Δx max 0.027');
    expect(screen.queryByText('Wei boundary construction')).not.toBeInTheDocument();
  });

  it('disables dependent layers until calculated branch samples are available', () => {
    render(
      <ManifoldsPanel
        manifoldState={{ ...defaultManifoldState, showUnstableManifold: true }}
        setManifoldState={vi.fn()}
        ORBIT_COLORS={ORBIT_COLORS}
        systemEpsilon={0.0625}
      />
    );

    expect(screen.queryByText(/closed unstable-manifold boundary/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Remove noise')).toBeDisabled();
    expect(screen.getByLabelText('Show noise balls')).toBeDisabled();
    expect(screen.getByLabelText('Show points')).toBeDisabled();
  });

  it('toggles stable manifold correctly', () => {
    const setManifoldState = vi.fn();
    render(
      <ManifoldsPanel
        manifoldState={{ ...defaultManifoldState, showStableManifold: true }}
        setManifoldState={setManifoldState}
        ORBIT_COLORS={ORBIT_COLORS}
      />
    );

    expect(screen.getByLabelText('Stable manifold')).toBeChecked();
  });

  it('renders saddle orbit source selector and only shows saddle periods', () => {
    const setManifoldState = vi.fn();
    const periodicOrbits = [
      { period: 1, stability: 'saddle' as const, points: [[0.5, 0.15] as [number, number]] },
      { period: 2, stability: 'saddle' as const, points: [[0.14, 0.42] as [number, number], [1.42, 0.04] as [number, number]] },
      { period: 2, stability: 'stable' as const, points: [[0.2, 0.4] as [number, number], [1.4, 0.1] as [number, number]] }, // non-saddle attractor
    ];

    render(
      <ManifoldsPanel
        manifoldState={{ ...defaultManifoldState, selectedOrbitPeriod: 'all' }}
        setManifoldState={setManifoldState}
        periodicOrbits={periodicOrbits}
        ORBIT_COLORS={ORBIT_COLORS}
      />
    );

    expect(screen.getByLabelText(/Orbit source/)).toBeInTheDocument();
    expect(screen.getByText('All periods (2 orbits)')).toBeInTheDocument();
    expect(screen.getByText('Period 1 (1 orbit, 1 pt)')).toBeInTheDocument();
    expect(screen.getByText('Period 2 (1 orbit, 2 pts)')).toBeInTheDocument();
    // Non-saddle/non-repeller attractor should not create extra options
    expect(screen.queryByText(/Period 2 stable/)).not.toBeInTheDocument();
  });
});
