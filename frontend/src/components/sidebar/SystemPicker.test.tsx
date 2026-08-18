import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SYSTEM_CATALOG } from '../../config/systems';
import { SystemPicker } from './SystemPicker';

describe('SystemPicker', () => {
  it('exposes system types and systems as pressed-state buttons', () => {
    const setType = vi.fn();
    const setSystemId = vi.fn();
    render(
      <SystemPicker
        type="discrete"
        setType={setType}
        systemId="henon"
        setSystemId={setSystemId}
        systems={SYSTEM_CATALOG}
      />,
    );

    const discrete = screen.getByRole('button', { name: /Discrete/ });
    const continuous = screen.getByRole('button', { name: /Continuous/ });
    const henon = screen.getByRole('button', { name: 'Hénon Map' });
    expect(discrete).toHaveAttribute('aria-pressed', 'true');
    expect(continuous).toHaveAttribute('aria-pressed', 'false');
    expect(henon).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(continuous);
    fireEvent.click(screen.getByRole('button', { name: 'Duffing Map' }));
    expect(setType).toHaveBeenCalledWith('continuous');
    expect(setSystemId).toHaveBeenCalledWith('duffing');
  });

  it('disables every system choice while a computation locks configuration', () => {
    render(
      <SystemPicker
        type="continuous"
        setType={vi.fn()}
        systemId="duffing_ode"
        setSystemId={vi.fn()}
        systems={SYSTEM_CATALOG}
        disabled
      />,
    );

    expect(screen.getByRole('button', { name: /Continuous/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Duffing Oscillator' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Custom ODE' })).toBeDisabled();
  });
});
