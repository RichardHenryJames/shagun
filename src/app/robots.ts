import type { MetadataRoute } from "next";
import { indexingEnabled } from "@/lib/config";
import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  if (!indexingEnabled()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    // Filter and search URLs remain crawlable so their noindex metadata can be read.
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api"] },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}