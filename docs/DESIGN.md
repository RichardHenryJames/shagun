# Shagun — interface design

**As of 2026-09-09:** home and the city directory have progressive public-city autocomplete, separate from private geographic selection. Current test/publication evidence and preview state are in [VERIFICATION.md](VERIFICATION.md). Production promotion remains blocked by the shared-security and operator/editorial gates in [AUDIT.md](AUDIT.md). Review publication, previews and test inventory are not a public launch.

## Visual direction

Public pages use warm paper (#faf7f2), ink/plum (#432c3d), muted green (#54675a), clay accents, fine rules, editorial serif headings and readable sans-serif text. Keep restrained spacing and modest radii. Decorative arches and missing-photo illustrations must not resemble claims of real venue photography. No invented stars, reviews, awards, popularity or coverage metrics.

Administration uses neutral surfaces, compact tables, clear lifecycle labels, section navigation and a sticky save/preview bar. It is a productivity interface, not the public visual hierarchy.

## Public autocomplete and private city selection

**Public discovery:** home and `/cities` progressively enhance the existing native GET form with a labelled combobox/listbox. Full results retain **24 cities per page** and actual published-venue counts; the suggestion response contains only `name`, `slug` and `state`.

- Show at most **8 name/state-labelled options** from `/api/cities/suggestions`. Match existing active-city visibility, including an active guide whose venues later become empty. Never show catalog places as launched guides or use private GeoNames/research fallback.
- Support arrow navigation, Enter selection, pointer/touch selection, Escape dismissal and clear focus. Debounce **250 ms**, time out after **8 seconds**, abort stale requests and invalidate pending work on edits, including trailing edits, blur and unmount. Late responses must not reopen a dismissed list.
- Distinguish loading, no matches and request failure; provide retry without disabling the underlying **native GET/no-JavaScript path**. A draft-only database still correctly shows preparation/empty states.
- The existing server `SearchBox` for **venue search is unchanged**. Public autocomplete does not use Auth, and carrying an admin cookie cannot widen its inventory. Server validation, anonymous RPC bounds and no-store behavior are specified in [ARCHITECTURE.md](ARCHITECTURE.md).

**Admin selection:** Add City has one nationwide city combobox, a selected name/state/district summary and **Create city**. There are no mandatory state/country, slug, introduction, SEO, lifecycle or metadata inputs on this screen. The checked-in catalog contains **7,112 places across 36 represented states/territories**, not 7,112 Shagun city records. Search returns bounded name/state/district-labelled suggestions; stable source IDs remain internal in this compact view. Changing a selection searches all India again, never retaining a hidden state filter.

- Require explicit result selection and a separate create command. The server derives geography, India, an available slug and draft defaults; standard SEO remains automatic without fabricated content. Repeated names stay distinguishable by state and district. Existing city editors retain optional editorial controls, state-filtered association and manual records.
- Support arrows, Enter, Escape, visible focus, loading/errors/retry and stale-request cancellation. The combobox displays at most 12 results; narrowing is preferable to an enormous dropdown.
- Preserve GeoNames/CC BY 4.0 attribution. The server validates the selected ID and stores `metadata.geographic_source_id`; it is not an editable provenance field.
- Catalog availability, saved city lifecycle and venue publication are separate concepts. Existing editorial spellings and locked URLs are not renamed by catalog selection.

**Excel import:** a workbook supports up to 1,000 rows, within the existing byte limits. One confirmation starts bounded 100-row requests with cumulative progress and **Stop import**. Keep confirmed, skipped, unconfirmed and unattempted outcomes distinct. Stopping does not undo a server request already received; errors require inventory inspection and explicit revalidation, never blind automatic retry. Large preview/result tables scroll inside their own bounded container rather than widening the page.

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

An image that fails before hydration must still show the missing-photo fallback. `MediaPhoto` checks completed image state and `naturalWidth` without requiring `currentSrc`; healthy completed images remain visible. Keep the deterministic held-hydration failure test and healthy-image control rather than relying only on a post-hydration error event.

## Evidence boundary

Revision-scoped six-width scenario results, autocomplete/image regressions and real isolated Auth/city-cover/media workflows are recorded once in [VERIFICATION.md](VERIFICATION.md), separately from older hosted and pre-refactor runs. Passes and intentional skips are distinct; neither fixtures nor real local services certify managed production, physical devices, final-domain performance or full manual accessibility conformance.

Public delayed/error stubs use a browser-context harness boundary, not a change to application Auth. Keep focused repeats distinct from full-scenario evidence; never present an earlier empty/one run as rerun after a harness-only repair.

The original hosted Preview's non-leaking catalog 500 remains a historical finding, not an all-green smoke. New evidence must retain its exact code/environment scope. See [../README.md](../README.md) for run modes; current preview restoration is tracked only in the verification record.