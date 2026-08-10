import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StartingPoint } from '../components/sidebar/StartingPoint';

describe('StartingPoint', () => {
  const basePoint = { x: 1.23456, y: -2.5, nx: 0.6, ny: -0.2 };

  it('renders all four extended-state inputs for continuous systems', () => {
    const updateStartPoint = vi.fn();
    render(
      <StartingPoint
        type="continuous"
        startPoint={basePoint}
        updateStartPoint={updateStartPoint}
      />
    );

    expect(screen.getByLabelText('x0-position')).toHaveValue(basePoint.x);
    expect(screen.getByLabelText('y0-position')).toHaveValue(basePoint.y);
    expect(screen.getByLabelText('nx-normal')).toHaveValue(basePoint.nx);
    expect(screen.getByLabelText('ny-normal')).toHaveValue(basePoint.ny);
  });

  it('renders position and normal inputs for discrete systems', () => {
    const updateStartPoint = vi.fn();
    render(
      <StartingPoint
        type="discrete"
        startPoint={basePoint}
        updateStartPoint={updateStartPoint}
      />
    );

    expect(screen.getByLabelText('x0-position')).toHaveValue(basePoint.x);
    expect(screen.getByLabelText('y0-position')).toHaveValue(basePoint.y);
    expect(screen.getByLabelText('nx-normal')).toHaveValue(basePoint.nx);
    expect(screen.getByLabelText('ny-normal')).toHaveValue(basePoint.ny);
  });

  it('applies the complete state and normalizes the normal atomically', () => {
    const updateStartPoint = vi.fn();
    render(
      <StartingPoint
        type="continuous"
        startPoint={basePoint}
        updateStartPoint={updateStartPoint}
      />
    );

    fireEvent.change(screen.getByLabelText('y0-position'), { target: { value: '3.125' } });
    fireEvent.change(screen.getByLabelText('nx-normal'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('ny-normal'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply extended state' }));

    expect(updateStartPoint).toHaveBeenCalledWith({
      x: basePoint.x,
      y: 3.125,
      nx: 0.6,
      ny: 0.8
    });
  });

  it('rejects a zero normal without replacing the active state', () => {
    const updateStartPoint = vi.fn();
    render(<StartingPoint type="discrete" startPoint={basePoint} updateStartPoint={updateStartPoint} />);

    fireEvent.change(screen.getByLabelText('nx-normal'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('ny-normal'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply extended state' }));

    expect(screen.getByRole('alert')).toHaveTextContent('normal must have nonzero length');
    expect(updateStartPoint).not.toHaveBeenCalled();
  });
});
