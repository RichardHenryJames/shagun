# Shagun — verification record

**Current evidence — 2026-09-08: completed local baseline; expanded checks and release PENDING; managed integration blocked by snapshot code.** `npm run check` passed **692 tests across 8 files**, lint and strict typecheck **before five new database-access tests were added**. The expanded **697-test check is running at this handoff; its result is pending verification**, not a recorded pass. The normal Next.js production build has a recorded pass. The default normal preview is empty/unconfigured at http://localhost:3000, not live Hazaribag inventory. Read-only Supabase inspection recognizes existing delegated Storage-policy authority, resolving the earlier local-runner `MIGRATION_PRIVILEGES` false positive, but now fails **`stage=metadata-public code=22023`** in the catalog/preservation snapshot. No apply, seed, provisioning, research import or database write occurred; `shagun` does not exist.

**The 207 browser passes / 22 intentional skips below are HISTORICAL isolated QA only. No new full browser matrix was run.** They are not latest-build or actual-service proof. This supersedes the earlier local-MVP summary without discarding its historical evidence. This docs-only refresh read local files and records the supplied latest outcomes; it ran no commands, tests, builds or external checks.

## Toolchain, completed baseline and pending local checks

The recorded environment is **Windows, Node v24.15.0, npm 11.12.1, TypeScript 5.9.3 and Next.js 16.3.3**. The project engine range remains `>=22.0.0 <25`; use [../package-lock.json](../package-lock.json) rather than upgrading packages to reproduce a run. Script definitions and pinned compiler/framework versions are in [../package.json](../package.json).

| Check or build mode | Recorded result | Boundary |
| --- | --- | --- |
| `npm run check` — completed baseline | ESLint, Next route type generation, strict TypeScript checking and **692 Vitest tests across 8 files passed**, before the five new database-access tests. | Isolated SQL and unit/action/client/route/research/toolkit tests; not confirmation of the expanded suite or managed-service certification. |
| `npm run check` — expanded suite | **Expected total: 697 tests; run in progress at this handoff, result PENDING verification.** | Includes five new database-access source-contract tests. Record a new pass/failure only after the actual outcome is confirmed. |
| `npm run build` | **Recorded normal Next.js production build passed**, with fixtures disabled. | No new build for this docs update, deployment, migrations, seed, provisioning or research import; no historical build ID is assigned to this result. |
| `npm run build:qa` | **Historical** isolated production-mode QA build passed. | Earlier localhost:3100 fixtures; not a new QA build/current browser matrix or deployment. |
| `npm audit` | **0 vulnerabilities reported earlier in this session.** | Not rerun for this record; not a fresh audit or a guarantee about future advisories. |

### Completed baseline Vitest breakdown — before five new database-access tests

| Test file | Passed |
| --- | ---: |
| [../tests/database/inventory.test.ts](../tests/database/inventory.test.ts) | 197 |
| [../tests/unit/actions.test.ts](../tests/unit/actions.test.ts) | 78 |
| [../tests/unit/clients.test.ts](../tests/unit/clients.test.ts) | 21 |
| [../tests/unit/db-migration-plan.test.ts](../tests/unit/db-migration-plan.test.ts) | 188 |
| [../tests/unit/media.test.ts](../tests/unit/media.test.ts) | 27 |
| [../tests/unit/routes.test.ts](../tests/unit/routes.test.ts) | 44 |
| [../tests/unit/validation.test.ts](../tests/unit/validation.test.ts) | 16 |
| [../tests/unit/research.test.ts](../tests/unit/research.test.ts) | 121 |
| **Total: 8 files** | **692** |

The baseline includes the migration toolkit's **188 passing SQL review/plan tests**. Its isolated Storage fixture supplies realistic managed-role permissions **only inside tests**; no managed ownership, grants or RLS were changed. Five new tests in [../tests/unit/db-access.test.ts](../tests/unit/db-access.test.ts) cover the protected-context/exact-delegation source contract, retained gates, sanitized errors and atomic execution boundaries. Their expanded check is **pending verification**; these tests do not execute SQL or emulate Supautils, and no result for them is asserted here. The actual authority correction and separate snapshot blocker are recorded below.

## Actual shared-service observations — read-only, not acceptance

| Observation | Recorded outcome / limit |
| --- | --- |
| Database connection | Real read-only connection to shared Supabase project `ixkhyqqovacdramymqjk`, through its `aws-1-ap-south-1` session-pooler endpoint on **5432**. The task privately selects BihariBhojan's `DIRECT_URL` through `--source-env`; no Shagun API configuration is created. |
| TLS | Earlier trust-chain failure resolved using the [official Supabase production CA](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt), obtained over authenticated HTTPS and stored in ignored [../.qa/supabase-production-ca.crt](../.qa/supabase-production-ca.crt). Tasks use `--use-system-ca` and `NODE_EXTRA_CA_CERTS`; certificate and hostname verification stay **on**. |
| Read-only permission diagnostic | [../scripts/db-access-inspect.ts](../scripts/db-access-inspect.ts): `create_objects`, `auth_usage`, `auth_read`, `auth_reference`, `storage_usage`, `bucket_read`, `bucket_insert` and `storage_read` are **true**. |
| Existing managed Storage authority | `storage_owner_usage=false` and `storage_owner_member=false`, but **`storage_policy_manager=true`** from already-configured `supautils.policy_grants` for the exact current role on `storage.objects`. Non-ownership is not a blocker. |
| Earlier permission denial | **Resolved local-runner false positive:** `MIGRATION_PRIVILEGES` omitted delegation detection. The updated preflight in [../scripts/db-migrate.ts](../scripts/db-migrate.ts) recognizes the protected-context/JSON capability without changing any grant, ownership or RLS. |
| Catalog syntax versus current runtime blocker | The earlier SQL syntax error **`42601` was fixed and parsed in isolated PGlite**. Current managed read-only inspection gets beyond permissions but fails **`stage=metadata-public code=22023`** in the catalog/preservation snapshot; runtime failure remains unresolved. |
| Writes / preservation evidence | **`shagun_exists=false`; no apply, seed, import, provisioning or database writes.** Full managed inspection and before/after preservation comparisons have not succeeded. Further database writes/debugging are **stopped pending review**, not continuing toward a forced apply. |
| Application/Auth | Supabase browser unauthenticated; no publishable/service API keys obtained for Shagun, no Shagun local environment file and no real admin account/session. A database URL cannot derive API keys. |
| GitHub / local work | Latest recorded observation of [RichardHenryJames/shagun](https://github.com/RichardHenryJames/shagun): empty with default branch `main`. Current work is **uncommitted**; initial commit/push is **pending**, to be updated after an actual result. |
| Separate Git credential paths | `git credential-manager github list` already lists **`RichardHenryJames`**. The `gh` CLI account separately reports `push=false`; authenticated Git push through the existing owner credential may succeed. Neither failure/impossibility nor success of that push is established. |
| Vercel | Existing project imports the correct repository but reports **No Production Deployment**. No successful commit, push, hosted CI, deployment or public launch is claimed. |

[Supabase's Supautils policy-management documentation](https://github.com/supabase/supautils#manage-policies) explains the managed delegation. Updated preflight requires protected `pg_settings` context (`postmaster`, `sighup` or `superuser`), a JSON object whose exact `current_user` entry is an array containing literal `storage.objects`, and all other existing capability/RLS checks. Only booleans are reported; no raw setting, credential or certificate content is exposed, and no new managed authority is configured. This correction recognizes existing authority, not a bypass or a performed policy write.

**Stop database writes/debugging pending review.** Review/fix the catalog/preservation snapshot guard and obtain successful full read-only inspection before separately authorizing atomic apply or an optional seed, with backup/preservation controls intact. Do not request owner escalation, transfer ownership, widen grants, disable RLS or force past a code failure. Obtain the still-unavailable API/service keys and real admin access only through an authorized non-chat workflow. Shared Auth settings must not be globally changed without assessing BihariBhojan. See [DEPLOYMENT.md](DEPLOYMENT.md) for the gated sequence.

## Current research and public presentation

[../data/research/hazaribag-2026-09-08.json](../data/research/hazaribag-2026-09-08.json) contains **12 real source-cited candidates / 27 source references**: the first seven have actual website-derived data for editorial review, not phone verification; five need source/contact follow-up. Reading the current fields confirms **11 non-null primary phones and 5 WhatsApp fields**, not tested or confirmed contacts. All records remain draft/unverified with `photos: []` and no photo permissions; all prices and coordinates are null. Only Mehfil has `capacity_max: 275`, a generic website claim, not confirmed seated capacity. The batch is not exhaustive Hazaribag coverage.

The matching admin workspace's **Add researched drafts** card and [../src/lib/actions/research.ts](../src/lib/actions/research.ts) are implemented, backed by the pure [../src/lib/research-catalog.ts](../src/lib/research-catalog.ts) validator. Explicit import reauthorizes, skips existing city/slug records without overwriting them, and saves each new draft atomically with private notes, `reviewed: false`, unverified status and a null verification date. It neither imports photos nor edits/activates the city. **All 12 are still unimported and unreviewed; no live Auth/import/editor/publish flow has been verified.**

The supplied **manual check of four normal routes on localhost:3000** confirmed no synthetic/test strings with fixtures disabled. This is a limited normal-preview observation, not a rerun of the browser matrix or an Auth check. The public UI remains **empty, unconfigured preparation**, not a published research catalogue. Public inventory has no JSON fallback or hardcoded city list; later cities are admin-created. Optional QA remains labelled and isolated, not disguised as normal inventory. See [HAZARIBAG_RESEARCH.md](HAZARIBAG_RESEARCH.md).

## Historical Chromium browser matrix — not rerun

Counts below are historical executions across the stated scenario/viewport combinations, not distinct assertions, current-build coverage or actual-service certification.

| Fixture scenario | Viewport width | Passed | Skipped | Executed scope |
| --- | --- | ---: | ---: | --- |
| `many` | 1440 px | 76 | 1 | Responsive, interaction, axe and HTTP/metadata/anonymous-boundary checks. |
| `many` | 320 px | 13 | 0 | Responsive route checks. |
| `many` | 375 px | 13 | 0 | Responsive route checks. |
| `many` | 390 px | 38 | 0 | Responsive, interaction and axe checks. |
| `many` | 414 px | 13 | 0 | Responsive route checks. |
| `many` | 768 px | 13 | 0 | Responsive route checks. |
| **`many` subtotal** | **All six widths** | **166** | **1** | **Historical configured six-width matrix.** |
| `empty` | 390 px | 17 | 12 | Empty-inventory responsive, interaction and axe checks. |
| `one` | 390 px | 24 | 9 | One-venue responsive, interaction, gallery and axe checks. |
| **All historical scenarios** | **Only the combinations above** | **207** | **22** | **No failing assertions in those historical runs.** |

- The five non-desktop `many` runs total **90 passed / 0 skipped**. Their 390 px subset of 38 is already included, not an additional run to add to the total.
- The single desktop skip intentionally excludes the **mobile filter drawer**; desktop uses the persistent filter panel.
- The 12 `empty` and 9 `one` skips are **scenario-inapplicable tests**, not failing assertions suppressed to obtain a pass. Empty inventory has no filters/gallery; many-record discovery/pagination tests require that scenario's inventory.
- Arithmetic: $166 + 17 + 24 = 207$ passes; $1 + 12 + 9 = 22$ skips. Empty and one were tested at 390 px only, not at all six widths.
- [../playwright.config.ts](../playwright.config.ts) selects responsive tests at all six widths, interaction/axe tests at 390 and 1440 px, and HTTP checks once at 1440 px. It uses Chromium, one worker, no retries and no existing-server reuse. Viewport width is not a claim of physical-device coverage.

## What the historical browser checks established locally

Sources: [../tests/e2e/public.spec.ts](../tests/e2e/public.spec.ts) and [../tests/e2e/boundaries.spec.ts](../tests/e2e/boundaries.spec.ts).

These findings describe the earlier labelled fixture build, not the current normal preview, shared-project integration or researched-draft importer.

- **Actual HTTP status:** missing/invalid routes and a venue requested under the wrong city return **HTTP 404**, with navigable recovery and noindex. A 200 response displaying not-found text is not accepted. This verifies the local regression fix for existence checks before streaming, not managed data visibility by itself.
- **Discovery:** city and venue prefix searches, literal search syntax, combined type/capacity/facility filters, compatible price bases and budgets, stable sorts, URL-state preservation, reset behavior and duplicate-free pagination. Empty inventory, zero filtered matches and an out-of-range page stay distinct.
- **Honest presentation:** no invented zero/unknown facts, contacts, locations or real venue photos. Missing fields and images receive explicit guidance or labelled illustrations. Pages have one main landmark/heading, image alternatives and no page-level horizontal overflow in the tested states.
- **Gallery and keyboard behavior:** six generated test-card diagrams load; arrows wrap; missing images show the labelled fallback while later images still load. Gallery and mobile filter modals contain Tab/Shift+Tab focus, close with Escape and restore the exact opener and prior scroll-lock state. The public skip link focuses the main landmark.
- **Automated accessibility:** key public routes and the unconfigured admin sign-in screen, plus applicable open dialogs, have no violations under the configured axe WCAG 2 A/AA, 2.1 A/AA and 2.2 AA tags. This is not a full manual accessibility or screen-reader certification.
- **Metadata/media:** canonical and social URLs use the build-time localhost origin; fixture pages are noindex; robots disallows fixture crawling. JSON-LD omits unrecorded contacts/ratings and preserves page positions. Exact fixture media IDs return allowed WebP variants; invalid IDs/widths return 404.
- **Anonymous admin boundaries:** deep private routes reach the real unconfigured login. Valid-origin anonymous media GET/POST/PATCH/DELETE requests receive authentication denials with private/no-store responses. No demo login, preview-query bypass or browser authentication stub is used.
- **Isolation:** browser requests stay on the local origin, with analytics off and no unhandled page exceptions. The only fulfilled browser-response stub is a missing **public synthetic image** to exercise fallback; it does not replace an admin or Auth response.

## Security, image and consistency evidence — local scope

The completed baseline below records passing local tests of application and SQL behavior, not a penetration-test report or proof of a live Supabase configuration. The five new database-access tests are separately pending confirmation and are not added to the passing baseline.

| Boundary | Locally verified behavior | Evidence layer |
| --- | --- | --- |
| Shared-project client targeting | Database clients select schema `shagun`; private helpers use `shagun_private`, media uses `shagun-media` and admin cookies use `shagun-admin-auth`. Runtime inventory does not target shared `public` tables. | Client/unit tests and local source; not verified hosted Data API exposure or shared Auth configuration. |
| Explicit migration toolkit | Reviewed four-file SQL gate, exact private checksum-ledger ordering, target/TLS guards, read-only default, explicit atomic apply and optional seed, preservation assertions and sanitized errors. | **188 passing migration-plan tests in the baseline**; five additional access-contract tests await verification. Isolated catalog syntax parsing does not resolve managed snapshot `22023`; no actual apply/preservation success is claimed. |
| Private research import | Strict catalog/mapping validation, geographic matching, fresh authorization, private provenance, no-overwrite duplicate handling and forced draft/unverified/unreviewed state. | **121 research tests** with isolated/mock boundaries; no real admin session or import. |
| Authorization and grants | Fresh user/active UUID allowlist checks for actions; missing, inactive, mismatched and revoked membership denied in covered cases. Public SQL predicates restrict reads to active cities/published venues; private research and operational data remain separate. No self-promotion or broadened RPC grants. | Real action authorization code with mocked Auth/clients; SQL RLS/grant probes under non-superuser roles in PGlite. |
| Request and privacy guards | Same-origin enforcement, bounded actual request bytes despite forged/absent content lengths, sanitized errors, HMAC-based limiter inputs and fail-closed limiter errors. Disabled analytics, DNT/GPC and invalid event contexts do not become aggregate writes. | Unit/action/route tests with mocked providers; SQL aggregate/limiter tests. |
| Exact saves and lifecycle | Exact optimistic timestamp strings survive with offsets and fractional seconds; stale saves/deletes fail. Venue facts, facilities and research save atomically; review/publication prerequisites and first-launch/publication URL locks are enforced. ISO-date and UTF-8 metadata guards are tested; PostgreSQL's formatted JSON byte limit remains authoritative. | Action tests plus committed, single-connection PGlite transactions; not real concurrent sessions. |
| Image input | Genuine JPEG/PNG/WebP decoding, **≤3 MiB (3,145,728 bytes)**, **≤40,000,000 decoded pixels** and **≤20,000 pixels per side**. Empty/invalid bytes, MIME mismatches, SVG and animation are rejected. | Real Sharp processing of generated in-memory images; no venue photographs or provider calls. |
| Image processing/output | EXIF rotation, metadata stripping, oriented aspect ratio and no enlargement. WebP variants target maximum widths **480/960/1600**; each derivative is bounded to **3 MiB** in the implementation and private-bucket configuration. Smaller sources remain smaller than their variant label. | Sharp tests verify processing/dimensions; PGlite checks bucket configuration, not Storage HTTP enforcement. |
| Ownership and delivery | One saved owner; at most **1 city cover / 24 venue photos**, immutable random UUIDv4 roots, cover/order rules and owner-version changes. Session-authorized uploads use `upsert: false`. Public delivery checks anonymous visibility before privileged object retrieval; private previews/errors are no-store and no signed/public URL is generated. | SQL, route and image tests. Public response headers allow a **60-second** cache; this does not certify a live CDN or recall prior downloads. |
| Reservation before upload | `begin_media_upload` commits durable work **before any Storage write**, with `ready_at` at database transaction time plus **15 minutes**. Duplicate roots cannot renew it; interrupted uploads retain cleanup work even without a media row. | PGlite reservation/grant tests and route ordering tests with deferred mock responses. |
| Atomic finalization | After all three uploads, `finalize_media_upload` consumes the reservation and inserts metadata in one transaction. Validation/ownership/quota errors roll back both changes. Missing/consumed/expired reservations and deletion jobs cannot finalize; wall-time checks prevent extending the window through lock waits. | Real SQL tests and checked-in migration logic; no live lock-contention or Storage HTTP claim. |
| Safe cleanup | Deletion/cascade work is immediately eligible. Cleanup uses the current admin session, selects at most **25 ready jobs**, leaves future reservations alone, rechecks live references, removes **all three variants before acknowledgement**, and retains work on provider/acknowledgement failure. No broad bucket purge or automatic sweeper. | SQL deletion/reservation tests and mocked cleanup action tests; managed failure/retry behavior still needs real-service evidence. |

Sources: [../tests/database/inventory.test.ts](../tests/database/inventory.test.ts), [../tests/unit/actions.test.ts](../tests/unit/actions.test.ts), [../tests/unit/media.test.ts](../tests/unit/media.test.ts), [../tests/unit/routes.test.ts](../tests/unit/routes.test.ts), [../src/lib/media.ts](../src/lib/media.ts) and [../supabase/migrations/0004_media_uploads.sql](../supabase/migrations/0004_media_uploads.sql).

PGlite applies **all four workspace migrations** with synthetic managed Auth/Storage scaffolding. Role probes use `anon`, `authenticated` and `service_role`, not the setup owner's privileges. The realistic Storage-role fixture permission correction is confined to this isolated setup. It is an in-memory, single-connection database, **not Supabase**. Action/route tests invoke real handlers with mocked clients; historical browser tests served labelled local fixtures. These suites establish no live managed Auth, PostgREST or Storage session. The separate actual database observations above remain read-only and narrowly scoped.

The explicit seed is independently checked to create **only draft Hazaribag, Jharkhand**, with no venues, photos or accounts and no overwrite of operator edits. Synthetic test records and diagrams are not production inventory and must not be imported into managed projects.

## Run modes, preview and CI

| Mode | Command/task and origin | Contract |
| --- | --- | --- |
| **Default normal app preview** | **Shagun: Local app preview**; `npm run start -- --hostname localhost` at **http://localhost:3000** | Already-built normal output, `SHAGUN_TEST_FIXTURES=false`; current unconfigured preparation state with no synthetic/test wording or listings. |
| Ordinary local development | `npm run dev` at `http://localhost:3000` | No debugger required. With Supabase unconfigured and fixtures disabled, show the honest preparation state, not demo administration. |
| Fixture compilation | `npm run build:qa` | Use the QA wrapper, not manually assembled environment commands or an ordinary production build. |
| Optional isolated QA preview | `npm run preview:qa` at `http://localhost:3100` | Serve an already-built matching QA build with visible fixture labels and all safeguards; not the default task. The old demo is stopped. |
| Automated browser QA | `npm run test:e2e` after `npm run build:qa` | Playwright owns its own production server on localhost:3100 and refuses to reuse the preview server. |
| Real release build | `npm run build` with real scoped deployment settings and fixtures disabled | Separate normal production build; never deploy QA output or run migrations/seed/provisioning during a build. |

[../scripts/qa.ts](../scripts/qa.ts), [../scripts/qa-environment.ts](../scripts/qa-environment.ts) and [../playwright.config.ts](../playwright.config.ts) share the exact compile/server origin **`http://localhost:3100`**, clear database/service-key settings, disable analytics and public contacts, and select `SHAGUN_FIXTURE_SCENARIO` (`empty`, `one`, or default `many`). Keep the chosen scenario identical for compilation and serving/testing. The QA wrapper refuses Vercel; application fixture guards also reject a configured database or non-local HTTP origin. Do not hand-edit origins or replace localhost with `127.0.0.1` for this workflow.

**Current preview state:** the first task in [../.vscode/tasks.json](../.vscode/tasks.json) was renamed **Shagun: Local app preview** and serves the normal build at **http://localhost:3000**. The old port-3100 demo is stopped. No Shagun API configuration or authenticated admin is connected; the standard preparation UI is not live data. Switching off fixture mode for this task does not hide labels from the separate QA workflow.

Stop the normal preview before replacing shared build output, and any optional QA preview before E2E takes port 3100. Use **Terminal → Terminate Task** or **Ctrl+C** for the relevant process. Normal and QA builds share generated output, so rebuild in the intended mode after changing modes/scenarios; return to `npm run build` before restarting the default normal task. Reproduction guidance is in [../README.md](../README.md).

**CI configuration is not execution evidence.** [../.github/workflows/ci.yml](../.github/workflows/ci.yml) targets **Node 22**, installs locked dependencies, checks, builds QA and runs Chromium without managed-service secrets. It has **not been run on GitHub for this record**. The local Node 24 passes do not certify Node 22 or the hosted runner; the workflow does not deploy or migrate a managed database.

## Managed production acceptance and known limits

The **BLOCKED / PENDING** items in [DEPLOYMENT.md](DEPLOYMENT.md) are managed-service/release acceptance obligations. Passing local tests and historical fixtures do not satisfy them. This record does **not** verify:

- Authorized ownership/configuration of the existing Supabase/Vercel resources, successful managed migration/seed, a committed/pushed release, production deployment, HTTPS final domain or actual hosted CI.
- Real Auth sign-in/out, refresh/expiry/recovery, revoked sessions, ordinary signed-in users, allowlist provisioning or authenticated end-to-end editorial administration.
- Import of any of the 12 research candidates, editor approval, photo permission, present business/contact accuracy, exhaustive Hazaribag coverage or public inventory launch.
- PostgREST schema exposure, REST/RPC visibility and grants on the managed project; raw Storage list/download/write/overwrite/MIME/size enforcement, signed URL behavior, or real-provider partial-upload/cleanup failures.
- Multiple real PostgreSQL connections exercising concurrent saves, photo quotas/covers/order, lock waits and cleanup races.
- Database **and object-byte and Auth/configuration** backup recovery, isolated restore, credential rotation or rollback rehearsal.
- Final-domain latency, image/CDN behavior, Lighthouse/performance with representative authorized images, production quotas or commercial-plan suitability.
- A new full browser matrix for the latest changes, Safari/WebKit, Firefox, physical devices, assistive-technology use or complete manual accessibility conformance. The historical matrix is Chromium-only with the per-width scope above.

Keep all four managed migrations and the draft-city seed explicit, provision approved administrators only through the trusted-terminal/dashboard procedures, and preserve RLS and private Storage. [DEPLOYMENT.md](DEPLOYMENT.md), [OPERATIONS.md](OPERATIONS.md) and [../supabase/README.md](../supabase/README.md) contain those procedures. Local success is not permission to fabricate inventory, bypass authentication or mark managed acceptance complete.

## Historical local visual and performance check — not rerun

The earlier fixture walkthrough reviewed the home page at 390 and 1440 px, the Hazaribag guide at 1440 px and the synthetic gallery detail at 390 px. The original arch illustration was visibly distinct from venue photography, and the synthetic-data banner was visible. Real venue photos and contacts were not invented for screenshots. All four inspected routes returned HTTP 200, loaded their first meaningful image, used the self-hosted typeface, and had no external requests, console errors or unhandled exceptions. This is not a visual check of the latest normal preview or real researched inventory.

One **Lighthouse 13.4.1** mobile-emulation run against the locally served, production-mode `many` fixture homepage completed at **2026-09-08 07:32:26 UTC**:

| Measurement | Local result |
| --- | ---: |
| Performance | **99 / 100** |
| Accessibility | **100 / 100** |
| Best practices | **100 / 100** |
| SEO | **69 / 100** — fixtures deliberately block indexing |
| Largest Contentful Paint | **1.97 s** |
| Cumulative Layout Shift | **0.0026** |
| Total Blocking Time | **62 ms** |
| Document response time | **22 ms** |
| Total transfer size | Approximately **337 KiB** |

Lighthouse reported roughly 30 KiB of potentially unused JavaScript. This largely framework-driven overhead is not a reason to weaken working interactions or ship an additional library. No production performance or field INP claim follows from one local lab run, and synthetic diagrams do not reproduce real inventory image costs. The deliberately lower SEO score is not “fixed” by exposing test pages to search engines.

Generated screenshots, visual checks and the Lighthouse JSON remain historical ignored local QA artifacts. Reproduce against the real HTTPS deployment with representative authorized images before launch. The old fixture preview has since been stopped; the current task serves the normal, unconfigured app on localhost:3000. The **692-test / 8-file pass and normal production build** are the completed baseline at the top of this record; the expanded **697-test check awaits confirmed results**. Neither is a repeat of this browser/Lighthouse run, and the separate supplied four-route normal-preview check is not a new full matrix.