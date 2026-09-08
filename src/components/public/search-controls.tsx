import Link from "next/link";
import { X } from "lucide-react";
import { formatNumber, formatPrice } from "@/lib/format";
import { FACILITY_LABELS, PRICE_TYPE_LABELS, VENUE_TYPE_LABELS, type Facets, type SearchFilters } from "@/lib/types";
import { filterParams } from "@/lib/validation";
import { queryHref } from "@/components/public/pagination";

const SORT_LABELS: Record<SearchFilters["sort"], string> = {
  recent: "Recently published", name: "Name: A–Z", capacity: "Guest capacity", price: "Price: low to high",
};

export function HiddenSearchFields({ filters, exclude = [] }: { filters: SearchFilters; exclude?: string[] }) {
  return [...filterParams(filters, { page: 1 }).entries()]
    .filter(([name]) => !exclude.includes(name))
    .map(([name, value]) => <input key={`${name}-${value}`} type="hidden" name={name} value={value} />);
}

export function SortControl({ action, filters, facets }: { action: string; filters: SearchFilters; facets: Facets }) {
  return (
    <form action={action} method="get" className="sh-sort-form">
      <HiddenSearchFields filters={filters} exclude={["sort"]} />
      <label htmlFor="venue-sort">Sort by</label>
      <div className="sh-sort-controls">
        <select key={filters.sort} id="venue-sort" name="sort" defaultValue={filters.sort} aria-describedby={facets.priceTypes.length > 0 && !filters.priceType ? "sort-basis-help" : undefined}>
          <option value="recent">{SORT_LABELS.recent}</option>
          <option value="name">{SORT_LABELS.name}</option>
          {facets.hasCapacity && <option value="capacity">{SORT_LABELS.capacity}</option>}
          {facets.priceTypes.length > 0 && <option value="price" disabled={!filters.priceType}>{filters.priceType ? `${SORT_LABELS.price} · ${PRICE_TYPE_LABELS[filters.priceType]}` : "Price · choose a basis first"}</option>}
        </select>
        <button className="sh-button sh-button-secondary" type="submit">Apply sort</button>
      </div>
      {facets.priceTypes.length > 0 && !filters.priceType && <p className="sh-field-hint" id="sort-basis-help">Choose a price basis in filters to sort by price.</p>}
    </form>
  );
}

export function FilterChips({ pathname, filters }: { pathname: string; filters: SearchFilters }) {
  const chips: { key: string; label: string; remove: Partial<SearchFilters> }[] = [];
  if (filters.q) chips.push({ key: "q", label: `Search: “${filters.q}”`, remove: { q: "" } });
  if (filters.type) chips.push({ key: "type", label: VENUE_TYPE_LABELS[filters.type], remove: { type: null } });
  if (filters.capacity) chips.push({ key: "capacity", label: `${formatNumber(filters.capacity)} guests`, remove: { capacity: null } });
  if (filters.priceType) chips.push({ key: "priceType", label: `Prices ${PRICE_TYPE_LABELS[filters.priceType]}`, remove: { priceType: null, budget: null, ...(filters.sort === "price" ? { sort: "recent" as const } : {}) } });
  if (filters.budget && filters.priceType) chips.push({ key: "budget", label: formatPrice(null, filters.budget, filters.priceType)!, remove: { budget: null } });
  for (const facility of filters.facilities) chips.push({ key: facility, label: FACILITY_LABELS[facility], remove: { facilities: filters.facilities.filter((value) => value !== facility) } });
  if (filters.sort !== "recent") chips.push({ key: "sort", label: SORT_LABELS[filters.sort], remove: { sort: "recent" } });
  if (!chips.length) return null;

  return (
    <nav className="sh-filter-chips" aria-label="Active search filters">
      <ul>
        {chips.map((chip) => (
          <li key={chip.key}>
            <Link href={queryHref(pathname, filterParams(filters, { ...chip.remove, page: 1 }).toString())} prefetch={false} aria-label={`Remove filter: ${chip.label}`}>
              <span>{chip.label}</span><X size={14} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      <Link href={pathname} prefetch={false} className="sh-text-link">Reset all</Link>
    </nav>
  );
}