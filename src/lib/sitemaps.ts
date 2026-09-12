import "server-only";
import { indexingEnabled } from "@/lib/config";
import { getSitemapCount, getSitemapRoutes } from "@/lib/data/public";
import { absoluteUrl, SITEMAP_PAGE_SIZE, sitemapPartitionCount, STATIC_SITEMAP_PATHS } from "@/lib/seo";

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>';
const escapeXml = (text: string) => text.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);
const missing = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
const unavailable = () => new Response("Sitemap temporarily unavailable", { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60", "X-Robots-Tag": "noindex" } });
const xml = (body: string) => new Response(`${XML_HEADER}\n${body}\n`, {
  headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
});

async function partitionCount() {
  const total = await getSitemapCount();
  if (!Number.isSafeInteger(total) || total < 0 || total > 10_000_000) throw new Error("Invalid sitemap inventory count.");
  return sitemapPartitionCount(total);
}

/** Request-time index: expanding inventory never requires a build/deploy. */
export async function sitemapIndexResponse(): Promise<Response> {
  if (!indexingEnabled()) return missing();
  try {
    const count = await partitionCount();
    return xml(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Array.from({ length: count }, (_, index) =>
      `<sitemap><loc>${escapeXml(absoluteUrl(`/sitemap/${index}.xml`))}</loc></sitemap>`).join("")}</sitemapindex>`);
  } catch { return unavailable(); }
}

/** Preserve established partition URLs without build-time generateStaticParams. */
export async function sitemapPartitionResponse(segment: string): Promise<Response> {
  if (!indexingEnabled() || !/^(?:0|[1-9]\d{0,6})\.xml$/.test(segment)) return missing();
  try {
    const index = Number(segment.slice(0, -4));
    if (index >= await partitionCount()) return missing();
    const staticCount = STATIC_SITEMAP_PATHS.length;
    const offset = index === 0 ? 0 : index * SITEMAP_PAGE_SIZE - staticCount;
    const limit = index === 0 ? SITEMAP_PAGE_SIZE - staticCount : SITEMAP_PAGE_SIZE;
    const rows = await getSitemapRoutes(offset, limit);
    if (!Array.isArray(rows) || rows.length > limit || rows.some(({ path, updatedAt }) =>
      !/^\/city\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/vivah-bhawan\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(path) || !Number.isFinite(Date.parse(updatedAt)))) {
      throw new Error("Invalid sitemap rows.");
    }
    const entries = [
      ...(index === 0 ? STATIC_SITEMAP_PATHS.map((path) => `<url><loc>${escapeXml(absoluteUrl(path))}</loc></url>`) : []),
      ...rows.map(({ path, updatedAt }) => `<url><loc>${escapeXml(absoluteUrl(path))}</loc><lastmod>${escapeXml(new Date(updatedAt).toISOString())}</lastmod></url>`),
    ];
    return xml(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join("")}</urlset>`);
  } catch { return unavailable(); }
}