import { sitemapPartitionResponse } from "@/lib/sitemaps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ partition: string }> }) {
  return sitemapPartitionResponse((await params).partition);
}