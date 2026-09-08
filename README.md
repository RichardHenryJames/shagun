# Shagun

A city-first wedding venue directory with open public discovery and private editorial inventory operations. Visitors browse recorded facts and contact venues directly; Shagun is not a booking, payment, availability, review or lead-selling service.

**Current status — 2026-09-08: source pushed, hosted CI passed; framework config fix awaiting redeploy verification; real inventory blocked.** CI success applies to the initial commit, not the pending follow-up or a verified public launch.

- Latest full `npm run check`: **697 tests across 9 files passed**, with lint, route type generation and strict typecheck green. The original **692 tests are unchanged**, and all **five new database-access source-contract tests passed**. The previously passing normal Next.js production build already includes the action/research changes; later minor changes are limited to scripts, documentation and source-gate checks, with no new normal build for this docs update. The **207 browser passes / 22 skips are historical local isolated QA only**; no new full local matrix is recorded.
- **Shagun: Local app preview** serves the normal build at **http://localhost:3000**, with fixtures disabled. The old port-3100 demo is stopped. The supplied manual check of four normal routes found no synthetic/test strings. The UI remains an **empty, unconfigured preparation state**, not live Hazaribag inventory.
- Read-only shared-Supabase inspection recognizes the role's **already-configured `supautils.policy_grants` authority on `storage.objects`** (`storage_policy_manager=true`). The earlier `MIGRATION_PRIVILEGES` denial was a **local-runner false positive**, now resolved; table non-ownership is not a blocker. Inspection now fails **`stage=metadata-public code=22023`** in the catalog/preservation snapshot. The earlier SQL syntax error `42601` was fixed and parsed in isolated PGlite, but the runtime snapshot failure remains unresolved.
- **No migration, seed, research import, provisioning or database write occurred; `shagun` does not exist. Further database writes/debugging are stopped pending review.** Review/fix the snapshot guard and obtain successful read-only inspection before separately authorizing apply; no forced bypass or new grants/ownership/RLS changes. Supabase API keys and a real admin account remain unavailable. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) and [docs/VERIFICATION.md](docs/VERIFICATION.md).
- **Initial code publication and hosted CI succeeded:** the 161-file root commit [2edd4fd](https://github.com/RichardHenryJames/shagun/commit/2edd4fd831808e6b8ffdf30c46d7265bc734c410) was pushed to `main`, with upstream tracking configured. [GitHub Actions run 34222982087](https://github.com/RichardHenryJames/shagun/actions/runs/34222982087) **completed / SUCCESS** for that exact initial commit; no hosted test counts were fetched.
- **Vercel framework fix pending verification:** the initial deployment reached **Ready in 43 seconds**, but [the production domain](https://shagun-peach.vercel.app) still returns **Vercel 404**. The empty-repository import left **Framework Preset: Other**. Root [vercel.json](vercel.json) now explicitly sets `framework: nextjs`, `installCommand: npm ci` and `buildCommand: npm run build`; the parent will push the fix to trigger redeployment. The preview URL is SSO/Auth-gated, with no bypass attempted. This documentation-only follow-up remains **uncommitted/unpushed, pending parent publication**.

## Inventory and presentation

- The explicit production seed creates **Hazaribag, Jharkhand, India, as a draft city only**. It does not activate the city or create venues, photographs, administrators or credentials. Reapplying it does not overwrite operator edits.
- [data/research/hazaribag-2026-09-08.json](data/research/hazaribag-2026-09-08.json) prepares **12 real, source-cited business candidates with 27 source references**: the first seven contain real website-derived data for editorial review, not phone verification; five need source/contact follow-up. **All 12 remain unimported and unreviewed**, with draft/unverified status, private research notes and `photos: []`; this is neither exhaustive Hazaribag coverage nor confirmed contact information. No photo permission has been obtained. See [docs/HAZARIBAG_RESEARCH.md](docs/HAZARIBAG_RESEARCH.md).
- A matching saved city's authenticated workspace now offers **Add researched drafts**. Import is explicit, insert-only and private; it skips existing city/slug records without overwriting edits, keeps new venues draft/unverified/unreviewed, and never activates the city. Other cities are admin-created, not a hardcoded public list.
- An unconfigured application or a database with only the draft seed intentionally has no public inventory. Original decorative artwork and missing-photo illustrations are labeled as illustrations, not venue photographs.
- Public discovery reads eligible database inventory only; it never falls back to the research JSON. Synthetic fixtures remain **isolated, clearly labelled local QA data only**, never launch inventory. Disabling fixtures for normal use does not hide their labels or weaken their safeguards.

## Architecture

| Area | Implementation |
| --- | --- |
| Application | Next.js **16.3.3** App Router, React, strict TypeScript **5.9.3**; Node.js 24 is the local/deployment baseline. |
| Public interface | Server-rendered city discovery, name/locality search, inventory-derived filters, matching price bases, pagination, venue details, responsive galleries and direct phone/WhatsApp contact. Self-hosted fonts and a separate editorial public design. |
| Private interface | Email/password login, inventory overview, city workspaces with matched research-import cards, draft/edit/publish forms, authenticated saved previews, photo management, review counts and retryable storage cleanup. |
| Data access | Supabase PostgreSQL through typed supabase-js/PostgREST clients and narrow RPCs. **No ORM is deliberate**: complex queries and atomic writes stay in PostgreSQL without a separate serverless connection pool. |
| Shared-project isolation | Inventory/RPC schema `shagun`, private helpers/ledger in `shagun_private`, private bucket `shagun-media`, admin cookie `shagun-admin-auth`. All application database clients select `db: { schema: "shagun" }`; runtime inventory never uses BihariBhojan's shared `public` tables. |
| Authorization | Managed Supabase Auth plus an ID-based active `shagun.admin_users` allowlist. Every mutation revalidates the session and membership; RLS and SQL checks also enforce access. Shared Auth settings must not be changed globally without assessing BihariBhojan. |
| Public data | Anonymous, session-free reads: active cities and published venues only. Private research is excluded from public documents. Live publication checks precede cached venue snapshots. |
| Media | Private bucket, durable reservation before upload and atomic finalization. JPEG/PNG/WebP becomes aspect-ratio-preserving WebP variants without enlargement; public delivery checks ownership and admin previews are no-store. |
| Consistency | Atomic save RPCs include facilities and private review records. Exact `updated_at` versions prevent stale overwrites. Deletion queues object cleanup transactionally. |
| SEO and privacy | Canonicals, escaped factual JSON-LD, bounded sitemap partitions, noindex search/filter/preview pages. Optional aggregate analytics are off by default. |

Detailed decisions: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DESIGN.md](docs/DESIGN.md), [supabase/README.md](supabase/README.md).

### Route map

| Purpose | Route |
| --- | --- |
| Public entry/directory/search | `/`, `/cities`, `/search` |
| Canonical city | `/city/[city]` |
| City alias | `/city/[city]/vivah-bhawan` permanently redirects to the canonical city route, preserving query parameters. |
| Venue detail | `/city/[city]/vivah-bhawan/[venue]` |
| Listing standards/privacy | `/about`, `/privacy` |
| Admin login/overview | `/admin/login`, `/admin` |
| City-first administration | `/admin/cities`, `/admin/cities/new`, `/admin/cities/[city]`, `/admin/cities/[city]/edit`; `[city]` is the city slug. |
| Venue administration | `/admin/venues`, `/admin/venues/new?city=…`, `/admin/venues/[id]`, `/admin/venues/[id]/preview`; the query selects a saved city UUID. |
| Public image | `/media/[id]/[width]`, where width is `480`, `960` or `1600`; `[id]` is a media asset ID, not a storage path. |
| Private image/management | `/api/admin/media` for uploads; `/api/admin/media/[id]` for authenticated preview, metadata/order/cover changes and deletion. Preview size uses `?w=480`, `?w=960` or `?w=1600`. |

## Local development

Use Node.js **24** from the project root. The recorded Windows verification used **Node v24.15.0 and npm 11.12.1**; the current engine range is `>=22.0.0 <25` in [package.json](package.json). Install from [package-lock.json](package-lock.json) rather than upgrading packages to `latest`:

```powershell
npm ci
npm run dev
```

The development origin is `http://localhost:3000`. With Supabase settings blank and fixtures disabled, public pages show the intentional preparation state; this is not a working managed admin environment. For an ordinary **no-debug** session, run this server from the project root in VS Code's integrated terminal and open that origin; no debugger configuration is required.

For connected development, use a separate non-production Supabase project. Make a private local copy of [.env.example](.env.example) in the editor at the path required by the `admin:create` script in [package.json](package.json). **Shagun currently has no local environment file or configured API keys.** The shared database inspection reads the sibling project's selected `DIRECT_URL` privately; it neither configures the app nor supplies publishable/service API keys. Obtain those through an authorized operator's secret workflow, never through chat. [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) documents the environment and remaining access gates.

### Commands and verification boundaries

| Command | Purpose |
| --- | --- |
| `npm ci` | Reproducible dependency installation; requires a synchronized manifest and lockfile. |
| `npm run dev` | Local Next.js development server, normally port 3000. |
| `npm run start -- --hostname localhost` | Serve an already-built normal application at localhost:3000; used by **Shagun: Local app preview** with `SHAGUN_TEST_FIXTURES=false`. |
| `npm run check` | ESLint, Next route type generation/TypeScript checking, then Vitest. |
| `npm run build` | Normal production Next.js build, with fixtures disabled; never applies SQL, seeds inventory or provisions users. |
| `npm run build:qa` | Isolated production-mode fixture build with the shared localhost:3100 environment; not deployment output. |
| `npm run preview:qa` | Serve an already-built matching QA build at localhost:3100 for a local walkthrough; no database or authenticated admin. |
| `npm run test:e2e` | Playwright owns the isolated fixture-only production server on port 3100; run `npm run build:qa` first and stop any preview using that port. |
| `npm run admin:create` | Trusted interactive, out-of-band administrator creation; hidden password prompts, no credential arguments. |

The remaining scripts, including individual test/lint commands and the optional linked-project type-generation command, are defined in [package.json](package.json). The latter needs separately configured Supabase CLI access; it is not a migration, a default local prerequisite or a CI step.

### Isolated browser QA

Use a separate local terminal/checkout without managed credentials or a `VERCEL` environment. **Stop the normal app preview before replacing its shared build output**, and stop any optional QA preview on port 3100 before E2E. Playwright owns port 3100; the default normal preview uses port 3000. Run each command only after the preceding command succeeds. This is a **local production-mode QA build**, not a Vercel deployment:

```powershell
npm ci
npm run check
npm run build:qa
npx playwright install chromium
npm run test:e2e
```

[scripts/qa.ts](scripts/qa.ts), [scripts/qa-environment.ts](scripts/qa-environment.ts) and [playwright.config.ts](playwright.config.ts) share **`http://localhost:3100` for compilation and runtime**, clear database/service-key settings, disable analytics and public contacts, and select only the intended local fixture scenario. Do not hand-edit origins, substitute `127.0.0.1`, use a development server or reuse a normal production build for these tests. Playwright starts its own `next start` server and refuses to reuse an existing server.

Optional local-only `SHAGUN_FIXTURE_SCENARIO` accepts `empty`, `one` or `many` (default). Select it before both `npm run build:qa` and the matching preview/test run; rebuild when changing scenarios. The recorded `empty` and `one` runs used `npm run test:e2e -- --project=chromium-390`. [src/lib/testing/fixtures.ts](src/lib/testing/fixtures.ts) labels these records and test-card images as synthetic, with no dialable contacts or real venue locations; none is production seed data.

[src/lib/config.ts](src/lib/config.ts) rejects fixtures on Vercel, with configured Supabase credentials, or on a non-local HTTP origin. Do not bypass those guards. Fixture browser tests cannot certify managed Auth, real Storage HTTP policies or real concurrent database sessions. PGlite uses an in-memory database with synthetic managed-service scaffolding, not an actual Supabase deployment.

Normal and QA builds share generated output. Rebuild with `npm run build:qa` after a normal build or development session before QA. For a real release, build separately with **`npm run build`**, the intended production environment and fixtures disabled; never deploy QA output.

### Default local app preview in VS Code

The first task in [.vscode/tasks.json](.vscode/tasks.json) is now **Shagun: Local app preview**. It runs `npm run start -- --hostname localhost` with `SHAGUN_TEST_FIXTURES=false`, serving the **normal production build at http://localhost:3000** without a debugger. It does not build automatically; use **Shagun: Build app preview** or `npm run build` before starting it after a build-mode change. Do not start a development server on the same port while it is running.

The old port-3100 demo was stopped. The current standard public UI has **no test/synthetic wording or listings** because fixture mode is off, not because labels were concealed. With no Shagun API configuration or authenticated admin session, this is an **unconfigured preparation-state walkthrough**, not public live Hazaribag data.

The optional `npm run preview:qa` workflow remains separate: first make a matching `npm run build:qa`, then serve explicitly labelled fixtures at localhost:3100. Preserve all fixture warnings and guards. Stop whichever preview is using the generated output before rebuilding; after QA, rebuild normally before returning to the default app task.

### Completed local checks and historical QA — 2026-09-08

| Command | Recorded local result on Node v24.15.0 / npm 11.12.1 |
| --- | --- |
| `npm run check` | **Full check passed:** lint, route type generation, strict typecheck and **697 tests across 9 files**. The original 692-test set is unchanged; all five new database-access source-contract tests passed. Per-file counts are in [docs/VERIFICATION.md](docs/VERIFICATION.md). |
| `npm run build` | **Previously recorded normal Next.js production build passed**, already including the action/research changes. Later minor changes are scripts, documentation and source-gate checks; no new build for this docs update, deployment or managed-service certification is claimed. |
| `npm run build:qa` | **Historical local** isolated QA build passed; not rerun locally for this documentation update. Initial-commit hosted CI success is recorded separately below. |

**Historical local Chromium results only — no new full local browser matrix is recorded:**

| Browser scenario | Recorded widths | Passed | Intentionally skipped |
| --- | --- | ---: | ---: |
| `many` | 320, 375, 390, 414, 768, 1440 px | 166 | 1 |
| `empty` | 390 px | 17 | 12 |
| `one` | 390 px | 24 | 9 |
| **Total historical browser executions** | Above scenario/width combinations | **207** | **22** |

Those historical runs recorded no failing assertions. The many-scenario desktop run is **76 passed / 1 skipped**; the other five widths total **90 passed / 0 skipped**. The desktop skip intentionally excludes the mobile filter drawer; empty/one skips are scenario-inapplicable tests, not waived failures. Coverage included actual HTTP 404 responses, discovery/filter/sort/pagination behavior, gallery/fallback and modal keyboard focus, axe checks on key routes, and anonymous admin boundaries. This is not current-build browser, authenticated-admin or actual-service proof. No commands, tests or external checks were run for this docs-only refresh.

## Deployment and operations

1. Follow [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): keep database work stopped pending review, fix the catalog/preservation snapshot guard and obtain successful read-only inspection before separately authorizing atomic migration application and the optional draft-city seed. Existing delegated Storage-policy authority needs no ownership escalation. All four SQL files use Shagun-only application namespaces. Preserve existing BihariBhojan data, Auth/Storage ownership, grants and policies.
2. Follow [docs/OPERATIONS.md](docs/OPERATIONS.md): saved city → explicit researched-draft import or manual draft → authorized photos → saved preview → private-source review → publish venue → explicitly activate city. The 12 candidates have **not** reached import or live editorial review.
3. Read [supabase/README.md](supabase/README.md) before changing schema, RLS, grants, public metadata or image cleanup behavior.
4. [.github/workflows/ci.yml](.github/workflows/ci.yml) is configured for **Node 22**, `npm run check`, `npm run build:qa` and Chromium, with no service secrets and read-only permissions. [Run 34222982087](https://github.com/RichardHenryJames/shagun/actions/runs/34222982087) **completed / SUCCESS** for `2edd4fd831808e6b8ffdf30c46d7265bc734c410`. No hosted test counts were fetched; local counts above are not hosted counts. This initial-commit pass does not cover the pending framework/docs follow-up, deploy the app or certify managed services.

**Publication follow-up:** the initial push used Git Credential Manager's existing **`RichardHenryJames`** owner credential and set `main` to track `origin/main`; no Git user identity was changed. The recorded release safety check covered **161 files with no findings**, and no secrets were leaked. The separate `gh` CLI account's `push=false` is a different credential context, not a blocker after this successful Git push. **This documentation-only follow-up remains uncommitted/unpushed, pending the parent.** Verify the framework-fix redeployment and actual production routes before claiming public success; the initial **Ready** state did not prevent Vercel 404. Supabase API/service keys, real admin access and successful full read-only inspection remain separate blockers; obtain credentials only through an authorized non-chat workflow.

Do not promise zero-cost production: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) contains recorded planning estimates, not a fresh independent vendor check. Verify current prices and terms, including Vercel Hobby's non-commercial restriction and Supabase Free's inactivity/quotas and lack of automatic backups. Budget for an appropriate commercial plan, database **and** storage/Auth recovery, a domain and bandwidth.