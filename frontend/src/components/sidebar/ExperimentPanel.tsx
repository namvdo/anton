import { useRef, useState, type ChangeEvent } from 'react';
import { Collapsible } from '../ui/Collapsible';
import type { ExperimentStatus } from '../../types/domain';

interface ExperimentPanelProps {
  onExport: () => void;
  onImport: (contents: string) => void | Promise<void>;
  status: ExperimentStatus | null;
}

export const ExperimentPanel = ({ onExport, onImport, status }: ExperimentPanelProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setIsImporting(true);
    try {
      await onImport(await file.text());
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Collapsible title="Experiment" defaultOpen={false}>
      <p className="experiment-note">
        Save the complete configuration and result provenance, or load a shared experiment and recompute it locally.
      </p>
      <div className="experiment-actions">
        <button type="button" onClick={onExport}>Export JSON</button>
        <button type="button" onClick={() => inputRef.current?.click()} disabled={isImporting}>
          {isImporting ? 'Importing…' : 'Import JSON'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleFile}
          hidden
        />
      </div>
      {status && <div className={`experiment-status ${status.type}`}>{status.message}</div>}
    </Collapsible>
  );
};
