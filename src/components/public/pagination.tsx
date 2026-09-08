import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function queryHref(pathname: string, params: string): string {
  return params ? `${pathname}?${params}` : pathname;
}

export function Pagination({ pathname, params = "", page, total, pageSize }: {
  pathname: string;
  params?: string;
  page: number;
  total: number;
  pageSize: number;
}) {
  const pages = Math.min(1000, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const current = Math.min(Math.max(1, page), pages);
  const middle = Math.min(Math.max(current, 3), Math.max(3, pages - 2));
  const numbers = [...new Set([1, middle - 1, middle, middle + 1, pages])]
    .filter((value) => value >= 1 && value <= pages).sort((a, b) => a - b);
  const href = (value: number) => {
    const query = new URLSearchParams(params);
    if (value === 1) query.delete("page");
    else query.set("page", String(value));
    return queryHref(pathname, query.toString());
  };

  return (
    <nav className="sh-pagination" aria-label="Results pages">
      {page > 1 ? <Link className="sh-page-direction" href={href(Math.min(page - 1, pages))} prefetch={false}><ChevronLeft size={17} aria-hidden="true" />Previous</Link>
        : <span className="sh-page-direction sh-disabled" aria-disabled="true"><ChevronLeft size={17} aria-hidden="true" />Previous</span>}
      <ol className="sh-page-numbers">
        {numbers.map((number, index) => (
          <li key={number}>
            {index > 0 && number - numbers[index - 1] > 1 && <span className="sh-page-gap" aria-hidden="true">…</span>}
            <Link href={href(number)} prefetch={false} aria-label={`Page ${number}`} aria-current={number === page ? "page" : undefined}>{number}</Link>
          </li>
        ))}
      </ol>
      {page < pages ? <Link className="sh-page-direction" href={href(page + 1)} prefetch={false}>Next<ChevronRight size={17} aria-hidden="true" /></Link>
        : <span className="sh-page-direction sh-disabled" aria-disabled="true">Next<ChevronRight size={17} aria-hidden="true" /></span>}
    </nav>
  );
}