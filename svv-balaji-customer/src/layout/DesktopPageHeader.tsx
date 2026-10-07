import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export interface Crumb {
  label: string;
  to?: string;
}

/**
 * Desktop / tablet (>= 768px) page header: breadcrumb, title, optional subtitle
 * and actions, lined up with the store header's container. Hidden on phones,
 * where each page keeps its own app bar ("<- Title").
 */
export function DesktopPageHeader({
  title,
  subtitle,
  crumbs = [],
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  crumbs?: Crumb[];
  actions?: ReactNode;
}) {
  const trail: Crumb[] = [{ label: 'Home', to: '/' }, ...crumbs];
  return (
    <div className="dk-head desktop-only">
      <div className="store-container">
        <div style={{ minWidth: 0 }}>
          <nav className="dk-crumbs" aria-label="Breadcrumb">
            {trail.map((c, i) => (
              <span key={`${c.label}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {i > 0 ? <span aria-hidden>/</span> : null}
                {c.to && i < trail.length - 1 ? <Link to={c.to}>{c.label}</Link> : <span className="dk-crumb-current">{c.label}</span>}
              </span>
            ))}
          </nav>
          <h1 className="dk-title">{title}</h1>
          {subtitle ? <p className="dk-subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="dk-head-actions">{actions}</div> : null}
      </div>
    </div>
  );
}
