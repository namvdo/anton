import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { Slider } from './Slider';

describe('Slider', () => {
  it('clamps number input to min/max bounds', () => {
    const onChange = vi.fn();
    render(
      <Slider
        label="a"
        min={-10}
        max={10}
        step={0.01}
        value={0}
        onChange={onChange}
        disabled={false}
      />
    );

    const numberInput = screen.getByRole('spinbutton');

    fireEvent.change(numberInput, { target: { value: '12' } });
    expect(onChange).toHaveBeenLastCalledWith(10);

    fireEvent.change(numberInput, { target: { value: '-12' } });
    expect(onChange).toHaveBeenLastCalledWith(-10);
  });

  it('clamps range input to min/max bounds', () => {
    const onChange = vi.fn();
    render(
      <Slider
        label="b"
        min={-10}
        max={10}
        step={0.01}
        value={0}
        onChange={onChange}
        disabled={false}
      />
    );

    const rangeInput = screen.getByRole('slider');

    fireEvent.change(rangeInput, { target: { value: '15' } });
    expect(onChange).toHaveBeenLastCalledWith(10);

    fireEvent.change(rangeInput, { target: { value: '-15' } });
    expect(onChange).toHaveBeenLastCalledWith(-10);
  });
});
