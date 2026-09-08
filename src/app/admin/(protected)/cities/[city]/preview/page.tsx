import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getAdminCityPreview } from "@/lib/data/admin";
import type { SearchParams } from "@/lib/types";
import { parseSearchParams } from "@/lib/validation";
import { Breadcrumbs } from "@/components/admin/ui";
import { StatusBadge } from "@/components/admin/status-badge";
import { CityDiscovery } from "@/components/public/city-discovery";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const metadata: Metadata = {
  title: "Private city preview", robots: { index: false, follow: false, nocache: true }, alternates: { canonical: null },
};

export default async function CityPreviewPage({ params, searchParams }: {
  params: Promise<{ city: string }>; searchParams: Promise<SearchParams>;
}) {
  // Authenticate even malformed/missing slugs; neither the layout nor a preview
  // query parameter grants access. The repository independently requires admin.
  await requireAdmin();
  const [{ city: slug }, raw] = await Promise.all([params, searchParams]);
  const data = await getAdminCityPreview(slug, parseSearchParams(raw));
  if (!data) notFound();
  const { city } = data;
  const workspace = `/admin/cities/${encodeURIComponent(city.slug)}`;
  return (
    <>
      <Breadcrumbs items={[{ label: "Overview", href: "/admin" }, { label: "Cities", href: "/admin/cities" }, { label: city.name, href: workspace }, { label: "Private preview" }]} />
      <aside className="a-preview-banner" aria-label="Authenticated city preview notice">
        <div className="a-heading-row">
          <div><strong><ShieldCheck size={18} aria-hidden="true" />Preview: saved draft and published venues</strong><div className="a-actions"><span>City:</span><StatusBadge status={city.status} /></div></div>
          <div className="a-actions"><Link href={workspace} className="a-button" prefetch={false}>City workspace</Link><Link href={`${workspace}/edit`} className="a-button" prefetch={false}><ArrowLeft size={16} aria-hidden="true" />Back to editing</Link></div>
        </div>
        <p>This is the saved database version; unsaved edits are not included. Draft and published venues appear here, including under a non-public city. Unpublished and archived venues are excluded. Only published venues in an active city are public.</p>
        <p>Access and images are private, authenticated and not cached or indexed. This is not a shareable public preview. Search, filters and pagination stay in this protected city preview.</p>
      </aside>
      <div className="a-preview-content a-city-preview sh-site"><CityDiscovery {...data} preview rawSearchParams={raw} /></div>
    </>
  );
}