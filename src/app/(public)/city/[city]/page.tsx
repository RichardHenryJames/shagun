import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cityPath, venuePath } from "@/lib/format";
import { breadcrumbJsonLd, createMetadata, itemListJsonLd } from "@/lib/seo";
import type { SearchParams } from "@/lib/types";
import { filterParams, hasActiveFilters, parseSearchParams } from "@/lib/validation";
import { CityDiscovery } from "@/components/public/city-discovery";
import { EventImpression } from "@/components/public/event-impression";
import { queryHref } from "@/components/public/pagination";
import { JsonLd } from "@/components/public/structured-data";
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
  const { city, filters, result } = data;
  const path = cityPath(city.slug);
  const facetFilters = { ...filters, q: "", page: 1 };

  return (
    <>
      <CityDiscovery {...data} rawSearchParams={raw} />
      <EventImpression event="city_viewed" cityId={city.id} />
      {filters.q && <EventImpression key={`search:${filters.q}`} event="search_performed" cityId={city.id} />}
      {hasActiveFilters(facetFilters) && <EventImpression key={`filters:${filterParams(facetFilters).toString()}`} event="filter_used" cityId={city.id} />}
      <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "City guides", path: "/cities" }, { name: city.name, path }])} />
      {result.items.length > 0 && <JsonLd data={itemListJsonLd(result.items.map((venue) => ({ name: venue.name, path: venuePath(venue.city.slug, venue.slug) })), (result.page - 1) * result.pageSize, result.total)} />}
    </>
  );
}