import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cityPath, formatNumber, venuePath } from "@/lib/format";
import { breadcrumbJsonLd, createMetadata, itemListJsonLd } from "@/lib/seo";
import type { SearchParams } from "@/lib/types";
import { filterParams, hasActiveFilters, parseSearchParams } from "@/lib/validation";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { EmptyState } from "@/components/public/empty-state";
import { EventImpression } from "@/components/public/event-impression";
import { Pagination, queryHref } from "@/components/public/pagination";
import { SearchBox } from "@/components/public/search-box";
import { FilterChips, HiddenSearchFields, SortControl } from "@/components/public/search-controls";
import { JsonLd } from "@/components/public/structured-data";
import { VenueCard } from "@/components/public/venue-card";
import { VenueFilters } from "@/components/public/venue-filters";
import { loadCityPage } from "./_data";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ city: string }>; searchParams: Promise<SearchParams> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ city: slug }, raw] = await Promise.all([params, searchParams]);
  const query = filterParams(parseSearchParams(raw)).toString();
  const data = await loadCityPage(slug, query);
  if (!data) notFound();
  const { city, filters, result } = data;
  return createMetadata({
    title: `${city.seo_title || `Wedding venues in ${city.name}`}${filters.page > 1 ? ` — Page ${filters.page}` : ""}`,
    description: city.seo_description || city.description || `Explore wedding venues, vivah bhawans and marriage halls in ${city.name}, ${city.state}. Compare recorded details and contact venues directly.`,
    path: queryHref(cityPath(city.slug), query),
    noIndex: hasActiveFilters(filters) || !data.hasInventory || result.items.length === 0,
  });
}

export default async function CityPage({ params, searchParams }: Props) {
  const [{ city: slug }, raw] = await Promise.all([params, searchParams]);
  const query = filterParams(parseSearchParams(raw)).toString();
  const data = await loadCityPage(slug, query);
  if (!data) notFound();
  const { city, filters, result, facets, hasInventory } = data;
  const path = cityPath(city.slug);
  const resetHref = queryHref(path, filterParams(parseSearchParams({ q: filters.q })).toString());
  const hasFacets = hasInventory && (facets.hasCapacity || facets.facilities.length > 0 || facets.priceTypes.length > 0 || facets.venueTypes.length > 1);
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const priceBasisMissing = !filters.priceType && (Boolean(first(raw.budget)) || first(raw.sort) === "price");
  const filtered = hasActiveFilters(filters);
  const facetFilters = { ...filters, q: "", page: 1 };

  return (
    <div className="sh-container sh-city-page">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "City guides", href: "/cities" }, { label: city.name }]} />
      <header className="sh-page-heading sh-city-heading">
        <p className="sh-eyebrow">WEDDING VENUES IN {city.state}</p>
        <h1 className="sh-display">{city.name}<span className="sh-heading-stop">.</span></h1>
        <p className="sh-page-intro sh-preserve-lines">{city.description || `A place for your people, right here in ${city.name}. Explore vivah bhawans, marriage halls and other wedding venues, then connect directly.`}</p>
        <SearchBox action={path} id="city-venue-search" query={filters.q} label="Find a venue in this city" placeholder="Venue name or locality">
          <HiddenSearchFields filters={filters} exclude={["q"]} />
        </SearchBox>
      </header>
      {priceBasisMissing && <p className="sh-inline-notice" role="status">Choose a price basis to apply a budget or sort by price. Those settings have not been applied to these results.</p>}

      <div className={`sh-discovery-layout${hasFacets ? "" : " sh-discovery-unfiltered"}`}>
        {hasFacets && <VenueFilters key={query} facets={facets} filters={filters} action={path} resetHref={resetHref} />}
        <section className="sh-discovery-results" aria-labelledby="venue-results-title">
          <div className="sh-results-toolbar">
            <div className="sh-results-summary">
              <h2 id="venue-results-title">{formatNumber(result.total)} {result.total === 1 ? "venue" : "venues"}{filtered ? " found" : " to explore"}</h2>
              {result.items.length > 0 && <p>Showing {formatNumber((result.page - 1) * result.pageSize + 1)}–{formatNumber((result.page - 1) * result.pageSize + result.items.length)}{filters.q ? ` for “${filters.q}”` : " in this city guide"}</p>}
            </div>
            {hasInventory && <SortControl action={path} filters={filters} facets={facets} />}
          </div>
          <FilterChips pathname={path} filters={filters} />
          {result.items.length > 0 ? (
            <div className="sh-venue-grid sh-city-venue-grid" data-count={Math.min(result.items.length, 3)}>{result.items.map((venue, index) => <VenueCard key={venue.id} venue={venue} priority={index === 0} />)}</div>
          ) : !hasInventory ? (
            <EmptyState compact eyebrow="A GUIDE IN THE MAKING" title="The first places are still taking shape." description={`There are no published venues in the ${city.name} guide yet. Listings will appear once their details have been reviewed and made public.`} href="/cities" linkLabel="Explore city guides" />
          ) : result.total > 0 ? (
            <EmptyState compact eyebrow="A DIFFERENT PAGE" title="There are no venues on this page." description="The directory may have changed. Return to the first page to see the current results with your search and filters intact." href={queryHref(path, filterParams(filters, { page: 1 }).toString())} linkLabel="Go to the first page" />
          ) : (
            <EmptyState compact eyebrow="MAKE A LITTLE MORE ROOM" title="No places match just yet." description="Try a broader search or remove a filter. Venues with unrecorded capacities, prices or facilities may not appear when those filters are selected." href={path} linkLabel="Reset search & filters" />
          )}
          <Pagination pathname={path} params={query} page={result.page} total={result.total} pageSize={result.pageSize} />
        </section>
      </div>
      <EventImpression event="city_viewed" cityId={city.id} />
      {filters.q && <EventImpression key={`search:${filters.q}`} event="search_performed" cityId={city.id} />}
      {hasActiveFilters(facetFilters) && <EventImpression key={`filters:${filterParams(facetFilters).toString()}`} event="filter_used" cityId={city.id} />}
      <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "City guides", path: "/cities" }, { name: city.name, path }])} />
      {result.items.length > 0 && <JsonLd data={itemListJsonLd(result.items.map((venue) => ({ name: venue.name, path: venuePath(venue.city.slug, venue.slug) })), (result.page - 1) * result.pageSize, result.total)} />}
    </div>
  );
}