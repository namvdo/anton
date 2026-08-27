import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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

  it('keeps Hénon orbit-period configuration in the periodic search panel', () => {
    render(<ParametersPanel {...baseProps} />);
    expect(screen.queryByLabelText('Maximum orbit period')).toBeNull();
    expect(screen.getByLabelText('Trajectory iterations')).toBeInTheDocument();
  });

  it('retains the Duffing maximum period because its search uses a built-in grid', () => {
    render(<ParametersPanel {...baseProps} systemId="duffing" />);
    expect(screen.getByLabelText('Maximum orbit period')).toHaveValue(5);
  });

  it('allows zero epsilon to select deterministic dynamics', () => {
    const setParams = vi.fn();
    render(<ParametersPanel {...baseProps} setParams={setParams} />);

    const epsilonInput = screen.getAllByRole('spinbutton')[2];
    fireEvent.change(epsilonInput, { target: { value: '0' } });

    const updater = setParams.mock.calls.at(-1)?.[0];
    expect(updater).toBeTypeOf('function');
    expect(updater(baseProps.params)).toMatchObject({ epsilon: 0 });
    expect(screen.getByText('noise radius')).toBeInTheDocument();
  });

  it('evaluates and applies static and functional presets', () => {
    const applyPreset = vi.fn();
    const dynamicPresetVals = vi.fn(() => ({ a: 0.8, b: -0.4, epsilon: 0.05 }));
    render(
      <ParametersPanel
        {...baseProps}
        applyPreset={applyPreset}
        systems={{
          discrete: [
            {
              id: 'henon',
              name: 'Hénon Map',
              presets: [
                { name: 'Standard', vals: { a: 1.4, b: 0.3 } },
                { name: 'Random', vals: dynamicPresetVals },
              ],
            },
          ],
          continuous: [],
        }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Standard' }));
    expect(applyPreset).toHaveBeenCalledWith({ a: 1.4, b: 0.3 });

    fireEvent.click(screen.getByRole('button', { name: 'Random' }));
    expect(dynamicPresetVals).toHaveBeenCalled();
    expect(applyPreset).toHaveBeenCalledWith({ a: 0.8, b: -0.4, epsilon: 0.05 });
  });
});

