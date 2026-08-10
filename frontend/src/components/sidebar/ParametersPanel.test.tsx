import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { ParametersPanel } from './ParametersPanel';

const baseProps = {
  systemId: 'henon' as const,
  params: {
    a: 1.4,
    b: 0.3,
    delta: 0.15,
    h: 0.05,
    epsilon: 0.01,
    startX: 0.1,
    startY: 0.1,
    maxPeriod: 5,
    maxIterations: 1000,
  },
  setParams: vi.fn(),
  disabled: false,
  systems: {
    discrete: [{ id: 'henon' as const, name: 'Hénon Map', presets: [] }],
    continuous: []
  },
  applyPreset: vi.fn(),
  customParams: [],
  setCustomParams: vi.fn(),
  paramErrors: []
};

describe('ParametersPanel', () => {
  it('uses [-10, 10] bounds for a and b controls', () => {
    render(<ParametersPanel {...baseProps} />);
    const spinboxes = screen.getAllByRole('spinbutton');

    expect(spinboxes[0]).toHaveAttribute('min', '-10');
    expect(spinboxes[0]).toHaveAttribute('max', '10');
    expect(spinboxes[1]).toHaveAttribute('min', '-10');
    expect(spinboxes[1]).toHaveAttribute('max', '10');
  });

  it('does not render recompute button (moved to shared sidebar action)', () => {
    render(<ParametersPanel {...baseProps} />);
    expect(screen.queryByRole('button', { name: 'Apply & Recompute' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Recompute' })).toBeNull();
  });
});
