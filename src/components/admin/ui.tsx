import Link from "next/link";
import { ChevronRight, Info } from "lucide-react";
import type { ReactNode } from "react";
import { formatNumber } from "@/lib/format";

export interface Breadcrumb { label: string; href?: string }

export function Breadcrumbs({ items }: { items: Breadcrumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="a-breadcrumbs">
      <ol>
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            {index > 0 && <ChevronRight size={13} aria-hidden="true" />}
            {item.href ? <Link href={item.href} prefetch={false}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHeader({ title, description, breadcrumbs, actions, badge }: {
  title: string; description?: string; breadcrumbs: Breadcrumb[]; actions?: ReactNode; badge?: ReactNode;
}) {
  return (
    <header className="a-page-header">
      <Breadcrumbs items={breadcrumbs} />
      <div className="a-heading-row">
        <div className="a-min-w-0">
          <div className="a-title-row"><h1 className="a-heading">{title}</h1>{badge}</div>
          {description && <p className="a-page-description">{description}</p>}
        </div>
        {actions && <div className="a-actions">{actions}</div>}
      </div>
    </header>
  );
}

export function Notice({ children, title, tone = "info" }: {
  children: ReactNode; title?: string; tone?: "info" | "success" | "warning";
}) {
  return (
    <div className={`a-notice a-notice--${tone}`} role={tone === "success" ? "status" : "note"}>
      <Info size={18} aria-hidden="true" />
      <div>{title && <strong className="a-notice-title">{title}</strong>}<div>{children}</div></div>
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="a-empty">
      <h2 className="a-section-title">{title}</h2>
      <p>{children}</p>
      {action && <div className="a-actions">{action}</div>}
    </div>
  );
}

export function StatsRow({ items, label = "Inventory counts" }: {
  items: { label: string; value: number; hint?: string }[]; label?: string;
}) {
  return (
    <dl className="a-stats" aria-label={label}>
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{formatNumber(item.value)}</dd>
          {item.hint && <dd className="a-stat-hint">{item.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}

export function SectionNav({ items }: { items: { id: string; label: string }[] }) {
  return (
    <nav aria-label="Form sections" className="a-section-nav">
      <p className="a-eyebrow">On this form</p>
      <ul>{items.map((item) => <li key={item.id}><a href={`#${item.id}`}>{item.label}</a></li>)}</ul>
    </nav>
  );
}