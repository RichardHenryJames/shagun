import { validCitySuggestionQuery } from "@/lib/city-suggestions";
import { getPublicCitySuggestions } from "@/lib/data/city-suggestions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
};

/** Public, session-free GET. Only currently active saved city guides can be suggested. */
export async function GET(request: Request): Promise<Response> {
  const parameters = new URL(request.url).searchParams;
  const query = parameters.get("q") ?? "";
  if (parameters.getAll("q").length > 1 || [...parameters.keys()].some((key) => key !== "q") || !validCitySuggestionQuery(query)) {
    return Response.json({ error: "Use one city search of at most 100 characters without control characters." }, { status: 400, headers });
  }
  try {
    const items = await getPublicCitySuggestions(query);
    return Response.json({ items }, { headers });
  } catch {
    // A configured service outage is not an empty inventory result. No provider details.
    return Response.json({ error: "City suggestions are temporarily unavailable." }, {
      status: 503, headers: { ...headers, "Retry-After": "60" },
    });
  }
}