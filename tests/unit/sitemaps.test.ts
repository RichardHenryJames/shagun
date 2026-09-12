import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ enabled: vi.fn(), count: vi.fn(), rows: vi.fn() }));
vi.mock("@/lib/config", () => ({ indexingEnabled: mock.enabled, siteUrl: () => "https://shagun.example.test", SITE_NAME: "Shagun", SITE_DESCRIPTION: "Directory" }));
vi.mock("@/lib/data/public", () => ({ getSitemapCount: mock.count, getSitemapRoutes: mock.rows }));
import { sitemapIndexResponse, sitemapPartitionResponse } from "@/lib/sitemaps";
import robots from "@/app/robots";

beforeEach(() => { vi.resetAllMocks(); mock.enabled.mockReturnValue(true); mock.count.mockResolvedValue(0); mock.rows.mockResolvedValue([]); });
describe("request-time sitemap generation", () => {
  it("does not read inventory for robots or merely importing the handlers", async () => {
    expect(mock.count).not.toHaveBeenCalled();
    expect(await robots()).toMatchObject({ sitemap: "https://shagun.example.test/sitemap.xml" });
    expect(mock.count).not.toHaveBeenCalled();
  });
  it("returns only static routes for empty published inventory", async () => {
    const response = await sitemapPartitionResponse("0.xml");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/xml; charset=utf-8");
    const body = await response.text();
    expect(body.match(/<url>/g)).toHaveLength(3);
    expect(body).not.toContain("/admin");
    expect(mock.rows).toHaveBeenCalledWith(0, 9997);
  });
  it("discovers newly necessary partitions at request time without a rebuild", async () => {
    mock.count.mockResolvedValueOnce(9997).mockResolvedValueOnce(9998);
    expect((await (await sitemapIndexResponse()).text()).match(/<sitemap>/g)).toHaveLength(1);
    const updated = await (await sitemapIndexResponse()).text();
    expect(updated.match(/<sitemap>/g)).toHaveLength(2);
    expect(updated).toContain("https://shagun.example.test/sitemap/1.xml");
  });
  it("uses stable offsets and valid UTC lastmod values for inventory", async () => {
    mock.count.mockResolvedValue(20000);
    mock.rows.mockResolvedValue([{ path: "/city/chapra/vivah-bhawan/synthetic-hall", updatedAt: "2026-01-01T10:00:00+05:30" }]);
    const response = await sitemapPartitionResponse("1.xml");
    expect(response.status).toBe(200);
    expect(mock.rows).toHaveBeenCalledWith(9997, 10000);
    expect(await response.text()).toContain("<lastmod>2026-01-01T04:30:00.000Z</lastmod>");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it.each(["-1.xml", "01.xml", "1", "abc.xml", "1.xml/extra", "10000000.xml"])("rejects malformed partition %s without a database read", async (segment) => {
    expect((await sitemapPartitionResponse(segment)).status).toBe(404);
    expect(mock.count).not.toHaveBeenCalled();
  });
  it("rejects non-existing partitions with no inventory fetch", async () => {
    expect((await sitemapPartitionResponse("1.xml")).status).toBe(404);
    expect(mock.rows).not.toHaveBeenCalled();
  });
  it("does not expose sitemap content when indexing is disabled", async () => {
    mock.enabled.mockReturnValue(false);
    for (const response of [await sitemapIndexResponse(), await sitemapPartitionResponse("0.xml")]) {
      expect(response.status).toBe(404); expect(response.headers.get("x-robots-tag")).toBe("noindex");
    }
    expect(mock.count).not.toHaveBeenCalled();
    expect(await robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });
  it.each([-1, Number.NaN, 10_000_001])("fails closed on invalid count %s", async (value) => {
    mock.count.mockResolvedValue(value);
    expect((await sitemapIndexResponse()).status).toBe(503);
  });
  it("sanitizes provider failures rather than returning an indexable empty success", async () => {
    mock.count.mockRejectedValue(new Error("private provider error"));
    const response = await sitemapIndexResponse();
    expect(response.status).toBe(503); expect(response.headers.get("retry-after")).toBe("60");
    expect(await response.text()).not.toContain("private provider error");
  });
  it.each(["/admin/cities/chapra/preview", "https://evil.example/path", '/city/x<attack>'])('rejects non-public inventory path %s', async (path) => {
    mock.count.mockResolvedValue(1); mock.rows.mockResolvedValue([{ path, updatedAt: "2026-01-01" }]);
    expect((await sitemapPartitionResponse("0.xml")).status).toBe(503);
  });
});