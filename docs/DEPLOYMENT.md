# Deployment runbook

**Current status — 2026-09-08: managed integration blocked by snapshot code; release PENDING, not production-certified.** The completed `npm run check` baseline passed **692 tests across 8 files** before five new database-access tests. The expanded **697-test check is running at this handoff; its result is pending verification**. The normal Next.js production build has a recorded pass. Earlier **207 browser passes / 22 skips are historical isolated QA only**; no new full matrix was run. The default normal preview at http://localhost:3000 is **empty/unconfigured**, not live Hazaribag data. All 12 researched candidates remain unimported.

The shared Supabase project and imported Vercel project already exist. Read-only inspection with verified TLS recognizes **already-configured Supautils delegation to manage policies on `storage.objects`**; the earlier `MIGRATION_PRIVILEGES` denial was a **local-runner false positive**, now resolved. Inspection now gets beyond permissions and fails **`stage=metadata-public code=22023`** in the catalog/preservation snapshot. The earlier SQL syntax error `42601` was fixed and parsed in isolated PGlite, but that does not resolve the managed runtime failure. **No apply, seed, provisioning, research import or database write occurred; `shagun` does not exist. Further database writes/debugging are stopped pending review.** Shagun API keys and a real admin account remain unavailable. Git Credential Manager already has the owner account configured; initial commit/push is pending, not proven impossible. Vercel shows **No Production Deployment**.

This documentation refresh makes no external calls and runs no commands, migrations, imports, commits, pushes or deployments. Examples are for a separately authorized operator, with secrets entered only through a trusted terminal/secret workflow, never chat or command arguments.

## 1. Prerequisites and environment separation

- Use Node.js **24** as the local/deployment baseline with the locked TypeScript **5.9.3** dependency. The recorded Windows verification used **Node v24.15.0 / npm 11.12.1**; the current engine range is `>=22.0.0 <25`. CI is configured for Node 22, but no actual hosted CI/Node 22 pass is certified by these local results.
- Public discovery and private operations share a Next.js **16.3.3** application on the **Node runtime**. Sharp image processing and server-side secrets require a server deployment, not static export or an Edge-only conversion.
- The selected integration target is existing shared Supabase project `ixkhyqqovacdramymqjk`. Confirm authorized ownership, service configuration and suitable commercial plans rather than recreating resources. Keep development/staging separate from this shared live project.
- Do not give preview deployments production editing credentials. Use a separate staging project, or leave Supabase unconfigured for an intentionally empty preview. `noindex` is not access control.
- Keep secrets in the user's local secret file and the appropriate Vercel environment settings. Never supply them in a shell command, public build variable, issue, screenshot, repository or browser payload.
- Local dependency installation is `npm ci`; do not replace the locked toolchain with `npm install …@latest` to make a release pass.

### Repository and hosting access gate

| Recorded surface | Actual state / next requirement |
| --- | --- |
| GitHub repository | Latest recorded observation of [RichardHenryJames/shagun](https://github.com/RichardHenryJames/shagun): empty, with default branch `main`. Initial publication is pending; update the record only after an actual push result. |
| Git authentication | `git credential-manager github list` already lists **`RichardHenryJames`**. The separate `gh` CLI account reports `push=false`; that is not a verdict on authenticated Git using the existing owner credential, which may succeed. No push success is claimed. |
| Local Git | Current work is **uncommitted**; initial commit/push is pending. Review source, staged content, remote configuration and secret exclusions before separately authorized publication. |
| Vercel | Project already exists and imports the correct repository, but displays **No Production Deployment**. Repository import is not deployed application code. |
| Supabase application access | Browser unauthenticated; no publishable/service API keys obtained for Shagun, no Shagun local environment file and no real admin account/session. An authorized project admin must provide keys privately; a database URL cannot derive them. |

Do not bootstrap around unavailable sign-ins or fabricate accounts/credentials. Existing delegated policy authority, successful full inspection, API-key/admin access and a confirmed Git push are separate facts; none establishes the others.

## 2. Environment contract

The template is [../.env.example](../.env.example). For local connected work, save a private copy in the editor at the location required by the `admin:create` script in [../package.json](../package.json). It does not currently exist in Shagun. The ignore rules are in [../.gitignore](../.gitignore); inspect files before sharing or committing them.

| Variable | Required value and visibility |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | The actual **HTTPS origin** for production, with no credentials, path, query or fragment. Used for canonicals, cookie security and same-origin checks. Local development uses `http://localhost:3000`; isolated browser QA uses `http://localhost:3100`. |
| `NEXT_PUBLIC_SUPABASE_URL` | The HTTPS project API URL obtained from the user's Supabase project. Public configuration, not a database connection string. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | That same project's publishable/public API key. Public by design; it is safe only with correct RLS/grants. Never put the service-role key here. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only** privileged key from the same project. Needed for durable rate limiting, optional event aggregation, gated private-object delivery and out-of-band provisioning. Never prefix with `NEXT_PUBLIC_`. Public inventory reads and admin inventory writes do not use this bypass key. |
| `RATE_LIMIT_SECRET` | A distinct, cryptographically random local secret: generate at least **32 random bytes**, store securely; the application requires a value at least **32 characters** long. Use a trusted local generator/password manager, not a sample string. Missing/short secrets fail closed. |
| `NEXT_PUBLIC_ANALYTICS_ENABLED` | `false` by default. Enable only by an explicit privacy/operations decision. No third-party analytics service is provisioned by this setting. |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Optional monitored public corrections/privacy mailbox. Leave empty rather than inventing an address. Do not use a private address that is not intended for publication. |
| `SHAGUN_TEST_FIXTURES` | **Unset or `false` on every deployment**, including preview/staging. `true` is only for isolated localhost QA with no Supabase configuration. Rejected on Vercel or with a connected database. |
| `SHAGUN_DATABASE_URL` | Optional **operator-only** connection source when no `--source-env` is supplied to the migration toolkit. Not an application/build variable and not an API key. Never put the URL or password in arguments/logs. |
| `NODE_EXTRA_CA_CERTS` | Operator-task TLS trust configuration. Existing database tasks point to the ignored official Supabase CA file; it is a public certificate, not a credential. Certificate and hostname verification stay enabled. |

Set deployment values **before building** and in the corresponding runtime environment. `NEXT_PUBLIC_*` values can be embedded at build time; rebuild after changing origins, public keys or analytics settings. Ensure the browser origin and configured site origin agree for admin uploads and other same-origin requests. Do not configure a wildcard origin to work around a mismatch.

On Vercel the limiter fingerprints requests using its sanitized forwarding header. The non-Vercel fallback is for local work; another production host needs a reviewed trusted-proxy/rate-limit configuration, not arbitrary trust in client-supplied forwarding headers.

## 3. Apply the database schema explicitly

**STOP: further database writes and debugging are paused pending review.** The standard inspector has **not completed managed inspection** because of the catalog/preservation snapshot code blocker, not missing Storage-owner authority. Review/fix the guard responsible for `stage=metadata-public code=22023`, then obtain successful full read-only inspection and review backups before separately authorizing apply. No forced bypass, new grants, ownership transfer or RLS changes are permitted to clear this blocker.

### Recorded read-only connection and TLS resolution

- Target: shared project `ixkhyqqovacdramymqjk`, the `aws-1-ap-south-1` Supabase **session-pooler endpoint on port 5432**. The task selects BihariBhojan's private environment file via `--source-env`, using its `DIRECT_URL`; no URL/password is reproduced here or copied into Shagun configuration. See [../.vscode/tasks.json](../.vscode/tasks.json).
- The earlier TLS trust error was resolved with the [official Supabase production CA](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt), downloaded over authenticated HTTPS and saved as [../.qa/supabase-production-ca.crt](../.qa/supabase-production-ca.crt), ignored by [../.gitignore](../.gitignore). Database tasks use `--use-system-ca` and `NODE_EXTRA_CA_CERTS`; `rejectUnauthorized: true` and hostname verification remain on. No insecure TLS fallback was used.
- [../scripts/db-access-inspect.ts](../scripts/db-access-inspect.ts) completed a read-only permissions diagnostic. It reports the following, not a successful migration:

| Diagnostic flags | Recorded value |
| --- | --- |
| `create_objects`, `auth_usage`, `auth_read`, `auth_reference` | `true` |
| `storage_usage`, `bucket_read`, `bucket_insert`, `storage_read` | `true` |
| `storage_owner_usage`, `storage_owner_member` | **`false`**, not a blocker with the existing managed delegation below. |
| `storage_policy_manager` | **`true`** — already-configured policy authority for the current role on `storage.objects`. |
| `shagun_exists` | **`false`** |

Supabase documents [managed policy delegation through `supautils.policy_grants`](https://github.com/supabase/supautils#manage-policies). The role does not need to own `storage.objects` when that existing delegation authorizes its policy management. The updated migration preflight accepts only protected `pg_settings` contexts (`postmaster`, `sighup`, `superuser`), a JSON object with an array for the exact `current_user`, and the literal `storage.objects` entry. It returns capability booleans, not raw configuration. No setting, grant, ownership or RLS change was made; user-set placeholders and malformed configuration are not a bypass. The earlier **`MIGRATION_PRIVILEGES` was a local-runner false positive from missing delegation detection**, now resolved.

The current **Shagun: Inspect shared database** attempt passes the permission stage but fails **`stage=metadata-public code=22023`** in the catalog/preservation snapshot. The earlier query syntax error **`42601` was fixed and parsed in isolated PGlite**; runtime snapshot `22023` remains unresolved. No migration, seed, account, research import or other database write was attempted. Full inspection, preservation comparisons, Data API exposure, Auth and Storage HTTP behavior are not certified. Keep database debugging/writes stopped until review; repair the guard and require a successful read-only inspection before any separate apply authorization.

### Reviewed atomic toolkit and schema contract

Use [../scripts/db-migrate.ts](../scripts/db-migrate.ts) with [../scripts/db-migration-plan.ts](../scripts/db-migration-plan.ts), in an approved operator context, **not an application JWT or standalone autocommit paste**. The completed 692-test baseline includes **188 passing migration-plan tests**; the isolated Storage fixture's realistic managed-role permissions are **test-only**. Five new database-access source-contract tests are in the pending expanded check. Local tests neither grant managed authority nor certify the provider's delegation hook or snapshot runtime; native permissions and all other guards remain authoritative.

| Control | Contract |
| --- | --- |
| Default inspection | Read-only; explicit `--expected-project-ref` is required. `--source-env` reads only the selected file, preferring `DIRECT_URL` over `DATABASE_URL`, without installing sibling variables into the app environment. Without it, only `SHAGUN_DATABASE_URL` is used. |
| Endpoint/TLS guard | Canonical Supabase direct or session-pooler connection on 5432; transaction pooler 6543, mismatched projects and weakened TLS are rejected. Do not simply rewrite a pooler URL's port. |
| Application | Only a **separate, explicitly authorized** invocation with `--apply`, after successful inspection and backup review. All pending migrations, checksum ledger entries, optional seed, postconditions and preservation comparisons use one repeatable-read transaction. First install includes all four migrations. |
| Seed | Off by default. `--seed` requires `--apply` and is an additional explicit choice after the four migrations; it is unrelated to the research importer. |
| History | Exact four-file allowlist and private `shagun_private.schema_migrations` checksum ledger. No gaps, altered checksums, collision adoption, automatic repair/reset, force flag or automatic retry. |
| Preservation | Existing `public`/Auth/Storage data, ownership, grants and unrelated policies are retained. The owned additions are Shagun namespaces, the new `shagun-media` bucket and six Shagun policies; Auth uses the new allowlist's normal FK, never fabricated users. |

The ordered migration sources are:

1. [../supabase/migrations/0001_inventory.sql](../supabase/migrations/0001_inventory.sql) — tables, constraints, indexes, fixed facility vocabulary, RLS, RPCs, review/version invariants and deletion outbox.
2. [../supabase/migrations/0002_storage.sql](../supabase/migrations/0002_storage.sql) — new private `shagun-media` bucket, WebP derivative limits and Shagun-only Storage policies; validates managed RLS/base permissions without altering them.
3. [../supabase/migrations/0003_sitemap.sql](../supabase/migrations/0003_sitemap.sql) — `sitemap_entries(p_offset, p_limit)`, used by production robots/sitemap generation. Do not omit this migration simply because inventory queries work.
4. [../supabase/migrations/0004_media_uploads.sql](../supabase/migrations/0004_media_uploads.sql) — durable `begin_media_upload` reservations before Storage writes, database-timed 15-minute `ready_at` deadlines, atomic `finalize_media_upload` and restricted reservation locking.
5. Only after **all four migrations**, explicitly apply [../supabase/seed.sql](../supabase/seed.sql) if the initial draft Hazaribag row is wanted. It is conflict-safe and never changes an existing city's edits or lifecycle.

All four SQL files use application schema **`shagun`** and helpers **`shagun_private`**, not shared `public` application tables. All application database clients select `db: { schema: "shagun" }`; media uses `shagun-media` and the admin cookie is `shagun-admin-auth`. Definitions are in [../src/lib/db/schema.ts](../src/lib/db/schema.ts) and [../src/lib/db/clients.ts](../src/lib/db/clients.ts).

**Apply migrations and seed only as explicit operator steps**, never from a build, application startup, preview deployment or CI job. Database tests apply them only to isolated in-memory PGlite. The seed has zero venues, photos, Auth users or passwords. Test fixtures must never become real inventory. A connection loss during a future commit can leave an unknown outcome: re-inspect the ledger before explicitly retrying; do not infer rollback from a network error.

Supabase supplies Auth/Storage schemas and roles. An authorized operator must append **`shagun`** to the existing Data API exposed-schema list, preserving **`public` and every other existing entry**; keep **`shagun_private` excluded**. SQL inspection cannot fully certify hosted exposure settings, and the runner does not change them. Do not insert fabricated Auth users, modify managed Storage ownership/base grants, disable RLS or hand-create a colliding bucket/policy to get around the runner. See [../supabase/README.md](../supabase/README.md).

## 4. Configure invite-only administration

Shagun authorization is its own active UUID allowlist, not a project-wide signup switch. In the selected **shared** Supabase project:

- **Do not globally disable signup or anonymous sign-ins without assessing BihariBhojan and obtaining the shared project's operator approval.** Shagun has no public registration flow; ordinary shared Auth users must fail its allowlist/RLS checks. In a separately owned Shagun-only environment, disable unused signup providers as part of that environment's approved policy.
- Review password policy, email confirmation, origins, recovery and narrow redirects with the existing application's requirements before changing shared settings. Do not remove BihariBhojan origins/providers as a Shagun side effect. The application has no self-service reset workflow.
- Grant administration only to intentionally approved people. Membership is the Auth user's UUID in `shagun.admin_users` with `is_active = true`, not an email suffix, domain or client-controlled metadata. The separate `shagun-admin-auth` cookie does not isolate the underlying shared Auth service.

### Preferred: existing provisioning script

After the inventory migration and local project credentials are configured, run from the project root in a trusted **interactive TTY**:

```powershell
npm run admin:create
```

[../scripts/create-admin.ts](../scripts/create-admin.ts) prompts for email and display name, then a unique **12–128-character password and confirmation with input hidden**. Enter credentials directly into that terminal. Do not add arguments, pipe/redirect input or output, use a noninteractive CI job, or put a password in shell history/chat.

“Invite-only” means an operator deliberately approves and provisions the person. This script creates a confirmed managed Auth account (`email_confirm: true`); it **does not send an invitation email or prove mailbox ownership**. Verify the intended recipient separately and transfer initial access through an approved private channel.

The script inserts the allowlist row using the UUID returned by that specific Auth creation. It refuses to promote an existing account on an email conflict. If allowlist insertion fails, it attempts to delete **only the new account created by that run**. If rollback cannot be confirmed, inspect that account in the dashboard before retrying; do not remove unrelated users or blindly rerun provisioning.

### Alternative: dashboard-created user and a bound UUID

Create or invite the intended user through the managed Auth dashboard, following its real email/password flow. Confirm the account and copy its actual Auth UUID from that project. Do not copy a synthetic UUID from tests, generate a new unrelated UUID or insert an Auth row with SQL.

For an approved administrative SQL client that supports bound parameters, use this template with `$1` bound to that **real Auth UUID** and `$2` bound to the chosen display name:

```sql
insert into shagun.admin_users (id, display_name, is_active)
select u.id, $2::text, true
from auth.users as u
where u.id = $1::uuid
returning id, display_name, is_active;
```

Require exactly one returned row and verify the identity. A conflict is a reason to inspect existing access, not silently reactivate it. This is a parameterized template, not a paste-ready query for a SQL editor without parameter binding. For dashboard-only provisioning, select schema `shagun` and its `admin_users` table, then enter those same three values using the actual Auth UUID. No example password, token or working UUID is supplied here. Regular authenticated application clients cannot write the allowlist.

## 5. Prepare and release the application

1. Confirm the currently running expanded 697-test check's result before recording a new pass. Before release, refresh the appropriate local QA using [../README.md](../README.md): `npm run check`, `npm run build:qa`, then Chromium tests. The recorded 207 passes are historical, not a new run of the latest changes. [../scripts/qa.ts](../scripts/qa.ts), [../scripts/qa-environment.ts](../scripts/qa-environment.ts) and [../playwright.config.ts](../playwright.config.ts) retain the exact **localhost:3100** compile/server origin and labelled isolated fixtures. Stop the normal **Shagun: Local app preview** before replacing shared build output and any optional QA preview before Playwright takes port 3100.
2. Review the initial source/secret exclusions and remote setup before separately authorizing commit/push through the **existing configured owner Git credential**. Initial publication is pending; the separate `gh` account's `push=false` does not predict this Git credential's result. Update the record after the actual outcome. Use the **existing** Vercel project already importing the correct repository, with the project root and Next.js preset. Select Node **24**, install with `npm ci`, build with `npm run build`; do not add migrations, seeds, provisioning or smoke mutations to build hooks.
3. Configure the correct environment scope before deployment. A deployed build must have fixtures disabled; do not upload/reuse the local fixture build as production output.
4. Configure the actual HTTPS domain and matching site origin. If public build-time settings changed, rebuild. Recheck canonical URLs, cookies and same-origin requests on that exact domain.
5. Keep Hazaribag draft until real editorial work is complete. The 12 source-cited candidates are **not imported**; the matching admin workspace's **Add researched drafts** action is implemented but needs real Auth and explicit execution. It inserts only new private draft/unverified/unreviewed records and skips existing city/slug records without overwrites. Follow [OPERATIONS.md](OPERATIONS.md) and [HAZARIBAG_RESEARCH.md](HAZARIBAG_RESEARCH.md): review each draft and obtain rights before uploads, publish deliberately, then separately activate the city. No deployment/import automatically publishes anything, and no exhaustive coverage or confirmed-contact claim is justified.
6. Run and retain the managed-service checks below. A green CI run, empty preparation page or successful build is not launch approval.

## 6. CI and local test scope

[../.github/workflows/ci.yml](../.github/workflows/ci.yml) is configured to use Node 22 and `npm ci`, run `npm run check`, build through `npm run build:qa`, install Playwright Chromium and run `npm run test:e2e`. Service variables are empty, repository permissions are read-only, checkout credentials are not persisted, and browser reports/results are uploaded on failure. There is no deployment or managed-database migration job and no managed-service secret reference. **The workflow has not been run on GitHub for this verification record; no hosted CI/Node 22 pass is claimed.**

**Completed local baseline (2026-09-08):** Node **v24.15.0 / npm 11.12.1**, TypeScript **5.9.3**, Next.js **16.3.3**. `npm run check` passed lint, route type generation, strict typechecking and **692 tests across 8 files before five database-access tests were added**; the normal **`npm run build` has a recorded pass**. [VERIFICATION.md](VERIFICATION.md) lists the baseline counts, including 188 migration-plan and 121 research tests. The expanded **697-test check is running, with its result pending verification**; record it only after completion is confirmed. No new full browser matrix, QA build or command execution is claimed by this docs-only refresh.

**Historical isolated QA:** the earlier QA build and `many` Chromium scenario passed all six widths: **166 passed / 1 skipped**, comprising desktop **76/1** and the other five widths **90/0**. At 390 px, `empty` and `one` passed **17/12** and **24/9** respectively (passed/skipped). **Historical total: 207 passed / 22 intentional skips**, with no failing assertions in those runs. These are neither latest-build browser results nor actual-service proof. Skip reasons and local HTTP/keyboard/axe scope are retained in [VERIFICATION.md](VERIFICATION.md).

The first/default preview task in [../.vscode/tasks.json](../.vscode/tasks.json) is **Shagun: Local app preview**, running `npm run start -- --hostname localhost` with `SHAGUN_TEST_FIXTURES=false` at **http://localhost:3000**. The supplied manual check of four normal routes found no synthetic/test strings; the preview remains empty/unconfigured preparation, not real configured inventory. The old port-3100 demo is stopped; optional QA scripts still retain labels and isolation safeguards. Neither preview is a hosted deployment or an authenticated editorial run.

The database suite applies **all four migrations**, including sitemap null/range rejection and durable upload reservation tests; action tests cover strict ISO dates and UTF-8 metadata budgets. PostgreSQL's formatted JSON byte check remains authoritative. PGlite's managed schemas are stubs and route/action providers are mocked; these completed local tests do not contact Supabase or prove real Auth, PostgREST exposure, Storage HTTP enforcement, actual concurrency, restore or production performance. An earlier `npm audit` in this session reported **0 vulnerabilities**; it is not a fresh audit for this record.

## 7. Pricing, quotas and recovery budget

The figures below are **recorded planning estimates** from [ARCHITECTURE.md](ARCHITECTURE.md), not a fresh independent vendor check. Verify current vendor prices, regional availability, usage limits, terms and taxes before selecting a plan.

| Recorded assumption | Planning consequence |
| --- | --- |
| Supabase Free: 500 MB database, 1 GB storage, 5 GB egress and 5 GB cached egress; inactivity pausing and no automatic backups. | Suitable only if the actual availability, quota and manual recovery obligations are accepted. Do not promise always-on or zero-cost production. |
| Free image transformations not included; Supabase Pro recorded from $25/month. | Shagun pre-generates variants. Images still consume storage/bandwidth, and a paid plan does not remove the need to verify backup coverage. |
| Vercel Hobby: non-commercial personal use only; Pro developer seats recorded at $20/month plus usage/taxes. | A commercial directory needs an appropriate plan; do not treat Hobby as a free commercial production entitlement. |

Budget separately for a domain, database and object backups, Auth recovery, monitoring, function execution and bandwidth. A database backup is not a backup of stored image bytes. Rehearse the complete restore described in [OPERATIONS.md](OPERATIONS.md).

## 8. Production acceptance checklist — BLOCKED / PENDING

Record evidence, environment, build/revision, date and operator for each check outside public logs. Do not tick items from assumptions or fixture results. Use isolated staging for synthetic/destructive/fault tests; use approved real inventory for final production visibility checks.

The unchecked items below require their stated **completed local, real managed-service or hosted-release evidence**. The 692-test baseline is complete; confirmation of the expanded 697-test run is pending, and the older six-width matrix and 390 px empty/one runs remain historical evidence only. Read-only connectivity and delegated policy capability do not satisfy the full inspection, migration, Auth, publication or deployment gates.

### Resources, configuration and build

- [ ] **BLOCKED:** Authorized Supabase application configuration, API/service keys supplied privately and a real admin account/session remain unavailable. Existing delegated Storage-policy authority is recognized; no additional owner authority is required by the diagnosis. Confirm resource ownership, region, current commercial terms and budget; the existing Vercel import has no production deployment.
- [ ] **PENDING:** Production/staging separation; HTTPS final origin; correct build/runtime environment; secret storage and public-bundle/log inspection; fixtures disabled on every deployment.
- [ ] **PENDING:** Confirm the expanded 697-test check, then record the final release revision's actual commit/push outcome through the already-configured owner Git credential, hosted CI and a separately built Node 24 deployment with fixtures disabled and real scoped configuration. The separate `gh` account's `push=false` is not proof that Git push is unavailable. Retain the 692-test baseline and historical browser evidence separately; no hosted CI or production deployment is claimed.
- [ ] **BLOCKED — code:** Review/fix the `stage=metadata-public code=22023` catalog/preservation guard and obtain successful full read-only inspection before explicitly authorizing atomic application of all four migrations and the private checksum ledger; record any optional draft-city seed separately. Database writes/debugging remain stopped pending review, with no forced bypass. Later exercise `sitemap_entries` and upload reservation/finalization RPCs on the managed service. Current `shagun_exists=false`; no apply/seed has run.
- [ ] **PENDING:** `shagun` appended to the existing API schema list without removing other entries, `shagun_private` excluded, private `shagun-media` bucket and narrow grants/RLS verified. Preserve existing `public`/Auth/Storage data, ownership, base grants and unrelated policies.

### Managed Auth and authorization

- [ ] **PENDING:** Shared Auth impact reviewed with BihariBhojan's operator before any project-wide signup/provider/password/email/recovery/redirect changes. Approved real Auth user and matching active `shagun.admin_users` UUID provisioned securely; ordinary shared-project accounts denied Shagun administration without relying on a global signup shutdown.
- [ ] **PENDING:** Real login, logout, refresh/expiry, bad credentials, ordinary non-admin user and revoked/inactive administrator tested. A previously valid session cannot regain private access after revocation.
- [ ] **PENDING:** Direct admin routes, saved previews, Server Actions and media GET/POST/PATCH/DELETE independently deny missing/expired/non-admin/revoked sessions; private responses/cookies are not publicly cached.
- [ ] **PENDING:** Managed anonymous **and ordinary signed-in** REST/RPC probes cannot read draft/unpublished venues, hidden-city venues, private research, cleanup jobs or analytics, or mutate inventory/allowlist. Active admin preview works without widening public query predicates.
- [ ] **PENDING:** Direct Storage download/list/write/overwrite paths deny anonymous, non-admin and revoked clients. Guessing media IDs/roots or adding a preview parameter grants no access; no public bucket or distributed signed URL bypass.
- [ ] **PENDING:** Same-origin/missing-origin/foreign-origin probes and durable login/upload/cleanup limits behave correctly on the final host. Missing limiter configuration/provider failures fail closed without leaking internals.

### Inventory, media and consistency

- [ ] **PENDING:** Real Auth → matching city workspace → explicit research import/manual draft → authorized upload → saved preview → private-source review → publish → separate activation works against managed services. Check import skip/no-overwrite, unreviewed state and partial-progress handling. All 12 prepared candidates are currently unimported. Published venue in a draft/inactive city stays private; counters are not coverage claims.
- [ ] **PENDING:** Publication, verification and 90-day staleness are distinct; factual/source/facility changes require re-review. Public descriptions/metadata/credits contain no private notes or unauthorized personal information.
- [ ] **PENDING:** The managed upload path enforces JPEG/PNG/WebP input of **≤3 MiB**, decoded **40 million pixels maximum**, rejection of animation/invalid bytes/SVG, metadata stripping and WebP derivatives targeting maximum widths of 480/960/1600 pixels, each **≤3 MiB**, preserving the oriented aspect ratio without enlargement. City maximum 1 and venue maximum 24 are enforced server-side. Local image/SQL/route checks already cover these rules; verify their real-service enforcement separately.
- [ ] **PENDING:** Real session upload/download, cover changes, order, metadata, delete and preview work. Public delivery checks current anonymous ownership; unauthorized draft images never acquire public caching.
- [ ] **PENDING:** Publish then unpublish/deactivate hides fresh public pages/search and stops new image delivery after the documented CDN window of at most 60 seconds. Already downloaded or externally cached copies remain non-recallable.
- [ ] **PENDING:** Managed failure-path tests confirm `begin_media_upload` commits a reservation **before** the first Storage write, with `ready_at` at database time plus **15 minutes**. Interrupted/no-row uploads retain cleanup work; `finalize_media_upload` atomically consumes the reservation with the row, rolls both back on error, and rejects expired reservations and deletion jobs.
- [ ] **PENDING:** Delete/cascade creates immediately ready outbox work. Cleanup uses the current admin session, selects only `ready_at <= now`, rechecks no live `media_assets` reference and removes **all three variants before acknowledgement**. Provider/acknowledgement failures remain retryable. Future reservations are left alone; no broad bucket deletion, deadline extension or root reuse.
- [ ] **PENDING:** Two real concurrent sessions exercise stale saves/deletes, atomic research/facility updates, first-publication URL locks, owner-version changes, concurrent cover/order/upload limits and cleanup retries. PGlite alone is insufficient evidence.

### Public behavior, performance and operations

- [ ] **PENDING:** Final-domain public navigation, empty/missing-data states, filters/pagination, gallery keyboard/focus behavior and phone/WhatsApp links work without signup or invented facts.
- [ ] **PENDING:** Final-domain mobile/layout/accessibility checks at 320, 375, 390, 414, 768 and 1440 px; Lighthouse/performance evidence on the actual HTTPS domain with representative authorized images. No score is presumed from local tests.
- [ ] **PENDING:** Canonicals, alias redirects, escaped JSON-LD, noindex search/filter/admin/preview/empty city pages, robots and every sitemap partition verified on the final domain. Missing/hidden canonical city and venue routes return HTTP **404** before streaming, not 200 with not-found content. Only published venues in active cities and nonempty active cities enter inventory sitemap entries.
- [ ] **PENDING:** Analytics remains off unless intentionally enabled. If enabled, managed aggregate writes, Do Not Track/Global Privacy Control, context validation and retention housekeeping are checked without collecting raw searches or visitor identifiers.
- [ ] **PENDING:** Monitored corrections channel if configured, image-rights response process, named maintenance owner and review/cleanup schedule established.
- [ ] **PENDING:** Database **and storage objects/bucket policies and Auth identities/configuration** backed up through supported procedures; encrypted/off-site retention and recovery objectives agreed; isolated restore actually tested, including allowlist UUIDs and post-restore draft privacy.
- [ ] **PENDING:** Rollback/recovery and credential revocation/rotation rehearsed; hosting failures, quotas, pauses, cleanup backlog and backup freshness monitored. No current production-readiness certification until the owner accepts the evidence.