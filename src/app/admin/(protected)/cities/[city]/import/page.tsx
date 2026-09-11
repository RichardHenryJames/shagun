import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { getAdminCity } from "@/lib/data/admin";
import { PageHeader } from "@/components/admin/ui";
import { VenueImport } from "@/components/admin/venue-import";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Import venues from Excel" };

export default async function ImportVenuesPage({ params }: { params: Promise<{ city: string }> }) {
  const { city: slug } = await params;
  const city = await getAdminCity(slug);
  if (!city) notFound();
  const workspace = `/admin/cities/${encodeURIComponent(city.slug)}`;
  return <>
    <PageHeader title="Import venues from Excel" description={`${city.name}, ${city.state}, ${city.country}`}
      breadcrumbs={[{ label: "Overview", href: "/admin" }, { label: "Cities", href: "/admin/cities" }, { label: city.name, href: workspace }, { label: "Import Excel" }]}
      actions={<>
        <Link href={workspace} prefetch={false} className="a-button"><ArrowLeft size={17} aria-hidden="true" />City workspace</Link>
        <a href={`/api/admin/venue-import?city_id=${encodeURIComponent(city.id)}`} download className="a-button a-button--primary"><Download size={17} aria-hidden="true" />Download template</a>
      </>} />
    <VenueImport key={city.id} cityId={city.id} workspace={workspace} />
  </>;
}