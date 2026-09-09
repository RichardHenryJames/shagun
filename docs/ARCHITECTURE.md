# Shagun — product and technical architecture

**As of 2026-09-09:** all five migrations and the draft seed are installed in the approved shared Supabase project. Real local-service workflows passed, but confirmed critical sibling API exposure, missing Shagun API exposure, no approved production admin and no reviewed inventory block production promotion. Source publication is review-branch-only. Current counts and pending results belong in [VERIFICATION.md](VERIFICATION.md).

## Product judgment

Shagun is an open editorial directory, not a transaction engine. Prioritize useful local information, transparent uncertainty and direct contact. No booking, payment, availability, public registration, ratings or paid contact access.

Hazaribag, Jharkhand is the only seeded city: a normal **draft** row with no venues, photos or accounts. The separate source-cited research batch is not a public fallback or automatic import. Later cities are admin-created. Catalog availability, city lifecycle, venue publication and information verification are distinct; none implies complete geographic coverage.

The implemented scope is discovery, structured inventory, authorized images, private research, saved previews, editorial publishing, SEO and optional aggregate analytics. Do not infer a marketplace or owner-claim system from this foundation.

## Flows

- Visitor: home → choose an active city → search/filter → detail → phone/WhatsApp. No account, cookie gate or paywall.
- Operations: login → saved city workspace → **Add researched drafts** for a matching batch, or add a manual venue with city preselected → saved draft → authorized photos → saved preview → private-source review → publish venue → explicitly activate city.
- Corrections: edit/reverify, unpublish immediately, or archive. Permanent deletion requires a matching name and an unpublished record. Cities with venues cannot be deleted accidentally.
- City progress = actual total/published/draft/recheck counts. Publication readiness is not geographic market coverage. No invented denominator or popularity claims.

## Stack decision

- Next.js **16.3.3** App Router, React and strict TypeScript **5.9.3**. Node **24** is the local/deployment baseline; the engine range is `>=22.0.0 <25`. Install locked dependencies, not floating replacements.
- Server Components by default, small client islands for forms, gallery and mobile filters.
- Tailwind v4 and a small tokenized stylesheet; self-hosted DM Sans / Cormorant Garamond. No component framework, carousel bundle or animation framework.
- Supabase managed PostgreSQL, Auth and private Storage: one operational service, RLS, SQL migrations, portable schema and objects.
- Typed supabase-js/PostgREST clients rather than an additional ORM/direct application connection pool. Complex queries and atomic writes use narrowly scoped PostgreSQL RPCs. This avoids an application-managed pool, not all provider capacity limits.
- Zod at server boundaries; Sharp for image decoding, metadata stripping and deterministic responsive variants.
- Vitest/PGlite, public Playwright/axe fixtures and a separate real local Supabase integration stack. Supabase CLI **2.116.0** and Docker are development tooling, not extra paid deployment services.

## Shared Supabase boundary

The selected integration target is the existing BihariBhojan Supabase project `ixkhyqqovacdramymqjk`, not a new isolated production project. [../src/lib/db/schema.ts](../src/lib/db/schema.ts) defines:

| Surface | Shagun-owned contract |
| --- | --- |
| Inventory tables and application RPCs | `shagun`; all database clients explicitly use `db: { schema: "shagun" }`. |
| Private helper functions and migration ledger | `shagun_private`; never exposed through PostgREST. |
| Private media bucket | `shagun-media`; new Shagun-only policies leave unrelated bucket access unchanged. |
| Admin session cookie | `shagun-admin-auth`; a separate cookie name, not a separate managed Auth tenant. |

Runtime inventory never reads or writes BihariBhojan's shared `public` tables. The explicit migration tooling reads their metadata/fingerprints for preservation checks only. All **five** migrations target Shagun application objects and narrowly scoped Storage additions. Existing data, ownership, base grants, managed RLS and unrelated policies remain protected.

[../scripts/db-migrate.ts](../scripts/db-migrate.ts) defaults to read-only inspection. Explicit apply uses one repeatable-read transaction for the advisory lock, preflight, pending reviewed SQL, private checksum ledger, optional draft seed, postconditions and preservation checks. There is no build hook, force/reset/adoption mode or automatic retry. An ambiguous commit requires ledger inspection before retrying.

The empty-ACL snapshot error is **fixed**, and guarded `--apply --seed` completed on the real shared project. Preflight recognizes existing protected Supautils delegation on `storage.objects`; no ownership escalation or base-permission change was needed. All seven preservation checks passed, subject to the exact exclusions and snapshot limits documented in [VERIFICATION.md](VERIFICATION.md).

SQL installation does not configure hosted Data API exposure: the zero-row `shagun` city probe returned **406 / PGRST106 (invalid schema)**. An authenticated, authorized operator must inspect the existing list, append `shagun`, preserve every other entry and exclude `shagun_private`. Shared Auth settings and service-key privileges remain project-wide.

**The preserved baseline has a confirmed critical exposure:** anonymous zero-row `HEAD` requests for existing BihariBhojan `public.Order` and `public.ContactMessage` returned **200**, corroborating SQL SELECT grants with RLS disabled. No customer rows were retrieved. This is not a Shagun-induced permission change or a hypothetical reachability issue. Only separately authorized shared/BihariBhojan owners may remediate sibling permissions/RLS; no automatic migration, API-list replacement or production promotion is acceptable. See [AUDIT.md](AUDIT.md).

## City catalog and saved discovery preview

The checked-in GeoNames snapshot has **7,112 Indian populated places and 36 represented states/territories**, with CC BY 4.0 attribution. It is server-only selection data, not inventory, a census or an exhaustive place list. The authenticated catalog API returns bounded matches and source-derived state options; the browser never receives the entire snapshot. See [../data/geography/README.md](../data/geography/README.md).

The admin combobox supports state filtering, explicit selection and manual entry. `saveCityAction` looks up the selected ID, validates state/India and stores the reserved scalar `metadata.geographic_source_id`. It preserves saved associations and launched URLs rather than trusting posted labels or free metadata. A missing retired source does not silently detach an existing record. The public selector remains native GET search over active city inventory, **24 per page**.

Protected `/admin/cities/[slug]/preview` and public discovery share `CityDiscovery` in [../src/components/public/city-discovery.tsx](../src/components/public/city-discovery.tsx). Each route owns its authorization/data boundary; the component performs no queries, analytics or metadata generation.

Migration [../supabase/migrations/0005_city_preview.sql](../supabase/migrations/0005_city_preview.sql) supplies `preview_city_venues` and `preview_city_facets`. Both RPCs and their private `city_preview_inventory` helper are security invokers with execution granted **only to `authenticated`**, not SQL `PUBLIC`, `anon` or `service_role`; each requires active admin authorization and a city ID. They include only that city's saved draft/published venues, without requiring an active city; unpublished/archived venues stay excluded. Filters, exact totals and 12-item pages are computed in SQL; facets span all eligible city inventory, not a truncated admin page. Preview response validation strips unexpected/private fields. Links and photos remain authenticated, no-store and noindex, without canonical, JSON-LD or analytics output.

## Private research import

[../src/lib/actions/research.ts](../src/lib/actions/research.ts) reauthorizes summaries/imports and matches a batch to a saved city's **slug, state and country**. The pure validator in [../src/lib/research-catalog.ts](../src/lib/research-catalog.ts) checks the whole batch before writes.

**Add researched drafts** skips existing `(city_id, slug)` records in every lifecycle and inserts missing venues through `save_venue`. It never upserts edits, imports photos or activates a city. Inputs force draft/unverified/unreviewed state and a null verification date. Provenance and caveats enter private `venue_research.source_notes`, not public descriptions, metadata or credits.

Each venue save is atomic; the batch is not. Inspect confirmed partial progress before retry. The prepared Hazaribag batch remains unimported; human review and image rights are not supplied by source-page dates or readiness flags. Follow [OPERATIONS.md](OPERATIONS.md).

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
- `/admin/login`; authenticated `/admin`, city workspaces/add/edit/preview under `/admin/cities`, and venue add/edit/preview under `/admin/venues`. City route parameters are slugs; venue parameters are saved UUIDs. `/admin/venues/new?city=...` preselects a saved city UUID.
- Admin IDs are acceptable; public venue URLs never contain database IDs. Slugs and city association lock once launched/published. Never silently rename an indexed URL.
- Per-page canonical/title/description, OG/Twitter, breadcrumbs, ItemList and EventVenue JSON-LD with only actual data. No ratings, reviews or offers invented. JSON-LD is escaped for script contexts.
- Search/filter combinations are `noindex,follow`; plain paginated listings have self-canonicals. Sitemaps are partitioned, paginated, published-only and omit empty cities. Empty city pages remain usable but noindex until inventory exists. Preview environments and unconfigured builds are noindex.

**Request-time sitemaps:** [../src/lib/sitemaps.ts](../src/lib/sitemaps.ts) supplies the dynamic Node handlers in [../src/app/sitemap.xml/route.ts](../src/app/sitemap.xml/route.ts) and [../src/app/sitemap/[partition]/route.ts](../src/app/sitemap/[partition]/route.ts). These replace build-time `generateSitemaps` enumeration: sitemap generation performs no build-time database fetch, `/sitemap/0.xml` remains stable, and the index discovers new partitions from current eligible inventory at request time.

Non-indexable environments, including localhost HTTP, return **404** for sitemaps; malformed or out-of-range partition names also return 404. Invalid counts/rows, private paths, limit violations and service failures fail closed with a sanitized **503**, `no-store`, `noindex` and `Retry-After: 60`. Successful XML is escaped and no-store. Async [../src/app/robots.ts](../src/app/robots.ts) makes **no database query** and advertises **only `/sitemap.xml`**, not every partition, when indexing is enabled. Nineteen request-time tests cover these contracts; they are not managed HTTPS acceptance.

## Security, privacy and consistency

Admin email/password login uses managed password hashing, verified server user lookups, the active `shagun.admin_users` UUID allowlist, HttpOnly/SameSite cookies, secure cookies on HTTPS and durable rate limiting. Auth refresh runs only on admin paths. `getAdminContext` memoizes within a request, not across sessions; every mutation/private endpoint independently reauthorizes. A layout, proxy or ordinary shared-project account alone never grants administration. Shagun has no public registration. **Do not change shared Auth settings without assessing BihariBhojan and obtaining operator approval.**

RLS permits public inventory reads only for active cities and their published venues, with eligibility propagated to facilities/photos. Private research and operational tables have separate grants/policies. Public inventory uses an anonymous client; mutations use the admin JWT plus RLS/SQL checks. The service key is confined to server-side limiting, aggregate events, gated object retrieval and trusted provisioning.

`configReadiness` separates public configuration from admin readiness and checks origin, known key-role mix-ups, server key, limiter secret and host support without reporting values. It does not verify key authenticity or provider availability. Durable limits use HMAC buckets and fail closed. Vercel's sanitized IP header is supported; the common `local` fingerprint is loopback-HTTP-only. A non-Vercel real host is **blocked**, not silently treated as local or ready.

Server Actions provide origin checks; explicit upload/analytics route handlers check same-origin. Existing action guards reject non-ISO check dates and enforce a UTF-8 metadata byte budget before writes. PostgreSQL remains authoritative, including its formatted JSON byte limit. No raw HTML rendering of descriptions. Error messages do not expose SQL, tokens, emails or research notes.

## Images

Private Supabase bucket `shagun-media`; no draft photo is published through a public bucket URL. Admin upload accepts one JPEG/PNG/WebP per request up to **3 MiB**, rejects animation and excessive pixel counts, rotates and strips metadata, then emits WebP variants targeting maximum widths of **480/960/1600 pixels**. Processing preserves the oriented aspect ratio and never enlarges a smaller source. Public image routes verify public ownership with anonymous RLS before download. Admin previews use a separate private no-store route. No SVG uploads, arbitrary remote URL fetches or original image proxying. Relative storage keys enable provider migration.

Migration [../supabase/migrations/0004_media_uploads.sql](../supabase/migrations/0004_media_uploads.sql) reserves durable cleanup **before any Storage write**. `ready_at` is database transaction time plus **15 minutes**, not a renewable client deadline. After three session-authorized uploads, `finalize_media_upload` atomically consumes the reservation and inserts the media row; failure retains cleanup work. Wall-time checks after locking reject expired reservations and deletion jobs. Cleanup selects ready, unreferenced roots and removes all three variants before acknowledgement; deletion jobs are ready immediately. Local SQL tests and real local Storage workflows cover these paths, but managed-provider faults/concurrency still require separate evidence.

Responsive `picture`/`srcset`, explicit dimensions, first-image priority and below-fold lazy loading avoid double optimization costs. Public derivatives can have a short 60-second CDN cache; already-public images may persist in external caches and cannot be recalled from visitors. Draft media is never cached publicly. Remove copyrighted/sensitive media at the provider and purge caches when needed.

No real venue photos are seeded. Decorative original vector artwork is visually distinct from photography and not represented as a venue.

## Rendering and performance

Public reads are independent of user sessions. Live publication checks precede any cached venue snapshot, so fresh page requests honor unpublishing; cache keys include `updated_at`. Lists use bounded indexed server queries with current public status rather than silently serving stale publication states. Cache immutable UI, content snapshots and responsive derivatives; invalidate inventory tags after admin writes. Never put admin previews or session responses into ISR. This prioritizes correct privacy over indiscriminate full-page caching.

Canonical city and venue routes resolve availability in blocking `generateMetadata()` before body streaming. [../next.config.ts](../next.config.ts) disables metadata streaming for all user agents with `htmlLimitedBots: /.*/`, and these routes have **no ancestor loading boundary**. This lets `notFound()` produce a true HTTP **404**, rather than a streamed 200 with not-found content. The root loading boundary was deliberately removed: the initial response can wait for the lookup instead of showing an immediate skeleton. Route skeletons remain only under `/cities`, `/search` and `/admin`.

12 venues per result page and 24 cities per directory page; bounded query length, pages and facet values. Shared query repository prevents duplicated fetch logic. React request memoization deduplicates metadata/page reads. No Elasticsearch, maps SDK, cron, realtime subscription, payment SDK or public Auth client bundle.

## Deployment and cost

Deployment uses Vercel's **Node runtime** and the approved shared Supabase project; no container or always-on application worker is required. Docker hosts only the isolated local/CI integration stack. Production settings are saved, and the final normal `npm run build` **passed with fixtures false**, dynamic request-time sitemaps and **no database queries during compilation**. Builds never migrate, seed or provision users. Managed/hosted acceptance remains open; the planned `audit/second-pass-2026-09-09` review branch is not yet pushed. Do not promote production or force launch around the shared-security gate.

The **3/3 real local-service workflow pass preceded the sitemap refactor**; the new SEO behavior has unit/public-test coverage afterward, not a rerun of authenticated or managed acceptance. Exact results are in [VERIFICATION.md](VERIFICATION.md).

Keep three local modes distinct: normal/no-database preview on 3000, labelled database-free fixtures on 3100, and real local Supabase integration with Next on 3200. Normal preview restoration is being checked; port-3000 availability is not yet confirmed. The local Auth provider configuration is intentionally test-owned, not a shared Auth policy template. Exact commands, origins and process ownership are in [../README.md](../README.md). Release gates and **historical planning estimates, not fresh prices**, are in [DEPLOYMENT.md](DEPLOYMENT.md).

## Principal launch risks

1. **Critical confirmed shared Order/ContactMessage exposure:** obtain separate owner authorization for remediation; preservation success does not establish a secure baseline.
2. Shagun is missing from the hosted API schema list, the dashboard session expired and no approved real admin identity is available. Finish operator gates without changing sibling access as a side effect.
3. No reviewed inventory or authorized photos: keep the city draft; never fill gaps with fabricated facts. Recheck stale information after 90 days without presenting verification as endorsement.
4. Incomplete recovery coverage: the pre-install public-schema scratch restore is not a current Shagun backup and did not restore managed Auth/settings, object bytes, roles or original ownership/ACLs.
5. Final-domain behavior and operational capacity remain unverified: local passes do not certify HTTPS cookies, CDN recall, concurrency, pricing, quotas or managed availability. See [AUDIT.md](AUDIT.md).