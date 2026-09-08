import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getDashboard } from "@/lib/data/admin";
import { formatNumber } from "@/lib/format";
import { STALE_DAYS } from "@/lib/types";
import { CityTable } from "@/components/admin/city-table";
import { CleanupControl } from "@/components/admin/cleanup-control";
import { EmptyState, PageHeader, StatsRow } from "@/components/admin/ui";
import { VenueTable } from "@/components/admin/venue-table";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Overview" };

export default async function AdminDashboardPage() {
  const data = await getDashboard();
  return (
    <>
      <PageHeader title="Inventory overview" description="Live database counts. Work city by city to build reliable, reviewed inventory." breadcrumbs={[{ label: "Overview" }]}
        actions={<><Link href="/admin/venues" prefetch={false} className="a-button">All venues</Link><Link href="/admin/cities/new" prefetch={false} className="a-button a-button--primary"><Plus size={17} aria-hidden="true" />Add city</Link></>} />
      <StatsRow items={[
        { label: "Cities", value: data.totalCities }, { label: "Active cities", value: data.activeCities },
        { label: "Total venues", value: data.totalVenues }, { label: "Published", value: data.publishedVenues },
        { label: "Drafts", value: data.draftVenues }, { label: "Review / recheck", value: data.reviewVenues },
        { label: "Cleanup jobs", value: data.cleanupCount },
      ]} />
      <p className="a-field-hint">These counts describe recorded inventory, not geographic coverage. “Published” is a venue status; public visibility also requires an active city. Review counts can overlap publication statuses.</p>
      <section className="a-panel" aria-labelledby="dashboard-cities-title">
        <div className="a-panel-header"><div><h2 id="dashboard-cities-title" className="a-section-title">City workspaces</h2><p>{data.cities.length < data.totalCities ? `Showing ${formatNumber(data.cities.length)} of ${formatNumber(data.totalCities)} cities. The full directory is searchable.` : "Add and maintain venues within their actual city."}</p></div><Link href="/admin/cities" prefetch={false} className="a-button a-button--quiet">View all cities</Link></div>
        {data.cities.length ? <CityTable cities={data.cities} /> : <EmptyState title="No city workspaces yet" action={<Link href="/admin/cities/new" prefetch={false} className="a-button a-button--primary">Add the first city</Link>}>The authenticated database contains no cities. Add a city as a draft, then begin its venue inventory.</EmptyState>}
      </section>
      <div className="a-dashboard-support">
        <section className="a-support-panel" aria-labelledby="dashboard-review-title">
          <h2 className="a-section-title" id="dashboard-review-title">Editorial review & rechecks</h2>
          <p>{formatNumber(data.reviewVenues)} venues are in the database review / recheck count. Revisit unverified or flagged records and checks older than {STALE_DAYS} days. Open a venue’s research section to record an actual check.</p>
          <Link href="/admin/venues" prefetch={false} className="a-button">Inspect venue verification</Link>
        </section>
        <CleanupControl count={data.cleanupCount} />
      </div>
      <section className="a-panel" aria-labelledby="dashboard-recent-title">
        <div className="a-panel-header"><div><h2 className="a-section-title" id="dashboard-recent-title">Recent additions</h2><p>Most recently created saved venues, including drafts.</p></div><Link href="/admin/venues" prefetch={false} className="a-button a-button--quiet">All venue records</Link></div>
        {data.recentVenues.length ? <VenueTable venues={data.recentVenues} recent /> : <EmptyState title="No saved venues yet" action={<Link href="/admin/cities" prefetch={false} className="a-button">Choose a city workspace</Link>}>Start in a city workspace and save a venue draft. No sample venues are shown here.</EmptyState>}
      </section>
    </>
  );
}