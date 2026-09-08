import Link from "next/link";
import { Search } from "lucide-react";
import { VENUE_STATUSES } from "@/lib/types";

export function ListControls({ path, q, status, citySearch = false }: {
  path: string; q: string; status?: string; citySearch?: boolean;
}) {
  return (
    <form action={path} method="get" role="search" className="a-filter-form">
      <div className="a-field a-search-field">
        <label htmlFor="inventory-query">{citySearch ? "Search cities" : "Search venues"}</label>
        <input id="inventory-query" name="q" type="search" className="a-input" defaultValue={q}
          key={q} maxLength={100} placeholder={citySearch ? "City name or state" : "Name or locality"} />
      </div>
      {status !== undefined && (
        <div className="a-field">
          <label htmlFor="inventory-status">Publication status</label>
          <select id="inventory-status" name="status" className="a-input" defaultValue={status} key={status}>
            <option value="">All statuses</option>
            {VENUE_STATUSES.map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}
          </select>
        </div>
      )}
      <div className="a-actions">
        <button className="a-button a-button--primary" type="submit"><Search size={16} aria-hidden="true" />Search</button>
        {(q || status) && <Link className="a-button a-button--quiet" href={path} prefetch={false}>Clear filters</Link>}
      </div>
    </form>
  );
}