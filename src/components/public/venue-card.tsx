import Link from "next/link";
import { ArrowUpRight, Check, MapPin, Users } from "lucide-react";
import { formatCapacity, formatPrice, venuePath } from "@/lib/format";
import { VENUE_TYPE_LABELS, type PublicVenue } from "@/lib/types";
import { PhotoFallback } from "@/components/public/artwork";
import { MediaPhoto } from "@/components/public/media-photo";
import { venueCheck } from "@/components/public/venue-facts";

export function VenueCard({ venue, priority = false }: { venue: PublicVenue; priority?: boolean }) {
  const cover = venue.photos.find((photo) => photo.is_cover) ?? venue.photos[0];
  const capacity = formatCapacity(venue.capacity_min, venue.capacity_max);
  const price = venue.price_type ? formatPrice(venue.price_min, venue.price_max, venue.price_type) : null;
  const checked = venueCheck(venue);

  return (
    <article className="sh-venue-card">
      <Link href={venuePath(venue.city.slug, venue.slug)} className="sh-venue-card-link" aria-label={`View ${venue.name} in ${venue.city.name}`}>
        <div className="sh-card-image">
          {cover ? <MediaPhoto photo={cover} priority={priority} /> : <PhotoFallback />}
          <span className="sh-card-type">{VENUE_TYPE_LABELS[venue.venue_type]}</span>
        </div>
        <div className="sh-card-body">
          <p className="sh-card-location"><MapPin size={14} aria-hidden="true" /><span>{[venue.locality, venue.city.name].filter(Boolean).join(", ")}</span></p>
          <h3>{venue.name}</h3>
          {capacity && <p className="sh-card-capacity"><Users size={15} aria-hidden="true" />{capacity}</p>}
          {price && <p className="sh-card-price">{price}</p>}
          <div className="sh-card-bottom">
            {checked.fresh ? (
              <span className="sh-checked" title={`Listing details checked ${checked.date}. Not an endorsement.`}>
                <Check size={14} aria-hidden="true" /> Details checked
                <time dateTime={checked.dateTime}>{checked.date}</time>
              </span>
            ) : <span className="sh-card-explore">Explore the details</span>}
            <ArrowUpRight size={20} strokeWidth={1.5} aria-hidden="true" />
          </div>
        </div>
      </Link>
    </article>
  );
}