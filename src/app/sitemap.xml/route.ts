import { sitemapIndexResponse } from "@/lib/sitemaps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() { return sitemapIndexResponse(); }