import { useState, type ReactNode } from 'react';

interface CollapsibleProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export const Collapsible = ({ title, children, defaultOpen = true }: CollapsibleProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const panelId = `section-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  return (
    <div className={`section ${isOpen ? 'open' : ''}`}>
      <button
        type="button"
        className="sec-head"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen(previous => !previous)}
      >
        <span className="sec-title">{title}</span>
        <span className="sec-caret" aria-hidden="true">›</span>
      </button>
      <div className="sec-body" id={panelId}>
        {children}
      </div>
    </div>
  );
};
