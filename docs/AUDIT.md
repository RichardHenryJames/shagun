# Shagun — audit findings and launch gates

**As of 2026-09-09: managed SQL installation is complete; confirmed critical shared API exposure blocks production promotion.** This document reconciles supplied execution evidence with current source. This documentation-only update ran no commands, deployments or new service probes. The next push is **review-branch-only**, not a production launch. Exact results and pending labels are in [VERIFICATION.md](VERIFICATION.md).

## Fixed or completed

| Finding | Resolution and evidence boundary |
| --- | --- |
| Catalog snapshot failed with SQLSTATE `22023` | The local query passed a zero-dimensional empty ACL array to `aclexplode`. Empty ACLs are normalized after resolving applicable defaults, preserving explicit-empty versus default privileges. The fix is complete; guarded migration/seed application to the real shared project succeeded. This was not evidence of shared catalog corruption. |
| Storage non-ownership was treated as missing authority | Preflight now recognizes the existing protected Supautils policy delegation for the exact role and `storage.objects`. No ownership transfer, new base grants or RLS disabling was needed. The private bucket and six Shagun policies passed managed SQL verification. |
| Configuration readiness and misleading setup guidance | Public configuration and admin readiness are separate. URL/origin validation, known public/server key-role mix-ups, limiter-secret requirements and host support are checked without exposing values. Setup text preserves shared Auth policy. These checks do not authenticate a key or certify hosted API access. |
| Non-Vercel rate-limit fallback | The fixed implementation allows the shared `local` fingerprint only for loopback HTTP. An unsupported non-Vercel real host fails closed and is **not admin-ready**; arbitrary forwarded headers are not trusted. Supporting another production host still needs a reviewed implementation. |
| Local email/password provider configuration | With pinned Supabase CLI **2.116.0**, local `auth.email.enable_signup=true` enables the email provider while global `auth.enable_signup=false` rejects public registration. A direct registration-denial assertion and real login/refresh passed. This local configuration must not be copied to shared Auth automatically. |
| Saved-city preview and geographic selection | The protected city route uses shared `CityDiscovery` and the two admin-only preview RPCs from migration `0005`. The bounded GeoNames picker is a selection aid, with server-validated source identity, not a public or seeded city list. The local browser workflow exercised both. |
| Signed-in mobile page overflow | Real browser geometry found a screen-reader-only table header beyond its scroll container, widening the page to 626 px at a 390 px viewport. `position: relative` on `.a-table-wrap` contains it correctly. Real local Supabase workflows passed **3/3 in 2.4 minutes after this fix**, with strict no-overflow and axe checks intact. This Auth/Chapra/venue/upload/cover/reorder/delete/publish/unpublish/cleanup run **preceded the sitemap refactor**; post-refactor SEO coverage is unit/public tests, not a rerun of authenticated acceptance. |
| Malformed geographic ZIP denial of service | Dependency audit identified the `fflate` ZIP64 infinite-loop advisory. Updated the exact dev dependency from 0.8.2 to patched 0.8.3; the follow-up audit reports zero findings. |
| Sitemap builds depended on live inventory | Replaced `generateSitemaps` enumeration with request-time XML index/partition handlers, removing the sitemap build-time database fetch. `/sitemap/0.xml` stays stable; new partitions appear without rebuilding. Async robots is database-free and links only the index. **19 tests** cover boundaries, privacy, pagination/limits, noindex 404s and sanitized 503s for invalid/private rows or outages. |
| “Recent additions” actually sorted by edit time | Relabelled public/admin sections as recent updates, matching the real query instead of presenting an edited record as newly added. |
| Pre-apply recovery rehearsal | A private public-schema backup was restored into a newly created local scratch database; shared-table fingerprints matched and scratch cleanup completed. This is a **limited restore**, not managed-project recovery or a roles/ownership/ACL restoration test. |

Sources: [../scripts/db-catalog-snapshot.ts](../scripts/db-catalog-snapshot.ts), [../scripts/db-migrate.ts](../scripts/db-migrate.ts), [../src/lib/config.ts](../src/lib/config.ts), [../src/lib/security.ts](../src/lib/security.ts), [../scripts/db-backup.ts](../scripts/db-backup.ts), [../src/lib/sitemaps.ts](../src/lib/sitemaps.ts), [../src/app/sitemap.xml/route.ts](../src/app/sitemap.xml/route.ts), [../src/app/sitemap/[partition]/route.ts](../src/app/sitemap/[partition]/route.ts), [../src/app/robots.ts](../src/app/robots.ts).

**Integration reset protection:** the runner verifies the dedicated local container and ownership marker. Before first-use ownership is recorded, it rejects existing Shagun schemas, bucket or reserved policies. Both guard tests pass within the **950-test / 14-file** check, which also includes the 19 sitemap tests. See [../tests/unit/integration-safety.test.ts](../tests/unit/integration-safety.test.ts).

## Rejected or unsupported recommendations

- **Speculative Shagun RPC/policy suggestions are not automatically defects.** Those suggestions did not establish a reproducible Shagun authorization failure; this does **not** negate the confirmed BihariBhojan API exposure below. Retain parameter validation, role-specific grants and RLS; do not widen policies to suppress Shagun's confirmed missing-schema error.
- **Repeated Auth checks are not, by themselves, an authorization bug.** `getAdminContext` uses request-only memoization, while mutations/private endpoints reauthorize independently. Removing those checks would weaken the boundary.
- **Do not add cross-request caching of authorization or privileged dashboard/preview responses as a speculative optimization.** Public versioned snapshots have a live anonymous visibility check first; that is not permission to cache private access decisions.
- Do not report “all eight exploration bugs fixed” or “no security issues.” Only the resolutions above have a stated basis. SQL installation and Production key storage are complete; hosted runtime acceptance still requires independent evidence.

Sources: [../src/lib/auth.ts](../src/lib/auth.ts), [../src/lib/db/clients.ts](../src/lib/db/clients.ts), [../src/lib/data/public.ts](../src/lib/data/public.ts).

## Actual launch blockers and closure criteria

| Open gate | Required evidence to close it |
| --- | --- |
| **CRITICAL: shared Order/ContactMessage exposure** | Anonymous zero-row `HEAD` probes returned **200**, confirming reachability alongside existing SELECT grants and disabled RLS. Obtain separate shared/BihariBhojan-owner authorization for remediation and safe verification without retrieving customer rows. The preserved baseline is not secure merely because these tables were empty. |
| **Managed Data API excludes Shagun** | A real anonymous zero-row request returned **406 / PGRST106: Invalid schema: shagun**. An authorized operator must append `shagun`, preserve every other exposed entry and exclude `shagun_private`, then rerun role-specific probes. Management returned 401; the official sign-in page is visible but the GitHub button did not navigate, so the user must sign in privately. |
| **No approved production administrator input** | A human chooses a real identity and privately creates its Auth account through the dashboard or existing trusted-terminal workflow; a trusted operator allowlists the **actual approved UUID**. No password/key in chat or invented UUID. Managed login/refresh/revocation must pass. Both Auth-user and admin counts are zero; no approved email is available. |
| **No reviewed public inventory** | An active real admin explicitly imports/creates drafts, checks sources, obtains rights for any photos and reviews before publishing/activating after release clearance. All 12 candidates remain unimported/unreviewed; seven fresh official-source 200 responses supply partial website evidence, not contact verification. The Aranya email mismatch is already in private review notes; it and ambiguous AC-room claims remain unresolved. No photos/rights or real reviews may be fabricated. |
| **Review-branch/hosted acceptance pending** | The **950-test / 14-file** check and final normal `npm run build` passed with fixtures false, dynamic request-time sitemaps and no build-time database queries. Public results at all six widths are **many 166/1, empty 95/28, one 120/21** (passed/skipped): **381 passes / 50 intentional, inapplicable skips**. The planned review branch is not yet pushed and the new hosted two-job CI result is pending. Preview restoration is being checked; availability is not yet confirmed. Saved Production variables and earlier CI do not certify runtime acceptance. |
| **Complete recovery not rehearsed** | Establish and test supported recovery of current Shagun data, object bytes, managed identities/settings, roles and permissions with the shared owner. The pre-install public-only scratch restore cannot close this gate. |

**Release decision: planned `audit/second-pass-2026-09-09` review-branch push only, not yet pushed; no production promotion, force launch or production Hazaribag import while these gates remain open.** The new CI definition has Node 22 quality and Node 24 real local Auth/Storage jobs using Docker, suppresses credential-bearing output/artifacts and always attempts local-stack cleanup. Hosted execution remains pending; a later green CI run does not resolve the shared-security issue.

The operational sequence and managed acceptance criteria are in [DEPLOYMENT.md](DEPLOYMENT.md). A minimum of one published venue permits city activation; it does not establish useful coverage or business/contact verification. Empty public discovery is correct for the current draft-only seed, not a seed failure.

## CRITICAL shared-project API exposure — confirmed, not changed here

SQL inspection found anonymous/authenticated SELECT privileges and disabled RLS on existing BihariBhojan `public` tables. The actual anonymous probes **`HEAD /rest/v1/Order?select=id&limit=0`** and **`HEAD /rest/v1/ContactMessage?select=id&limit=0`** both returned **200**. This confirms managed API reachability, not merely catalog risk. **No customer rows were retrieved**; do not retrieve any to demonstrate impact. Empty baseline tables do not protect future customer records.

The public publishable key was momentarily visible in the browser UI, used only in browser memory and hidden before tool results; its value was not printed or returned to the model. **Private/backend secrets were not read or revealed.** The probe did not modify the shared baseline or expose Shagun's private schema.

Remediation requires **separate shared/BihariBhojan-owner authorization**, not unilateral grants/RLS changes in Shagun's deployment. Preserve existing API entries during the append-only Shagun configuration step; any sibling security change needs its own approved scope. All seven installation preservation checks passed; that proves the guarded operation preserved its baseline, not that the baseline was secure or that unrelated concurrent changes were audited. This documentation does not change permissions or authorize production promotion.

## Continuing operational obligations

- Cleanup is a manual, bounded retry operation; no automatic sweeper is installed. Never clear jobs just to hide a backlog.
- Research import is atomic per venue, not per batch. Inspect partial progress before retry; never overwrite existing edits.
- Real-service failure paths, concurrent editors, final-domain image caching/performance and full managed recovery need their own evidence. The three passing local-service workflows do not cover every failure mode.
- Do not create manual test records in production. No Chapra production record has been created; its UI lifecycle was exercised only in the isolated local stack.