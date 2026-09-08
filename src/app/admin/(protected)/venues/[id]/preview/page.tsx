import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { getAdminVenue } from "@/lib/data/admin";
import { uuidSchema } from "@/lib/validation";
import { VenueDetail } from "@/components/public/venue-detail";
import { StatusBadge } from "@/components/admin/status-badge";
import { Breadcrumbs } from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const metadata: Metadata = { title: "Private venue preview", robots: { index: false, follow: false, nocache: true }, alternates: { canonical: null } };

export default async function VenuePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const record = await getAdminVenue(id);
  if (!record) notFound();
  // Do not serialize private research into the public component or a client island.
  const { research, ...venue } = record;
  void research;
  const edit = `/admin/venues/${encodeURIComponent(venue.id)}`;
  return (
    <>
      <Breadcrumbs items={[{ label: "Overview", href: "/admin" }, { label: venue.city.name, href: `/admin/cities/${encodeURIComponent(venue.city.slug)}` }, { label: venue.name, href: edit }, { label: "Private preview" }]} />
      <aside className="a-preview-banner" aria-label="Authenticated preview notice">
        <div className="a-heading-row"><div><strong><ShieldCheck size={18} aria-hidden="true" />Authenticated preview</strong><div className="a-actions"><span>Venue:</span><StatusBadge status={venue.status} /><span>City:</span><StatusBadge status={venue.city.status} /></div></div><Link href={edit} className="a-button" prefetch={false}><ArrowLeft size={16} aria-hidden="true" />Back to editing</Link></div>
        <p>This is the saved database version. Unsaved edits are not included. Preview access is private, authenticated and not indexed. Only a published venue in an active city is publicly visible.</p>
      </aside>
      <div className="a-preview-content"><VenueDetail venue={venue} preview /></div>
    </>
  );
}