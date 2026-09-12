# Shagun

A city-first wedding venue directory with open discovery and private editorial administration. Visitors browse recorded facts and contact venues directly. Shagun does not provide bookings, payments, availability, public registration, ratings or gated contacts.

## Current status — 2026-09-09

**Managed SQL installed; public city autocomplete implemented; production promotion blocked.** Current check/matrix/integration results, publication scope, operator confirmations and preview/stack state are maintained only in [docs/VERIFICATION.md](docs/VERIFICATION.md). Earlier hosted passes are historical, not certification of later code.

- All **five migrations, 0001–0005**, and the draft Hazaribag seed are installed in shared Supabase project `ixkhyqqovacdramymqjk`. Apply-time preservation, read-only inspection and inventory observations have separate scopes in [docs/VERIFICATION.md](docs/VERIFICATION.md); SQL installation does not establish API or public readiness.
- Home and the city directory now progressively enhance native GET search with bounded public-city suggestions. Venue search and the private admin GeoNames catalog remain separate.
- **Critical shared-project exposure requires separately authorized remediation.** The `public.Order`/`public.ContactMessage` evidence and owner-approval status are in [docs/VERIFICATION.md](docs/VERIFICATION.md). Never retrieve customer rows to demonstrate impact or change sibling access as a Shagun side effect.
- Production Vercel keys are saved; do not request them again. Current Data API/sign-in evidence is in [docs/VERIFICATION.md](docs/VERIFICATION.md), not inferred from historical HTTP failures. After private sign-in, verify the actual list and append `shagun` **only if absent and authorized**, preserving every other entry and excluding `shagun_private`.
- Identity approval alone is not provisioning. A new unique password must be entered privately with the unchanged **12-character minimum**, followed by actual-UUID allowlisting and managed access checks. Provisioning status is recorded only in [docs/VERIFICATION.md](docs/VERIFICATION.md).
- Research requires explicit draft import, actual editorial review and rights for any photos. Current import/review status is in [docs/VERIFICATION.md](docs/VERIFICATION.md). Do not substitute research or synthetic inventory for public records or infer readiness from the draft seed alone.
- Publication remains **review-branch-only**. **Do not promote `main`/Production or force a launch** while the shared-security, API, real-admin, editorial and managed-acceptance/recovery gates remain open.

[docs/AUDIT.md](docs/AUDIT.md) records supported fixes and launch blockers; it does not treat every exploratory suggestion as a proven bug.

## Product and data boundaries

- [supabase/seed.sql](supabase/seed.sql) creates only the draft Hazaribag city, never venues, accounts or photos; conflicts do not overwrite edits. The facility vocabulary comes from the inventory migration.
- [data/research/hazaribag-2026-09-08.json](data/research/hazaribag-2026-09-08.json) is a separate research batch, not public fallback data. **Add researched drafts** requires active admin authorization, skips existing city/slug records and leaves new entries draft/unverified/unreviewed. Website evidence is not contact verification or photo permission.
- **Import Excel** in a saved city workspace provides a blank 29-column template, row validation and explicit import of up to **1,000 new drafts per workbook, 2 MiB maximum**. Confirmed 100-row requests show progress and can be stopped; uncertain requests are never automatically retried. Existing city/slug records are skipped without changing edits; imported venues remain unverified and unreviewed. Photos and publication stay in the existing editor workflow. See [docs/OPERATIONS.md](docs/OPERATIONS.md#excel-imports-for-a-saved-city).
- **Review & publish** on city/global venue lists publishes selected draft/unpublished rows in pages of up to **25** after explicit administrator review. Saved facts, sources and verification dates are preserved; missing requirements and concurrent edits are reported without bypassing database checks. See [docs/OPERATIONS.md](docs/OPERATIONS.md#bulk-review-and-publication).
- **Add city** needs only a nationwide city search, an explicit result selection and **Create city**. The server derives the name, state, India, available slug and draft defaults; standard SEO needs no overrides. The GeoNames catalog has **7,112 places across 36 represented states/territories**, not thousands of saved or launched cities. Existing city editors retain their geographic associations, manual records and optional editorial controls.
- Public city selection on home and `/cities` adds at most **8 name/state-labelled suggestions** from active public inventory, including an active empty guide under the existing visibility rule. Native GET search and **24-city pages** still work without JavaScript. Suggestions use only `/api/cities/suggestions`, never Auth, the private catalog or research fallback. Venue discovery retains the existing server `SearchBox`, **12 venues per page**, inventory-derived facets and comparable price bases.
- Private source notes never enter public descriptions, city metadata, suggestions or photo credits. The suggestion response contains only `name`, `slug` and `state`; its bounds and cancellation contract are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- Saved city preview at `/admin/cities/[slug]/preview` uses the actual shared `CityDiscovery` interface and admin-only RPCs. It includes saved draft/published venues, is authenticated/noindex/no-store, emits no analytics and is not a shareable public link.
- Synthetic records and generated images are local QA only, visibly labelled and never imported into the shared project. There is no demo Auth bypass.

## Technical outline

Next.js **16.3.3** App Router, React, strict TypeScript **5.9.3**, Supabase PostgreSQL/Auth/private Storage, Zod and Sharp. Server Components are the default. Typed PostgREST clients and atomic SQL RPCs avoid an extra ORM/runtime connection pool.

Shagun uses isolated `shagun` / `shagun_private` namespaces, private `shagun-media` storage and `shagun-admin-auth` cookies within the approved shared project. Public inventory uses anonymous reads with active-city/published-venue predicates. Admin writes reauthorize managed Auth plus the active UUID allowlist, with SQL grants/RLS as additional enforcement. Preserve BihariBhojan data, existing API entries and shared Auth/Storage settings.

### Main routes

| Purpose | Routes |
| --- | --- |
| Public discovery | `/`, `/cities`, `/search`, `/city/[city]` |
| Public city suggestions | `GET /api/cities/suggestions`, `q` only |
| Venue detail | `/city/[city]/vivah-bhawan/[venue]` |
| Standards/privacy | `/about`, `/privacy` |
| Private operations | `/admin/login`, `/admin`, `/admin/cities`, `/admin/venues` |
| City workspace/edit/preview | `/admin/cities/[slug]`, `/admin/cities/[slug]/edit`, `/admin/cities/[slug]/preview` |
| City-scoped Excel import | `/admin/cities/[slug]/import`; authenticated `GET`/`POST /api/admin/venue-import` |
| Venue edit/preview | `/admin/venues/[id]`, `/admin/venues/[id]/preview` |
| Media | Public `/media/[id]/[width]`; private `/api/admin/media` and `/api/admin/media/[id]` |
| SEO | `/robots.txt`, request-time `/sitemap.xml` index and numbered partitions such as `/sitemap/0.xml` |

The city alias `/city/[city]/vivah-bhawan` permanently redirects to the canonical city route. Missing/hidden canonical city and venue records must return a real HTTP 404 before streaming.

Sitemaps no longer enumerate inventory during builds: new partitions appear at request time. Async robots makes no database query and advertises only the index URL. Non-indexable local environments return sitemap 404s; invalid/private rows, limit violations and service failures produce sanitized 503s. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Local development and test modes

Use **Node 24** and `npm ci` from this root. The supported engine range is `>=22.0.0 <25`; use [package.json](package.json) and [package-lock.json](package-lock.json), not ad-hoc upgrades. Supabase CLI **2.116.0** remains pinned; `fflate` is patched to **0.8.3**. Revision-scoped dependency-audit evidence is in [docs/VERIFICATION.md](docs/VERIFICATION.md).

| Mode | Origin/services | Contract |
| --- | --- | --- |
| Default local preview | `http://localhost:3000`, normally no database | Fixtures off; intentional preparation state. **Shagun: Local app preview** serves an already-built normal app without a debugger. |
| Public fixture QA | `http://localhost:3100`, no database | Explicitly labelled `empty`, `one` or `many` fixtures; matching build and runtime scenario required. |
| Real local integration | Next at `http://localhost:3200`; Supabase API `http://127.0.0.1:55321`, database port **55322** | Real local Auth, REST, Storage and PostgreSQL; `SHAGUN_TEST_FIXTURES=false`; owned disposable project only. |

Actual build, preview-restoration and integration-stack state are recorded in [docs/VERIFICATION.md](docs/VERIFICATION.md). The default-mode contract above is not a claim that its preview is currently running.

For ordinary development, use `npm run dev`. For the normal preview, build with `npm run build`, then use the existing preview task or `npm run start -- --hostname localhost`. Builds do not migrate, seed or provision managed services.

**Real-service local workflow**, in order, with each step succeeding before the next:

1. `npm ci`
2. `npm run check` — lint, route types, strict typecheck and isolated Vitest/PGlite tests.
3. `npm run integration:start` — requires a working local Docker engine; starts the dedicated local Supabase services.
4. `npm run build:integration` — builds for the exact local service/origin contract.
5. `npm run test:integration` — guarded owned-project reset/bootstrap, random local Auth accounts and the real browser workflow; Playwright owns the Next server.
6. `npm run integration:stop` — stops only the dedicated integration project, retaining its local data.

[scripts/integration.ts](scripts/integration.ts) pins the local target, checks container/test ownership before destructive reset, refuses to adopt preexisting Shagun objects and keeps credentials in process memory/child environments rather than reports. Do not link this stack remotely or create production test records. Docker is **development-only**; it adds no paid deployment runtime.

The local Auth configuration deliberately combines `auth.email.enable_signup=true` (email/password provider enabled in this CLI version) with global `auth.enable_signup=false` (public registration denied and directly asserted). **Do not copy these settings into shared managed Auth automatically.**

**Fixture workflow:** `npm run build:qa`, then `npm run test:e2e`; `npm run preview:qa` is an optional manual preview, not a server for Playwright to reuse. Select `SHAGUN_FIXTURE_SCENARIO=empty|one|many` consistently before compilation and execution. Keep warnings and database/Vercel guards intact.

All modes share generated build output. Stop the relevant preview before rebuilding, keep ports free for the owning test process and never hand-edit QA origins or reuse a mismatched build. After either test mode, rebuild normally before restarting the default preview. Never deploy fixture or integration output.

CI defines **two jobs**: Node **22** quality/fixture checks, then Node **24** real local Auth/Storage workflows using Docker. The authenticated job avoids credential/trace/dump artifacts and always attempts to stop its own integration stack. Revision-specific hosted counts and Preview evidence are canonical in [docs/VERIFICATION.md](docs/VERIFICATION.md); older passes never certify newer code or authorize production promotion.

## Release and operator documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — data boundaries, consistency, media and rendering.
- [docs/DESIGN.md](docs/DESIGN.md) — public/admin interfaces, city selection and protected previews.
- [docs/OPERATIONS.md](docs/OPERATIONS.md) — trusted admin provisioning, research, publishing, cleanup and recovery.
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — saved Production configuration, remaining operator gates and cost estimates.
- [docs/VERIFICATION.md](docs/VERIFICATION.md) — managed SQL evidence, completed local checks/build/matrix and pending release evidence.
- [docs/AUDIT.md](docs/AUDIT.md) — fixed findings, rejected suggestions and separate shared-project risk.

No private secrets belong in chat, command arguments, screenshots or source control. After the API/operator gates, provision the supplied identity privately through the dashboard/actual-UUID allowlist procedure or `npm run admin:create` with hidden password entry in a trusted terminal. Local Auth and the helper retain their 12-character minimum; never persist a chat-supplied credential or lower the policy. Neither provisioning path is a build step. Identity approval alone does not satisfy private provisioning, shared-owner security authorization or real editorial review; no production launch is authorized here.