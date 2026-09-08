import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicVenue } from "@/lib/data/public";
import { cityPath, photoUrl, venuePath } from "@/lib/format";
import { breadcrumbJsonLd, createMetadata, venueJsonLd } from "@/lib/seo";
import { EventImpression } from "@/components/public/event-impression";
import { JsonLd } from "@/components/public/structured-data";
import { VenueDetail } from "@/components/public/venue-detail";

export const dynamic = "force-dynamic";
const loadVenue = cache(getPublicVenue);
type Props = { params: Promise<{ city: string; venue: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city, venue: slug } = await params;
  const venue = await loadVenue(city, slug);
  if (!venue) notFound();
  const cover = venue.photos.find((photo) => photo.is_cover) ?? venue.photos[0];
  return createMetadata({
    title: venue.seo_title || `${venue.name} in ${venue.city.name}`,
    description: venue.seo_description || venue.description || `Explore ${venue.name} in ${venue.city.name}, ${venue.city.state}. See recorded venue details, facilities and published contact information.`,
    path: venuePath(venue.city.slug, venue.slug),
    ...(cover ? { image: { url: photoUrl(cover.id, 1600), alt: cover.alt_text } } : {}),
  });
}

export default async function VenuePage({ params }: Props) {
  const { city, venue: slug } = await params;
  const venue = await loadVenue(city, slug);
  if (!venue) notFound();
  return (
    <>
      <VenueDetail venue={venue} />
      <EventImpression event="venue_viewed" cityId={venue.city_id} venueId={venue.id} />
      <JsonLd data={[
        breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "City guides", path: "/cities" }, { name: venue.city.name, path: cityPath(venue.city.slug) }, { name: venue.name, path: venuePath(venue.city.slug, venue.slug) }]),
        venueJsonLd(venue),
      ]} />
    </>
  );
}