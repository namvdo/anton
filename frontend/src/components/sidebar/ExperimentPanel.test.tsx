import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExperimentPanel } from './ExperimentPanel';

describe('ExperimentPanel', () => {
  it('exports through the supplied callback and shows status', () => {
    const onExport = vi.fn();
    render(
      <ExperimentPanel
        onExport={onExport}
        onImport={vi.fn()}
        status={{ type: 'success', message: 'Saved.' }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }));
    expect(onExport).toHaveBeenCalledOnce();
    expect(screen.getByText('Saved.')).toHaveClass('success');
  });

  it('passes imported JSON text to the supplied callback', async () => {
    const onImport = vi.fn().mockResolvedValue(undefined);
    render(<ExperimentPanel onExport={vi.fn()} onImport={onImport} status={null} />);
    const file = new File(['{"schema":"bist-experiment"}'], 'experiment.json', {
      type: 'application/json',
    });
    Object.defineProperty(file, 'text', {
      value: vi.fn().mockResolvedValue('{"schema":"bist-experiment"}'),
    });

    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    });

    await waitFor(() => expect(onImport).toHaveBeenCalledWith('{"schema":"bist-experiment"}'));
  });
});
