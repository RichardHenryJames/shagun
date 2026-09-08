import type { MetadataRoute } from "next";
import { indexingEnabled } from "@/lib/config";
import { getSitemapCount } from "@/lib/data/public";
import { absoluteUrl, sitemapPartitionCount } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  if (!indexingEnabled()) return { rules: { userAgent: "*", disallow: "/" } };
  const count = sitemapPartitionCount(await getSitemapCount());
  return {
    // Filter and search URLs remain crawlable so their noindex metadata can be read.
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api"] },
    sitemap: Array.from({ length: count }, (_, id) => absoluteUrl(`/sitemap/${id}.xml`)),
  };
}