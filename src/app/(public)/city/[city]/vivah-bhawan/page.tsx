import { permanentRedirect } from "next/navigation";
import { cityPath } from "@/lib/format";
import type { SearchParams } from "@/lib/types";
import { queryHref } from "@/components/public/pagination";

export default async function CityCategoryAlias({ params, searchParams }: {
  params: Promise<{ city: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ city }, values] = await Promise.all([params, searchParams]);
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(values)) {
    if (Array.isArray(value)) value.forEach((item) => query.append(name, item));
    else if (value !== undefined) query.append(name, value);
  }
  permanentRedirect(queryHref(cityPath(city), query.toString()));
}