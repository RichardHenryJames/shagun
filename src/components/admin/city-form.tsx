"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Eye, Plus, Save } from "lucide-react";
import { createCatalogCityAction, saveCityAction } from "@/lib/actions/cities";
import type { GeoCity } from "@/lib/city-catalog-data";
import { slugify } from "@/lib/format";
import { CITY_STATUSES, type ActionState, type CitySummary } from "@/lib/types";
import { CityPicker } from "@/components/admin/city-picker";
import { FieldErrors, FormFeedback, InputField, SelectField, TextareaField } from "@/components/admin/form-fields";
import { SectionNav } from "@/components/admin/ui";

export function CreateCityForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createCatalogCityAction, {});
  const [selection, setSelection] = useState<GeoCity | null>(null);
  return (
    <form action={action} className="a-editor-form a-city-create" aria-busy={pending} onSubmit={(event) => {
      if (!selection || pending) event.preventDefault();
    }}>
      <input type="hidden" name="catalog_id" value={selection?.id ?? ""} />
      <FormFeedback state={state} fieldIds={{ catalog_id: "city-catalog-query" }} />
      <CityPicker simple value={selection} onChange={setSelection} errors={state.fieldErrors?.catalog_id} disabled={pending} />
      <div className="a-actions">
        <button className="a-button a-button--primary" type="submit" disabled={pending || !selection}><Plus size={16} aria-hidden="true" />{pending ? "Creating city..." : "Create city"}</button>
        <Link className="a-button a-button--quiet" href="/admin/cities" prefetch={false}>Cancel</Link>
        <span className="a-badge a-badge--neutral">Draft</span>
      </div>
    </form>
  );
}

export function CityForm({ city, catalogCity = null }: { city?: CitySummary; catalogCity?: GeoCity | null }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveCityAction, {});
  const metadata = city?.metadata;
  const attributes = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
  const savedSourceId = typeof attributes.geographic_source_id === "string" ? attributes.geographic_source_id : "";
  const editableMetadata = Object.fromEntries(Object.entries(attributes).filter(([key]) => key !== "geographic_source_id"));
  const [selection, setSelection] = useState<GeoCity | null>(catalogCity);
  const [entryMode, setEntryMode] = useState<"catalog" | "manual">(savedSourceId || !city ? "catalog" : "manual");
  const [values, setValues] = useState({
    name: city?.name ?? "", state: city?.state ?? "", country: city?.country ?? "India",
    slug: city?.slug ?? "", description: city?.description ?? "", seo_title: city?.seo_title ?? "",
    seo_description: city?.seo_description ?? "", status: city?.status ?? "draft",
    metadata: Object.keys(editableMetadata).length ? JSON.stringify(editableMetadata, null, 2) : "",
  });
  const [manualSlug, setManualSlug] = useState(Boolean(city));
  const locked = Boolean(city?.launched_at);
  const errors = state.fieldErrors;
  const fieldIds = { ...Object.fromEntries(Object.keys(values).map((name) => [name, `city-${name}`])), catalog_id: "city-catalog-query" };
  const set = (name: keyof typeof values, value: string) => setValues((previous) => ({ ...previous, [name]: value }));
  const cancelHref = city ? `/admin/cities/${encodeURIComponent(city.slug)}` : "/admin/cities";
  const needsSelection = entryMode === "catalog" && !savedSourceId && !selection;
  const selectCity = (next: GeoCity | null) => {
    setSelection(next);
    if (next) setValues((previous) => ({
      ...previous,
      // Associating an existing manual record must not silently rename its
      // editorial display label or an established URL (including valid aliases).
      name: city ? previous.name || next.name : next.name,
      state: next.state, country: next.country,
      slug: !locked && !manualSlug ? next.suggestedSlug : previous.slug,
    }));
  };

  return (
    <form action={action} className="a-editor-form" aria-busy={pending} onSubmit={(event) => {
      if (needsSelection || pending) event.preventDefault();
    }}>
      <input type="hidden" name="id" value={city?.id ?? ""} />
      <input type="hidden" name="expected_updated_at" value={city?.updated_at ?? ""} />
      <input type="hidden" name="catalog_id" value={savedSourceId || (entryMode === "catalog" ? selection?.id ?? "" : "")} />
      {locked && <input type="hidden" name="slug" value={city!.slug} />}
      <FormFeedback state={state} fieldIds={fieldIds} />
      <p className="a-section-description">Choose a catalog city to fill the required geographic fields, or deliberately use manual entry. Save before uploading a cover. Nothing is activated automatically.</p>
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
            <p className="a-section-description">Catalog choices are a selection aid, not existing city workspaces. A new record is created only when you save. Display names and available URL slugs can be edited.</p>
            {savedSourceId ? (
              <div className="a-city-source" id="city-catalog-query" tabIndex={-1}>
                <p className="a-inline-value"><strong>Saved geographic source</strong><br />{catalogCity ? `${catalogCity.name} · ${catalogCity.state}, ${catalogCity.country}${catalogCity.district ? ` · District: ${catalogCity.district}` : ""}` : "This source is no longer in the current catalog. Keep the saved geographic fields while its association is reviewed."}<br /><span>{savedSourceId}</span></p>
                <p className="a-field-hint">The association is fixed after saving. The server preserves it independently of editable metadata. {catalogCity ? "Use its state and India; the public display name may use an editorial spelling variant." : "Other city details can still be saved without removing this source."}</p>
                <p className="a-field-hint">Geographical data © <a className="a-link" href="https://www.geonames.org/">GeoNames</a> · <a className="a-link" href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>. Source-derived selection; not verified inventory.</p>
                <FieldErrors id="city-catalog-query" errors={errors?.catalog_id} />
              </div>
            ) : (
              <>
                <fieldset className="a-city-entry-mode">
                  <legend>City entry method</legend>
                  <label className="a-checkbox"><input type="radio" name="city_entry_method" value="catalog" checked={entryMode === "catalog"} onChange={() => setEntryMode("catalog")} />Choose from catalog</label>
                  <label className="a-checkbox"><input type="radio" name="city_entry_method" value="manual" checked={entryMode === "manual"} onChange={() => { setEntryMode("manual"); setSelection(null); }} />Enter a city manually</label>
                </fieldset>
                {entryMode === "catalog" ? <CityPicker value={selection} onChange={selectCity} errors={errors?.catalog_id} disabled={pending} /> : (
                  <div className="a-city-source" id="city-catalog-query" tabIndex={-1}><p className="a-field-hint">Manual entry keeps this city independent of the catalog. Use researched geographic details; saving does not add a master-catalog place. Existing manual records do not need a catalog association.</p><FieldErrors id="city-catalog-query" errors={errors?.catalog_id} /></div>
                )}
              </>
            )}
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
              hint="Leave empty or enter a flat JSON object. Values may only be strings, numbers, booleans or null. geographic_source_id is reserved and saved by the server, not edited here. The whole stored object, including the source ID, must be under 3 KB." />
          </section>
        </fieldset>
      </div>
      <footer className="a-savebar">
        <p>{needsSelection ? "Select a catalog result before saving, or choose manual entry." : city ? "Changes are not autosaved. Preview shows saved data only." : "Step 1 of 2 · Save first, upload a cover next."}</p>
        <div className="a-actions"><Link className="a-button a-button--quiet" href={cancelHref} prefetch={false}>Cancel</Link>{city && <Link className="a-button" href={`${cancelHref}/preview`} prefetch={false} target="_blank" rel="noopener noreferrer"><Eye size={16} aria-hidden="true" />Saved preview<span className="a-sr-only"> (opens in a new tab)</span></Link>}<button className="a-button a-button--primary" type="submit" disabled={pending || needsSelection}><Save size={16} aria-hidden="true" />{pending ? "Saving…" : city ? "Save city" : "Save city & continue"}</button></div>
      </footer>
    </form>
  );
}