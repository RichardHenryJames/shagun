import { cache } from "react";
import type { Metadata } from "next";
import { getPublicCities } from "@/lib/data/public";
import { cityPath, formatNumber } from "@/lib/format";
import { breadcrumbJsonLd, createMetadata, itemListJsonLd } from "@/lib/seo";
import type { SearchParams } from "@/lib/types";
import { filterParams, parseSearchParams } from "@/lib/validation";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { CityCard } from "@/components/public/city-card";
import { CitySearchBox } from "@/components/public/city-search-box";
import { EmptyState } from "@/components/public/empty-state";
import { Pagination, queryHref } from "@/components/public/pagination";
import { JsonLd } from "@/components/public/structured-data";

export const dynamic = "force-dynamic";
const CITY_PAGE_SIZE = 24;
const loadDirectory = cache((query: string, page: number) => getPublicCities(query || undefined, page));

function directoryFilters(params: SearchParams) {
  const { q, page } = parseSearchParams(params);
  return parseSearchParams({ q, page: String(page) });
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const filters = directoryFilters(await searchParams);
  const directory = await loadDirectory(filters.q, filters.page);
  return createMetadata({
    title: `${filters.q ? "Search city guides" : "Explore city guides"}${filters.page > 1 ? ` — Page ${filters.page}` : ""}`,
    description: "Choose an active city guide and explore its published wedding venues, useful details and direct venue contact information.",
    path: queryHref("/cities", filterParams(filters).toString()),
    noIndex: Boolean(filters.q) || (filters.page > 1 && directory.items.length === 0),
  });
}

export default async function CitiesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const filters = directoryFilters(await searchParams);
  const directory = await loadDirectory(filters.q, filters.page);
  const cities = directory.items.filter((city) => city.status === "active");
  const params = filterParams(filters).toString();

  return (
    <div className="sh-container sh-directory-page">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "City guides" }]} />
      <header className="sh-page-heading">
        <p className="sh-eyebrow">A PLACE TO BEGIN</p>
        <h1 className="sh-display">Find your city.<br /><em>Begin your story.</em></h1>
        <p className="sh-page-intro">Local places for life’s big occasions. Choose a city guide to explore the venues and details that have been published so far.</p>
        <CitySearchBox key={filters.q} id="directory-search" query={filters.q} label="Search for a city" placeholder="City name" buttonLabel="Find a city" />
      </header>
      <section className="sh-directory-results" aria-labelledby="city-results-title">
        <div className="sh-results-heading"><h2 id="city-results-title">{filters.q ? `City guides matching “${filters.q}”` : "Explore the city guides"}</h2>{directory.total > 0 && <p>{formatNumber(directory.total)} {directory.total === 1 ? "city guide" : "city guides"}</p>}</div>
        {cities.length > 0 ? (
          <div className="sh-city-grid" data-count={Math.min(cities.length, 3)}>{cities.map((city, index) => <CityCard key={city.id} city={city} priority={index === 0} />)}</div>
        ) : directory.total > 0 ? (
          <EmptyState compact eyebrow="A DIFFERENT PAGE" title="There are no guides on this page." description="The directory may have changed since this link was created. Start with the first page of your results." href={queryHref("/cities", filterParams(filters, { page: 1 }).toString())} linkLabel="Go to the first page" />
        ) : filters.q ? (
          <EmptyState eyebrow="NOT HERE JUST YET" title="No city guides match your search." description="Try a different spelling or browse the available city guides. Only active guides appear here; more will appear as they are prepared." href="/cities" linkLabel="Clear search & browse guides" />
        ) : (
          <EmptyState eyebrow="IN PREPARATION" title="Every city deserves a thoughtful guide." description="The first guides are being prepared, with venue facts and image permissions reviewed before publication. There are no active city guides to browse yet." href="/about" linkLabel="How our guides take shape" />
        )}
        <Pagination pathname="/cities" params={params} page={filters.page} total={directory.total} pageSize={CITY_PAGE_SIZE} />
      </section>
      <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "City guides", path: "/cities" }])} />
      {cities.length > 0 && <JsonLd data={itemListJsonLd(cities.map((city) => ({ name: city.name, path: cityPath(city.slug) })), (filters.page - 1) * CITY_PAGE_SIZE, directory.total)} />}
    </div>
  );
}