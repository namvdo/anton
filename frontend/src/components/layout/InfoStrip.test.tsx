import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InfoStrip } from './InfoStrip';

const props = {
  type: 'discrete' as const,
  manifoldState: {
    isComputing: false,
    isRunning: false,
    currentPoint: { x: 0.125, y: -0.25, nx: 0.6, ny: 0.8 },
    iteration: 4
  },
  ulamState: {},
  params: { maxIterations: 100, h: 0.05 },
  periodicState: { orbits: [] }
};

describe('InfoStrip', () => {
  it('shows both position and normal for the current extended state', () => {
    render(<InfoStrip {...props} />);

    expect(screen.getByText('Position')).toBeInTheDocument();
    expect(screen.getByText('(0.125, -0.250)')).toBeInTheDocument();
    expect(screen.getByText('Normal')).toBeInTheDocument();
    expect(screen.getByText('(0.600, 0.800)')).toBeInTheDocument();
  });

  it('shows the normal for continuous systems as well', () => {
    render(<InfoStrip {...props} type="continuous" />);
    expect(screen.getByText('Normal')).toBeInTheDocument();
    expect(screen.getByText('(0.600, 0.800)')).toBeInTheDocument();
  });
});
