"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Eye, Save } from "lucide-react";
import { saveVenueAction } from "@/lib/actions/venues";
import { slugify } from "@/lib/format";
import { FACILITY_CODES, FACILITY_LABELS, PRICE_TYPES, PRICE_TYPE_LABELS, VENUE_STATUSES, VENUE_TYPES, VENUE_TYPE_LABELS, VERIFICATION_STATUSES, type ActionState, type AdminVenue, type City, type FacilityCode } from "@/lib/types";
import { FieldErrors, FormFeedback, InputField, SelectField, TextareaField } from "@/components/admin/form-fields";
import { SectionNav } from "@/components/admin/ui";

export function VenueForm({ city, venue, today }: { city: City; venue?: AdminVenue; today: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveVenueAction, {});
  const [values, setValues] = useState({
    name: venue?.name ?? "", venue_type: venue?.venue_type ?? "", description: venue?.description ?? "",
    locality: venue?.locality ?? "", address: venue?.address ?? "", phone: venue?.phone ?? "",
    alternate_phone: venue?.alternate_phone ?? "", whatsapp: venue?.whatsapp ?? "", email: venue?.email ?? "",
    capacity_min: venue?.capacity_min?.toString() ?? "", capacity_max: venue?.capacity_max?.toString() ?? "",
    price_min: venue?.price_min?.toString() ?? "", price_max: venue?.price_max?.toString() ?? "", price_type: venue?.price_type ?? "",
    latitude: venue?.latitude?.toString() ?? "", longitude: venue?.longitude?.toString() ?? "",
    source_notes: venue?.research?.source_notes ?? "", verification_status: venue?.verification_status ?? "unverified",
    verified_at: venue?.verified_at?.slice(0, 10) ?? "", slug: venue?.slug ?? "",
    seo_title: venue?.seo_title ?? "", seo_description: venue?.seo_description ?? "", status: venue?.status ?? "draft",
  });
  const [reviewed, setReviewed] = useState(Boolean(venue?.research?.reviewed_at));
  const [facilities, setFacilities] = useState<FacilityCode[]>(venue?.facilities ?? []);
  const [manualSlug, setManualSlug] = useState(Boolean(venue));
  const locked = Boolean(venue?.published_at);
  const needsReview = values.status === "published" || values.verification_status === "verified";
  const errors = state.fieldErrors;
  const fieldIds = Object.fromEntries([...Object.keys(values), "city_id", "reviewed", "facilities"].map((name) => [name, `venue-${name}`]));
  const set = (name: keyof typeof values, value: string) => setValues((previous) => ({ ...previous, [name]: value }));
  const workspace = `/admin/cities/${encodeURIComponent(city.slug)}`;
  const phoneHint = "Include + and the country code, such as +91 for India. Leave unknown numbers empty.";

  return (
    <form action={action} className="a-editor-form" aria-busy={pending}>
      <input type="hidden" name="id" value={venue?.id ?? ""} />
      <input type="hidden" name="expected_updated_at" value={venue?.updated_at ?? ""} />
      <input type="hidden" name="city_id" value={city.id} />
      {locked && <input type="hidden" name="slug" value={venue!.slug} />}
      <FormFeedback state={state} fieldIds={fieldIds} />
      <p className="a-section-description">Fields marked * are required. Keep unknown details blank. Save a draft first; photos are uploaded separately after saving.</p>
      <div className="a-editor">
        <SectionNav items={[
          { id: "venue-basic", label: "Basic details" }, { id: "venue-contact", label: "Contact" },
          { id: "venue-details", label: "Capacity, pricing & facilities" }, { id: "venue-location", label: "Coordinates" },
          { id: "venue-research", label: "Private research & review" }, { id: "venue-seo", label: "URL & search" },
          { id: "venue-publishing", label: "Publishing" }, ...(venue ? [{ id: "venue-photos", label: "Photos" }, { id: "venue-delete", label: "Archive / delete" }] : []),
        ]} />
        <fieldset className="a-form-fields" disabled={pending}>
          <legend className="a-sr-only">Venue information</legend>
          <section className="a-form-section" id="venue-basic" aria-labelledby="venue-basic-title">
            <h2 className="a-section-title" id="venue-basic-title">Basic details</h2>
            <p className="a-section-description">Only a name, type, stable slug and city are needed to begin a draft.</p>
            <div className="a-form-grid">
              <div className="a-field a-span-full" id="venue-city_id" tabIndex={-1}>
                <span className="a-field-label">Associated city</span>
                <p className="a-inline-value"><strong>{city.name}</strong> · {city.state}, {city.country}</p>
                <p className="a-field-hint">{locked ? "City association is permanently locked after first publication." : "This form saves to the selected city. Association is fixed in this editor and becomes permanently locked after first publication."}</p>
                {!venue && <Link className="a-link" href="/admin/venues/new" prefetch={false}>Choose another city (starts a new form)</Link>}
                <FieldErrors id="venue-city_id" errors={errors?.city_id} />
              </div>
              <InputField id="venue-name" name="name" label="Venue name" required minLength={2} maxLength={180} autoComplete="off" value={values.name} errors={errors?.name} onChange={(event) => {
                const name = event.target.value;
                setValues((previous) => ({ ...previous, name, slug: !manualSlug && !locked ? slugify(name) : previous.slug }));
              }} />
              <SelectField id="venue-venue_type" name="venue_type" label="Venue type" required value={values.venue_type} onChange={(event) => set("venue_type", event.target.value)} errors={errors?.venue_type}>
                <option value="" disabled>Choose the recorded type</option>
                {VENUE_TYPES.map((type) => <option value={type} key={type}>{VENUE_TYPE_LABELS[type]}</option>)}
              </SelectField>
              <TextareaField id="venue-description" name="description" label="Description" rows={5} maxLength={8000} wrapperClassName="a-span-full" value={values.description} onChange={(event) => set("description", event.target.value)} errors={errors?.description} hint="Factual public description. Keep research sources and internal notes in the private section below." />
              <InputField id="venue-locality" name="locality" label="Locality / neighbourhood" maxLength={150} value={values.locality} onChange={(event) => set("locality", event.target.value)} errors={errors?.locality} />
              <TextareaField id="venue-address" name="address" label="Full address" required={values.status === "published"} maxLength={600} rows={3} wrapperClassName="a-span-full" value={values.address} onChange={(event) => set("address", event.target.value)} errors={errors?.address} hint="Required before publishing. Include enough detail to locate the venue without guessing." />
            </div>
          </section>
          <section className="a-form-section" id="venue-contact" aria-labelledby="venue-contact-title">
            <h2 className="a-section-title" id="venue-contact-title">Public contact information</h2>
            <p className="a-section-description">Record only contact information appropriate for publication. Do not assume a telephone number also accepts WhatsApp.</p>
            <div className="a-form-grid">
              <InputField id="venue-phone" name="phone" label="Phone" type="tel" maxLength={30} autoComplete="off" value={values.phone} onChange={(event) => set("phone", event.target.value)} errors={errors?.phone} hint={phoneHint} />
              <InputField id="venue-alternate_phone" name="alternate_phone" label="Alternate phone" type="tel" maxLength={30} autoComplete="off" value={values.alternate_phone} onChange={(event) => set("alternate_phone", event.target.value)} errors={errors?.alternate_phone} hint={phoneHint} />
              <InputField id="venue-whatsapp" name="whatsapp" label="WhatsApp number" type="tel" maxLength={30} autoComplete="off" value={values.whatsapp} onChange={(event) => set("whatsapp", event.target.value)} errors={errors?.whatsapp} hint={phoneHint} />
              <InputField id="venue-email" name="email" label="Public email" type="email" maxLength={254} autoComplete="off" autoCapitalize="none" spellCheck={false} value={values.email} onChange={(event) => set("email", event.target.value)} errors={errors?.email} />
            </div>
          </section>
          <section className="a-form-section" id="venue-details" aria-labelledby="venue-details-title">
            <h2 className="a-section-title" id="venue-details-title">Capacity, pricing & known facilities</h2>
            <p className="a-section-description">Optional facts, not estimates. Blank means unrecorded; zero is not a substitute for an unknown price or capacity.</p>
            <div className="a-form-grid">
              <InputField id="venue-capacity_min" name="capacity_min" label="Minimum capacity (guests)" type="number" min={1} max={100000} step={1} inputMode="numeric" value={values.capacity_min} onChange={(event) => set("capacity_min", event.target.value)} errors={errors?.capacity_min} />
              <InputField id="venue-capacity_max" name="capacity_max" label="Maximum capacity (guests)" type="number" min={Number(values.capacity_min) > 0 ? Number(values.capacity_min) : 1} max={100000} step={1} inputMode="numeric" value={values.capacity_max} onChange={(event) => set("capacity_max", event.target.value)} errors={errors?.capacity_max} />
              <InputField id="venue-price_min" name="price_min" label="Minimum price (INR)" type="number" min={1} max={100000000} step="any" inputMode="decimal" value={values.price_min} onChange={(event) => set("price_min", event.target.value)} errors={errors?.price_min} />
              <InputField id="venue-price_max" name="price_max" label="Maximum price (INR)" type="number" min={Number(values.price_min) > 0 ? Number(values.price_min) : 1} max={100000000} step="any" inputMode="decimal" value={values.price_max} onChange={(event) => set("price_max", event.target.value)} errors={errors?.price_max} />
              <SelectField id="venue-price_type" name="price_type" label="Price basis" required={Boolean(values.price_min || values.price_max)} value={values.price_type} onChange={(event) => set("price_type", event.target.value)} errors={errors?.price_type} hint="Required when either price is recorded. Prices with different bases cannot be compared directly." wrapperClassName="a-span-full">
                <option value="">Not recorded</option>{PRICE_TYPES.map((type) => <option key={type} value={type}>{PRICE_TYPE_LABELS[type]}</option>)}
              </SelectField>
              <fieldset id="venue-facilities" className="a-form-fields a-span-full" tabIndex={-1} aria-describedby={`venue-facilities-hint${errors?.facilities?.length ? " venue-facilities-error" : ""}`}>
                <legend className="a-field-label">Known facilities</legend>
                <p id="venue-facilities-hint" className="a-field-hint">Check only positively established facilities. An unchecked box means unrecorded, not unavailable.</p>
                <div className="a-check-grid">{FACILITY_CODES.map((code) => <label key={code} className="a-checkbox" htmlFor={`venue-facility-${code}`}><input id={`venue-facility-${code}`} name="facilities" value={code} type="checkbox" checked={facilities.includes(code)} onChange={(event) => {
                  const checked = event.target.checked;
                  setFacilities((previous) => checked ? [...previous, code] : previous.filter((value) => value !== code));
                }} />{FACILITY_LABELS[code]}</label>)}</div>
                <FieldErrors id="venue-facilities" errors={errors?.facilities} />
              </fieldset>
            </div>
          </section>
          <section className="a-form-section" id="venue-location" aria-labelledby="venue-location-title">
            <h2 className="a-section-title" id="venue-location-title">Coordinates</h2>
            <p className="a-section-description">Optional. Enter both coordinates from a reliable source, or leave both empty. Do not use a city centre as a venue location.</p>
            <div className="a-form-grid">
              <InputField id="venue-latitude" name="latitude" label="Latitude" type="number" step="any" min={-90} max={90} required={Boolean(values.longitude)} value={values.latitude} onChange={(event) => set("latitude", event.target.value)} errors={errors?.latitude} hint="−90 to 90." />
              <InputField id="venue-longitude" name="longitude" label="Longitude" type="number" step="any" min={-180} max={180} required={Boolean(values.latitude)} value={values.longitude} onChange={(event) => set("longitude", event.target.value)} errors={errors?.longitude} hint="−180 to 180." />
            </div>
          </section>
          <section className="a-form-section" id="venue-research" aria-labelledby="venue-research-title">
            <h2 className="a-section-title" id="venue-research-title">Private research & editorial review</h2>
            <p className="a-section-description">Source notes and the review record are private. Verification records a dated check; it is not an endorsement and does not publish the venue.</p>
            <div className="a-form-grid">
              <TextareaField id="venue-source_notes" name="source_notes" label="Private source notes" required={needsReview} maxLength={8000} rows={6} wrapperClassName="a-span-full" value={values.source_notes} onChange={(event) => set("source_notes", event.target.value)} errors={errors?.source_notes} hint="Record sources, dates, permission references and uncertainties. Required for publishing or marking verified. Do not store passwords, tokens or unnecessary personal data." />
              <div className="a-span-full">
                <label className="a-checkbox a-checkbox--review" htmlFor="venue-reviewed"><input type="checkbox" id="venue-reviewed" name="reviewed" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} required={needsReview} aria-invalid={errors?.reviewed?.length ? true : undefined} aria-describedby={`venue-reviewed-hint${errors?.reviewed?.length ? " venue-reviewed-error" : ""}`} /><span>I have reviewed the recorded facts and their sources.{needsReview && <span className="a-required" aria-hidden="true"> *</span>}</span></label>
                <p className="a-field-hint" id="venue-reviewed-hint">This is an explicit editorial decision, separate from publication and the verification date.</p>
                <FieldErrors id="venue-reviewed" errors={errors?.reviewed} />
              </div>
              <SelectField id="venue-verification_status" name="verification_status" label="Verification status" required value={values.verification_status} onChange={(event) => set("verification_status", event.target.value)} errors={errors?.verification_status}>
                {VERIFICATION_STATUSES.map((status) => <option value={status} key={status}>{status === "needs_review" ? "Needs review" : status === "verified" ? "Verified" : "Unverified"}</option>)}
              </SelectField>
              <InputField id="venue-verified_at" name="verified_at" label="Last checked date" type="date" max={today} required={values.verification_status === "verified"} value={values.verified_at} onChange={(event) => set("verified_at", event.target.value)} errors={errors?.verified_at} hint="Use the actual check date, never a future date. Verified requires this date, source notes and the review checkbox." />
            </div>
          </section>
          <section className="a-form-section" id="venue-seo" aria-labelledby="venue-seo-title">
            <h2 className="a-section-title" id="venue-seo-title">Stable URL & search appearance</h2>
            <p className="a-section-description">The URL and city association lock on first publication, even if the venue is later unpublished.</p>
            <div className="a-form-grid">
              <InputField id="venue-slug" name="slug" label="Venue URL slug" required minLength={2} maxLength={90} pattern="[a-z0-9]+(-[a-z0-9]+)*" autoCapitalize="none" spellCheck={false} disabled={locked} value={values.slug} onChange={(event) => { setManualSlug(true); set("slug", event.target.value); }} errors={errors?.slug} wrapperClassName="a-span-full" hint={locked ? "Locked after first publication. The original slug is preserved when saving." : "Generated from the name until manually edited. Lowercase letters, numbers and single hyphens."} />
              <InputField id="venue-seo_title" name="seo_title" label="SEO title override" maxLength={70} value={values.seo_title} onChange={(event) => set("seo_title", event.target.value)} errors={errors?.seo_title} hint="Optional, up to 70 characters. Leave empty for the standard title." wrapperClassName="a-span-full" />
              <TextareaField id="venue-seo_description" name="seo_description" label="SEO description override" rows={3} maxLength={180} value={values.seo_description} onChange={(event) => set("seo_description", event.target.value)} errors={errors?.seo_description} hint="Optional, up to 180 characters. Leave empty for the standard description." wrapperClassName="a-span-full" />
            </div>
          </section>
          <section className="a-form-section" id="venue-publishing" aria-labelledby="venue-publishing-title">
            <h2 className="a-section-title" id="venue-publishing-title">Publishing</h2>
            <p className="a-section-description">Publishing requires an address, private source notes and editorial review. A published venue is visible publicly only while its city is active. Verification is a separate decision.</p>
            <SelectField id="venue-status" name="status" label="Publication status" required value={values.status} onChange={(event) => set("status", event.target.value)} errors={errors?.status} hint="Save to apply the selected status. Use Unpublished to hide a listing, or Archived to retire it without deleting its history.">
              {VENUE_STATUSES.map((status) => <option value={status} key={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}
            </SelectField>
            <p className="a-field-hint">{venue ? "The preview uses saved database content only. Save these changes before checking the preview or managing photos." : "After saving, the edit screen will provide photo uploads and a private preview. No photos can be uploaded against an unsaved venue."}</p>
          </section>
        </fieldset>
      </div>
      <footer className="a-savebar">
        <p>{venue ? "Preview shows saved data, not unsaved edits." : "Step 1 of 2 · Save details, then upload photos."}</p>
        <div className="a-actions">
          <Link className="a-button a-button--quiet" href={workspace} prefetch={false}>Cancel</Link>
          {venue && <Link className="a-button" href={`/admin/venues/${encodeURIComponent(venue.id)}/preview`} target="_blank" rel="noopener noreferrer" prefetch={false}><Eye size={16} aria-hidden="true" />Saved preview<span className="a-sr-only"> (opens in a new tab)</span></Link>}
          <button className="a-button a-button--primary" type="submit" disabled={pending}><Save size={16} aria-hidden="true" />{pending ? "Saving…" : venue ? "Save venue" : "Save venue & continue"}</button>
        </div>
      </footer>
    </form>
  );
}