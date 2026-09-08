import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAdminCity, getAdminPhotos } from "@/lib/data/admin";
import { deleteCityAction } from "@/lib/actions/cities";
import { CityForm } from "@/components/admin/city-form";
import { DeleteRecordForm } from "@/components/admin/delete-record-form";
import { PhotoManager } from "@/components/admin/photo-manager";
import { StatusBadge } from "@/components/admin/status-badge";
import { PageHeader } from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit city" };

export default async function EditCityPage({ params }: { params: Promise<{ city: string }> }) {
  const { city: slug } = await params;
  const city = await getAdminCity(slug);
  if (!city) notFound();
  const photos = await getAdminPhotos({ cityId: city.id });
  return (
    <>
      <PageHeader title={`Edit ${city.name}`} description="Maintain city details, lifecycle, stable URL and authorised cover imagery." badge={<StatusBadge status={city.status} />}
        breadcrumbs={[{ label: "Overview", href: "/admin" }, { label: "Cities", href: "/admin/cities" }, { label: city.name, href: `/admin/cities/${encodeURIComponent(city.slug)}` }, { label: "Edit city" }]} />
      <CityForm key={`${city.id}:${city.updated_at}`} city={city} />
      <section id="city-photos" className="a-panel" aria-labelledby="city-photos-title">
        <h2 className="a-section-title" id="city-photos-title">City cover & photos</h2>
        <PhotoManager key={city.id} owner={{ cityId: city.id }} photos={photos} />
      </section>
      <DeleteRecordForm kind="city" id={city.id} name={city.name} expected_updated_at={city.updated_at} action={deleteCityAction}
        disabled_reason={city.total_count > 0 ? `This city contains ${city.total_count} venue${city.total_count === 1 ? "" : "s"} and cannot be permanently deleted. Archive it instead, or resolve its venue records first.` : city.status === "active" ? "Set the city to Inactive or Archived and save before permanently deleting it." : undefined} />
    </>
  );
}