import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { listHref } from "@/components/admin/list-utils";

export function Pagination({ path, query = {}, total, page, pageSize }: {
  path: string; query?: Record<string, string>; total: number; page: number; pageSize: number;
}) {
  const pages = Math.max(1, Math.min(1000, Math.ceil(total / pageSize)));
  const first = total === 0 || page > pages ? 0 : (page - 1) * pageSize + 1;
  const last = first === 0 ? 0 : Math.min(page * pageSize, total);
  const visible = [...new Set([1, page - 1, page, page + 1, pages])].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  const href = (p: number) => listHref(path, { ...query, page: p });
  return (
    <div className="a-pagination-row">
      <div><p className="a-muted">{formatNumber(first)}–{formatNumber(last)} of {formatNumber(total)} results</p>{total > pages * pageSize && <p className="a-field-hint">Refine the search to access results beyond the first {formatNumber(pages * pageSize)}.</p>}</div>
      {(pages > 1 || page > pages) && (
        <nav className="a-pagination" aria-label="Results pages">
          {page > 1 && <Link className="a-button a-button--quiet" href={href(Math.min(page - 1, pages))} prefetch={false} rel="prev"><ChevronLeft size={16} aria-hidden="true" /><span className="a-sr-only">Previous page</span></Link>}
          {visible.map((p, index) => (
            <span className="a-pagination-item" key={p}>
              {index > 0 && p - visible[index - 1] > 1 && <span className="a-pagination-gap" aria-hidden="true">…</span>}
              <Link className={`a-button ${p === page ? "a-button--primary" : "a-button--quiet"}`} href={href(p)} prefetch={false}
                aria-label={`Page ${p}`} aria-current={p === page ? "page" : undefined}>{p}</Link>
            </span>
          ))}
          {page < pages && <Link className="a-button a-button--quiet" href={href(page + 1)} prefetch={false} rel="next"><span className="a-sr-only">Next page</span><ChevronRight size={16} aria-hidden="true" /></Link>}
        </nav>
      )}
    </div>
  );
}