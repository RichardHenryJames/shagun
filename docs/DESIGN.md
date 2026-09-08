# Shagun — interface system and screen plan

## Visual direction

Public: warm paper (#faf7f2), ink/plum (#432c3d), muted green (#54675a), clay accents, fine rules, editorial serif headings and a highly readable sans-serif. Restrained 8px spacing rhythm; modest 6–12px radii; no fake stars, testimonial faces, counters, awards, garish gradients or dashboard styling. Decorative arch/celebration artwork is not a venue photo.

Admin: neutral surfaces, compact tables and clear status chips; keyboard-first labeled inputs, section anchors and a sticky save/preview action bar. Same accessibility baseline, separate visual hierarchy.

## Public screens

- Home: confident wedding-focused headline, city discovery search, active-city links, real recently published inventory only, a three-step explanation, transparent listing standards and a quiet footer. If no city is active, show an intentional launch preparation state, not imaginary recommendations.
- Cities: searchable database-driven city directory with state and actual published count; no invented popularity. No results → reset/search guidance.
- City: breadcrumbs, heading/short editable intro/count, inline name/locality search, desktop sidebar and accessible mobile bottom sheet, chips, coherent price basis, sort, 12-card grid, numbered navigation. Hide facets without positive data. Distinguish an empty inventory from a filtered-out result.
- Venue: breadcrumbs/name/location, responsive mosaic and swipeable mobile strip, native modal full-screen gallery (focus/escape/arrow keys), recorded facilities, description, address, dated check status, transparent pricing basis. Desktop contact panel/mobile sticky phone+WhatsApp; unavailable contact gets useful guidance, not dead buttons. Missing images get a labeled graphic, not fabricated photographs.
- Search: venue name/locality/city search, noindex and shareable URL state.
- About/privacy: manual listing/review standards, no booking promises, correction contact only when configured, aggregate analytics explained.
- 404/error: navigable recovery, matching public shell, no internal error information. Canonical city/venue availability is checked in blocking metadata without an ancestor loading boundary, so missing or hidden records return a true HTTP 404 before body streaming.
- Loading: skeletons exist only for `/cities`, `/search` and `/admin`. The root loading boundary was deliberately removed to protect canonical 404 status; city/venue navigation can wait for its lookup rather than immediately showing a skeleton. Request-memoized reads avoid duplicating metadata/page work.

## Admin screens

- Login: email/password, no signup/reset workflow promising unavailable mail, setup notice if services are unconfigured, accessible inline errors.
- Dashboard: actual counts, city workspaces, review queue and recent additions; no pseudo coverage percentage.
- Cities: status/search, add city and workspace links. Add/edit form has name/state/country, stable slug, short intro, SEO and lifecycle. Covers are managed after first save.
- City workspace: scoped counts, city controls, search/status-filtered table, preassociated add-venue CTA, edit and authenticated preview links, readiness guidance.
- All venues: bounded searchable cross-city operations table, linking back to workspaces; city-scoped entry remains the primary flow.
- Add/edit venue: basic/contact/details/location/research/SEO/publishing sections. Only essential fields required for drafts. Facilities indicate positive known facts, not assumed booleans. Source notes are private. Unpublished vs unverified are visibly distinct.
- Photo manager: one at a time bounded multiple upload, readable progress/errors, preview, alt text and rights credit, move up/down keyboard controls, cover selection and removal. Saves against a real venue ID; no orphan uploads before first save.
- Preview: same public detail component inside a clearly marked, authenticated noindex/no-store preview; never an unsigned query-parameter bypass.
- Archive/delete: archive preferred, explicit name confirmation for permanent deletion; cannot delete published venues or a city containing venues. Queue failed object cleanup for retry.

## Interaction/accessibility contract

44px primary touch targets, visible focus, one h1, semantic landmarks, skip navigation, explicit form labels, linked inline errors/live feedback, dialog focus management and escape. Avoid hover-only controls and motion-dependent information. `prefers-reduced-motion` honored. Native GET search/filter forms work without JavaScript; client JS enhances mobile dialogs and image interaction only.

Photo processing preserves the oriented aspect ratio at target maximum widths of 480, 960 and 1600 pixels, without enlarging smaller sources. Those variant labels are not a promise that every stored image has that exact width.

## QA matrix

**Recorded on 2026-09-08:** the `many` scenario passed at all six Chromium viewports, **320, 375, 390, 414, 768 and 1440 px**: **166 passed, 1 intentional skip**. Desktop contributed **76 passed / 1 skipped**; the other widths contributed **90 passed / 0 skipped** (390 px: 38; each of 320/375/414/768 px: 13). The desktop skip is the mobile-only filter drawer, because desktop uses the persistent panel.

Separate 390 px runs covered `empty` (**17 passed / 12 scenario-inapplicable skips**) and `one` (**24 passed / 9 scenario-inapplicable skips**). Total: **207 passed, 22 intentional skips; no failing assertions remain in the recorded runs**. Empty/one were not run at every width. Responsive checks run at every configured width; interaction and axe checks run at 390/1440 px, and HTTP checks run once at 1440 px.

The browser evidence covers honest empty/missing-data states, filters and coherent price sorting, pagination, loaded synthetic diagrams and missing-image fallback, gallery arrows, modal Tab/Shift+Tab containment, Escape and exact-opener focus restoration. Key public routes and the unconfigured admin login pass the configured axe WCAG checks. Missing/invalid city and venue routes are asserted to return **actual HTTP 404**, not merely not-found content inside a 200 response. Anonymous admin redirects and direct media endpoint denials exercise the real local route boundaries without a demo authentication bypass.

See [VERIFICATION.md](VERIFICATION.md) for evidence, test-layer boundaries and the separately reserved local visual/performance record, and [../README.md](../README.md) for the running localhost:3100 preview task. These are Chromium automation results, not Safari/WebKit/Firefox, physical-device, screen-reader or complete accessibility certification. SQL RLS tests use in-memory PGlite managed-schema stubs; real Supabase Auth/Storage, authenticated editorial workflows and final-domain mobile/accessibility/performance acceptance remain managed deployment requirements.