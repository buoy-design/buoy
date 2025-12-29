export const SIMPLE_BUTTON = `
import React from 'react';

export function Button({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick}>{children}</button>;
}
`;

export const ARROW_COMPONENT = `
import React from 'react';

export const Card = ({ title }: { title: string }) => {
  return <div className="card">{title}</div>;
};
`;

export const HARDCODED_STYLES = `
import React from 'react';

export function Badge({ label }: { label: string }) {
  return (
    <span style={{ backgroundColor: '#ff0000', padding: '8px' }}>
      {label}
    </span>
  );
}
`;

export const DEPRECATED_COMPONENT = `
import React from 'react';

/**
 * @deprecated Use NewButton instead
 */
export function OldButton({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick}>Click</button>;
}
`;
