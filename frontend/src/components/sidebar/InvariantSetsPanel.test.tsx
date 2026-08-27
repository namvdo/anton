import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InvariantSetsPanel } from './InvariantSetsPanel';
import type { InvariantSetState } from '../../types/domain';

const initialState = (): InvariantSetState => ({
  seedMode: 'random',
  boundaryPointCount: 256,
  forwardIterations: 12,
  showResult: true,
  isComputing: false,
  result: null,
  error: null,
});

const Harness = ({ compute = vi.fn(), epsilon = 0.1 }: { compute?: () => void; epsilon?: number }) => {
  const [state, setState] = useState(initialState);
  const [point, setPoint] = useState({ x: 0.2, y: -0.1, nx: 1.0, ny: 0.0 });
  return <InvariantSetsPanel state={state} setState={setState} initialState={point} updateInitialState={setPoint}
    epsilon={epsilon} compute={compute} />;
};

describe('InvariantSetsPanel', () => {
  it('selects the manual start point and edits the sampling controls', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Set initial state' }));
    expect(screen.getByLabelText('x0-position')).toHaveValue(0.2);
    expect(screen.getByLabelText('y0-position')).toHaveValue(-0.1);
    fireEvent.change(screen.getByLabelText('Invariant boundary points'), { target: { value: '512' } });
    fireEvent.change(screen.getByLabelText('Invariant forward iterations'), { target: { value: '20' } });
    expect(screen.getByLabelText('Invariant boundary points')).toHaveValue(512);
    expect(screen.getByLabelText('Invariant forward iterations')).toHaveValue(20);
  });

  it('starts propagation and blocks zero-noise input', () => {
    const compute = vi.fn();
    const { rerender } = render(<Harness compute={compute} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approximate invariant boundary' }));
    expect(compute).toHaveBeenCalledOnce();
    rerender(<Harness compute={compute} epsilon={0} />);
    expect(screen.getByRole('button', { name: 'Approximate invariant boundary' })).toBeDisabled();
    expect(screen.getByText('Set ε > 0 before propagation.')).toBeInTheDocument();
  });
});


