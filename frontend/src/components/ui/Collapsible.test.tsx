import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Collapsible } from './Collapsible';

describe('Collapsible', () => {
  it('exposes expanded state and toggles its labelled content with the keyboard-safe button', () => {
    const { container } = render(
      <Collapsible title="Parameters">
        <span>Parameter controls</span>
      </Collapsible>,
    );

    const trigger = screen.getByRole('button', { name: 'Parameters' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveAttribute('aria-controls', 'section-parameters');
    expect(container.querySelector('.section')).toHaveClass('open');

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(container.querySelector('.section')).not.toHaveClass('open');
  });
});
