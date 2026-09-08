import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getAdminCities } from "@/lib/data/admin";
import { ADMIN_PAGE_SIZE, type SearchParams } from "@/lib/types";
import { CityTable } from "@/components/admin/city-table";
import { ListControls } from "@/components/admin/list-controls";
import { readListQuery, listHref } from "@/components/admin/list-utils";
import { Pagination } from "@/components/admin/pagination";
import { EmptyState, PageHeader } from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cities" };

export default async function AdminCitiesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { q, page } = readListQuery(await searchParams);
  const result = await getAdminCities(q, page);
  return (
    <>
      <PageHeader title="Cities" description="Database-driven city workspaces, lifecycle and recorded venue counts." breadcrumbs={[{ label: "Overview", href: "/admin" }, { label: "Cities" }]}
        actions={<Link href="/admin/cities/new" className="a-button a-button--primary" prefetch={false}><Plus size={17} aria-hidden="true" />Add city</Link>} />
      <ListControls path="/admin/cities" q={q} citySearch />
      {result.items.length ? <CityTable cities={result.items} /> : (
        <EmptyState title={q ? "No matching cities on this page" : page > 1 ? "No cities on this page" : "No cities recorded yet"}
          action={q || page > 1 ? <Link href={page > 1 ? listHref("/admin/cities", { q }) : "/admin/cities"} prefetch={false} className="a-button">{page > 1 ? "Return to first page" : "Clear search"}</Link> : <Link href="/admin/cities/new" prefetch={false} className="a-button a-button--primary">Add a city</Link>}>
          {q ? "Try another city name or state, or clear the search." : page > 1 ? "Records may have changed. Return to the first page for current inventory." : "Add a real city as a draft. Cities are not automatically activated."}
        </EmptyState>
      )}
      <Pagination path="/admin/cities" query={{ q }} total={result.total} page={page} pageSize={ADMIN_PAGE_SIZE} />
      <p className="a-field-hint">Review / recheck can overlap draft or published counts. These are inventory counts, not a measure of market coverage.</p>
    </>
  );
}