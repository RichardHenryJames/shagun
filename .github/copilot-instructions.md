# Shagun workspace instructions

## Product boundaries
- City-first public venue discovery; private editorial administration, not a booking marketplace.
- Hazaribag, Jharkhand is the only seeded city, and starts as a normal draft record. The seed contains no venues, photos or accounts. Future cities are admin-created.
- Real Hazaribag research is a separate source-cited batch, not the schema seed or a public hardcoded fallback. Import explicitly as unverified drafts through an active admin; never overwrite existing edits or fabricate a review.
- Never fabricate real venue facts, contacts, photos, ratings or metrics. No Google scraping, public registration, booking, payments or gated contacts.
- Synthetic records and diagrams are local QA only, clearly labelled and rejected on Vercel or with a configured database.

## Implementation conventions
- Work in the existing project root (`.`); preserve user configuration and unrelated changes. No more scaffolding or extensions are needed.
- Next.js App Router, strict TypeScript 5, React, Supabase PostgreSQL/Auth/private Storage. Node 24 is the locally tested runtime; keep dependency locks reproducible.
- Server Components by default. Public data uses anonymous clients and active-city/published-venue predicates, never a service-role inventory read.
- Keep public city autocomplete separate from the private GeoNames/catalog/research paths. `GET /api/cities/suggestions` accepts only `q` (raw maximum 100, no control characters), calls anonymous `public_cities` at page 1/limit 8 with a 5-second timeout, and returns only name/slug/state with no-store caching. No Auth lookup or admin-cookie widening.
- Match existing `/cities` visibility: an active empty guide remains discoverable until deactivated. Home/directory autocomplete progressively enhances native GET/no-JavaScript search; keep the existing server `SearchBox` for venue search unchanged.
- Preserve the client 250 ms debounce, 8-second timeout, abort/stale protection on every edit (including trailing edits), Escape, blur and unmount. Keep name/state-labelled listbox options, arrow/Enter/pointer/touch selection, distinct empty/error states and retry.
- Reuse the approved shared BihariBhojan Supabase project only through isolated `shagun` / `shagun_private` namespaces, private `shagun-media` storage and `shagun-admin-auth` cookies. Never change sibling data, shared Auth settings, managed ownership or existing API schema entries as a side effect.
- Reauthorize every action and private endpoint against managed Auth and the active UUID allowlist; preserve RLS and SQL grants. No auth bypass for previews/tests.
- Keep the admin catalog's `isConfigured` guard before client construction: missing URL/public key yields private/no-store, noindex 503 with no catalog data. Configured requests still require fresh Auth and active allowlist checks.
- Validate server input; use atomic save RPCs for facts, facilities and research. Keep exact optimistic timestamp strings; never round-trip through JavaScript Date.
- Preserve slugs/city association after launch/publication. Private research must not enter public descriptions, city metadata or photo credits.
- Upload genuine decoded/re-encoded images only. Reserve durable cleanup before writing Storage; finalize atomically. Cleanup ready, unreferenced roots only, remove all variants before acknowledgement.
- Preserve `MediaPhoto` pre-hydration failure detection using completed-image state and `naturalWidth`, without requiring `currentSrc`; retain healthy-image behavior and deterministic held-hydration coverage. Do not claim the old failure proved an empty runtime `currentSrc`.
- Public city/venue existence checks must precede streaming. Do not reintroduce ancestor loading boundaries that turn missing pages into HTTP 200.
- Use restrained public editorial styling and productivity-focused admin styling. Keep labels, keyboard dialogs, focus and 320px layouts accessible.
- Never request secrets through chat or commit any secrets; never persist chat-supplied credentials. Admin provisioning is an explicit private dashboard/trusted-terminal operation, not a build step. Identity approval alone is insufficient: retain API readiness, actual-UUID allowlisting and the unchanged local Auth/provisioning-helper 12-character password minimum.
- Read architecture, design and operations documentation before changing related behavior. Keep communication brief and distinguish local checks from real-service certification.

## Verification
- `npm run check`: lint, route type generation, strict typecheck and isolated Vitest/PGlite tests.
- `npm run build`: normal production build, never migration/seed execution.
- `npm run build:qa` then `npm run test:e2e`: shared localhost:3100 origin and no database; do not hand-edit QA origins or reuse a mismatched production build.
- `npm run integration:start`, `npm run build:integration`, `npm run test:integration`: real isolated Auth/REST/Storage at 127.0.0.1:55321 and app localhost:3200, with fixtures disabled and random private test accounts. Never point these tests at hosted data. Stop only this stack with `npm run integration:stop`.
- The default preview is **Shagun: Local app preview** at localhost:3000 with fixtures disabled. Keep synthetic UI only in deliberately labelled QA mode; never remove its warning while retaining invented data.
- Test all six widths and empty/one/many inventory scenarios; report passes separately from intentional skips. Pre-hydration image cases apply only to nonempty inventory. Public delayed/error stubs use browser-context interception; helpers must own route fulfillment, await their gate and clean up. This harness boundary is not application Auth mocking; do not weaken assertions or imply earlier scenarios were rerun.
- Real Supabase Auth/REST/Storage, concurrent sessions, backups and final-domain performance remain deployment checks, not proven by local fixtures.
- Keep current local/hosted counts, pending confirmations, publication and preview/stack state only in [../docs/VERIFICATION.md](../docs/VERIFICATION.md); link there rather than duplicating volatile progress. A pass applies only to its exact code/environment/scope, never to newer uncommitted changes. Historical preview restoration is not current process state.
- Distinguish read-only inspection from migration apply: `preservationComparison: false` does not repeat the seven historical apply-time preservation checks. Never infer fresh public readiness from draft-only SQL counts.

## Setup progress
- [x] Requirements and product/technical decisions documented.
- [x] Application scaffold and compatible locked dependencies installed.
- [x] Public discovery with progressive city autocomplete, city-first admin, protected previews, actions, database, storage, SEO and analytics foundation implemented.
- [x] No additional extensions needed.
- [x] Twelve real source-cited Hazaribag candidates and an authenticated, insert-only research import are prepared; no direct contact checks or photo rights are claimed.
- [x] Shared database installation and draft Hazaribag seed are recorded in [../docs/VERIFICATION.md](../docs/VERIFICATION.md). Historical apply-time preservation, read-only inspection and the limited public-only restore are distinct; none establishes full managed recovery.
- [x] Historical review publication, catalog-503 correction and revision-scoped hosted/Preview evidence are retained in [../docs/VERIFICATION.md](../docs/VERIFICATION.md). Never call the original catalog-500 Preview all green or infer Production promotion from Preview success.
- [ ] API/admin gate: use [../docs/VERIFICATION.md](../docs/VERIFICATION.md) for current API/sign-in/provisioning evidence; historical HTTP failures are not fresh failures. After private operator sign-in, verify actual exposure and append `shagun` only if absent and authorized, preserving the existing list and excluding `shagun_private`. Identity approval alone is not private provisioning with a new unique password meeting the unchanged minimum and actual-UUID allowlisting.
- [ ] Editorial/managed gate: import/review/photo-rights status belongs in [../docs/VERIFICATION.md](../docs/VERIFICATION.md). Require real review, managed acceptance, concurrency, full recovery and final-domain checks independently of code or harness fixes.
- [ ] Critical shared-owner gate: confirmed Bihari `Order`/`ContactMessage` exposure and approval evidence are recorded in [../docs/VERIFICATION.md](../docs/VERIFICATION.md). An unavailable approval response or general request to finish is not separate authorization to change sibling permissions. Keep publication review-branch-only; `main`/Production promotion and force launch remain blocked until separately authorized remediation and all API/admin/editorial/full-managed gates are complete.
