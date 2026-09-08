import Link from "next/link";
import { formatNumber } from "@/lib/format";
import type { CitySummary } from "@/lib/types";
import { StatusBadge } from "@/components/admin/status-badge";

export function CityTable({ cities, picker = false }: { cities: CitySummary[]; picker?: boolean }) {
  return (
    <div className="a-min-w-0">
      <p className="a-table-hint">Scroll the table horizontally for all columns.</p>
      <div className="a-table-wrap" tabIndex={0} role="region" aria-label={picker ? "Choose a city" : "City inventory"}>
        <table className="a-table">
          <caption className="a-sr-only">City lifecycle and recorded venue counts. Counts are not geographic coverage.</caption>
          <thead><tr><th scope="col">City</th><th scope="col">Status</th><th scope="col" className="a-numeric">Total</th><th scope="col" className="a-numeric">Published</th><th scope="col" className="a-numeric">Draft</th><th scope="col" className="a-numeric">Review / recheck</th><th scope="col"><span className="a-sr-only">Actions</span></th></tr></thead>
          <tbody>{cities.map((city) => {
            const workspace = `/admin/cities/${encodeURIComponent(city.slug)}`;
            const href = picker ? `/admin/venues/new?city=${encodeURIComponent(city.id)}` : workspace;
            return (
              <tr key={city.id}>
                <th scope="row"><Link className="a-table-name" href={href} prefetch={false}>{city.name}</Link><span className="a-table-secondary">{city.state}, {city.country}</span></th>
                <td><StatusBadge status={city.status} /></td>
                <td className="a-numeric">{formatNumber(city.total_count)}</td><td className="a-numeric">{formatNumber(city.published_count)}</td>
                <td className="a-numeric">{formatNumber(city.draft_count)}</td><td className="a-numeric">{formatNumber(city.review_count)}</td>
                <td><div className="a-row-actions"><Link className="a-table-action" href={href} prefetch={false} aria-label={`${picker ? "Choose" : "Open workspace for"} ${city.name}`}>{picker ? "Choose city" : "Workspace"}</Link>{!picker && <Link className="a-table-action" href={`${workspace}/preview`} prefetch={false} aria-label={`Preview saved city ${city.name}`}>Preview</Link>}</div></td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </div>
  );
}