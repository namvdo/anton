import type { ReactNode } from 'react';

interface ShellProps {
  children: ReactNode;
}

export const Shell = ({ children }: ShellProps) => {
  return (
    <div className="shell">
      {children}
    </div>
  );
};
