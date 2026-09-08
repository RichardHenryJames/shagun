"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Save } from "lucide-react";
import { saveCityAction } from "@/lib/actions/cities";
import { slugify } from "@/lib/format";
import { CITY_STATUSES, type ActionState, type CitySummary } from "@/lib/types";
import { FormFeedback, InputField, SelectField, TextareaField } from "@/components/admin/form-fields";
import { SectionNav } from "@/components/admin/ui";

export function CityForm({ city }: { city?: CitySummary }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveCityAction, {});
  const [values, setValues] = useState({
    name: city?.name ?? "", state: city?.state ?? "", country: city?.country ?? "India",
    slug: city?.slug ?? "", description: city?.description ?? "", seo_title: city?.seo_title ?? "",
    seo_description: city?.seo_description ?? "", status: city?.status ?? "draft",
    metadata: city && city.metadata && Object.keys(city.metadata).length ? JSON.stringify(city.metadata, null, 2) : "",
  });
  const [manualSlug, setManualSlug] = useState(Boolean(city));
  const locked = Boolean(city?.launched_at);
  const errors = state.fieldErrors;
  const fieldIds = Object.fromEntries(Object.keys(values).map((name) => [name, `city-${name}`]));
  const set = (name: keyof typeof values, value: string) => setValues((previous) => ({ ...previous, [name]: value }));
  const cancelHref = city ? `/admin/cities/${encodeURIComponent(city.slug)}` : "/admin/cities";

  return (
    <form action={action} className="a-editor-form" aria-busy={pending}>
      <input type="hidden" name="id" value={city?.id ?? ""} />
      <input type="hidden" name="expected_updated_at" value={city?.updated_at ?? ""} />
      {locked && <input type="hidden" name="slug" value={city!.slug} />}
      <FormFeedback state={state} fieldIds={fieldIds} />
      <p className="a-section-description">Fields marked * are required. Save the city before uploading its cover. Nothing is activated automatically.</p>
      <div className="a-editor">
        <SectionNav items={[
          { id: "city-basic", label: "City details" }, { id: "city-seo", label: "URL & search" },
          { id: "city-publishing", label: "Lifecycle" }, { id: "city-metadata-section", label: "Optional metadata" },
          ...(city ? [{ id: "city-photos", label: "Cover photos" }, { id: "city-delete", label: "Archive / delete" }] : []),
        ]} />
        <fieldset className="a-form-fields" disabled={pending}>
          <legend className="a-sr-only">City information</legend>
          <section className="a-form-section" id="city-basic" aria-labelledby="city-basic-title">
            <h2 className="a-section-title" id="city-basic-title">City details</h2>
            <p className="a-section-description">Use the real city name and a short, factual introduction.</p>
            <div className="a-form-grid">
              <InputField id="city-name" name="name" label="City name" required minLength={2} maxLength={100} autoComplete="address-level2"
                value={values.name} errors={errors?.name} onChange={(event) => {
                  const name = event.target.value;
                  setValues((previous) => ({ ...previous, name, slug: !manualSlug && !locked ? slugify(name) : previous.slug }));
                }} />
              <InputField id="city-state" name="state" label="State / region" required minLength={2} maxLength={100} autoComplete="address-level1" value={values.state} onChange={(event) => set("state", event.target.value)} errors={errors?.state} />
              <InputField id="city-country" name="country" label="Country" required minLength={2} maxLength={100} autoComplete="country-name" value={values.country} onChange={(event) => set("country", event.target.value)} errors={errors?.country} />
              <TextareaField id="city-description" name="description" label="City introduction" maxLength={2000} rows={4} wrapperClassName="a-span-full" value={values.description} onChange={(event) => set("description", event.target.value)} errors={errors?.description} hint="Optional. Up to 2,000 characters; plain text, without unsupported coverage claims." />
            </div>
          </section>
          <section className="a-form-section" id="city-seo" aria-labelledby="city-seo-title">
            <h2 className="a-section-title" id="city-seo-title">Stable URL & search appearance</h2>
            <p className="a-section-description">Search overrides are optional. Leave them empty to use the standard page title and description.</p>
            <div className="a-form-grid">
              <InputField id="city-slug" name="slug" label="City URL slug" required minLength={2} maxLength={90} pattern="[a-z0-9]+(-[a-z0-9]+)*" autoCapitalize="none" spellCheck={false}
                disabled={locked} value={values.slug} onChange={(event) => { setManualSlug(true); set("slug", event.target.value); }} errors={errors?.slug} wrapperClassName="a-span-full"
                hint={locked ? "Locked because this city has already been activated. Renaming the city does not change its URL." : "Generated from the name until you edit it. Lowercase letters, numbers and single hyphens; locked after first activation."} />
              <InputField id="city-seo_title" name="seo_title" label="SEO title override" maxLength={70} value={values.seo_title} onChange={(event) => set("seo_title", event.target.value)} errors={errors?.seo_title} hint="Optional, up to 70 characters." wrapperClassName="a-span-full" />
              <TextareaField id="city-seo_description" name="seo_description" label="SEO description override" rows={3} maxLength={180} value={values.seo_description} onChange={(event) => set("seo_description", event.target.value)} errors={errors?.seo_description} hint="Optional, up to 180 characters." wrapperClassName="a-span-full" />
            </div>
          </section>
          <section className="a-form-section" id="city-publishing" aria-labelledby="city-publishing-title">
            <h2 className="a-section-title" id="city-publishing-title">City lifecycle</h2>
            <p className="a-section-description">Active makes this city discoverable. At least one published venue is required; the database checks this again when saving. Draft, inactive and archived cities are not public.</p>
            <SelectField id="city-status" name="status" label="City status" required value={values.status} onChange={(event) => set("status", event.target.value)} errors={errors?.status}
              hint={city ? `${city.published_count} published venue${city.published_count === 1 ? "" : "s"} currently recorded. Archiving is preferable to permanent deletion.` : "Save as draft, add and publish a reviewed venue, then return here to activate the city."}>
              {CITY_STATUSES.map((status) => <option value={status} key={status} disabled={status === "active" && !(city && city.published_count > 0)}>{status[0].toUpperCase() + status.slice(1)}{status === "active" && !(city && city.published_count > 0) ? " — needs a published venue" : ""}</option>)}
            </SelectField>
          </section>
          <section className="a-form-section" id="city-metadata-section" aria-labelledby="city-metadata-title">
            <h2 className="a-section-title" id="city-metadata-title">Optional metadata</h2>
            <p className="a-section-description">For non-sensitive structured attributes only. City metadata is not a private research store.</p>
            <TextareaField id="city-metadata" name="metadata" label="Metadata JSON" className="a-json" rows={5} maxLength={6000} spellCheck={false} value={values.metadata} onChange={(event) => set("metadata", event.target.value)} errors={errors?.metadata}
              hint="Leave empty or enter a flat JSON object. Values may only be strings, numbers, booleans or null; no arrays or nested objects. Stored JSON must be under 3 KB." />
          </section>
        </fieldset>
      </div>
      <footer className="a-savebar">
        <p>{city ? "Changes are not autosaved." : "Step 1 of 2 · Save first, upload a cover next."}</p>
        <div className="a-actions"><Link className="a-button a-button--quiet" href={cancelHref} prefetch={false}>Cancel</Link><button className="a-button a-button--primary" type="submit" disabled={pending}><Save size={16} aria-hidden="true" />{pending ? "Saving…" : city ? "Save city" : "Save city & continue"}</button></div>
      </footer>
    </form>
  );
}