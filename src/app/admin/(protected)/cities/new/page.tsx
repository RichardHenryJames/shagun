import type { Metadata } from "next";
import { CityForm } from "@/components/admin/city-form";
import { PageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Add city" };

export default async function NewCityPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader title="Add a city" description="Filter by state or union territory, search the source catalog and select a city. Review its editable details, then save a normal city workspace; add venues and a cover afterwards." breadcrumbs={[{ label: "Overview", href: "/admin" }, { label: "Cities", href: "/admin/cities" }, { label: "Add city" }]} />
      <CityForm />
    </>
  );
}