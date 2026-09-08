/* eslint-disable @next/next/no-img-element -- Original local SVG artwork, not a photograph or an image-optimization input. */
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, Leaf, Phone } from "lucide-react";
import { getPublicCities, getRecentVenues } from "@/lib/data/public";
import { cityPath } from "@/lib/format";
import { createMetadata, itemListJsonLd } from "@/lib/seo";
import { BrandMark } from "@/components/public/brand";
import { CityCard } from "@/components/public/city-card";
import { EmptyState } from "@/components/public/empty-state";
import { SearchBox } from "@/components/public/search-box";
import { JsonLd } from "@/components/public/structured-data";
import { VenueCard } from "@/components/public/venue-card";

export const dynamic = "force-dynamic";
export const metadata = createMetadata({
  title: "Wedding venues, thoughtfully discovered",
  description: "Find a place for your celebration. Explore city guides, compare recorded venue details, and speak directly with venues — without signing up.",
  path: "/",
});

export default async function HomePage() {
  const [directory, recent] = await Promise.all([getPublicCities(undefined, 1), getRecentVenues(3)]);
  const cities = directory.items.filter((city) => city.status === "active");

  return (
    <>
      <section className="sh-hero sh-container" aria-labelledby="home-title">
        <div className="sh-hero-copy">
          <p className="sh-eyebrow"><span className="sh-eyebrow-rule" />WEDDING VENUES, CITY BY CITY</p>
          <h1 id="home-title" className="sh-display">Every celebration<br />begins with<br /><em>a place.</em></h1>
          <p className="sh-hero-intro">A place for your people. A setting for your story. Discover wedding venues with useful details and the freedom to connect directly.</p>
          <SearchBox action="/cities" id="home-city-search" label="Where are you celebrating?" placeholder="Search your city" buttonLabel="Find my city" />
          {cities.length > 0 ? (
            <div className="sh-city-shortcuts"><span>Explore a city</span>{cities.slice(0, 4).map((city) => <Link key={city.id} href={cityPath(city.slug)}>{city.name}<ArrowUpRight size={13} aria-hidden="true" /></Link>)}</div>
          ) : <p className="sh-hero-launch-note"><span className="sh-status-dot" aria-hidden="true" />Our first city guides are being thoughtfully prepared.</p>}
        </div>
        <figure className="sh-hero-art">
          <div className="sh-art-top-note"><span>A NEW BEGINNING</span><span aria-hidden="true">✳</span></div>
          <img src="/celebration-arch.svg" width={640} height={720} alt="Original decorative wedding arch with draped fabric, flowers and foliage. Not a venue photograph." fetchPriority="high" loading="eager" decoding="async" />
          <figcaption>A celebration, on paper.<span>Original illustration · not a venue photograph</span></figcaption>
        </figure>
      </section>

      <div className="sh-promise-strip">
        <div className="sh-container sh-promise-inner">
          <span><Leaf size={18} strokeWidth={1.5} aria-hidden="true" />Thoughtfully prepared listings</span>
          <span><Phone size={17} strokeWidth={1.5} aria-hidden="true" />Direct conversations with venues</span>
          <span><Check size={18} strokeWidth={1.5} aria-hidden="true" />No account needed to explore</span>
        </div>
      </div>

      <section className="sh-section sh-container" aria-labelledby="home-cities-title">
        <div className="sh-section-heading">
          <div><p className="sh-eyebrow">START SOMEWHERE MEANINGFUL</p><h2 className="sh-section-title" id="home-cities-title">Find a city. Feel a little closer.</h2></div>
          <Link className="sh-text-link" href="/cities">All city guides<ArrowUpRight size={18} aria-hidden="true" /></Link>
        </div>
        {cities.length > 0 ? (
          <div className="sh-city-grid" data-count={Math.min(cities.length, 3)}>{cities.slice(0, 6).map((city) => <CityCard key={city.id} city={city} />)}</div>
        ) : (
          <EmptyState eyebrow="IN PREPARATION" title="Good beginnings take a little care." description="Our first city guides are taking shape. Venue details and image permissions are being reviewed before listings go live. There are no public listings to browse just yet." href="/about" linkLabel="A look at our approach" />
        )}
      </section>

      {recent.length > 0 && (
        <section className="sh-section sh-section-ruled sh-container" aria-labelledby="home-recent-title">
          <div className="sh-section-heading">
            <div><p className="sh-eyebrow">PLACES TO GET TO KNOW</p><h2 className="sh-section-title" id="home-recent-title">New to the directory.</h2></div>
            <Link className="sh-text-link" href="/search">Explore venues<ArrowUpRight size={18} aria-hidden="true" /></Link>
          </div>
          <div className="sh-venue-grid" data-count={Math.min(recent.length, 3)}>{recent.map((venue) => <VenueCard key={venue.id} venue={venue} />)}</div>
        </section>
      )}

      <section className="sh-how-section" aria-labelledby="how-title">
        <div className="sh-container">
          <div className="sh-section-heading"><div><p className="sh-eyebrow">LESS SEARCHING. MORE BEGINNING.</p><h2 className="sh-section-title" id="how-title">A simpler way to find your place.</h2></div><p className="sh-section-intro">From the first thought to the first conversation.<br />Take it one step at a time.</p></div>
          <ol className="sh-steps">
            <li><span className="sh-step-number" aria-hidden="true">01</span><h3>Begin with your city.</h3><p>Browse a city guide for vivah bhawans, marriage halls and other wedding venues.</p></li>
            <li><span className="sh-step-number" aria-hidden="true">02</span><h3>Make room for the details.</h3><p>Compare recorded capacities, facilities and prices on a clear, matching basis.</p></li>
            <li><span className="sh-step-number" aria-hidden="true">03</span><h3>Start a conversation.</h3><p>Contact the venue directly. Check your date, arrange a visit and ask what’s included.</p></li>
          </ol>
        </div>
      </section>

      <section className="sh-section sh-container">
        <div className="sh-standards-panel">
          <div className="sh-standards-intro"><BrandMark className="sh-standards-mark" /><p className="sh-eyebrow">THE SHAGUN APPROACH</p><h2 className="sh-section-title">A little less noise.<br /><em>A little more clarity.</em></h2><Link className="sh-text-link" href="/about">Read our listing standards<ArrowRight size={18} aria-hidden="true" /></Link></div>
          <div className="sh-standards-list">
            <div><h3>Information, not promises.</h3><p>A “Details checked” label is a dated information check, not an endorsement or a guarantee.</p></div>
            <div><h3>What’s known. Nothing invented.</h3><p>No made-up ratings, reviews or venue photographs. Missing details stay missing until they can be recorded.</p></div>
            <div><h3>Contact without the gatekeeping.</h3><p>Published venue contact details are open to everyone. No account or enquiry form between you and a conversation.</p></div>
          </div>
        </div>
      </section>
      {cities.length > 0 && <JsonLd data={itemListJsonLd(cities.slice(0, 6).map((city) => ({ name: city.name, path: cityPath(city.slug) })))} />}
    </>
  );
}