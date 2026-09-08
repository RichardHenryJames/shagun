import Link from "next/link";
import { ArrowUpRight, Check, Info, MapPin, MessageCircle, Phone, Users } from "lucide-react";
import { cityPath, formatCapacity, formatPrice, phoneHref, whatsappHref } from "@/lib/format";
import { FACILITY_LABELS, VENUE_TYPE_LABELS, type PublicVenue } from "@/lib/types";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { ContactLink } from "@/components/public/contact-link";
import { CorrectionsNote } from "@/components/public/corrections-note";
import { VenueGallery } from "@/components/public/venue-gallery";
import { validContactEmail, validContactPhone, venueCheck } from "@/components/public/venue-facts";

/** Shared with the authenticated admin preview. Deliberately has no site header, footer or main. */
export function VenueDetail({ venue, preview = false }: { venue: PublicVenue; preview?: boolean }) {
  const capacity = formatCapacity(venue.capacity_min, venue.capacity_max);
  const price = venue.price_type ? formatPrice(venue.price_min, venue.price_max, venue.price_type) : null;
  const checked = venueCheck(venue);
  const phone = validContactPhone(venue.phone) ?? validContactPhone(venue.alternate_phone);
  const alternatePhone = validContactPhone(venue.alternate_phone);
  const whatsapp = validContactPhone(venue.whatsapp);
  const email = validContactEmail(venue.email);
  const hasContact = Boolean(phone || whatsapp || email);
  const hasMobileContact = !preview && Boolean(phone || whatsapp);
  const hasCoordinates = venue.latitude !== null && venue.longitude !== null &&
    Number.isFinite(venue.latitude) && Number.isFinite(venue.longitude) &&
    Math.abs(venue.latitude) <= 90 && Math.abs(venue.longitude) <= 180;
  const contactProps = { cityId: venue.city_id, venueId: venue.id, preview };

  return (
    <article className={`sh-venue-detail sh-container${hasMobileContact ? " sh-has-mobile-contact" : ""}`}>
      {!preview && <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Cities", href: "/cities" }, { label: venue.city.name, href: cityPath(venue.city.slug) }, { label: venue.name }]} />}
      <header className="sh-venue-heading">
        <p className="sh-eyebrow">{VENUE_TYPE_LABELS[venue.venue_type]}</p>
        <h1 className="sh-display sh-venue-title">{venue.name}</h1>
        <div className="sh-venue-heading-meta">
          <p><MapPin size={17} aria-hidden="true" />{[venue.locality, venue.city.name, venue.city.state].filter(Boolean).join(", ")}</p>
          {checked.fresh && <p className="sh-checked"><Check size={16} aria-hidden="true" />Details checked <time dateTime={checked.dateTime}>{checked.date}</time></p>}
        </div>
      </header>

      <VenueGallery photos={venue.photos} venueName={venue.name} preview={preview} />

      <div className="sh-detail-columns">
        <div className="sh-detail-content">
          {(capacity || price) && (
            <dl className="sh-detail-facts">
              {capacity && <div><dt><Users size={18} aria-hidden="true" />Guest capacity</dt><dd>{capacity}</dd></div>}
              {price && <div><dt>Indicative pricing</dt><dd>{price}</dd></div>}
            </dl>
          )}
          <section className="sh-detail-section">
            <p className="sh-eyebrow">THE PLACE</p>
            <h2 className="sh-section-title">A closer look.</h2>
            {venue.description ? <p className="sh-preserve-lines">{venue.description}</p>
              : <p>Start with the recorded details here, then speak with the venue about the celebration you have in mind.</p>}
            {(capacity || price) && <p className="sh-detail-disclaimer">Capacity and prices may depend on your event layout, date and inclusions. Confirm the current arrangements directly.</p>}
          </section>

          <section className="sh-detail-section">
            <p className="sh-eyebrow">THE PRACTICAL THINGS</p>
            <h2 className="sh-section-title">Facilities & arrangements.</h2>
            {venue.facilities.length > 0 ? (
              <ul className="sh-facility-grid">
                {venue.facilities.map((facility) => <li key={facility}><Check size={17} aria-hidden="true" /><span>{FACILITY_LABELS[facility]}</span></li>)}
              </ul>
            ) : <p>Facilities have not been recorded for this listing yet. Ask the venue about the essentials for your event.</p>}
            <p className="sh-detail-disclaimer">Only recorded facilities are shown. An unlisted facility is not necessarily unavailable; ask about access, inclusions and any additional charges.</p>
          </section>

          <section className="sh-detail-section">
            <p className="sh-eyebrow">GETTING THERE</p>
            <h2 className="sh-section-title">Find your way.</h2>
            <div className="sh-address-block">
              <MapPin size={23} strokeWidth={1.4} aria-hidden="true" />
              <address>
                {venue.address && <span className="sh-preserve-lines">{venue.address}</span>}
                {venue.locality && <span>{venue.locality}</span>}
                <span>{venue.city.name}, {venue.city.state}</span>
                <span>{venue.city.country}</span>
              </address>
            </div>
            {hasCoordinates && (
              <a className="sh-button sh-button-secondary sh-map-link" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${venue.latitude},${venue.longitude}`)}`} target="_blank" rel="noopener noreferrer">
                Open in Google Maps<ArrowUpRight size={17} aria-hidden="true" /><span className="sh-sr-only"> (opens in a new tab)</span>
              </a>
            )}
            <p className="sh-detail-disclaimer">Confirm the exact entrance and directions with the venue before your visit.</p>
          </section>

          <section className="sh-planning-note">
            <p className="sh-eyebrow">BEFORE YOU DECIDE</p>
            <h2 className="sh-section-title">Leave room for the details.</h2>
            <ul>
              <li><span aria-hidden="true">01</span><div><h3>Check your date.</h3><p>Speak with the venue about availability and arrange a visit.</p></div></li>
              <li><span aria-hidden="true">02</span><div><h3>Ask what’s included.</h3><p>Confirm catering, decoration, guest capacity and any extra costs.</p></div></li>
              <li><span aria-hidden="true">03</span><div><h3>Get the terms in writing.</h3><p>Discuss the final price, payment schedule and cancellation policy directly.</p></div></li>
            </ul>
          </section>
        </div>

        <aside className="sh-contact-column" aria-label="Venue contact and listing information">
          <section className="sh-contact-card">
            <p className="sh-eyebrow">YOUR NEXT STEP</p>
            <h2 className="sh-section-title">{hasContact ? "Start a conversation." : "A little more to come."}</h2>
            <p>{hasContact ? "Ask about your date, a visit, and the little things that make it yours." : "Contact information has not been published for this venue yet. There is no sign-up or hidden contact form."}</p>
            {price && <div className="sh-contact-price"><span>Indicative pricing</span><strong>{price}</strong><small>Confirm the final quote with the venue.</small></div>}
            <div className="sh-contact-actions">
              {phone && <ContactLink {...contactProps} event="phone_clicked" href={phoneHref(phone)} className="sh-button sh-button-primary sh-contact-phone"><Phone size={18} aria-hidden="true" /><span>Call the venue<small>{phone}</small></span></ContactLink>}
              {whatsapp && <ContactLink {...contactProps} event="whatsapp_clicked" href={whatsappHref(whatsapp)} className="sh-button sh-button-sage" external><MessageCircle size={19} aria-hidden="true" />Chat on WhatsApp</ContactLink>}
              {alternatePhone && alternatePhone !== phone && <ContactLink {...contactProps} event="phone_clicked" href={phoneHref(alternatePhone)} className="sh-alternate-contact">Alternative number: {alternatePhone}</ContactLink>}
              {email && <a href={`mailto:${email}`} className="sh-alternate-contact">Email the venue: {email}</a>}
              {!hasContact && !preview && <Link className="sh-button sh-button-secondary" href={cityPath(venue.city.slug)}>Explore other venues</Link>}
            </div>
            <p className="sh-contact-footnote">Shagun is a directory, not a booking service. All conversations and arrangements are directly with the venue.</p>
          </section>
          <section className="sh-verification-note">
            <Info size={19} aria-hidden="true" />
            <div>
              <h2>{checked.fresh ? "About “Details checked”" : "Confirm the latest details"}</h2>
              {checked.date && <p>Last checked <time dateTime={checked.dateTime}>{checked.date}</time>.</p>}
              <p>{checked.fresh ? "This is a dated check of listing information, not an endorsement, quality rating or guarantee of availability." : "Listing information can change. Please confirm current details with the venue before making any commitment."}</p>
            </div>
          </section>
        </aside>
      </div>

      <section className="sh-corrections-note">
        <h2>Help keep the details useful.</h2>
        <CorrectionsNote />
        <Link href="/privacy" className="sh-text-link">Privacy & corrections <ArrowUpRight size={15} aria-hidden="true" /></Link>
      </section>

      {hasMobileContact && (
        <nav className="sh-mobile-contact" aria-label={`Contact ${venue.name}`}>
          {phone && <ContactLink {...contactProps} event="phone_clicked" href={phoneHref(phone)} className="sh-button sh-button-primary"><Phone size={18} aria-hidden="true" />Call venue</ContactLink>}
          {whatsapp && <ContactLink {...contactProps} event="whatsapp_clicked" href={whatsappHref(whatsapp)} className="sh-button sh-button-sage" external><MessageCircle size={19} aria-hidden="true" />WhatsApp</ContactLink>}
        </nav>
      )}
    </article>
  );
}