import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GeometricOffsetsPanel } from './GeometricOffsetsPanel';

const state = {
  contourEpsilon: 0.08,
  showContours: true,
  inverseIterations: 1,
  inverseDisplayMode: 'final',
  showInverseContours: true,
  isComputing: false,
  isComputingInverse: false,
  result: null,
  inverseResult: null,
  error: null,
  inverseError: null
};

const result = {
  completed_levels: 1,
  epsilon: 0.1,
  stop_reason: 'requested_levels_completed',
  levels: [
    { level: 1, target_distance: 0.1, component_count: 1, offset_residual: 0.001, gap_residual: 0.0015, uncertainty: 0.01 }
  ]
};

describe('GeometricOffsetsPanel', () => {
  it('disables computation without showing prerequisite instructions', () => {
    const { container } = render(<GeometricOffsetsPanel state={state} setState={vi.fn()} canCompute={false} compute={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Compute ε contours' })).toBeDisabled();
    expect(container.querySelector('.geometric-offset-note')).toBeNull();
  });

  it('runs geometric offset computation', () => {
    const compute = vi.fn();
    render(<GeometricOffsetsPanel state={state} setState={vi.fn()} canCompute compute={compute} />);
    fireEvent.click(screen.getByRole('button', { name: 'Compute ε contours' }));
    expect(compute).toHaveBeenCalledOnce();
  });

  it('exposes contour spacing as the only geometric-offset numerical control', () => {
    const { container } = render(<GeometricOffsetsPanel state={state} setState={vi.fn()} canCompute compute={vi.fn()} />);
    expect(container.querySelectorAll('.p-val')).toHaveLength(1);
    expect(screen.getByText('Contour ε')).toBeInTheDocument();
    expect(screen.queryByText('Levels')).toBeNull();
    expect(screen.queryByText('Resolution')).toBeNull();
    expect(screen.queryByLabelText('Source contour')).toBeNull();
  });

  it('updates contour epsilon independently and invalidates stale contour results', () => {
    const setState = vi.fn();
    const { container } = render(<GeometricOffsetsPanel state={{ ...state, result }} setState={setState}
      canCompute compute={vi.fn()} />);
    const contourEpsilonInput = container.querySelector('.p-val');
    expect(contourEpsilonInput).toHaveValue(0.08);
    fireEvent.change(contourEpsilonInput, { target: { value: '0.25' } });
    const update = setState.mock.calls[0][0];
    expect(update({ ...state, result })).toMatchObject({
      contourEpsilon: 0.25,
      result: null,
      inverseResult: null
    });
  });

  it('keeps detailed geometric diagnostics out of the compact sidebar', () => {
    render(<GeometricOffsetsPanel state={{ ...state, result }} setState={vi.fn()} canCompute compute={vi.fn()} />);
    expect(screen.queryByText(/2 levels/)).toBeNull();
    expect(screen.queryByText(/gap ε/)).toBeNull();
    expect(screen.queryByText(/gap residual/)).toBeNull();
    expect(screen.queryByText(/target residual/)).toBeNull();
    expect(screen.queryByText(/uncertainty/)).toBeNull();
    expect(screen.queryByLabelText('Source contour')).toBeNull();
  });

  it('does not show the escaped-domain summary in the sidebar', () => {
    const escaped = { ...result, completed_levels: 1, stop_reason: 'escaped_domain', levels: result.levels.slice(0, 1) };
    render(<GeometricOffsetsPanel state={{ ...state, result: escaped }} setState={vi.fn()} canCompute compute={vi.fn()} />);
    expect(screen.queryByText(/escaped domain/)).toBeNull();
    expect(screen.queryByText(/1 level/)).toBeNull();
  });

  it('maps stored closed offset components backward on demand', () => {
    const computeInverse = vi.fn();
    render(<GeometricOffsetsPanel state={{ ...state, result }} setState={vi.fn()}
      canCompute compute={vi.fn()} canComputeInverse computeInverse={computeInverse} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show inverse curve' }));
    expect(computeInverse).toHaveBeenCalledOnce();
    expect(screen.getByText('Inverse steps')).toBeInTheDocument();
    expect(screen.getByLabelText('Display')).toBeDisabled();
    expect(screen.getByLabelText('Show inverse offset curves')).toBeDisabled();
  });

  it('reports inverse curve sampling and closure-oriented refinement diagnostics', () => {
    const inverseResult = {
      curves: [{ source_level: 1, source_component_id: 0, inverse_iteration: 1, points: [] }],
      total_output_points: 842,
      max_position_chord_error: 0.0004,
      max_normal_chord_error: 0.003,
      subdivision_limit_reached: false,
      completed_iterations: 1
    };
    const fitInverse = vi.fn();
    render(<GeometricOffsetsPanel state={{ ...state, result, inverseResult }} setState={vi.fn()}
      canCompute compute={vi.fn()} canComputeInverse computeInverse={vi.fn()} fitInverse={fitInverse} />);
    expect(screen.getByText('1 shown · 1 generated closed curve')).toBeInTheDocument();
    expect(screen.getByText(/842 stored samples/)).toBeInTheDocument();
    expect(screen.getByText(/position chord error 4.00e-4/)).toBeInTheDocument();
    expect(screen.getByText(/subdivision limit clear/)).toBeInTheDocument();
    expect(screen.getByLabelText('Show inverse offset curves')).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Fit inverse curve in view' }));
    expect(fitInverse).toHaveBeenCalledOnce();
  });
});
