import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getAdminCities } from "@/lib/data/admin";
import { uuidSchema } from "@/lib/validation";
import { ADMIN_PAGE_SIZE, type SearchParams } from "@/lib/types";
import { CityTable } from "@/components/admin/city-table";
import { ListControls } from "@/components/admin/list-controls";
import { firstParam, listHref, readListQuery } from "@/components/admin/list-utils";
import { Pagination } from "@/components/admin/pagination";
import { EmptyState, PageHeader } from "@/components/admin/ui";
import { VenueForm } from "@/components/admin/venue-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Add venue" };

export default async function NewVenuePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const search = await searchParams;
  const selectedCity = firstParam(search.city);
  if (selectedCity) {
    // The repository's getAdminCity accepts a slug. Resolve this UUID through an
    // explicitly reauthorized client, never by assuming the first directory page.
    const { client } = await requireAdmin();
    const parsed = uuidSchema.safeParse(selectedCity);
    if (!parsed.success) notFound();
    const { data: city, error } = await client.from("cities").select("*").eq("id", parsed.data).maybeSingle();
    if (error) throw new Error("The selected city could not be loaded.");
    if (!city) notFound();
    return (
      <>
        <PageHeader title="Add a venue" description={`Create a saved venue record in ${city.name}, ${city.state}. Photos follow after the first save.`}
          breadcrumbs={[{ label: "Overview", href: "/admin" }, { label: "Cities", href: "/admin/cities" }, { label: city.name, href: `/admin/cities/${encodeURIComponent(city.slug)}` }, { label: "Add venue" }]} />
        <VenueForm key={city.id} city={city} today={new Date().toISOString().slice(0, 10)} />
      </>
    );
  }
  const { q, page } = readListQuery(search);
  const result = await getAdminCities(q, page);
  return (
    <>
      <PageHeader title="Choose a city for the venue" description="A venue must be associated with an existing database city. Search and select the correct workspace; no city is selected automatically." breadcrumbs={[{ label: "Overview", href: "/admin" }, { label: "Venues", href: "/admin/venues" }, { label: "Choose city" }]}
        actions={<Link href="/admin/cities/new" prefetch={false} className="a-button">Add a missing city</Link>} />
      <ListControls path="/admin/venues/new" q={q} citySearch />
      {result.items.length ? <CityTable cities={result.items} picker /> : (
        <EmptyState title={q || page > 1 ? "No cities on this page" : "Create a city before adding a venue"}
          action={q || page > 1 ? <Link href={page > 1 ? listHref("/admin/venues/new", { q }) : "/admin/venues/new"} prefetch={false} className="a-button">{page > 1 ? "Return to first page" : "Clear search"}</Link> : <Link href="/admin/cities/new" prefetch={false} className="a-button a-button--primary">Add a city</Link>}>
          {q ? "Try the city name or state. Only saved database cities can be selected." : page > 1 ? "Return to the first page or refine the search." : "Save a draft city, then add the venue from its workspace."}
        </EmptyState>
      )}
      <Pagination path="/admin/venues/new" query={{ q }} total={result.total} page={page} pageSize={ADMIN_PAGE_SIZE} />
    </>
  );
}