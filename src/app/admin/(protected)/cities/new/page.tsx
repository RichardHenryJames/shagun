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
      <PageHeader title="Add a city" description="Create a city workspace first. Add venues and a cover after it is saved." breadcrumbs={[{ label: "Overview", href: "/admin" }, { label: "Cities", href: "/admin/cities" }, { label: "Add city" }]} />
      <CityForm />
    </>
  );
}