import type { MetadataRoute } from "next";
import { indexingEnabled } from "@/lib/config";
import { getSitemapCount, getSitemapRoutes } from "@/lib/data/public";
import { absoluteUrl, SITEMAP_PAGE_SIZE, sitemapPartitionCount, STATIC_SITEMAP_PATHS } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateSitemaps() {
  if (!indexingEnabled()) return [];
  const count = sitemapPartitionCount(await getSitemapCount());
  return Array.from({ length: count }, (_, id) => ({ id }));
}

export default async function sitemap({ id }: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  if (!indexingEnabled()) return [];
  const value = await id;
  if (!/^\d+$/.test(String(value))) return [];
  const partition = Number(value);
  const count = sitemapPartitionCount(await getSitemapCount());
  if (!Number.isSafeInteger(partition) || partition < 0 || partition >= count) return [];

  // Reserve space for the three static routes in partition zero; every file stays <= 10,000 URLs.
  const staticCount = STATIC_SITEMAP_PATHS.length;
  const offset = partition === 0 ? 0 : partition * SITEMAP_PAGE_SIZE - staticCount;
  const limit = partition === 0 ? SITEMAP_PAGE_SIZE - staticCount : SITEMAP_PAGE_SIZE;
  const routes = await getSitemapRoutes(offset, limit);
  return [
    ...(partition === 0 ? STATIC_SITEMAP_PATHS.map((path) => ({ url: absoluteUrl(path) })) : []),
    ...routes.map(({ path, updatedAt }) => ({
      url: absoluteUrl(path),
      ...(Number.isNaN(Date.parse(updatedAt)) ? {} : { lastModified: new Date(updatedAt) }),
    })),
  ];
}