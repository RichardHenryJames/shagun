import type { Metadata } from "next";
import { indexingEnabled, SITE_DESCRIPTION, SITE_NAME, siteUrl } from "@/lib/config";
import { photoUrl, venuePath } from "@/lib/format";
import { FACILITY_LABELS, type PublicVenue } from "@/lib/types";

export const SITEMAP_PAGE_SIZE = 10_000;
export const STATIC_SITEMAP_PATHS = ["/", "/cities", "/about"] as const;

export function absoluteUrl(path = "/"): string {
  return new URL(path, `${siteUrl()}/`).toString();
}

export function conciseDescription(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > 170 ? `${text.slice(0, 167).trimEnd()}…` : text;
}

export function createMetadata({
  title,
  description = SITE_DESCRIPTION,
  path = "/",
  noIndex = false,
  image,
}: {
  title: string;
  description?: string;
  path?: string;
  noIndex?: boolean;
  image?: { url: string; alt: string };
}): Metadata {
  const index = indexingEnabled() && !noIndex;
  const fullTitle = title === SITE_NAME ? title : `${title} | ${SITE_NAME}`;
  const summary = conciseDescription(description);
  const socialImage = image
    ? { url: absoluteUrl(image.url), alt: image.alt }
    : {
        url: absoluteUrl("/opengraph-image"),
        width: 1200,
        height: 630,
        alt: "Shagun — wedding venues, city by city. Original decorative wedding artwork.",
      };

  return {
    metadataBase: new URL(`${siteUrl()}/`),
    title: { absolute: fullTitle },
    description: summary,
    icons: { icon: "/favicon.svg" },
    alternates: { canonical: absoluteUrl(path) },
    robots: {
      index,
      follow: true,
      googleBot: { index, follow: true, "max-image-preview": index ? "large" : "none" },
    },
    openGraph: {
      type: "website",
      locale: "en_IN",
      siteName: SITE_NAME,
      title: fullTitle,
      description: summary,
      url: absoluteUrl(path),
      images: [socialImage],
    },
    twitter: { card: "summary_large_image", title: fullTitle, description: summary, images: [socialImage] },
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function itemListJsonLd(items: { name: string; path: string }[], offset = 0, total?: number) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    ...(total === undefined ? {} : { numberOfItems: total }),
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: offset + index + 1,
      name: item.name,
      url: absoluteUrl(item.path),
    })),
  };
}

export function venueJsonLd(venue: PublicVenue) {
  const url = absoluteUrl(venuePath(venue.city.slug, venue.slug));
  const hasCoordinates = venue.latitude !== null && venue.longitude !== null &&
    Number.isFinite(venue.latitude) && Number.isFinite(venue.longitude) &&
    Math.abs(venue.latitude) <= 90 && Math.abs(venue.longitude) <= 180;

  return {
    "@context": "https://schema.org",
    "@type": "EventVenue",
    "@id": `${url}#venue`,
    name: venue.name,
    url,
    ...(venue.description ? { description: venue.description } : {}),
    address: {
      "@type": "PostalAddress",
      ...(venue.address ? { streetAddress: venue.address } : {}),
      addressLocality: venue.city.name,
      addressRegion: venue.city.state,
      addressCountry: venue.city.country,
    },
    ...(venue.phone || venue.alternate_phone ? { telephone: venue.phone || venue.alternate_phone } : {}),
    ...(venue.email ? { email: venue.email } : {}),
    ...(venue.capacity_max ? { maximumAttendeeCapacity: venue.capacity_max } : {}),
    ...(hasCoordinates ? {
      geo: { "@type": "GeoCoordinates", latitude: venue.latitude, longitude: venue.longitude },
    } : {}),
    ...(venue.photos.length ? { image: venue.photos.map((photo) => absoluteUrl(photoUrl(photo.id, 1600))) } : {}),
    ...(venue.facilities.length ? {
      amenityFeature: venue.facilities.map((facility) => ({
        "@type": "LocationFeatureSpecification", name: FACILITY_LABELS[facility], value: true,
      })),
    } : {}),
  };
}

export function sitemapPartitionCount(routeCount: number): number {
  return Math.ceil((Math.max(0, routeCount) + STATIC_SITEMAP_PATHS.length) / SITEMAP_PAGE_SIZE);
}