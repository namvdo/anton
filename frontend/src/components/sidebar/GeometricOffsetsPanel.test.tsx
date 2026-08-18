import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GeometricOffsetsPanel } from './GeometricOffsetsPanel';
import { createGeometricOffsetContour } from '../../utils/geometricOffsetBatch';
import type {
  GeometricOffsetResult,
  GeometricOffsetState,
} from '../../types/domain';

const result = (epsilon: number): GeometricOffsetResult => ({
  completed_levels: 1,
  epsilon,
  stop_reason: 'requested_levels_completed',
  levels: [{
    level: 1,
    target_distance: epsilon,
    component_count: 1,
    boundary_components: [{ id: 0, points: [] }],
  }],
});

const initialState = (ready = false): GeometricOffsetState => {
  const contours = [0.025, 0.05, 0.075].map(createGeometricOffsetContour).map(contour => ({
    ...contour,
    result: ready ? result(contour.epsilon) : null,
  }));
  return {
    editorMode: 'series',
    seriesStart: 0.025,
    seriesEnd: 0.075,
    seriesCount: 3,
    individualEpsilon: 0.1,
    contours,
    selectedContourId: contours[0].id,
    preimageSourceIds: [contours[0].id],
    inverseIterations: 2,
    inverseDisplayMode: 'all',
    showInverseContours: true,
    isComputing: false,
    isComputingInverse: false,
    error: null,
    inverseError: null,
  };
};

interface HarnessProps {
  ready?: boolean;
  compute?: () => void;
  computeInverse?: () => void;
}

const Harness = ({ ready = false, compute = vi.fn(), computeInverse = vi.fn() }: HarnessProps) => {
  const [state, setState] = useState(() => initialState(ready));
  return (
    <GeometricOffsetsPanel
      state={state}
      setState={setState}
      systemEpsilon={0.0625}
      canCompute
      compute={compute}
      canComputeInverse={ready}
      computeInverse={computeInverse}
      fitInverse={vi.fn()}
    />
  );
};

describe('GeometricOffsetsPanel', () => {
  it('generates an evenly spaced epsilon series before computation', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Series start epsilon'), { target: { value: '0.02' } });
    fireEvent.change(screen.getByLabelText('Series end epsilon'), { target: { value: '0.08' } });
    fireEvent.change(screen.getByLabelText('Series contour count'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use evenly spaced series' }));

    expect(screen.getByLabelText('Show contour epsilon 0.02')).toBeInTheDocument();
    expect(screen.getByLabelText('Show contour epsilon 0.04')).toBeInTheDocument();
    expect(screen.getByLabelText('Show contour epsilon 0.06')).toBeInTheDocument();
    expect(screen.getByLabelText('Show contour epsilon 0.08')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compute 4 contours' })).toBeEnabled();
  });

  it('adds an individual epsilon without removing the generated series', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Individual' }));
    fireEvent.change(screen.getByLabelText('Individual contour epsilon'), {
      target: { value: '0.11' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByLabelText('Show contour epsilon 0.11')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compute 4 contours' })).toBeEnabled();
  });

  it('computes all configured contours through one action', () => {
    const compute = vi.fn();
    render(<Harness compute={compute} />);
    fireEvent.click(screen.getByRole('button', { name: 'Compute 3 contours' }));
    expect(compute).toHaveBeenCalledOnce();
  });

  it('gives every contour independent direct visibility', () => {
    render(<Harness ready />);
    const first = screen.getByLabelText('Show contour epsilon 0.025');
    const second = screen.getByLabelText('Show contour epsilon 0.05');
    expect(first).toBeChecked();
    expect(second).toBeChecked();
    fireEvent.click(first);
    expect(first).not.toBeChecked();
    expect(second).toBeChecked();
  });

  it('highlights one contour and automatically keeps it as a preimage source', () => {
    render(<Harness ready />);
    fireEvent.click(screen.getByRole('button', { name: 'Select contour epsilon 0.05' }));

    expect(screen.getByRole('button', { name: 'Select contour epsilon 0.05' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Use contour epsilon 0.05 for preimages')).toBeChecked();
    expect(screen.getByLabelText('Use contour epsilon 0.05 for preimages')).toBeDisabled();
  });

  it('supports multiple simultaneous preimage sources', () => {
    const computeInverse = vi.fn();
    render(<Harness ready computeInverse={computeInverse} />);
    fireEvent.click(screen.getByLabelText('Use contour epsilon 0.05 for preimages'));

    const button = screen.getByRole('button', { name: 'Compute preimages from 2 sources' });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(computeInverse).toHaveBeenCalledOnce();
  });

  it('prevents duplicate individual epsilon values', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Individual' }));
    fireEvent.change(screen.getByLabelText('Individual contour epsilon'), {
      target: { value: '0.05' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('alert')).toHaveTextContent('already exists');
    expect(screen.getByRole('button', { name: 'Compute 3 contours' })).toBeInTheDocument();
  });
});
