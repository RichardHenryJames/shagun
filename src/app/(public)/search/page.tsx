import type { Metadata } from "next";
import { searchVenues } from "@/lib/data/public";
import { formatNumber, venuePath } from "@/lib/format";
import { createMetadata, itemListJsonLd } from "@/lib/seo";
import type { SearchParams } from "@/lib/types";
import { filterParams, parseSearchParams } from "@/lib/validation";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { EmptyState } from "@/components/public/empty-state";
import { Pagination, queryHref } from "@/components/public/pagination";
import { SearchBox } from "@/components/public/search-box";
import { FilterChips } from "@/components/public/search-controls";
import { JsonLd } from "@/components/public/structured-data";
import { VenueCard } from "@/components/public/venue-card";

export const dynamic = "force-dynamic";
function globalFilters(params: SearchParams) {
  const { q, page } = parseSearchParams(params);
  return parseSearchParams({ q, page: String(page) });
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const filters = globalFilters(await searchParams);
  return createMetadata({ title: "Search wedding venues", path: queryHref("/search", filterParams(filters).toString()), noIndex: true });
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const filters = globalFilters(await searchParams);
  const result = await searchVenues(filters);
  const query = filterParams(filters).toString();
  // Analytics is city-scoped. Do not invent a city ID or attribute a global query to a result's city.
  return (
    <div className="sh-container sh-directory-page">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Search venues" }]} />
      <header className="sh-page-heading">
        <p className="sh-eyebrow">LET’S FIND YOUR PLACE</p>
        <h1 className="sh-display">A name. A neighbourhood.<br /><em>A new beginning.</em></h1>
        <p className="sh-page-intro">Search published venues by name, locality or city. For guest counts, facilities and budget filters, start with a city guide.</p>
        <SearchBox action="/search" id="global-venue-search" query={filters.q} label="Search across city guides" placeholder="Venue, locality or city name" />
      </header>
      <section className="sh-directory-results" aria-labelledby="search-results-title">
        <div className="sh-results-heading"><h2 id="search-results-title">{filters.q ? `${formatNumber(result.total)} ${result.total === 1 ? "venue" : "venues"} found` : "Explore published venues"}</h2>{!filters.q && result.total > 0 && <p>{formatNumber(result.total)} {result.total === 1 ? "venue" : "venues"}</p>}</div>
        <FilterChips pathname="/search" filters={filters} />
        {result.items.length > 0 ? (
          <div className="sh-venue-grid" data-count={Math.min(result.items.length, 3)}>{result.items.map((venue, index) => <VenueCard key={venue.id} venue={venue} priority={index === 0} />)}</div>
        ) : result.total > 0 ? (
          <EmptyState eyebrow="A DIFFERENT PAGE" title="There are no venues on this page." description="Return to the first page to see the current results for your search." href={queryHref("/search", filterParams(filters, { page: 1 }).toString())} linkLabel="Go to the first page" />
        ) : filters.q ? (
          <EmptyState eyebrow="MAKE A LITTLE MORE ROOM" title="No venues match your search." description="Try a shorter name, another spelling or a city name. Only published venues in active city guides appear in search." href="/search" linkLabel="Clear search" />
        ) : (
          <EmptyState eyebrow="IN PREPARATION" title="The directory is taking shape." description="There are no published venues to explore just yet. City guides and listing details are being prepared before they appear here." href="/cities" linkLabel="Visit the city guides" />
        )}
        <Pagination pathname="/search" params={query} page={result.page} total={result.total} pageSize={result.pageSize} />
      </section>
      {result.items.length > 0 && <JsonLd data={itemListJsonLd(result.items.map((venue) => ({ name: venue.name, path: venuePath(venue.city.slug, venue.slug) })), (result.page - 1) * result.pageSize, result.total)} />}
    </div>
  );
}