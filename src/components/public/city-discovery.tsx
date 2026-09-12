import "server-only";
import Link from "next/link";
import { ArrowUpRight, Check, MapPin, Users } from "lucide-react";
import { cityPath, formatCapacity, formatNumber, formatPrice, venuePath } from "@/lib/format";
import { PRICE_TYPE_LABELS, VENUE_TYPE_LABELS, type City, type Facets, type Photo, type PublicVenue, type SearchFilters, type SearchParams, type SearchResult } from "@/lib/types";
import { filterParams, hasActiveFilters, parseSearchParams } from "@/lib/validation";
import { PhotoFallback } from "@/components/public/artwork";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { EmptyState } from "@/components/public/empty-state";
import { MediaPhoto } from "@/components/public/media-photo";
import { Pagination, queryHref } from "@/components/public/pagination";
import { SearchBox } from "@/components/public/search-box";
import { FilterChips, HiddenSearchFields, SortControl } from "@/components/public/search-controls";
import { venueCheck } from "@/components/public/venue-facts";
import { VenueFilters } from "@/components/public/venue-filters";
import { VenueGallery } from "@/components/public/venue-gallery";

// Both city routes use this card markup. Preview changes only the destination,
// media delivery and explicit saved-status label, never the public route shape.
function CityVenueCard({ venue, preview, priority }: { venue: PublicVenue; preview: boolean; priority: boolean }) {
  const cover = venue.photos.find((photo) => photo.is_cover) ?? venue.photos[0];
  const capacity = formatCapacity(venue.capacity_min, venue.capacity_max);
  const price = venue.price_type ? formatPrice(venue.price_min, venue.price_max, venue.price_type) : null;
  const checked = venueCheck(venue);
  const href = preview ? `/admin/venues/${encodeURIComponent(venue.id)}/preview` : venuePath(venue.city.slug, venue.slug);
  return (
    <article className="sh-venue-card">
      <Link href={href} prefetch={preview ? false : undefined} className="sh-venue-card-link" aria-label={`${preview ? "Preview saved" : "View"} ${venue.name} in ${venue.city.name}`}>
        <div className="sh-card-image">
          {cover ? <MediaPhoto photo={cover} preview={preview} priority={priority} /> : <PhotoFallback />}
          <span className="sh-card-type">{VENUE_TYPE_LABELS[venue.venue_type]}</span>
        </div>
        <div className="sh-card-body">
          <p className="sh-card-location"><MapPin size={14} aria-hidden="true" /><span>{[venue.locality, venue.city.name].filter(Boolean).join(", ")}</span></p>
          <h3>{venue.name}</h3>
          {preview && <p className="sh-card-explore">Saved status: {venue.status === "draft" ? "Draft" : "Published"}</p>}
          {capacity && <p className="sh-card-capacity"><Users size={15} aria-hidden="true" />{capacity}</p>}
          {price && <p className="sh-card-price">{price}</p>}
          <div className="sh-card-bottom">
            {checked.fresh ? <span className="sh-checked" title={`Listing details checked ${checked.date}. Not an endorsement.`}><Check size={14} aria-hidden="true" /> Details checked<time dateTime={checked.dateTime}>{checked.date}</time></span> : <span className="sh-card-explore">Explore the details</span>}
            <ArrowUpRight size={20} strokeWidth={1.5} aria-hidden="true" />
          </div>
        </div>
      </Link>
    </article>
  );
}

function CitySortControl({ preview, action, filters, facets }: { preview: boolean; action: string; filters: SearchFilters; facets: Facets }) {
  if (!preview) return <SortControl action={action} filters={filters} facets={facets} />;
  // Keep the native public sorting controls, but do not call unpublished drafts
  // "recently published". Both queries order recent by updated_at, then ID.
  return (
    <form action={action} method="get" className="sh-sort-form">
      <HiddenSearchFields filters={filters} exclude={["sort"]} />
      <label htmlFor="venue-sort">Sort by</label>
      <div className="sh-sort-controls">
        <select key={filters.sort} id="venue-sort" name="sort" defaultValue={filters.sort} aria-describedby={facets.priceTypes.length > 0 && !filters.priceType ? "sort-basis-help" : undefined}>
          <option value="recent">Recently updated</option><option value="name">Name: A–Z</option>
          {facets.hasCapacity && <option value="capacity">Guest capacity</option>}
          {facets.priceTypes.length > 0 && <option value="price" disabled={!filters.priceType}>{filters.priceType ? `Price: low to high · ${PRICE_TYPE_LABELS[filters.priceType]}` : "Price · choose a basis first"}</option>}
        </select>
        <button className="sh-button sh-button-secondary" type="submit">Apply sort</button>
      </div>
      {facets.priceTypes.length > 0 && !filters.priceType && <p className="sh-field-hint" id="sort-basis-help">Choose a price basis in filters to sort by price.</p>}
    </form>
  );
}

/** Shared server-rendered discovery view: no queries, authorization, tracking,
 * metadata or structured data here. Each route owns its own data boundary. */
export function CityDiscovery({ city, filters, result, facets, hasInventory, cover = null, preview = false, rawSearchParams = {} }: {
  city: City; filters: SearchFilters; result: SearchResult; facets: Facets; hasInventory: boolean;
  cover?: Photo | null; preview?: boolean; rawSearchParams?: SearchParams;
}) {
  const workspace = `/admin/cities/${encodeURIComponent(city.slug)}`;
  const path = preview ? `${workspace}/preview` : cityPath(city.slug);
  const query = filterParams(filters).toString();
  const resetHref = queryHref(path, filterParams(parseSearchParams({ q: filters.q })).toString());
  const hasFacets = hasInventory && (facets.hasCapacity || facets.facilities.length > 0 || facets.priceTypes.length > 0 || facets.venueTypes.length > 1);
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const priceBasisMissing = !filters.priceType && (Boolean(first(rawSearchParams.budget)) || first(rawSearchParams.sort) === "price");
  const filtered = hasActiveFilters(filters);

  return (
    <div className="sh-container sh-city-page">
      {!preview && <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "City guides", href: "/cities" }, { label: city.name }]} />}
      <header className="sh-page-heading sh-city-heading">
        <p className="sh-eyebrow">WEDDING VENUES IN {city.state}</p>
        <h1 className="sh-display">{city.name}<span className="sh-heading-stop">.</span></h1>
        <p className="sh-page-intro sh-preserve-lines">{city.description || `A place for your people, right here in ${city.name}. Explore vivah bhawans, marriage halls and other wedding venues, then connect directly.`}</p>
        <SearchBox action={path} id="city-venue-search" query={filters.q} label="Find a venue in this city" placeholder="Venue name or locality">
          <HiddenSearchFields filters={filters} exclude={["q"]} />
        </SearchBox>
      </header>
      {cover && <VenueGallery photos={[cover]} venueName={city.name} preview={preview} />}
      {priceBasisMissing && <p className="sh-inline-notice" role="status">Choose a price basis to apply a budget or sort by price. Those settings have not been applied to these results.</p>}
      {preview && hasInventory && <p className="sh-field-hint">Filters and counts use all saved draft and published venues in this city, not just this page. Recent ordering uses the latest saved update.</p>}
      <div className={`sh-discovery-layout${hasFacets ? "" : " sh-discovery-unfiltered"}`}>
        {hasFacets && <VenueFilters key={query} facets={facets} filters={filters} action={path} resetHref={resetHref} />}
        <section className="sh-discovery-results" aria-labelledby="venue-results-title">
          <div className="sh-results-toolbar">
            <div className="sh-results-summary">
              <h2 id="venue-results-title">{formatNumber(result.total)} {result.total === 1 ? "venue" : "venues"}{filtered ? " found" : " to explore"}</h2>
              {result.items.length > 0 && <p>Showing {formatNumber((result.page - 1) * result.pageSize + 1)}–{formatNumber((result.page - 1) * result.pageSize + result.items.length)}{filters.q ? ` for “${filters.q}”` : " in this city guide"}</p>}
            </div>
            {hasInventory && <CitySortControl preview={preview} action={path} filters={filters} facets={facets} />}
          </div>
          <FilterChips pathname={path} filters={filters} />
          {result.items.length > 0 ? (
            <div className="sh-venue-grid sh-city-venue-grid" data-count={Math.min(result.items.length, 3)}>{result.items.map((venue, index) => <CityVenueCard key={venue.id} venue={venue} preview={preview} priority={!cover && index === 0} />)}</div>
          ) : !hasInventory ? (
            <EmptyState compact eyebrow={preview ? "SAVED CITY PREVIEW" : "A GUIDE IN THE MAKING"} title={preview ? "No saved draft or published venues yet." : "The first places are still taking shape."}
              description={preview ? "Add and save a venue in this workspace, then return to preview it. Unpublished and archived venues are intentionally excluded." : `There are no published venues in the ${city.name} guide yet. Listings will appear once their details have been reviewed and made public.`}
              href={preview ? workspace : "/cities"} linkLabel={preview ? "Back to city workspace" : "Explore city guides"} />
          ) : result.total > 0 ? (
            <EmptyState compact eyebrow="A DIFFERENT PAGE" title="There are no venues on this page." description="The directory may have changed. Return to the first page to see the current results with your search and filters intact." href={queryHref(path, filterParams(filters, { page: 1 }).toString())} linkLabel="Go to the first page" />
          ) : (
            <EmptyState compact eyebrow="MAKE A LITTLE MORE ROOM" title="No places match just yet." description="Try a broader search or remove a filter. Venues with unrecorded capacities, prices or facilities may not appear when those filters are selected." href={path} linkLabel="Reset search & filters" />
          )}
          <Pagination pathname={path} params={query} page={result.page} total={result.total} pageSize={result.pageSize} />
        </section>
      </div>
    </div>
  );
}