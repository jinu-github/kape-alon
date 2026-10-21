import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cafeConfig } from '@kape/shared';

export function CafeShell({
  children,
  table,
}: {
  children: ReactNode;
  table?: number;
}) {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="demo-banner">
        Demo site with sample data <span aria-hidden="true">·</span> Made for a
        slower morning
      </div>
      <header className="cafe-header">
        <Link to="/" className="brand" aria-label={cafeConfig.name + ' home'}>
          <span className="brand-symbol" aria-hidden="true">
            ≈
          </span>
          <span>
            {cafeConfig.name}
            <small>COFFEE & BRUNCH</small>
          </span>
        </Link>
        {table && (
          <span className="table-pill">
            <span aria-hidden="true">●</span> Table {table}
          </span>
        )}
      </header>
      {children}
      <footer className="cafe-footer">
        A good cup. A little pause. <span>{cafeConfig.name}</span>
      </footer>
    </>
  );
}
