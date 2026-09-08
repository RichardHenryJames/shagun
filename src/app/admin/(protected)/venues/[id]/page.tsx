import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Eye } from "lucide-react";
import { getAdminVenue } from "@/lib/data/admin";
import { deleteVenueAction } from "@/lib/actions/venues";
import { uuidSchema } from "@/lib/validation";
import type { SearchParams } from "@/lib/types";
import { DeleteRecordForm } from "@/components/admin/delete-record-form";
import { firstParam } from "@/components/admin/list-utils";
import { PhotoManager } from "@/components/admin/photo-manager";
import { StatusBadge } from "@/components/admin/status-badge";
import { Notice, PageHeader } from "@/components/admin/ui";
import { VenueForm } from "@/components/admin/venue-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit venue" };

export default async function EditVenuePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  if (!uuidSchema.safeParse(id).success) notFound();
  const venue = await getAdminVenue(id);
  if (!venue) notFound();
  const preview = `/admin/venues/${encodeURIComponent(venue.id)}/preview`;
  return (
    <>
      <PageHeader title={`Edit ${venue.name}`} description={`${venue.city.name}, ${venue.city.state} · Saved venue record`} badge={<StatusBadge status={venue.status} />}
        breadcrumbs={[{ label: "Overview", href: "/admin" }, { label: "Cities", href: "/admin/cities" }, { label: venue.city.name, href: `/admin/cities/${encodeURIComponent(venue.city.slug)}` }, { label: venue.name }]}
        actions={<Link href={preview} prefetch={false} className="a-button" target="_blank" rel="noopener noreferrer"><Eye size={16} aria-hidden="true" />Preview saved venue<span className="a-sr-only"> (opens in a new tab)</span></Link>} />
      {firstParam(search.saved) === "1" && <Notice tone="success" title="Venue saved">Next, <a className="a-link" href="#venue-photos">upload or manage photos</a> and check the saved preview. Publication remains an explicit decision in the Publishing section.</Notice>}
      <VenueForm key={`${venue.id}:${venue.updated_at}`} city={venue.city} venue={venue} today={new Date().toISOString().slice(0, 10)} />
      <section className="a-panel" id="venue-photos" aria-labelledby="venue-photos-title">
        <h2 className="a-section-title" id="venue-photos-title">Venue photos</h2>
        <PhotoManager key={venue.id} owner={{ venueId: venue.id }} photos={venue.photos} />
      </section>
      <DeleteRecordForm kind="venue" id={venue.id} name={venue.name} expected_updated_at={venue.updated_at} action={deleteVenueAction}
        disabled_reason={venue.status === "published" ? "This venue is published. Select Unpublished or Archived in Publishing and save before permanent deletion becomes available." : undefined} />
    </>
  );
}