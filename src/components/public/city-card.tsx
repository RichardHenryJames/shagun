import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cityPath, formatNumber } from "@/lib/format";
import type { CitySummary } from "@/lib/types";
import { MediaPhoto } from "@/components/public/media-photo";

export function CityCard({ city, priority = false }: { city: CitySummary; priority?: boolean }) {
  return (
    <article className="sh-city-card">
      <Link href={cityPath(city.slug)} className="sh-city-card-link">
        {city.cover && <MediaPhoto photo={city.cover} priority={priority} className="sh-city-cover" fallbackLabel="City photograph not available" />}
        <div className="sh-city-card-body">
          <div>
            <p className="sh-eyebrow">{city.state}</p>
            <h3>{city.name}</h3>
            <p className="sh-city-count">{city.published_count > 0
              ? `${formatNumber(city.published_count)} ${city.published_count === 1 ? "venue" : "venues"} to explore`
              : "Guide in preparation · no published venues yet"}</p>
          </div>
          <span className="sh-city-arrow"><ArrowUpRight size={21} strokeWidth={1.5} aria-hidden="true" /></span>
        </div>
      </Link>
    </article>
  );
}