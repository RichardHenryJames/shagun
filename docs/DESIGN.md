# Shagun — interface design

**As of 2026-09-09:** the [audit/second-pass-2026-09-09](https://github.com/RichardHenryJames/shagun/tree/audit/second-pass-2026-09-09) review branch is published through [9db51bd](https://github.com/RichardHenryJames/shagun/commit/9db51bd5b0a11395d62401353fde3e0db03a59fe); hosted audit checks passed for original `2072dc7`. Follow-up code status and actual Preview evidence are in [VERIFICATION.md](VERIFICATION.md). Production promotion remains blocked by the shared-security and operator/editorial gates in [AUDIT.md](AUDIT.md). Review publication, previews and test inventory are not a public launch.

## Visual direction

Public pages use warm paper (#faf7f2), ink/plum (#432c3d), muted green (#54675a), clay accents, fine rules, editorial serif headings and readable sans-serif text. Keep restrained spacing and modest radii. Decorative arches and missing-photo illustrations must not resemble claims of real venue photography. No invented stars, reviews, awards, popularity or coverage metrics.

Administration uses neutral surfaces, compact tables, clear lifecycle labels, section navigation and a sticky save/preview bar. It is a productivity interface, not the public visual hierarchy.

## Two different city selectors

**Public discovery:** retain the existing native GET search leading to `/cities`. Query only launched/active guides, with **24 cities per page** and actual published-venue counts. Do not ship thousands of geographic options to visitors or show available catalog places as launched guides. A draft-only database correctly shows preparation/empty states.

**Admin selection:** the state/union-territory filter and searchable GeoNames combobox help create a city workspace. The checked-in catalog contains **7,112 places across 36 represented states/territories**, not 7,112 Shagun city records. Search returns bounded suggestions with name, state, district and stable source ID; selection fills geographic fields but saves or activates nothing.

- Require explicit result selection or deliberate **manual entry**. Repeated names must remain distinguishable.
- Support arrows, Enter, Escape, visible focus, loading/errors/retry and stale-request cancellation. The combobox displays at most 12 results; narrowing is preferable to an enormous dropdown.
- Preserve GeoNames/CC BY 4.0 attribution. The server validates the selected ID and stores `metadata.geographic_source_id`; it is not an editable provenance field.
- Catalog availability, saved city lifecycle and venue publication are separate concepts. Existing editorial spellings and locked URLs are not renamed by catalog selection.

Missing Supabase URL/public-key configuration now returns a sanitized **503** from the catalog API before client construction, private/no-store and noindex, without catalog data. Do not confuse this unavailable state with no search matches or bypass configured fresh Auth/allowlist checks.

Sources: [../src/components/admin/city-picker.tsx](../src/components/admin/city-picker.tsx), [../src/components/admin/city-form.tsx](../src/components/admin/city-form.tsx), [../data/geography/README.md](../data/geography/README.md).

## Public screens

- **Home/cities:** city-first entry, genuine published inventory, listing standards and an intentional empty state. No research-JSON fallback.
- **City:** introduction, actual count, name/locality search, inventory-derived facets, desktop sidebar/mobile filter dialog, coherent price basis, sorting and 12 venues per page. Distinguish no inventory, no matching results and an out-of-range page.
- **Venue:** recorded facts, gallery, facilities, address and dated check status. Offer phone/WhatsApp only when recorded; unknown contacts get guidance, not dead buttons. A checked date is not endorsement, availability or a booking promise.
- **Search/about/privacy:** shareable GET state, noindex search results, clear editorial/privacy limits and a corrections address only when configured.
- **Errors:** navigable recovery without internal details. Missing/hidden canonical city and venue pages must return HTTP **404 before streaming**, not 200 with not-found text. Do not add ancestor loading boundaries; skeletons remain under `/cities`, `/search` and `/admin`.

## Admin screens and saved previews

Login shows a configuration checklist until secure admin prerequisites are present. It must not request credentials in an unready state, offer a demo bypass or tell an operator to disable shared-project signup. There is no public registration or promised self-service recovery email flow.

The dashboard leads to city workspaces, real counts and review/cleanup queues. City-scoped **Add venue** preselects the saved city. Forms distinguish publication, verification and editorial review; drafts require fewer fields, and sources stay private. The photo manager uses sequential uploads, readable progress/errors, alt text, public rights credit, keyboard ordering, cover selection and explicit deletion. Save the owner before uploads; archive before considering permanent deletion.

**Saved city preview** at `/admin/cities/[slug]/preview` renders the actual shared `CityDiscovery` view, not a mock screen. It includes saved draft and published venues, including under a non-public city; unpublished/archived venues are excluded. Search, facets, totals and pagination use the full eligible saved inventory. Cards link to protected venue previews and images use authenticated delivery.

Both city and venue previews are authenticated, private/no-store and noindex, omit public canonical/structured-data claims and emit no analytics. Show the saved-state notice and city/venue statuses; unsaved form changes are not included. A preview is not a shareable public link. Source: [../src/components/public/city-discovery.tsx](../src/components/public/city-discovery.tsx).

## Accessibility and media

Target usable **320 px** layouts, 44 px primary touch targets, one h1, landmarks, skip navigation, explicit labels, linked errors and live feedback. Dialogs contain focus, close with Escape and restore the exact opener. Avoid hover-only controls and respect reduced motion. Public GET forms work without JavaScript; the admin catalog and other interactive enhancements use JavaScript.

Keep `.a-table-wrap` positioned with `position: relative`: absolutely positioned screen-reader labels must stay inside their table scroller rather than widening the page. This fixes the observed admin overflow without hiding page overflow or weakening geometry/axe assertions. Source: [../src/app/admin/admin.css](../src/app/admin/admin.css).

Preserve oriented image aspect ratios, explicit dimensions and responsive derivatives with maximum widths 480/960/1600, without enlargement. Missing real photos stay visibly missing; local generated images are labelled synthetic and never launch inventory.

## Evidence boundary

Windows real Supabase workflows passed **3/3** at **390, 768 and 1440 px**, after the table-wrapper fix with signed-in axe/no-overflow checks, **before the sitemap refactor**. Separate hosted Node 24 Auth/Chapra/venue/media/publishing/cleanup workflows passed **after the sitemap refactor at `2072dc7`**; this is not managed acceptance or evidence for the later guard.

The **Windows public matrix before the final catalog-only guard** covers `many` (**166/1**), `empty` (**95/28**) and `one` (**120/21**) at **320, 375, 390, 414, 768 and 1440 px** (passed/skipped). **Total: 381 passes / 50 intentional, inapplicable skips**. Original hosted fixture CI ran only `many`, not this entire matrix.

The post-fix local check and normal fixtures-false build passed; actual local catalog responses and the restored empty localhost:3000 home were confirmed. The original hosted Preview's sanitized catalog 500 was fixed later, so its smoke must not be called all green. These results do not establish final-domain performance, physical-device behavior or full manual accessibility conformance. See [VERIFICATION.md](VERIFICATION.md) for revision-scoped evidence and [../README.md](../README.md) for run modes.