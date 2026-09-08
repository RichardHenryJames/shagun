# Shagun — product and technical architecture

**Current status — 2026-09-08:** the completed `npm run check` baseline passed **692 tests in 8 files** before five new database-access tests; the expanded **697-test run is in progress, with its result pending verification**. The normal Next.js production build has a recorded pass. The default port-3000 app is **empty/unconfigured**, not live inventory. All 12 researched candidates remain unimported. Read-only Supabase inspection recognizes existing delegated Storage-policy authority but now fails **`stage=metadata-public code=22023`** in the catalog/preservation snapshot, not at a permissions gate. Database work is stopped pending review; API keys/admin access remain unavailable and initial Git commit/push is pending. Earlier **207/22 browser results are historical QA only**, with no new full matrix. See [VERIFICATION.md](VERIFICATION.md) and [DEPLOYMENT.md](DEPLOYMENT.md).

## Product judgment

The strength is an open, useful local inventory, not a transaction engine. The moat is information quality and breadth within each city. The risks are sparse inventory, stale contact details, image rights, and claiming more certainty than the research supports. Learn scannable cards and filters from accommodation search, photography from wedding directories, and transparent sourcing from editorial guides. Do not copy forced lead forms, fake reviews, or paid contact access.

Hazaribag, Jharkhand is the ONLY initial city. The later city instruction supersedes Hazipur/Hajipur. Its seed is a normal **draft** database row with **zero venues, photos or accounts**. Separately, [../data/research/hazaribag-2026-09-08.json](../data/research/hazaribag-2026-09-08.json) contains 12 source-cited real business candidates and 27 source references, not verified or exhaustive city inventory. Seven are website-led review candidates; five need source/contact follow-up. None has been imported or reviewed, and no photo rights have been obtained. Every later city is admin-created. Public discovery has no hardcoded city list or fallback to research JSON; synthetic fixtures never become launch inventory.

MVP: public discovery, city lifecycle, structured venues, open contact, authorized images, private research, verification dates, preview, admin publishing, SEO and aggregate analytics. Later: claims/owners, reviews, enquiries, availability, payments, sponsors and vendor types. Do not create these now.

## Flows

- Visitor: home → choose an active city → search/filter → detail → phone/WhatsApp. No account, cookie gate or paywall.
- Operations: login → saved city workspace → **Add researched drafts** for a matching batch, or add a manual venue with city preselected → saved draft → authorized photos → saved preview → private-source review → publish venue → explicitly activate city.
- Corrections: edit/reverify, unpublish immediately, or archive. Permanent deletion requires a matching name and an unpublished record. Cities with venues cannot be deleted accidentally.
- City progress = actual total/published/draft/recheck counts. Publication readiness is not geographic market coverage. No invented denominator or popularity claims.

## Stack decision

- Stable Next.js App Router + React + strict TypeScript 5.9.3. Node.js **24** is the local/deployment baseline; the supported engine range is `>=22.0.0 <25`. Local verification used Node **v24.15.0** / npm **11.12.1**. The existing workflow targets Node 22, but an actual hosted CI/Node 22 pass is not certified.
- Server Components by default, small client islands for forms, gallery and mobile filters.
- Tailwind v4 and a small tokenized stylesheet; self-hosted DM Sans / Cormorant Garamond. No component framework, carousel bundle or animation framework.
- Supabase managed PostgreSQL, Auth and private Storage: one operational service, RLS, SQL migrations, portable schema and objects.
- Typed supabase-js/PostgREST repository rather than adding an ORM and direct connection pool. REST calls are parameterized by PostgREST; complex queries and atomic writes use narrowly scoped PostgreSQL RPCs. No serverless connection exhaustion. Database contracts live in one module.
- Zod at server boundaries; Sharp for image decoding, metadata stripping and deterministic responsive variants.
- Vitest, PostgreSQL-compatible PGlite schema/security tests and Playwright/axe browser tests. No paid testing infrastructure.

## Shared Supabase boundary

The selected integration target is the existing BihariBhojan Supabase project `ixkhyqqovacdramymqjk`, not a new isolated production project. [../src/lib/db/schema.ts](../src/lib/db/schema.ts) defines:

| Surface | Shagun-owned contract |
| --- | --- |
| Inventory tables and application RPCs | `shagun`; all database clients explicitly use `db: { schema: "shagun" }`. |
| Private helper functions and migration ledger | `shagun_private`; never exposed through PostgREST. |
| Private media bucket | `shagun-media`; new Shagun-only policies leave unrelated bucket access unchanged. |
| Admin session cookie | `shagun-admin-auth`; a separate cookie name, not a separate managed Auth tenant. |

Runtime inventory reads and writes do not use the shared `public` tables. The explicit migration tooling reads shared metadata/fingerprints for preservation checks only. All four migration SQL files consistently target Shagun application objects; existing `public` data, Auth accounts, Storage objects, ownership, base grants and unrelated policies must remain unchanged. Do not transfer Storage ownership, revoke shared access or disable managed RLS to install Shagun.

[../scripts/db-migrate.ts](../scripts/db-migrate.ts) and [../scripts/db-migration-plan.ts](../scripts/db-migration-plan.ts) provide read-only inspection by default and a separate explicit apply mode. First installation applies all four reviewed migrations and their private checksum ledger in one transaction, with preflight, postconditions and preservation checks; the draft-city seed is an additional opt-in. The shared role already has [Supautils managed policy delegation](https://github.com/supabase/supautils#manage-policies): `storage_policy_manager=true` for `storage.objects`, despite false owner usage/membership. The updated preflight checks protected `pg_settings` context and the JSON object/array entry for the exact `current_user` and literal `storage.objects`; it does not configure new grants or trust a user-set placeholder. The earlier `MIGRATION_PRIVILEGES` denial was a resolved local-runner false positive, not a need for owner escalation.

This is not a completed managed installation. The earlier catalog-query syntax error `42601` was fixed and parsed in isolated PGlite; managed read-only inspection now gets past permissions but fails **`stage=metadata-public code=22023`** at runtime in the catalog/preservation snapshot. **`shagun_exists=false`; no apply, seed, provisioning, research import or database write occurred. Further database writes/debugging are stopped pending review.** Review/fix the snapshot guard and obtain a successful full read-only inspection before separately authorizing apply. Never force a bypass or change managed ownership, grants or RLS to clear a code blocker.

An authorized operator must append `shagun` to the **existing** exposed Data API schema list while retaining `public` and every other existing entry. Keep `shagun_private` excluded. The runner does not change API exposure or shared Auth settings. Auth configuration and service-role privileges remain project-wide; the publishable key still depends on RLS/grants. Namespace separation is not a substitute for protecting service keys or testing real-service authorization.

## Private research import

[../src/lib/actions/research.ts](../src/lib/actions/research.ts) registers the catalog server-side and reauthorizes both the workspace summary and import. [../src/lib/research-catalog.ts](../src/lib/research-catalog.ts) is a pure validator/mapper with no catalog import or I/O. A batch matches a saved city's **slug, state and country**, not a display-name conditional or a default city. Only flat summary data reaches the admin import card; provenance remains private.

**Add researched drafts** validates the full batch before writes, skips any existing `(city_id, slug)` record regardless of lifecycle, and inserts each missing venue through the atomic `save_venue` RPC. It never updates/upserts existing records. New inputs force `status: "draft"`, `verification_status: "unverified"`, `verified_at: null` and `reviewed: false`; source dates/readiness are not verification or editorial approval. Sources, caveats and website/gallery references map to private `venue_research.source_notes`, not public descriptions, city metadata or credits. No photos, city edits or activation are imported.

Each venue save is atomic; the entire batch is **not** one transaction. Interrupted imports report confirmed progress and require inspection before retry. All 12 candidates, including the five follow-up records, may be added as private drafts only after explicit authorized action. **None has been imported yet.** See [HAZARIBAG_RESEARCH.md](HAZARIBAG_RESEARCH.md) and [OPERATIONS.md](OPERATIONS.md).

## Relational model

All inventory tables below belong to `shagun`, not the shared `public` schema.

- `cities`: stable unique slug, name/state/country, description, lifecycle (draft/active/inactive/archived), SEO overrides, metadata, first activation and timestamps.
- `venues`: city FK (restrict city deletion), stable unique (city, slug), name/type/address/contact, nullable ranges and coordinates, lifecycle, verification, first publication and timestamps.
- `venue_research`: private 1:1 notes/provenance and editorial review, never exposed through a public join.
- `facilities` + `venue_facilities`: normalized extensible vocabulary and associations. Missing facility data means unrecorded, NOT a negative claim.
- `media_assets`: venue OR city ownership (XOR), immutable storage key, alt text, credit/rights note, dimensions, order and cover. Partial unique indexes guarantee one cover per owner.
- `admin_users`: allowlist referencing managed `auth.users`; no public insertion or registration. Password hashes are managed by Supabase Auth, not copied into application tables.
- `storage_cleanup_jobs`: transactional deletion outbox **and pre-upload reservations**, with `ready_at` controlling cleanup eligibility. A bounded admin operation drains ready jobs; no automatic sweeper or permanent worker is configured.
- `rate_limits`: expiring HMAC buckets, not raw IP addresses. `analytics_daily`: aggregate event counts without identifiers or raw queries.

Constraints enforce positive prices/capacities, ordered ranges, paired valid coordinates, allowed states, valid slugs and reviewed publication. Search uses a generated weighted `tsvector` with a GIN index and prefix terms; indexed city/status/date ordering and bounded pagination. All price filtering requires a price basis to avoid comparing per-plate and per-day prices. Public facets are derived from published inventory only.

## Routes and SEO

- `/`, `/cities`, `/search`, `/about`, `/privacy`
- `/city/[city]` is the canonical city discovery page.
- `/city/[city]/vivah-bhawan` permanently redirects to the canonical city route, preserving search parameters; avoids duplicate near-identical pages.
- `/city/[city]/vivah-bhawan/[venue]` is a venue's stable URL.
- `/admin/login`; authenticated `/admin`, `/admin/cities`, `/admin/cities/new`, `/admin/cities/[city]`, `/admin/cities/[city]/edit`, `/admin/venues`, `/admin/venues/new?city=...`, `/admin/venues/[id]`, `/admin/venues/[id]/preview`.
- Admin IDs are acceptable; public venue URLs never contain database IDs. Slugs and city association lock once launched/published. Never silently rename an indexed URL.
- Per-page canonical/title/description, OG/Twitter, breadcrumbs, ItemList and EventVenue JSON-LD with only actual data. No ratings, reviews or offers invented. JSON-LD is escaped for script contexts.
- Search/filter combinations are `noindex,follow`; plain paginated listings have self-canonicals. Sitemaps are partitioned, paginated, published-only and omit empty cities. Empty city pages remain usable but noindex until inventory exists. Preview environments and unconfigured builds are noindex.

## Security, privacy and consistency

Admin email/password login uses managed password hashing, verified server user lookups, a fresh active `shagun.admin_users` UUID allowlist check, HttpOnly/SameSite cookies, secure cookies on HTTPS, and durable rate limiting. Auth refresh runs only for admin paths, never polluting public cache entries. Every action/route reauthorizes; a layout or proxy alone is not authorization. Shagun has no public registration. **Do not globally disable signup/anonymous sign-ins or change shared Auth policy without assessing BihariBhojan and obtaining operator approval.** An ordinary shared-project Auth account never grants Shagun administration by itself.

RLS permits anonymous reads only for active cities AND published venues, with ownership propagated to facilities/photos. Private research, admins, rate buckets, cleanup jobs and analytics have separate policies. Public reads NEVER use the service key. Inventory mutations use the admin JWT plus RLS and explicit SQL checks. The service key is limited to server-side rate limiting, aggregate event writes, gated private-object retrieval and trusted provisioning.

Server Actions provide origin checks; explicit upload/analytics route handlers check same-origin. Existing action guards reject non-ISO check dates and enforce a UTF-8 metadata byte budget before writes. PostgreSQL remains authoritative, including its formatted JSON byte limit. No raw HTML rendering of descriptions. Error messages do not expose SQL, tokens, emails or research notes.

## Images

Private Supabase bucket `shagun-media`; no draft photo is published through a public bucket URL. Admin upload accepts one JPEG/PNG/WebP per request up to **3 MiB**, rejects animation and excessive pixel counts, rotates and strips metadata, then emits WebP variants targeting maximum widths of **480/960/1600 pixels**. Processing preserves the oriented aspect ratio and never enlarges a smaller source. Public image routes verify public ownership with anonymous RLS before download. Admin previews use a separate private no-store route. No SVG uploads, arbitrary remote URL fetches or original image proxying. Relative storage keys enable provider migration.

The fourth migration, [../supabase/migrations/0004_media_uploads.sql](../supabase/migrations/0004_media_uploads.sql), adds durable `begin_media_upload` reservations **before any Storage write**: `ready_at` is database transaction time plus **15 minutes**, not a renewable client deadline. After all three session-authorized uploads, `finalize_media_upload` atomically consumes the reservation and inserts the media row; a failed transaction retains the reservation. Expired reservations and deletion jobs cannot finalize. Cleanup uses the current admin session, selects only `ready_at <= now`, rechecks that no live media row references the root, and removes all three variants before acknowledging the job. Deletion jobs are eligible immediately. These paths have local SQL/route/action coverage; managed-provider failure testing remains a launch gate.

Responsive `picture`/`srcset`, explicit dimensions, first-image priority and below-fold lazy loading avoid double optimization costs. Public derivatives can have a short 60-second CDN cache; already-public images may persist in external caches and cannot be recalled from visitors. Draft media is never cached publicly. Remove copyrighted/sensitive media at the provider and purge caches when needed.

No real venue photos are seeded. Decorative original vector artwork is visually distinct from photography and not represented as a venue.

## Rendering and performance

Public reads are independent of user sessions. Live publication checks precede any cached venue snapshot, so unpublishing hides the page immediately; cache keys include `updated_at`. Lists use bounded indexed server queries with current public status rather than silently serving stale publication states. Cache immutable UI, content snapshots and responsive derivatives; invalidate inventory tags after admin writes. Never put admin previews or session responses into ISR. This prioritizes correct privacy over indiscriminate full-page caching.

Canonical city and venue routes resolve availability in blocking `generateMetadata()` before body streaming. [../next.config.ts](../next.config.ts) disables metadata streaming for all user agents with `htmlLimitedBots: /.*/`, and these routes have **no ancestor loading boundary**. This lets `notFound()` produce a true HTTP **404**, rather than a streamed 200 with not-found content. The root loading boundary was deliberately removed: the initial response can wait for the lookup instead of showing an immediate skeleton. Route skeletons remain only under `/cities`, `/search` and `/admin`.

12 results per public page; bounded query length, pages and facet values. Shared query repository prevents duplicated fetch logic. React request memoization deduplicates metadata/page reads. No Elasticsearch, maps SDK, cron, realtime subscription, payment SDK or public Auth client bundle.

## Deployment and cost

Vercel Node runtime + the selected shared Supabase project. No container or always-on app server. Vercel already imports the correct GitHub repository but has **No Production Deployment**. The remote was last observed empty and current work is uncommitted; initial commit/push is pending. Git Credential Manager already has `RichardHenryJames` configured; the separate `gh` CLI account's `push=false` does not rule out a successful authenticated Git push with that owner credential. Supabase API keys and a real admin account remain unavailable. The snapshot code blocker must be reviewed/fixed, and all **four ordered SQL migrations** must pass full read-only inspection and be explicitly authorized for atomic application before the optional draft-city seed and release; builds NEVER seed or reset a database. Keep staging separate from the shared live project, and do not connect preview deployments to production data for editing.

The current default local task serves the normal build on localhost:3000 with fixtures off and no Shagun API configuration. The supplied manual check of four normal routes found no synthetic/test strings; standard public pages remain empty preparation-state pages, not live Hazaribag data. The old demo on localhost:3100 is stopped; QA scripts still use that port only for explicitly labelled, isolated fixtures with all existing guards intact.

**Recorded planning estimates, not a fresh independent vendor check:** Supabase Free was recorded at 500 MB database, 1 GB storage, 5 GB egress and 5 GB cached egress, with inactivity pausing, no automatic backups and no included image transformations. Supabase Pro was recorded from $25/month. Vercel Hobby was recorded as non-commercial personal use only, with Pro developer seats at $20/month plus usage/taxes. Verify current vendor pricing, quotas, terms and regional availability before choosing an appropriate commercial plan. A domain, backups and growing image bandwidth are additional costs. No paid plan is enabled by this code.

## Principal launch risks

1. Insufficient reviewed venues: keep the city draft until useful, never compensate with fabricated inventory.
2. Stale data: recheck queue at 90 days; verification is a dated check, not an endorsement.
3. Image rights/privacy: retain provenance, strip EXIF, upload only with permission.
4. Free-tier pauses, quotas and lack of backups: export database AND objects; rehearse restore.
5. Incorrect shared Supabase policies/config: retain the existing managed policy delegation and preservation guards, fix the snapshot blocker before apply, preserve ownership/grants/RLS, review shared Auth impact, provision the Shagun allowlist out-of-band and probe anonymous/ordinary-user REST/Storage before launch. No owner escalation is indicated by the current diagnostics.
6. Database credentials and delegated policy capability are not API keys or a real admin session; those remain unavailable. Git commit/push through the configured owner credential is pending, not proven impossible. Local tests cannot certify a deployment, complete city coverage or current contacts.