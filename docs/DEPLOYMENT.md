# Deployment runbook

**As of 2026-09-09: SQL installation, Production secret storage and review publication through `9db51bd` are complete; original `2072dc7` hosted audit checks passed; production promotion is blocked.** Guarded `--apply --seed` succeeded on shared Supabase **`ixkhyqqovacdramymqjk`**. Critical anonymous Order/ContactMessage access is confirmed; Shagun is missing from the API schema list, and there is no approved real administrator or reviewed inventory. **Review publication is not a production release. No force launch or promotion is authorized.**

This is an operator runbook, not authorization to deploy or mutate shared settings. Recorded work/evidence spans 8–9 September. Local passes, hosted audit checks, managed SQL/HTTP probes and GitHub publication have distinct scopes; full managed acceptance remains incomplete. Follow-up code CI status, counts, preservation flags and limited restore evidence are canonical in [VERIFICATION.md](VERIFICATION.md).

## 1. Deployment boundary

- Use the existing approved Vercel/shared Supabase resources; do not create another paid production stack as a side effect.
- Deploy Next.js **16.3.3** on the **Node runtime**, with Node **24**, strict TypeScript and locked dependencies. Sharp/server secrets require a server, not static export or an Edge-only conversion.
- [../vercel.json](../vercel.json) explicitly selects `nextjs`, `npm ci` and `npm run build`. Verify the resulting revision and real routes; neither an old failure nor a provider **Ready** label establishes current runtime behavior.
- Builds/startup never migrate, seed or provision users. CI may reset/bootstrap and create temporary accounts **only in its owned local integration project**, never the managed project. Keep review previews/staging credentials separate from the shared live project; noindex alone is not access control.
- The [audit/second-pass-2026-09-09](https://github.com/RichardHenryJames/shagun/tree/audit/second-pass-2026-09-09) review branch contains published fix [9db51bd](https://github.com/RichardHenryJames/shagun/commit/9db51bd5b0a11395d62401353fde3e0db03a59fe), after original audit `2072dc7` passed both hosted jobs. Follow-up code status is tracked in [VERIFICATION.md](VERIFICATION.md). Do not merge to `main`, redeploy Production or enable live inventory to bypass the security hold.
- **Observed boundary:** deployment **6344149398** for `2072dc7` is **Preview**, `production_environment=false`, state `success`; actual smoke found the catalog 500 later fixed in `9db51bd`. GitHub `main` is confirmed unchanged at `b62d6ed`; user-local `main` remains `b066ed5`. No production promotion occurred. These observations do not claim a global Vercel production-branch setting, which was not fetched; full SHAs and smoke responses are in [VERIFICATION.md](VERIFICATION.md).
- The Docker/Supabase CLI stack is **local/CI testing only**, with no additional paid deployment runtime. The normal, fixture and real-integration modes/commands are in [../README.md](../README.md).

## 2. Production configuration — SAVED, runtime not yet certified

The following **Production-scoped Vercel settings are already saved**. Do not request the keys again in chat or reveal their values to verify presence.

| Variable | Stored contract |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | `https://shagun-peach.vercel.app`; replace only deliberately when adopting a different final HTTPS origin. |
| `NEXT_PUBLIC_SUPABASE_URL` | The HTTPS API URL for shared project `ixkhyqqovacdramymqjk`; public configuration, not a database URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **Saved as Config**; public/publishable key from that project. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Saved as Secret**; server-only backend secret/service-role credential, never a public key or browser variable. |
| `RATE_LIMIT_SECRET` | **Generated and saved as Secret**, with 32 random bytes of entropy; value never revealed. The application enforces a minimum 32-character value. |
| `SHAGUN_TEST_FIXTURES` | **`false`**. Keep disabled on every hosted environment. |
| `NEXT_PUBLIC_ANALYTICS_ENABLED` | **`false`** unless a later explicit privacy/operations decision enables it. |

`NEXT_PUBLIC_CONTACT_EMAIL` is optional: use only a monitored mailbox intended to be public, not the private admin identity. The template is [../.env.example](../.env.example). The zero-row probes confirmed acceptance of the public publishable key, not the backend secret or deployment readiness. Saved Vercel secrets do **not** configure a local provisioning terminal or prove the running deployment has adopted them.

The public key was momentarily visible in the browser UI, used only in browser memory for legitimate read-only probes and hidden before tool results; its value was not printed or returned to the model. **Private/backend secrets were not read or revealed.** Do not misreport this as “no key was ever revealed,” request the saved keys again or retrieve customer rows.

Set matching build/runtime values; rebuild after public configuration changes. The site URL must be an origin without credentials, path, query or fragment and must match the browser origin for same-origin requests. Do not use wildcard origins to suppress failures.

`configReadiness` separates public setup from admin readiness, checks known key-role mistakes, origin/server-key/limiter requirements and host support without reporting secret values. Vercel uses its sanitized request-IP header. A non-Vercel real host is **not ready and fails closed**; the shared `local` limiter fingerprint is loopback-HTTP-only. Another production host needs a reviewed request-fingerprint implementation, not a configuration bypass.

## 3. Database installation — COMPLETE

All five ordered migrations are installed and recorded in the private checksum ledger:

1. [../supabase/migrations/0001_inventory.sql](../supabase/migrations/0001_inventory.sql) — inventory, facility vocabulary, constraints, RLS/RPCs, review/version invariants and deletion outbox.
2. [../supabase/migrations/0002_storage.sql](../supabase/migrations/0002_storage.sql) — private `shagun-media` bucket and six Shagun-specific policies, preserving managed ownership/base grants.
3. [../supabase/migrations/0003_sitemap.sql](../supabase/migrations/0003_sitemap.sql) — bounded, eligible-inventory `sitemap_entries` RPC.
4. [../supabase/migrations/0004_media_uploads.sql](../supabase/migrations/0004_media_uploads.sql) — durable pre-upload reservation, 15-minute deadline and atomic finalization.
5. [../supabase/migrations/0005_city_preview.sql](../supabase/migrations/0005_city_preview.sql) — admin-only `preview_city_venues` / `preview_city_facets` and their private helper.

[../supabase/seed.sql](../supabase/seed.sql) was explicitly applied with them: draft Hazaribag only, no venues/photos/accounts, no overwrite on slug conflict. There is no need to recreate that city or paste the migrations manually.

For future authorized schema work, retain [../scripts/db-migrate.ts](../scripts/db-migrate.ts)'s read-only default, exact `--expected-project-ref`, selected private connection source and verified TLS. The operator tool accepts canonical direct/session-pooler port 5432, not transaction-pooler 6543; never rewrite a port or disable certificate/hostname verification to bypass a guard. The existing official CA is configured through the database tasks.

Only separately authorized `--apply` may execute reviewed pending changes. It uses one repeatable-read transaction for preflight, snapshots, SQL, ledger, optional seed and postconditions/preservation checks. Keep checksum/order/collision guards, existing Storage-policy delegation and no-force/no-reset/no-automatic-retry behavior. Reinspect the ledger after an ambiguous commit. Application schemas are `shagun` / `shagun_private`; unrelated `public`, Auth and Storage objects are not Shagun's migration targets.

## 4. Operator gates: critical shared exposure and missing Shagun schema

**Critical exposure is confirmed:** anonymous `HEAD /rest/v1/Order?select=id&limit=0` and `HEAD /rest/v1/ContactMessage?select=id&limit=0` both returned **200**. SQL had already found SELECT grants and disabled RLS. No customer rows were retrieved; empty baseline tables do not protect future data. Installation preserved this preexisting configuration, not its security.

The zero-row city probe with `Accept-Profile: shagun` returned **406 / PGRST106 / Invalid schema: shagun**. The expired dashboard session's management request returned **401**. The official sign-in page is visible, but the GitHub button did not navigate; the user must complete sign-in privately.

1. **Escalate to the shared/BihariBhojan owners and obtain separate authorization for remediation.** Do not change sibling grants/RLS, shared Auth settings or existing API entries as a Shagun side effect. Keep production promotion blocked; verification must not retrieve customer rows. See [AUDIT.md](AUDIT.md).
2. After signing in, open this project's [Data API / exposed schemas settings](https://supabase.com/dashboard/project/ixkhyqqovacdramymqjk/settings/api) and inspect the complete existing list privately.
3. For the authorized Shagun configuration step, **append `shagun` if absent; preserve `public` and every other existing entry; keep `shagun_private` excluded**. Do not replace the list. Any owner-approved sibling security remediation is a separately scoped change, not permission to alter the list opportunistically.
4. Recheck the Shagun city endpoint with `select=id&limit=0` and `Accept-Profile: shagun`; schema access should succeed rather than return PGRST106, without fetching rows. The draft-only seed still has no public inventory. Complete role-specific REST/RPC checks after provisioning actual approved membership, never by substituting a service key for a user session.

The migration runner does not edit hosted API exposure or shared Auth policy. These gates require authenticated operator access and owner decisions, not another seed or an authorization bypass.

## 5. Operator gate: provision a real administrator

**Blocked on human identity/input:** managed Auth-user count and Shagun admin count are both zero. No approved real email was supplied and the operator was unavailable. Do not invent an email, hardcode a password, use a test identity or add public signup.

After the owner-approved API configuration step, choose either the dashboard path below or the existing terminal alternative. For **`npm run admin:create`**, privately configure `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the local environment required by the package script; Vercel's saved settings do not populate it. Use a trusted interactive terminal without credential arguments, piping or redirected output. The human enters the approved email/display name and hidden password/confirmation directly there, never through chat.

[../scripts/create-admin.ts](../scripts/create-admin.ts) checks schema access before prompting or creating state, creates a managed Auth account, then allowlists the returned UUID. It refuses existing-user promotion on email conflict and attempts rollback only for the newly created account if allowlisting fails. An unconfirmed rollback needs inspection before retry. Provisioning does not send an invitation or prove mailbox ownership; the operator must verify the intended person.

Shared signup/providers/password/email/redirect/recovery settings remain unchanged unless the shared owner explicitly approves a separate change. Shagun authorization is the active UUID allowlist, not an email suffix or project-wide signup switch. Local CLI **2.116.0** uses `auth.email.enable_signup=true` to enable email/password while global `auth.enable_signup=false` denies registration; that tested **local** setup must not be copied to managed shared Auth automatically.

**Dashboard path (no local backend-key copy needed):** under Supabase **Authentication → Users**, create the intended real account and enter its password privately there. A trusted operator then verifies that account's approved email and actual UUID, opens `shagun.admin_users` and adds **only** that UUID as `id`, the approved display name and `is_active=true`. Do not invent a UUID or elevate every Auth user. Only the approved email/UUID—not a password or key—may be supplied for allowlisting assistance. The account is not a Shagun admin until that explicit step is complete.

## 6. Final build, runtime and publication gates

Use [VERIFICATION.md](VERIFICATION.md) as the canonical record for final-result labels and the follow-up hosted run. Completed evidence has these distinct scopes:

- **Post-fix local check/build:** `npm run check` passed **952 tests / 14 files**, including **60 catalog tests** and **19 sitemap tests**. The normal build passed after `9db51bd` with **`SHAGUN_TEST_FIXTURES=false`**, dynamic sitemaps and no compilation-time database queries. Never deploy fixture/integration output or rebuild over a running preview's output.
- **Prior Windows public matrix:** `many` **166/1**, `empty` **95/28**, `one` **120/21** (passed/skipped), each at **320, 375, 390, 414, 768 and 1440 px**; **381 passes / 50 intentional, inapplicable skips**. This matrix preceded the final catalog-only guard; it was not the hosted all-scenario CI scope.
- **Isolated service workflows:** Windows **3/3** passed after the table-wrapper/axe/no-overflow fix and before the sitemap refactor. Both original `2072dc7` and final `9db51bd` then independently passed Node 22 checks/`many` fixtures and all three Node 24 real Auth/Storage workflows in hosted CI. Exact runs/counts are in [VERIFICATION.md](VERIFICATION.md); these isolated-service passes do not certify managed production services.
- **Actual Preview finding and follow-up:** original `2072dc7` smoke found a sanitized, non-leaking catalog **500**, not an all-green preview. Published `9db51bd` returns private/no-store, noindex **503** before client construction when unconfigured; actual local and new deployed Preview valid/malformed queries confirmed the exact non-secret response. The new Preview's full recorded smoke passed. Configured fresh Auth/allowlist checks remain unchanged. No new SQL/shared settings or production promotion.

These managed release gates remain open independently of the completed local results:

- [ ] **Managed authorization:** real login/logout/refresh/expiry and revoked-member denial; independent private route/action/media checks; anonymous/ordinary users cannot read hidden/private data, mutate inventory or access raw private Storage. Unsupported origins/host configuration and limiter/provider failure must fail closed.
- [ ] **Managed consistency/media:** real session uploads/previews, cover/order/delete and safe cleanup; interrupted uploads preserve reservations, expired work cannot finalize and every variant is removed before acknowledgement. Use isolated non-production services for fault/concurrency tests, including two editors and photo/cleanup races; never insert manual production test records.
- [ ] **Real Hazaribag publication — deferred during the security hold:** an active real admin imports/reviews drafts, obtains rights for any uploaded images, publishes selected venues and explicitly activates the city only after release gates close. All 12 candidates are still unimported/unreviewed; seven fresh official-source 200 responses provide partial evidence, not verification. Resolve the Aranya email discrepancy and ambiguous AC-room claims; do not fabricate review dates or photographs.
- [ ] **Public HTTPS acceptance — separately owner-gated:** actual hosted revision/configuration, secure cookies, same-origin requests, discovery/detail/filter behavior, true pre-streaming 404s, no private notes, correct canonicals/escaped JSON-LD and noindex boundaries. Verify the request-time `/sitemap.xml` index, newly needed partitions and robots' single index link; local HTTP sitemap 404s and 19 local contract tests are not production indexing proof. Include six-width accessibility and measured final-domain performance without bypassing preview protection.
- [ ] **Recovery and operations:** complete the recovery gate below; name the maintenance owner, corrections channel if configured, review/cleanup cadence and monitoring for errors, quotas and backup freshness. Keep analytics off unless deliberately reviewed and enabled.

After the final catalog guard and normal fixtures-false build, the localhost:3000 preview was restored and confirmed honestly empty, without synthetic warnings or inventory. An empty connected directory is correct before publication. No real Hazaribag launch or production promotion is authorized while the shared-security, API, admin and editorial blockers remain. Neither deployment nor research import auto-publishes inventory. Follow [OPERATIONS.md](OPERATIONS.md).

## 7. Recovery: completed rehearsal versus remaining work

**Completed:** before apply, a private public-schema backup and separate Auth/Storage logical metadata were retained under ignored [../.qa/backups/](../.qa/backups/). Only the public-schema archive was restored into a new local scratch database; shared-table fingerprints matched and cleanup completed. Ownership/ACL metadata remain in the artifacts, but the rehearsal did not replay original owners/ACLs or test role restoration.

**Still required:** supported recovery of the now-installed Shagun namespaces/ledger/data, actual private image bytes, managed Auth identities/settings, roles/permissions and deployment configuration. The pre-install public-only archive is not that backup. Agree retention, protected/encrypted off-site storage, recovery objectives and an isolated rehearsal with the shared owner. Never restore over production for testing. Full procedures and revocation/cleanup cautions are in [OPERATIONS.md](OPERATIONS.md).

## 8. Cost planning — estimates, not fresh pricing

Historical planning estimates were **Supabase Pro from US$25/month** and **Vercel Pro developer seats at US$20/month**, plus usage/taxes. They are not a current quotation or an assertion that Shagun needs a second dedicated Supabase subscription; the selected project is shared.

Before committing spend, check [Supabase pricing](https://supabase.com/pricing), [Vercel pricing](https://vercel.com/pricing) and [Hobby plan eligibility](https://vercel.com/docs/plans/hobby). These references were **not freshly checked** for this update. Confirm commercial-use terms, region, free-tier pauses/quotas, actual backup coverage and shared-project usage.

Budget for domain, object/database recovery, monitoring, function execution and image bandwidth. Pre-generated WebP variants reduce transformation work, not storage/egress costs. The isolated Docker stack is development-only; this documentation provisions no paid service and promises neither zero-cost production nor complete managed acceptance.