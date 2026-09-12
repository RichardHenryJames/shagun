import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getAdminVenues } from "@/lib/data/admin";
import type { SearchParams } from "@/lib/types";
import { ListControls } from "@/components/admin/list-controls";
import { listHref, readListQuery } from "@/components/admin/list-utils";
import { Pagination } from "@/components/admin/pagination";
import { EmptyState, PageHeader } from "@/components/admin/ui";
import { BulkPublishVenues } from "@/components/admin/bulk-publish-venues";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata: Metadata = { title: "Venues" };

export default async function AdminVenuesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { q, status, page } = readListQuery(await searchParams);
  const result = await getAdminVenues({ q, status, page });
  return (
    <>
      <PageHeader title="All venues" description="Search saved inventory across cities. Use city workspaces for day-to-day additions." breadcrumbs={[{ label: "Overview", href: "/admin" }, { label: "Venues" }]}
        actions={<><Link href="/admin/cities" prefetch={false} className="a-button">City workspaces</Link><Link href="/admin/venues/new" prefetch={false} className="a-button a-button--primary"><Plus size={17} aria-hidden="true" />Add venue</Link></>} />
      <ListControls path="/admin/venues" q={q} status={status} />
      <BulkPublishVenues key={JSON.stringify([q, status, page])} venues={result.items} />
      {!result.items.length && (
        <EmptyState title={q || status ? "No matching venues on this page" : page > 1 ? "No venues on this page" : "No venue records yet"}
          action={q || status || page > 1 ? <Link href={page > 1 ? listHref("/admin/venues", { q, status }) : "/admin/venues"} prefetch={false} className="a-button">{page > 1 ? "Return to first page" : "Clear filters"}</Link> : <Link href="/admin/venues/new" prefetch={false} className="a-button a-button--primary">Choose a city & add a venue</Link>}>
          {q || status ? "Try a broader name or locality, or clear the publication status filter." : page > 1 ? "The database may have changed. Return to the first page for current results." : "Create a genuine record in a city workspace. Unknown details can remain blank while it is a draft."}
        </EmptyState>
      )}
      <Pagination path="/admin/venues" query={{ q, status }} total={result.total} page={result.page} pageSize={result.pageSize} />
      <p className="a-field-hint">Bulk selection is limited to this page. Draft and unpublished venues are eligible; verification and city status are unchanged.</p>
    </>
  );
}