import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, Settings2 } from "lucide-react";
import { getAdminCity, getAdminVenues } from "@/lib/data/admin";
import { researchSummaryForCity } from "@/lib/actions/research";
import { cityPath } from "@/lib/format";
import type { SearchParams } from "@/lib/types";
import { ListControls } from "@/components/admin/list-controls";
import { firstParam, listHref, readListQuery } from "@/components/admin/list-utils";
import { Pagination } from "@/components/admin/pagination";
import { ResearchImport } from "@/components/admin/research-import";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState, Notice, PageHeader, StatsRow } from "@/components/admin/ui";
import { VenueTable } from "@/components/admin/venue-table";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "City workspace" };

export default async function CityWorkspacePage({ params, searchParams }: { params: Promise<{ city: string }>; searchParams: Promise<SearchParams> }) {
  const [{ city: slug }, search] = await Promise.all([params, searchParams]);
  const city = await getAdminCity(slug);
  if (!city) notFound();
  const { q, status, page } = readListQuery(search);
  const [result, research] = await Promise.all([
    getAdminVenues({ cityId: city.id, q, status, page }), researchSummaryForCity(city),
  ]);
  const workspace = `/admin/cities/${encodeURIComponent(city.slug)}`;
  const newVenue = `/admin/venues/new?city=${encodeURIComponent(city.id)}`;
  return (
    <>
      <PageHeader title={city.name} description={`${city.state}, ${city.country} · City workspace`} badge={<StatusBadge status={city.status} />}
        breadcrumbs={[{ label: "Overview", href: "/admin" }, { label: "Cities", href: "/admin/cities" }, { label: city.name }]}
        actions={<><Link href={`${workspace}/edit`} prefetch={false} className="a-button"><Settings2 size={16} aria-hidden="true" />Edit city</Link><Link href={newVenue} prefetch={false} className="a-button a-button--primary"><Plus size={17} aria-hidden="true" />Add venue</Link></>} />
      {firstParam(search.saved) === "1" && <Notice tone="success" title="City saved">You can now add venues or <Link href={`${workspace}/edit#city-photos`} prefetch={false} className="a-link">upload the city’s cover</Link>.</Notice>}
      <StatsRow label={`${city.name} recorded inventory`} items={[
        { label: "Total venues", value: city.total_count }, { label: "Published", value: city.published_count },
        { label: "Drafts", value: city.draft_count }, { label: "Review / recheck", value: city.review_count },
      ]} />
      <p className="a-field-hint">Counts include this city’s full saved inventory, regardless of the filters below. Review counts can overlap publication statuses; they are not a coverage percentage.</p>
      {city.status === "active" ? (
        <Notice title="City is active">Only published venues are public. Unpublish a venue from its edit screen to hide it. <Link href={cityPath(city.slug)} prefetch={false} className="a-link">View public city page</Link>.</Notice>
      ) : (
        <Notice title="This city is not public" tone="warning">{city.published_count > 0
          ? "Published venues are recorded, but this city remains hidden. Review the workspace and explicitly set the city to Active when it is ready."
          : "Save a venue, upload authorised photos, review its research and publish it. At least one published venue is required before the city can be activated."} <Link href={`${workspace}/edit#city-publishing`} prefetch={false} className="a-link">Manage city lifecycle</Link>.</Notice>
      )}
      {research && <ResearchImport cityId={city.id} {...research} />}
      <section className="a-panel" aria-labelledby="workspace-venues-title">
        <h2 className="a-section-title" id="workspace-venues-title">Venue inventory</h2>
        <ListControls path={workspace} q={q} status={status} />
        {result.items.length ? <VenueTable venues={result.items} showCity={false} /> : (
          <EmptyState title={q || status ? "No matching venues on this page" : page > 1 ? "No venues on this page" : "No venues recorded in this city"}
            action={q || status || page > 1 ? <Link href={page > 1 ? listHref(workspace, { q, status }) : workspace} prefetch={false} className="a-button">{page > 1 ? "Return to first page" : "Clear filters"}</Link> : <Link href={newVenue} prefetch={false} className="a-button a-button--primary">Add the first venue</Link>}>
            {q || status ? "Try a different name or locality, or clear the publication filter." : page > 1 ? "Inventory may have changed since this page was opened." : "The add-venue form will already be associated with this city. Save a draft, then add photos and review it."}
          </EmptyState>
        )}
        <Pagination path={workspace} query={{ q, status }} total={result.total} page={result.page} pageSize={result.pageSize} />
      </section>
    </>
  );
}