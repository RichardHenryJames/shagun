# Shagun

A city-first wedding venue directory with open discovery and private editorial administration. Visitors browse recorded facts and contact venues directly. Shagun does not provide bookings, payments, availability, public registration, ratings or gated contacts.

## Current status — 2026-09-09

**Managed SQL installed; review branch published; final application CI and Preview smoke passed; production promotion blocked.** Recorded work spans 8–9 September. Exact revision-scoped evidence is maintained in [docs/VERIFICATION.md](docs/VERIFICATION.md).

- The empty-ACL catalog snapshot fix is complete. Guarded `--apply --seed` successfully installed **all five migrations, 0001–0005**, including city-preview RPCs, in shared Supabase project `ixkhyqqovacdramymqjk`. The private bucket/policies and all seven preservation checks passed.
- The managed inventory contains **one draft Hazaribag city, nine facilities and no venues, photos or administrators**. No Chapra production record has been created. Empty public discovery is the correct result, not a failed seed.
- **Critical shared-project exposure is confirmed:** anonymous zero-row `HEAD` probes of `public.Order` and `public.ContactMessage` returned **200**, alongside existing SELECT grants and disabled RLS. No customer rows were retrieved. This preexisting baseline was preserved, not made secure; remediation needs separate BihariBhojan/shared-owner authorization.
- Production Vercel configuration is saved, including both API keys; do not request them again. Shagun's zero-row API probe returned **406 / PGRST106 (invalid schema)**. Dashboard management access returned **401** and requires the user's sign-in; `shagun` must be appended to the existing exposed-schema list without removing other entries or exposing `shagun_private`. No approved real admin email has been provided.
- The **12 source-cited Hazaribag candidates remain unimported and unreviewed**. Photos are absent and rights unknown. A real admin must import/review/publish deliberately before Hazaribag can go live.
- Actual Preview smoke at original `2072dc7` found a **sanitized 500 without a leak** on unconfigured `/api/admin/city-catalog`. Published fix [9db51bd](https://github.com/RichardHenryJames/shagun/commit/9db51bd5b0a11395d62401353fde3e0db03a59fe) adds an `isConfigured` guard before client construction, returning private/no-store, noindex **503** with no catalog data. Configured fresh Auth/allowlist checks are unchanged; no SQL/shared settings changed. The old preview was **not all green**.
- **After the fix**, `npm run check` passed **952 tests across 14 files**, including **60 catalog tests** (two new missing-URL/key cases) and **19 request-time sitemap tests**. The normal `npm run build` **passed with `SHAGUN_TEST_FIXTURES=false`**, dynamic request-time sitemaps and **no database queries during compilation**. Actual local valid/malformed catalog requests confirmed the private 503 contract, and the honest empty localhost:3000 home was restored.
- The **Windows public matrix before the final catalog-only guard** covers all six widths: `many` **166/1**, `empty` **95/28**, `one` **120/21** (passed/skipped), totaling **381 passes / 50 intentional, inapplicable skips**. Historical Windows real-service **3/3** preceded the sitemap refactor; separate hosted Node 24 **3/3 at `2072dc7`** supplies post-sitemap Auth/Storage evidence. Hosted fixture CI covered only `many`, not the whole Windows matrix.
- **Review publication succeeded:** [audit/second-pass-2026-09-09](https://github.com/RichardHenryJames/shagun/tree/audit/second-pass-2026-09-09) contains `9db51bd`. Both application revisions passed their own hosted jobs; the final fix also passed actual Preview smoke, including the corrected catalog response. Exact runs/counts are in [docs/VERIFICATION.md](docs/VERIFICATION.md). Deployment is **Preview, not Production**; GitHub `main` remains at `b62d6ed` and user-local `main` at `b066ed5`.
- **Do not promote `main`/Production or force a launch** while the critical shared-security, API, real-admin, reviewed-inventory and full managed-acceptance/recovery gates remain open.

[docs/VERIFICATION.md](docs/VERIFICATION.md) separates completed evidence from pending results. [docs/AUDIT.md](docs/AUDIT.md) records fixes and confirmed launch blockers; it does not claim that every exploratory suggestion was a bug.

## Product and data boundaries

- [supabase/seed.sql](supabase/seed.sql) creates only the draft Hazaribag city, never venues, accounts or photos; conflicts do not overwrite edits. The facility vocabulary comes from the inventory migration.
- [data/research/hazaribag-2026-09-08.json](data/research/hazaribag-2026-09-08.json) is a separate research batch, not public fallback data. **Add researched drafts** requires active admin authorization, skips existing city/slug records and leaves new entries draft/unverified/unreviewed. Website evidence is not contact verification or photo permission.
- The admin GeoNames catalog has **7,112 places across 36 represented states/territories**. It is a local selection aid, not thousands of saved or launched cities. State-filtered selection is validated server-side and stored as `metadata.geographic_source_id`; deliberate manual entry remains available.
- Public city selection uses existing GET search over active guides, **24 per page**. Venue discovery uses **12 per page**, actual inventory-derived facets and comparable price bases. Private source notes never enter public descriptions, city metadata or photo credits.
- Saved city preview at `/admin/cities/[slug]/preview` uses the actual shared `CityDiscovery` interface and admin-only RPCs. It includes saved draft/published venues, is authenticated/noindex/no-store, emits no analytics and is not a shareable public link.
- Synthetic records and generated images are local QA only, visibly labelled and never imported into the shared project. There is no demo Auth bypass.

## Technical outline

Next.js **16.3.3** App Router, React, strict TypeScript **5.9.3**, Supabase PostgreSQL/Auth/private Storage, Zod and Sharp. Server Components are the default. Typed PostgREST clients and atomic SQL RPCs avoid an extra ORM/runtime connection pool.

Shagun uses isolated `shagun` / `shagun_private` namespaces, private `shagun-media` storage and `shagun-admin-auth` cookies within the approved shared project. Public inventory uses anonymous reads with active-city/published-venue predicates. Admin writes reauthorize managed Auth plus the active UUID allowlist, with SQL grants/RLS as additional enforcement. Preserve BihariBhojan data, existing API entries and shared Auth/Storage settings.

### Main routes

| Purpose | Routes |
| --- | --- |
| Public discovery | `/`, `/cities`, `/search`, `/city/[city]` |
| Venue detail | `/city/[city]/vivah-bhawan/[venue]` |
| Standards/privacy | `/about`, `/privacy` |
| Private operations | `/admin/login`, `/admin`, `/admin/cities`, `/admin/venues` |
| City workspace/edit/preview | `/admin/cities/[slug]`, `/admin/cities/[slug]/edit`, `/admin/cities/[slug]/preview` |
| Venue edit/preview | `/admin/venues/[id]`, `/admin/venues/[id]/preview` |
| Media | Public `/media/[id]/[width]`; private `/api/admin/media` and `/api/admin/media/[id]` |
| SEO | `/robots.txt`, request-time `/sitemap.xml` index and numbered partitions such as `/sitemap/0.xml` |

The city alias `/city/[city]/vivah-bhawan` permanently redirects to the canonical city route. Missing/hidden canonical city and venue records must return a real HTTP 404 before streaming.

Sitemaps no longer enumerate inventory during builds: new partitions appear at request time. Async robots makes no database query and advertises only the index URL. Non-indexable local environments return sitemap 404s; invalid/private rows, limit violations and service failures produce sanitized 503s. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Local development and test modes

Use **Node 24** and `npm ci` from this root. The supported engine range is `>=22.0.0 <25`; use [package.json](package.json) and [package-lock.json](package-lock.json), not ad-hoc upgrades. Supabase CLI **2.116.0** remains pinned; `fflate` is patched to **0.8.3**, with **zero findings** in the subsequent dependency audit.

| Mode | Origin/services | Contract |
| --- | --- | --- |
| Default local preview | `http://localhost:3000`, normally no database | Fixtures off; intentional preparation state. **Shagun: Local app preview** serves an already-built normal app without a debugger. |
| Public fixture QA | `http://localhost:3100`, no database | Explicitly labelled `empty`, `one` or `many` fixtures; matching build and runtime scenario required. |
| Real local integration | Next at `http://localhost:3200`; Supabase API `http://127.0.0.1:55321`, database port **55322** | Real local Auth, REST, Storage and PostgreSQL; `SHAGUN_TEST_FIXTURES=false`; owned disposable project only. |

After the catalog guard, the normal production build passed with `SHAGUN_TEST_FIXTURES=false`; the restored browser preview at `http://localhost:3000/` confirmed the honest empty preparation state without synthetic warnings or inventory and remains running.

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

CI defines **two jobs**: Node **22** quality/fixture checks, then Node **24** real local Auth/Storage workflows using Docker. The authenticated job avoids credential/trace/dump artifacts and always attempts to stop its own integration stack. Both jobs passed independently for original `2072dc7` and the final catalog fix `9db51bd`, including post-sitemap authenticated workflows. Revision-specific hosted counts and Preview evidence are canonical in [docs/VERIFICATION.md](docs/VERIFICATION.md); none authorize production promotion.

## Release and operator documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — data boundaries, consistency, media and rendering.
- [docs/DESIGN.md](docs/DESIGN.md) — public/admin interfaces, city selection and protected previews.
- [docs/OPERATIONS.md](docs/OPERATIONS.md) — trusted admin provisioning, research, publishing, cleanup and recovery.
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — saved Production configuration, remaining operator gates and cost estimates.
- [docs/VERIFICATION.md](docs/VERIFICATION.md) — managed SQL evidence, completed local checks/build/matrix and pending release evidence.
- [docs/AUDIT.md](docs/AUDIT.md) — fixed findings, rejected suggestions and separate shared-project risk.

No private secrets belong in chat, command arguments, screenshots or source control. An operator may create the approved Auth account privately in Supabase's dashboard and explicitly allowlist its actual UUID; the existing `npm run admin:create` alternative requires private local configuration and hidden password entry in a trusted terminal. Neither is a build step. Shared-owner security authorization, dashboard sign-in, an approved admin identity and real editorial review remain user-owned gates; no production launch is authorized here.