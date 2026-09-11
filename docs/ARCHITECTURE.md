# Shagun — product and technical architecture

**As of 2026-09-09:** all five migrations and the draft seed are installed in the approved shared Supabase project; public city autocomplete is implemented. Shared-security, API, private-admin provisioning and editorial gates still block production. Current and historical test/publication evidence, operator confirmations and local process state belong in [VERIFICATION.md](VERIFICATION.md). Publication remains review-branch-only; autocomplete does not authorize SQL or shared-setting changes.

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

The empty-ACL snapshot error is **fixed**, and guarded `--apply --seed` completed on the real shared project. Preflight recognizes existing protected Supautils delegation on `storage.objects`; no ownership escalation or base-permission change was needed. Historical preservation results, exact exclusions and snapshot limits are documented in [VERIFICATION.md](VERIFICATION.md).

SQL installation does not establish hosted Data API readiness. Current exposure/sign-in evidence and historical probes are recorded only in [VERIFICATION.md](VERIFICATION.md); older HTTP failures must not be presented as fresh results. An authenticated, authorized operator must inspect the actual list, append `shagun` **only if absent**, preserve every other entry and exclude `shagun_private`. Shared Auth settings and service-key privileges remain project-wide.

**The preserved baseline has a confirmed critical exposure:** the historical zero-row probes and SQL SELECT-grant/RLS evidence for BihariBhojan `public.Order` and `public.ContactMessage` are in [VERIFICATION.md](VERIFICATION.md). No customer-row retrieval is needed to demonstrate impact. This is not a Shagun-induced permission change or a hypothetical reachability issue. Only separately authorized shared/BihariBhojan owners may remediate sibling permissions/RLS; no automatic migration, API-list replacement or production promotion is acceptable. See [AUDIT.md](AUDIT.md).

## Public city autocomplete

Home and `/cities` progressively enhance the native GET city search; the full directory remains **24 cities per page** and usable without JavaScript. The existing server `SearchBox` for venue search is unchanged.

- `GET /api/cities/suggestions` accepts **only `q`**, validates its **raw maximum length of 100** and rejects control characters. It calls `public_cities` through an **anonymous client**, with **page 1, limit 8 and a 5-second timeout**.
- The safe response projects **only `name`, `slug` and `state`**, at most **8 suggestions**, with **`Cache-Control: no-store`**. Request fetches are also no-store. No IDs, counts, metadata or private fields enter the suggestion projection.
- Eligibility is current active public-city inventory, matching `/cities`: an already active city remains discoverable even when its published venues become empty. Do not add a nonempty-venue requirement or let an admin cookie widen visibility. There is no Auth lookup, private GeoNames/catalog read or research fallback on this path.
- The client uses a **250 ms debounce**, **8-second timeout**, abort and stale-response protection. Every edit, including trailing edits, invalidates old work; Escape, blur and unmount cancel/dismiss pending suggestions without late responses reopening them.
- Name/state-labelled listbox options support arrows, Enter, pointer and touch. Empty results and errors are distinct, with retry and the native GET fallback retained. Interaction details are in [DESIGN.md](DESIGN.md).

## City catalog and saved discovery preview

The checked-in GeoNames snapshot has **7,112 Indian populated places and 36 represented states/territories**, with CC BY 4.0 attribution. It is server-only selection data, not inventory, a census or an exhaustive place list. The authenticated catalog API returns bounded matches and source-derived state options; the browser never receives the entire snapshot. See [../data/geography/README.md](../data/geography/README.md).

For unconfigured `/api/admin/city-catalog` requests, `isConfigured` now guards **before client construction**: a missing Supabase URL/public key returns sanitized **503**, private/no-store and noindex, with no catalog data. Configured requests retain fresh managed Auth and active-UUID allowlist checks. The actual original Preview 500 and subsequent local guard verification are recorded in [VERIFICATION.md](VERIFICATION.md).

New-city creation uses a single nationwide combobox. `createCatalogCityAction` accepts only the selected catalog ID after fresh authorization, derives the name/state/India and an available slug, and saves a normal draft through `save_city`. It leaves introduction/SEO overrides null so existing factual page defaults apply without invented content. Already-associated workspaces and matching unassociated source aliases open without overwriting edits; occupied slugs use bounded state/source-ID suffix candidates. Selection alone makes no write, and creating a city never activates it.

The existing saved-city editor retains state filtering and deliberate manual entry for unassociated records. `saveCityAction` looks up the selected ID, validates state/India and stores the reserved scalar `metadata.geographic_source_id`. It preserves saved associations and launched URLs rather than trusting posted labels or free metadata. A missing retired source does not silently detach an existing record. This private geographic selection aid is separate from the public inventory-only autocomplete above.

Protected `/admin/cities/[slug]/preview` and public discovery share `CityDiscovery` in [../src/components/public/city-discovery.tsx](../src/components/public/city-discovery.tsx). Each route owns its authorization/data boundary; the component performs no queries, analytics or metadata generation.

Migration [../supabase/migrations/0005_city_preview.sql](../supabase/migrations/0005_city_preview.sql) supplies `preview_city_venues` and `preview_city_facets`. Both RPCs and their private `city_preview_inventory` helper are security invokers with execution granted **only to `authenticated`**, not SQL `PUBLIC`, `anon` or `service_role`; each requires active admin authorization and a city ID. They include only that city's saved draft/published venues, without requiring an active city; unpublished/archived venues stay excluded. Filters, exact totals and 12-item pages are computed in SQL; facets span all eligible city inventory, not a truncated admin page. Preview response validation strips unexpected/private fields. Links and photos remain authenticated, no-store and noindex, without canonical, JSON-LD or analytics output.

## Private research import

[../src/lib/actions/research.ts](../src/lib/actions/research.ts) reauthorizes summaries/imports and matches a batch to a saved city's **slug, state and country**. The pure validator in [../src/lib/research-catalog.ts](../src/lib/research-catalog.ts) checks the whole batch before writes.

**Add researched drafts** skips existing `(city_id, slug)` records in every lifecycle and inserts missing venues through `save_venue`. It never upserts edits, imports photos or activates a city. Inputs force draft/unverified/unreviewed state and a null verification date. Provenance and caveats enter private `venue_research.source_notes`, not public descriptions, metadata or credits.

Each venue save is atomic; the batch is not. Inspect confirmed partial progress before retry. Current Hazaribag import/review status belongs in [VERIFICATION.md](VERIFICATION.md); human review and image rights are not supplied by source-page dates or readiness flags. Follow [OPERATIONS.md](OPERATIONS.md).

## City-scoped Excel import

The saved workspace links to `/admin/cities/[slug]/import`. [../src/app/api/admin/venue-import/route.ts](../src/app/api/admin/venue-import/route.ts) serves the blank template and handles separate validation/import requests. Configuration is checked before client construction; every request freshly checks managed Auth and the active UUID allowlist, reloads the saved city and applies durable per-admin rate limits. POST also requires same-origin and bounded multipart input. All responses are private/no-store and noindex.

- [../src/lib/venue-import.ts](../src/lib/venue-import.ts) defines the 29-field contract and validates through the existing `venueSchema`. It rejects unknown and lifecycle/identity/photo columns, forces draft/unverified/unreviewed state and a null check date, and binds rows to the server-selected city. Private notes never enter the preview/report projection.
- [../src/lib/venue-import-workbook.ts](../src/lib/venue-import-workbook.ts) uses server-only ExcelJS with an fflate ZIP preflight. Input is at most **2 MiB**; streaming decompression enforces **8 MiB actual expanded bytes** and **128 entries**, with only bounded plain OOXML parts accepted. Macros, embedded files/images, external workbook parts, unsafe paths, XML entities, formulas, hidden populated cells and unsupported sheets are rejected. Hyperlink display text is read without fetching its target. Only `Venues` and optional `Fields` sheets are accepted, with at most **1,000 populated rows** through Excel row **1001**, and bounded error reporting.
- Validation completes for the entire workbook before any save. A SHA-256 digest binds the confirmation to the actual file bytes and saved city; it is not an authorization token, and import revalidates both input and authorization. A valid preview alone makes no inventory write.
- Import looks up matching `(city_id, slug)` records in every lifecycle and skips them, with at most **50 slugs per lookup** to bound REST URLs. New rows use the existing atomic `save_venue` RPC with null ID/expected version, never direct inserts, updates or upserts. A concurrent uniqueness conflict is a skip. No new migration, city activation, publication or Storage write is involved.
- One explicit confirmation advances through at most **ten sequential requests of 100 rows**. Every request reauthorizes, reloads the city, binds the same workbook digest and validates the entire workbook before saving its offset range. Validation has no offset; import accepts only bounded multiples of 100. Durable per-admin limits permit 40 workbook requests and 30 import requests per minute, not unlimited background work.
- Each request retains a **35-second save-loop deadline**, **8-second RPC abort** and **60-second route runtime bound**. The client merges only matching city/digest/row-identity/offset results, computes cumulative confirmed counts, and continues only after a successful batch response. **Stop import**, network errors or unmount cancel continuation; they cannot roll back a server request already in flight. Confirmed progress is retained, ambiguous rows remain unconfirmed and automatic retries are forbidden. Inspect inventory before explicit revalidation/retry; existing notes and exact optimistic timestamps remain untouched.

The client has distinct validation errors, explicit draft confirmation and saved-result links, with bounded tables, accessible feedback and request cancellation. It recovers an already selected DOM file when hydration attaches so an early selection is not lost. Workbooks remain in memory, not retained in private Storage. The operator workflow and data-entry rules are in [OPERATIONS.md](OPERATIONS.md#excel-imports-for-a-saved-city); revision-scoped evidence belongs only in [VERIFICATION.md](VERIFICATION.md).

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
- `GET /api/cities/suggestions` is the bounded, anonymous, no-store public-city suggestion endpoint, not the admin catalog.
- `/city/[city]` is the canonical city discovery page.
- `/city/[city]/vivah-bhawan` permanently redirects to the canonical city route, preserving search parameters; avoids duplicate near-identical pages.
- `/city/[city]/vivah-bhawan/[venue]` is a venue's stable URL.
- `/admin/login`; authenticated `/admin`, city workspaces/add/edit/preview under `/admin/cities`, and venue add/edit/preview under `/admin/venues`. City route parameters are slugs; venue parameters are saved UUIDs. `/admin/venues/new?city=...` preselects a saved city UUID.
- Admin IDs are acceptable; public venue URLs never contain database IDs. Slugs and city association lock once launched/published. Never silently rename an indexed URL.
- Per-page canonical/title/description, OG/Twitter, breadcrumbs, ItemList and EventVenue JSON-LD with only actual data. No ratings, reviews or offers invented. JSON-LD is escaped for script contexts.
- Search/filter combinations are `noindex,follow`; plain paginated listings have self-canonicals. Sitemaps are partitioned, paginated, published-only and omit empty cities. Empty city pages remain usable but noindex until inventory exists. Preview environments and unconfigured builds are noindex.

**Request-time sitemaps:** [../src/lib/sitemaps.ts](../src/lib/sitemaps.ts) supplies the dynamic Node handlers in [../src/app/sitemap.xml/route.ts](../src/app/sitemap.xml/route.ts) and [../src/app/sitemap/[partition]/route.ts](../src/app/sitemap/[partition]/route.ts). These replace build-time `generateSitemaps` enumeration: sitemap generation performs no build-time database fetch, `/sitemap/0.xml` remains stable, and the index discovers new partitions from current eligible inventory at request time.

Non-indexable environments, including localhost HTTP, return **404** for sitemaps; malformed or out-of-range partition names also return 404. Invalid counts/rows, private paths, limit violations and service failures fail closed with a sanitized **503**, `no-store`, `noindex` and `Retry-After: 60`. Successful XML is escaped and no-store. Async [../src/app/robots.ts](../src/app/robots.ts) makes **no database query** and advertises **only `/sitemap.xml`**, not every partition, when indexing is enabled. Request-time regression results are recorded in [VERIFICATION.md](VERIFICATION.md); those contracts are not managed HTTPS acceptance.

## Security, privacy and consistency

Admin email/password login uses managed password hashing, verified server user lookups, the active `shagun.admin_users` UUID allowlist, HttpOnly/SameSite cookies, secure cookies on HTTPS and durable rate limiting. Auth refresh runs only on admin paths. `getAdminContext` memoizes within a request, not across sessions; every mutation/private endpoint independently reauthorizes. A layout, proxy or ordinary shared-project account alone never grants administration. Shagun has no public registration. **Do not change shared Auth settings without assessing BihariBhojan and obtaining operator approval.**

RLS permits public inventory reads only for active cities and their published venues, with eligibility propagated to facilities/photos. Private research and operational tables have separate grants/policies. Public inventory uses an anonymous client; mutations use the admin JWT plus RLS/SQL checks. The service key is confined to server-side limiting, aggregate events, gated object retrieval and trusted provisioning.

`configReadiness` separates public configuration from admin readiness and checks origin, known key-role mix-ups, server key, limiter secret and host support without reporting values. It does not verify key authenticity or provider availability. Durable limits use HMAC buckets and fail closed. Vercel's sanitized IP header is supported; the common `local` fingerprint is loopback-HTTP-only. A non-Vercel real host is **blocked**, not silently treated as local or ready.

Server Actions provide origin checks; explicit upload/analytics route handlers check same-origin. Existing action guards reject non-ISO check dates and enforce a UTF-8 metadata byte budget before writes. PostgreSQL remains authoritative, including its formatted JSON byte limit. No raw HTML rendering of descriptions. Error messages do not expose SQL, tokens, emails or research notes.

## Images

Private Supabase bucket `shagun-media`; no draft photo is published through a public bucket URL. Admin upload accepts one JPEG/PNG/WebP per request up to **3 MiB**, rejects animation and excessive pixel counts, rotates and strips metadata, then emits WebP variants targeting maximum widths of **480/960/1600 pixels**. Processing preserves the oriented aspect ratio and never enlarges a smaller source. Public image routes verify public ownership with anonymous RLS before download. Admin previews use a separate private no-store route. No SVG uploads, arbitrary remote URL fetches or original image proxying. Relative storage keys enable provider migration.

Migration [../supabase/migrations/0004_media_uploads.sql](../supabase/migrations/0004_media_uploads.sql) reserves durable cleanup **before any Storage write**. `ready_at` is database transaction time plus **15 minutes**, not a renewable client deadline. After three session-authorized uploads, `finalize_media_upload` atomically consumes the reservation and inserts the media row; failure retains cleanup work. Wall-time checks after locking reject expired reservations and deletion jobs. Cleanup selects ready, unreferenced roots and removes all three variants before acknowledgement; deletion jobs are ready immediately. Local SQL tests and real local Storage workflows cover these paths, but managed-provider faults/concurrency still require separate evidence.

Responsive `picture`/`srcset`, explicit dimensions, first-image priority and below-fold lazy loading avoid double optimization costs. Public derivatives can have a short 60-second CDN cache; already-public images may persist in external caches and cannot be recalled from visitors. Draft media is never cached publicly. Remove copyrighted/sensitive media at the provider and purge caches when needed.

`MediaPhoto` also detects a completed broken image during hydration using `node.complete` and `naturalWidth`, without requiring `currentSrc`. An SSR image can fail before React attaches an error handler; the fallback must cover that case while retaining healthy images. Deterministic held-hydration coverage and the limits of the original failure diagnosis are recorded in [VERIFICATION.md](VERIFICATION.md).

No real venue photos are seeded. Decorative original vector artwork is visually distinct from photography and not represented as a venue.

## Rendering and performance

Public reads are independent of user sessions. Live publication checks precede any cached venue snapshot, so fresh page requests honor unpublishing; cache keys include `updated_at`. Lists use bounded indexed server queries with current public status rather than silently serving stale publication states. Cache immutable UI, content snapshots and responsive derivatives; invalidate inventory tags after admin writes. Never put admin previews or session responses into ISR. This prioritizes correct privacy over indiscriminate full-page caching.

Canonical city and venue routes resolve availability in blocking `generateMetadata()` before body streaming. [../next.config.ts](../next.config.ts) disables metadata streaming for all user agents with `htmlLimitedBots: /.*/`, and these routes have **no ancestor loading boundary**. This lets `notFound()` produce a true HTTP **404**, rather than a streamed 200 with not-found content. The root loading boundary was deliberately removed: the initial response can wait for the lookup instead of showing an immediate skeleton. Route skeletons remain only under `/cities`, `/search` and `/admin`.

12 venues per result page and 24 cities per directory page; bounded query length, pages and facet values. Shared query repository prevents duplicated fetch logic. React request memoization deduplicates metadata/page reads. No Elasticsearch, maps SDK, cron, realtime subscription, payment SDK or public Auth client bundle.

## Deployment and cost

Deployment uses Vercel's **Node runtime** and the approved shared Supabase project; no container or always-on application worker is required. Docker hosts only the isolated local/CI integration stack. Production settings are saved. Builds never migrate, seed or provision users; request-time sitemaps do not query inventory during compilation. Current check/build/publication results and historical hosted scopes are canonical in [VERIFICATION.md](VERIFICATION.md), not transferable between revisions. Managed acceptance remains open; do not promote production or force launch around the shared-security gate.

Keep three local modes distinct: normal/no-database preview on 3000, labelled database-free fixtures on 3100, and real local Supabase integration with Next on 3200. They share generated build output; rebuild normally before restoring the default preview after tests. Current preview/stack state is recorded only in [VERIFICATION.md](VERIFICATION.md). Local Auth settings are test-owned, not a shared Auth policy template. Commands and process ownership are in [../README.md](../README.md); release gates and **historical planning estimates, not fresh prices**, are in [DEPLOYMENT.md](DEPLOYMENT.md).

## Principal launch risks

1. **Critical confirmed shared Order/ContactMessage exposure:** obtain separate owner authorization for remediation; preservation success does not establish a secure baseline.
2. Require fresh Data API verification, private operator sign-in and real administrator provisioning with a new unique password of at least 12 characters and actual-UUID allowlisting. Current evidence belongs in [VERIFICATION.md](VERIFICATION.md), not a reused historical HTTP status. Identity approval alone does not close these gates; do not change sibling access or weaken Auth policy.
3. Editorial readiness requires reviewed real inventory and rights for any photos; keep the city draft until release clearance and never fill gaps with fabricated facts. Import/review status is in [VERIFICATION.md](VERIFICATION.md). Recheck stale information after 90 days without presenting verification as endorsement.
4. Incomplete recovery coverage: the pre-install public-schema scratch restore is not a current Shagun backup and did not restore managed Auth/settings, object bytes, roles or original ownership/ACLs.
5. Final-domain behavior and operational capacity remain unverified: local passes do not certify HTTPS cookies, CDN recall, concurrency, pricing, quotas or managed availability. See [AUDIT.md](AUDIT.md).