# Deployment runbook

**As of 2026-09-09: SQL installation and Production secret storage are complete; production promotion is blocked.** Guarded `--apply --seed` succeeded on shared Supabase **`ixkhyqqovacdramymqjk`**. Confirmed critical Order/ContactMessage exposure, Data API readiness, private administrator provisioning and editorial acceptance require independent closure. Current probe/operator, autocomplete, city-cover workflow and review-publication evidence is canonical in [VERIFICATION.md](VERIFICATION.md); older failures or passes are not fresh results. **Review publication is not a production release. No force launch or promotion is authorized.**

This is an operator runbook, not authorization to deploy or mutate shared settings. Recorded work/evidence spans 8–9 September. Local passes, hosted audit checks, managed SQL/HTTP probes and GitHub publication have distinct scopes; full managed acceptance remains incomplete. Follow-up code CI status, counts, preservation flags and limited restore evidence are canonical in [VERIFICATION.md](VERIFICATION.md).

## 1. Deployment boundary

- Use the existing approved Vercel/shared Supabase resources; do not create another paid production stack as a side effect.
- Deploy Next.js **16.3.3** on the **Node runtime**, with Node **24**, strict TypeScript and locked dependencies. Sharp/server secrets require a server, not static export or an Edge-only conversion.
- [../vercel.json](../vercel.json) explicitly selects `nextjs`, `npm ci` and `npm run build`. Verify the resulting revision and real routes; neither an old failure nor a provider **Ready** label establishes current runtime behavior.
- Builds/startup never migrate, seed or provision users. CI may reset/bootstrap and create temporary accounts **only in its owned local integration project**, never the managed project. Keep review previews/staging credentials separate from the shared live project; noindex alone is not access control.
- Review-branch publication, exact revisions and hosted results are recorded only in [VERIFICATION.md](VERIFICATION.md). Do not merge to `main`, redeploy Production or enable live inventory to bypass the security hold.
- Historical Preview/non-Production deployments, the original catalog smoke defect and earlier branch observations are retained in [VERIFICATION.md](VERIFICATION.md). They are not fresh branch/process checks or proof of a global Vercel production-branch setting. Hosting protection can add a Vercel login independently of Shagun's email/password login. The current usable admin origin and any explicitly owner-authorised, domain-scoped hosting exception are recorded there; do not assume all Preview addresses have the same access policy.
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

For an explicitly approved shorter review/admin domain, assign it to the exact **Preview branch**, preserve the Production domain, update only that branch's site origin and verify the resulting build. If the owner requests removal of the extra hosting login, prefer a documented exception for that exact domain over disabling protection for every historical deployment. Keep managed Shagun Auth, active UUID authorization, private previews, no-store/noindex behavior and origin checks unchanged. Verify the credential-free login form, private-route/API denial and the intended origin with no copied sessions, share-link secrets or forged hosting flags. This access configuration does not publish draft inventory or clear Production release gates.

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

## 4. Operator gates: critical shared exposure and Data API verification

**Critical exposure is confirmed:** historical zero-row probes and SQL SELECT-grant/RLS evidence for `public.Order` and `public.ContactMessage` are recorded in [VERIFICATION.md](VERIFICATION.md). No customer rows are needed to demonstrate impact; empty baseline tables do not protect future data. Installation preserved this preexisting configuration, not its security.

Current Data API and dashboard sign-in observations are maintained in [VERIFICATION.md](VERIFICATION.md), separately from historical HTTP failures and unconfirmed reports. Complete the official Supabase/GitHub owner sign-in privately; an old open settings page is not proof of current access, and a sign-in redirect alone is not an observed HTTP 401.

1. **Escalate to the shared/BihariBhojan owners and obtain separate authorization for remediation.** An unavailable approval response or general request to finish is not authorization. Do not change sibling grants/RLS, shared Auth settings or existing API entries as a Shagun side effect. Keep production promotion blocked; verification must not retrieve customer rows. See [AUDIT.md](AUDIT.md).
2. After signing in, open this project's [Data API / exposed schemas settings](https://supabase.com/dashboard/project/ixkhyqqovacdramymqjk/settings/api) and inspect the complete existing list privately.
3. For the authorized Shagun configuration step, **append `shagun` if absent; preserve `public` and every other existing entry; keep `shagun_private` excluded**. Do not replace the list. Any owner-approved sibling security remediation is a separately scoped change, not permission to alter the list opportunistically.
4. Recheck the Shagun city endpoint with `select=id&limit=0` and `Accept-Profile: shagun`; schema access should succeed rather than return PGRST106, without fetching rows. Neither a successful zero-row probe nor the draft seed establishes public discovery readiness. Complete role-specific REST/RPC checks after provisioning actual approved membership, never by substituting a service key for a user session.

The migration runner does not edit hosted API exposure or shared Auth policy. These gates require authenticated operator access and owner decisions, not another seed or an authorization bypass.

## 5. Operator gate: provision a real administrator

**Identity approval is not provisioning.** Actual account/API/private-input status is recorded in [VERIFICATION.md](VERIFICATION.md), not inferred from an older SQL count. After verified API readiness and private operator sign-in, enter a new unique password meeting the unchanged **12-character** local/provisioning minimum, then allowlist the actual managed UUID. Never persist a chat-supplied credential, lower the minimum, add public signup or use disposable local test accounts for a production handoff.

After fresh API verification and any needed owner-approved configuration, choose either the dashboard path below or the existing terminal alternative. For **`npm run admin:create`**, privately configure `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the local environment required by the package script; Vercel's saved settings do not populate it. Use a trusted interactive terminal without credential arguments, piping or redirected output. The human enters the approved email/display name and hidden password/confirmation directly there, never through chat.

[../scripts/create-admin.ts](../scripts/create-admin.ts) checks schema access before prompting or creating state, creates a managed Auth account, then allowlists the returned UUID. It refuses existing-user promotion on email conflict and attempts rollback only for the newly created account if allowlisting fails. An unconfirmed rollback needs inspection before retry. Provisioning does not send an invitation or prove mailbox ownership; the operator must verify the intended person.

Shared signup/providers/password/email/redirect/recovery settings remain unchanged unless the shared owner explicitly approves a separate change. Shagun authorization is the active UUID allowlist, not an email suffix or project-wide signup switch. Local CLI **2.116.0** uses `auth.email.enable_signup=true` to enable email/password while global `auth.enable_signup=false` denies registration; that tested **local** setup must not be copied to managed shared Auth automatically.

**Dashboard path (no local backend-key copy needed):** under Supabase **Authentication → Users**, create the intended real account and enter a new unique password of at least **12 characters** privately there. A trusted operator then verifies that account's approved email and actual UUID, opens `shagun.admin_users` and adds **only** that UUID as `id`, the approved display name and `is_active=true`. Do not invent a UUID or elevate every Auth user. Only the approved email/UUID—not a password or key—may be supplied for allowlisting assistance; never publish the private identity in these documents. The account is not a Shagun admin until that explicit step is complete.

## 6. Final build, runtime and publication gates

Use [VERIFICATION.md](VERIFICATION.md) as the sole record for counts, revisions, result labels and outstanding confirmations. Preserve these evidence boundaries:

- **Local checks and public fixtures:** match each pass to its exact code/scenario. Keep focused harness repeats separate from full matrices; an earlier empty/one run is not a rerun after a context-layer repair. Do not weaken assertions or transfer old hosted success to later code.
- **Real owned-service workflows:** distinguish pre-sitemap history from post-sitemap Auth/REST/Storage runs covering city covers, venue images, publishing, public autocomplete and cleanup. These are isolated-service evidence, not managed Production acceptance or persistent administrator provisioning.
- **Normal build and preview restoration:** require a completed ordinary build with **`SHAGUN_TEST_FIXTURES=false`** after test-mode builds, then verify the fresh preview process/HTTP response. An old DOM is not process evidence. Never deploy fixture/integration output or rebuild over a running preview's output.
- **Hosted CI and Preview:** use actual revision-specific job and smoke results, not a provider Ready label. The original non-leaking catalog **500** remains a historical defect; its later unconfigured **503** correction is not retroactive success or a change to configured fresh Auth/allowlist checks.

These managed release gates remain open independently of the completed local results:

- [ ] **Managed authorization:** real login/logout/refresh/expiry and revoked-member denial; independent private route/action/media checks; anonymous/ordinary users cannot read hidden/private data, mutate inventory or access raw private Storage. Unsupported origins/host configuration and limiter/provider failure must fail closed.
- [ ] **Managed consistency/media:** real session uploads/previews, cover/order/delete and safe cleanup; interrupted uploads preserve reservations, expired work cannot finalize and every variant is removed before acknowledgement. Use isolated non-production services for fault/concurrency tests, including two editors and photo/cleanup races; never insert manual production test records.
- [ ] **Real Hazaribag publication — deferred during the security hold:** an active real admin imports/reviews drafts, obtains rights for any uploaded images, publishes selected venues and explicitly activates the city only after release gates close. Current research status is in [VERIFICATION.md](VERIFICATION.md); source-page responses alone are not contact verification. Resolve the Aranya email discrepancy and ambiguous AC-room claims; do not fabricate review dates or photographs.
- [ ] **Public HTTPS acceptance — separately owner-gated:** actual hosted revision/configuration, secure cookies, same-origin requests, discovery/detail/filter behavior, true pre-streaming 404s, no private notes, correct canonicals/escaped JSON-LD and noindex boundaries. Verify the request-time `/sitemap.xml` index, newly needed partitions and robots' single index link; local HTTP sitemap 404s and contract tests are not production indexing proof. Include six-width accessibility and measured final-domain performance without bypassing preview protection.
- [ ] **Recovery and operations:** complete the recovery gate below; name the maintenance owner, corrections channel if configured, review/cleanup cadence and monitoring for errors, quotas and backup freshness. Keep analytics off unless deliberately reviewed and enabled.

Current restoration evidence is recorded only in [VERIFICATION.md](VERIFICATION.md); a historical normal-build/empty-preview pass is not current process state. An empty directory can be legitimate before publication but does not itself prove Data API readiness. No real Hazaribag launch or production promotion is authorized while the shared-security, API, admin and editorial blockers remain. Neither deployment nor research import auto-publishes inventory. Follow [OPERATIONS.md](OPERATIONS.md).

## 7. Recovery: completed rehearsal versus remaining work

**Completed:** before apply, a private public-schema backup and separate Auth/Storage logical metadata were retained under ignored [../.qa/backups/](../.qa/backups/). Only the public-schema archive was restored into a new local scratch database; shared-table fingerprints matched and cleanup completed. Ownership/ACL metadata remain in the artifacts, but the rehearsal did not replay original owners/ACLs or test role restoration.

**Still required:** supported recovery of the now-installed Shagun namespaces/ledger/data, actual private image bytes, managed Auth identities/settings, roles/permissions and deployment configuration. The pre-install public-only archive is not that backup. Agree retention, protected/encrypted off-site storage, recovery objectives and an isolated rehearsal with the shared owner. Never restore over production for testing. Full procedures and revocation/cleanup cautions are in [OPERATIONS.md](OPERATIONS.md).

## 8. Cost planning — estimates, not fresh pricing

Historical planning estimates were **Supabase Pro from US$25/month** and **Vercel Pro developer seats at US$20/month**, plus usage/taxes. They are not a current quotation or an assertion that Shagun needs a second dedicated Supabase subscription; the selected project is shared.

Before committing spend, check [Supabase pricing](https://supabase.com/pricing), [Vercel pricing](https://vercel.com/pricing) and [Hobby plan eligibility](https://vercel.com/docs/plans/hobby). These references were **not freshly checked** for this update. Confirm commercial-use terms, region, free-tier pauses/quotas, actual backup coverage and shared-project usage.

Budget for domain, object/database recovery, monitoring, function execution and image bandwidth. Pre-generated WebP variants reduce transformation work, not storage/egress costs. The isolated Docker stack is development-only; this documentation provisions no paid service and promises neither zero-cost production nor complete managed acceptance.