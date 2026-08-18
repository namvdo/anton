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

  it('shows simple boundary-layer controls and sampling density for a closed curve', () => {
    const setManifoldState = vi.fn();
    render(
      <ManifoldsPanel
        manifoldState={{ ...defaultManifoldState, showUnstableManifold: true }}
        setManifoldState={setManifoldState}
        ORBIT_COLORS={ORBIT_COLORS}
        hasClosedMisBoundary
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
    expect(screen.getByLabelText('Boundary sampling density')).toHaveTextContent('Unstable320 points · max gap 0.031');
    expect(screen.getByLabelText('Boundary sampling density')).toHaveTextContent('Deterministic320 points · max gap 0.027');
    expect(screen.queryByText('Wei boundary construction')).not.toBeInTheDocument();
  });

  it('disables boundary layers until a closed curve is available', () => {
    render(
      <ManifoldsPanel
        manifoldState={{ ...defaultManifoldState, showUnstableManifold: true }}
        setManifoldState={vi.fn()}
        ORBIT_COLORS={ORBIT_COLORS}
        systemEpsilon={0.0625}
      />
    );

    expect(screen.getByText(/Waiting for a closed unstable-manifold boundary/)).toBeInTheDocument();
    expect(screen.getByLabelText('Remove noise')).toBeDisabled();
    expect(screen.getByLabelText('Show noise balls')).toBeDisabled();
    expect(screen.getByLabelText('Show points')).toBeDisabled();
  });

  it('shows intersection detection panel when stable manifold enabled', () => {
    const setManifoldState = vi.fn();
    render(
      <ManifoldsPanel
        manifoldState={{ ...defaultManifoldState, showStableManifold: true }}
        setManifoldState={setManifoldState}
        ORBIT_COLORS={ORBIT_COLORS}
      />
    );

    expect(screen.getByText(/Detection threshold/)).toBeInTheDocument();
  });

  it('hides intersection panel when stable manifold disabled', () => {
    const setManifoldState = vi.fn();
    render(
      <ManifoldsPanel
        manifoldState={{ ...defaultManifoldState, showStableManifold: false }}
        setManifoldState={setManifoldState}
        ORBIT_COLORS={ORBIT_COLORS}
      />
    );

    expect(screen.queryByText(/Detection threshold/)).toBeNull();
  });

  it('shows heteroclinic warning when intersections found', () => {
    const setManifoldState = vi.fn();
    render(
      <ManifoldsPanel
        manifoldState={{
          ...defaultManifoldState,
          showStableManifold: true,
          intersections: [
            { has_intersection: true, min_distance: 0.02 },
            { has_intersection: false, min_distance: 0.5 },
          ],
        }}
        setManifoldState={setManifoldState}
        ORBIT_COLORS={ORBIT_COLORS}
      />
    );

    expect(screen.getByText(/Heteroclinic connection/)).toBeInTheDocument();
    expect(screen.getByText(/1 connection found/)).toBeInTheDocument();
  });

  it('shows no connections message when intersections checked but none found', () => {
    const setManifoldState = vi.fn();
    render(
      <ManifoldsPanel
        manifoldState={{
          ...defaultManifoldState,
          showStableManifold: true,
          intersections: [
            { has_intersection: false, min_distance: 0.3 },
          ],
        }}
        setManifoldState={setManifoldState}
        ORBIT_COLORS={ORBIT_COLORS}
      />
    );

    expect(screen.getByText(/No heteroclinic connections/)).toBeInTheDocument();
  });
});
