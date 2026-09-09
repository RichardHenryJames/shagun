# Shagun — verification record

**Evidence cutoff: 2026-09-09; runs span 8–9 September.** This records supplied execution results, local evidence and confirmed GitHub branch/run metadata, not an inferred total session duration. Local tests, managed SQL/HTTP checks, review publication and hosted CI have distinct environment/revision boundaries. A passing result applies only to its stated environment and scope.

## Results and final-update labels

`FINAL_RELEASE_RESULT` distinguishes **successful review publication**, **passed hosted checks for both application revisions**, and **blocked production**. The follow-up code's own completed hosted run is recorded in `FOLLOW_UP_HOSTED_CI_RESULT` below; it is not inferred from the original audit or local passes. Documentation-only follow-up commits do not change these tested application revisions or authorize a release.

| Label | Recorded result / next evidence |
| --- | --- |
| `FINAL_CHECK_RESULT` | **PASS after `9db51bd`:** `npm run check` passed lint, route type generation, strict typecheck and **952 tests across 14 files**. The **60 catalog tests** include two new missing-URL/missing-public-key cases; the **19 request-time sitemap tests** and integration-reset guards remain included. |
| `LOCAL_INTEGRATION_BUILD` | **PASS:** `npm run build:integration`, a production-mode Next build for the exact local Supabase/localhost:3200 environment, fixtures disabled, before the sitemap refactor. Not a normal release build or deployment. |
| `LOCAL_INTEGRATION_BROWSER` | **PASS:** `npm run test:integration` completed **3/3 workflows on Windows**, at **390, 768 and 1440 px**, **11 substeps each**, in **2.4 minutes**, after the `.a-table-wrap` positioning fix and **before the sitemap refactor**. Real local Auth, REST, PostgreSQL and Storage plus signed-in axe/no-overflow checks were used. This Windows run was not repeated afterward; the separate hosted `2072dc7` run supplies post-sitemap Auth evidence below. |
| `FINAL_NORMAL_BUILD_RESULT` | **PASS after `9db51bd`:** normal `npm run build` with **`SHAGUN_TEST_FIXTURES=false`**. Request-time sitemaps are dynamic, with **no database queries during compilation**; builds never migrate, seed or provision users. The normal localhost:3000 empty preview was restored and confirmed afterward. |
| `FINAL_FIXTURE_MATRIX_RESULT` | **PASS, Windows matrix before the final catalog-only guard:** `many` **166/1**, `empty` **95/28**, and `one` **120/21**, all at **six widths** (passed/skipped). **381 passes / 50 intentional, inapplicable skips**, no failures. Hosted audit CI ran only `many`, not this whole matrix. |
| `FOLLOW_UP_HOSTED_CI_RESULT` | **PASS, both jobs:** [run 34322083604](https://github.com/RichardHenryJames/shagun/actions/runs/34322083604) completed successfully at **`9db51bd5b0a11395d62401353fde3e0db03a59fe`**. Actual logs confirm Node 22 full check **952 tests / 14 files**, `many` public fixtures **166 passed / 1 skipped**, and Node 24 real isolated Auth/Storage workflows **3 passed in 1.8 minutes**, followed by successful stack shutdown. |
| `FINAL_RELEASE_RESULT` | **REVIEW PUBLICATION: SUCCESS / FINAL APPLICATION CI: PASS / PRODUCTION: BLOCKED.** Published [audit/second-pass-2026-09-09](https://github.com/RichardHenryJames/shagun/tree/audit/second-pass-2026-09-09) contains the tested follow-up [9db51bd](https://github.com/RichardHenryJames/shagun/commit/9db51bd5b0a11395d62401353fde3e0db03a59fe), not just original `2072dc7`. Its own hosted CI and Preview smoke passed within their stated scopes. Only Preview deployment is recorded; remote/local `main` remain unchanged as detailed below. Critical shared-security, API, real-admin, reviewed-inventory and full managed-acceptance/recovery gates remain open. |

Toolchain: Windows, locally tested Node **24**; pinned Next.js **16.3.3**, TypeScript **5.9.3** and development-only Supabase CLI **2.116.0**. Reproduce with [../package.json](../package.json) and [../package-lock.json](../package-lock.json).

## Managed SQL installation — PASS

The real shared Supabase target was **`ixkhyqqovacdramymqjk`**. After the empty-ACL catalog fix and pre-apply backup rehearsal, the guarded runner completed **`--apply --seed` successfully**. All five migrations **0001–0005**, including the city-preview RPCs, were applied and recorded in the private checksum ledger. TLS certificate/hostname verification remained enabled; existing managed Storage-policy delegation was used without ownership escalation.

| Observed postcondition | Result |
| --- | --- |
| Shagun objects | **10 tables, 19 RPCs in schema `shagun`**; private ledger excluded from the table count; RLS and role permissions verified. “19 RPCs” does **not** mean 19 anonymously executable functions. |
| Inventory | `admin_users=0`, `cities=1` (draft Hazaribag), `facilities=9`, `venues=0`, `media_assets=0`, `storage_cleanup_jobs=0`. |
| Storage | Private **`shagun-media`** bucket verified; **6 Shagun policies** verified. |
| Shared baseline | BihariBhojan **Category 6, Product 44, Order 0, ContactMessage 0**, with unchanged row fingerprints. Managed **Auth user count 0**. |

All **seven** preservation flags were **true**: `publicMetadataUnchanged`, `authMetadataUnchanged`, `storageMetadataUnchanged`, `storageBucketsUnchanged`, `sharedDataUnchanged`, `authCountUnchanged`, `storageObjectCountUnchanged`.

The comparisons exclude only the intended new bucket/six policies and the internal Auth FK support triggers belonging to the new Shagun allowlist constraint. Existing sibling data, managed definitions, ownership, base grants and unrelated policies were preserved. The runner did not change hosted API exposure or shared Auth settings. Repeatable-read fingerprints check this operation's baseline/changes; they do not audit unrelated concurrent transactions or prove the preexisting configuration secure.

Sources: [../scripts/db-migrate.ts](../scripts/db-migrate.ts), [../scripts/db-migration-plan.ts](../scripts/db-migration-plan.ts), [../scripts/db-catalog-snapshot.ts](../scripts/db-catalog-snapshot.ts). The former metadata `22023` failure is **resolved**, not a current installation blocker.

## Pre-apply backup and local restore — LIMITED PASS

The pre-install **public-schema backup plus Auth/Storage logical metadata** is retained privately under [../.qa/backups/](../.qa/backups/), excluded by [../.gitignore](../.gitignore). [../scripts/db-backup.ts](../scripts/db-backup.ts) restored the archive into a **new local scratch database**, verified the shared-table fingerprints and archive integrity, and completed scratch/copy cleanup. No restore was applied to the managed project.

The archive/metadata retain ownership and ACL information, but the scratch restore used **`--no-owner --no-privileges`**. Original ownership/ACLs were **not replayed**, and role restoration was **not tested**. This was not a managed Auth identity/settings, object-byte or full service recovery rehearsal. The artifact predates Shagun installation and is not a current Shagun inventory backup. Local private files are not automatically encrypted/off-site; complete recovery remains open.

## Production configuration and inventory — NOT LAUNCHED

- Vercel **Production** already has `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` as **Config** and `SUPABASE_SERVICE_ROLE_KEY` as **Secret**, plus project/site URLs, fixtures=false, analytics=false and a generated `RATE_LIMIT_SECRET`. Do not ask for the keys again. Their storage does not establish backend-key validity, runtime adoption or a working admin session.
- **No real admin is configured:** no approved real email was supplied and the human operator was unavailable. No account was fabricated or provisioned. Vercel secret storage is not local provisioning setup.
- The **12 real source-cited Hazaribag candidates** remain **unimported/unreviewed**, with no photos and unknown rights. Website-derived evidence is not verified contacts, editorial approval or exhaustive coverage.
- **Seven official primary sources were freshly rechecked and returned 200**: partial website evidence for seven candidates only, not contact verification. The Aranya email mismatch is already recorded in private review notes; it and ambiguous “AC rooms” evidence remain unresolved. Do not silently reconcile claims or fabricate reviews. Five candidates remain follow-up holds. See [HAZARIBAG_RESEARCH.md](HAZARIBAG_RESEARCH.md).
- **No Chapra production record has ever been created.** The workflow below used an explicitly synthetic, temporary local record. The managed draft-only seed should yield no public city/venue inventory; that is correct behavior.

## Managed HTTP probes — confirmed critical exposure and missing schema

The public publishable key was **momentarily revealed in the browser UI**, used only in browser memory for legitimate read-only, zero-row probes, then hidden before tool results. Its value was not printed or returned to the model. **Private/backend secrets were not read or revealed**; this is not a claim that no key was ever shown in the UI.

| Anonymous probe | Observed result |
| --- | --- |
| `HEAD /rest/v1/Order?select=id&limit=0` | **200**; existing shared `public.Order` API access confirmed. |
| `HEAD /rest/v1/ContactMessage?select=id&limit=0` | **200**; existing shared `public.ContactMessage` API access confirmed. |
| `/rest/v1/cities?select=id&limit=0` with `Accept-Profile: shagun` | **406 / PGRST106 / Invalid schema: shagun**. |

**No customer rows were retrieved.** The first two results corroborate the already observed anonymous/authenticated SELECT grants with RLS disabled. Reachability is now confirmed, not hypothetical; the empty Order/ContactMessage baseline does not protect future rows. This preexisting security risk was **not changed by Shagun installation**. Remediation requires **separate shared/BihariBhojan-owner authorization**, never unilateral sibling grants/RLS changes or customer-row retrieval. All seven preservation flags remaining true is not security clearance.

Shagun must be appended to the existing exposed-schema list, preserving **every** other entry and excluding `shagun_private`. The expired dashboard session's management request returned **401**; the official sign-in page is visible, but the GitHub button did not navigate. The user must complete sign-in privately. No API-list or shared Auth change was made by these probes.

**Release decision:** review publication and the original audit's hosted CI pass do not clear these gates. Do not promote `main`/Production, force launch, fabricate an admin/review or run a production Hazaribag import while they remain open. Exact owner/operator steps are in [DEPLOYMENT.md](DEPLOYMENT.md).

## Windows real local-service browser workflow — historical 3 PASSED

[../tests/integration/admin-workflow.spec.ts](../tests/integration/admin-workflow.spec.ts) executes the following **11 substeps at each of 390, 768 and 1440 px**. These are three complete workflow tests, not 33 independently counted tests.

1. Reject an incorrect password, log in with a real local Auth account, check the HttpOnly session, rotate the actual refresh token/cookie and reload successfully; reject signed-out private routes/APIs.
2. Reject ordinary non-admin application login, establish a genuine ordinary Auth session for direct denial probes, check allowlist/RLS/preview-RPC denial and refuse any preexisting Chapra.
3. Preview the actual local **draft Hazaribag seed** through shared `CityDiscovery`, without editing/importing venues; its public URL remains 404.
4. Use the authenticated **Bihar-filtered GeoNames picker** to select Chapra (`geonames:1274353`, Saran), save a draft through the UI and verify `metadata.geographic_source_id`.
5. Add the associated venue through the workspace UI; save facts, facilities and private research atomically as an unreviewed draft, then inspect the city preview.
6. Reject SVG/oversized uploads through both UI and authorized API; upload actual generated **PNG, JPEG and WebP bytes**, verify stored WebP variants/private previews, and deny anonymous raw Storage/draft media and non-admin media operations.
7. Select the second cover, move photos both directions, edit alt text/credit, delete a photo and drain its durable Storage job through the admin UI.
8. Inspect saved venue/city previews, explicitly review/publish the venue, retain unverified status and prove it remains hidden while its city is draft; private research does not enter public output.
9. Activate the city deliberately; exercise fresh anonymous GET city/venue search, filters, price basis, sorting, facts, contact hrefs, gallery keyboard behavior, public images, canonicals and sitemap-eligibility RPCs. No phone call or WhatsApp navigation occurs.
10. Unpublish and verify disappearance, republish, then deactivate the city and prove its still-published venue is hidden from discovery, REST, media and sitemap eligibility.
11. Delete only the run-owned unpublished venue/inactive city through the UI, remove all remaining image variants via cleanup, preserve Hazaribag, sign out and verify session removal/private denial.

**Isolation:** Next uses `http://localhost:3200`; real local Supabase API uses `http://127.0.0.1:55321`, database **55322**. Fixtures remain false. The runner owns only `shagun-integration`, verifies container/ownership before reset and creates random local Auth identities. Allowed requests reach actual services unchanged; there are no Auth mocks or fabricated JWTs. Credentials stay in memory/child environments, with sensitive screenshots, traces, state files and reports disabled.

With CLI **2.116.0**, local `auth.email.enable_signup=true` enables the email/password provider; global `auth.enable_signup=false` rejects public registration, confirmed by a direct signup-denial assertion. These are **local test settings**, not a recommendation to modify shared Auth.

The suite uses one worker, no retries and test-owned Next server lifecycle. The first-use reset guard checks all schemas/bucket/policy targets before recording ownership; both source tests pass in the full check. Signed-in dashboard, city picker, venue editor, photo manager and public-layout previews pass axe and page-overflow checks at all three widths. An absolutely positioned screen-reader label had escaped its table scroller; **`position: relative` on `.a-table-wrap`** fixes the cause without hiding page overflow or weakening assertions. The **2.4-minute, 3/3 pass is after that fix and those checks**. See [../src/app/admin/admin.css](../src/app/admin/admin.css), [../scripts/integration.ts](../scripts/integration.ts), [../playwright.integration.config.ts](../playwright.integration.config.ts).

**Timing:** this Windows run **preceded the request-time sitemap refactor**. Separate Node 24 hosted runs passed **3 workflows in 1.9 minutes at `2072dc7`** and **3 workflows in 1.8 minutes at `9db51bd`**, after the sitemap refactor and, for the latter, the catalog guard. Those runs add real isolated-service evidence for their revisions, not managed-project acceptance.

**SEO boundary:** localhost HTTP is intentionally non-indexable. Canonicals and anonymous `sitemap_entries` eligibility were checked, while robots disallowed crawling and sitemap requests returned 404. This is not verification of production HTTPS sitemap XML, secure cookies or CDN behavior.

**Local integration shutdown:** `npm run integration:stop` succeeded; `docker ps` showed only the unrelated `biharibhojan-db` container still running. Local test data was retained.

## Unit/database tests versus service tests

`npm run check` covers local validation, authorization/action/route contracts, Sharp image handling, catalog/preview behavior and SQL migrations, grants, lifecycle, exact optimistic versions, upload reservations and cleanup. PGlite uses synthetic managed-schema scaffolding and a single connection; mocked route/action clients are not live Supabase. The separate workflow above adds actual local Auth/REST/Storage evidence, not managed-project certification.

The post-fix local **952-test / 14-file** run includes **60 catalog tests**, **19 request-time sitemap tests** and both reset guards. The original hosted audit ran **950 tests / 14 files before the two catalog regressions were added**; these are supplied execution counts, not inferred totals. The malformed-ZIP advisory in the city-import dependency was fixed by pinning `fflate` **0.8.3**; the subsequent package-manager audit reported **zero vulnerabilities**. Supabase CLI remains **2.116.0**.

### Request-time sitemap regression coverage — 19 tests

- [../src/lib/sitemaps.ts](../src/lib/sitemaps.ts), [../src/app/sitemap.xml/route.ts](../src/app/sitemap.xml/route.ts) and [../src/app/sitemap/[partition]/route.ts](../src/app/sitemap/[partition]/route.ts) replace build-time `generateSitemaps` enumeration. Builds no longer fetch inventory to generate sitemaps; the request-time index grows new partitions without a rebuild and preserves `/sitemap/0.xml`.
- Tests cover index/partition boundaries, pagination and limits, XML escaping, noindex/local **404s**, invalid/private rows and sanitized no-store **503s** on invalid data or service failures. These are local contracts, not proof of managed HTTPS output.
- Async [../src/app/robots.ts](../src/app/robots.ts) makes **no database request** and advertises **one index URL**, `/sitemap.xml`, when indexing is enabled; it does not enumerate partition URLs.

## Windows public fixture matrix — all scenarios passed before the catalog guard

These supplied Windows Chromium results cover **all six configured widths and all three scenarios before the final catalog-only guard**. They are not the older single-width empty/one runs or a hosted all-scenario matrix; original audit CI ran only `many`.

| Scenario | Widths | Passed | Intentional skips |
| --- | --- | ---: | ---: |
| `many` | 320, 375, 390, 414, 768, 1440 px | 166 | 1 |
| `empty` | 320, 375, 390, 414, 768, 1440 px | 95 | 28 |
| `one` | 320, 375, 390, 414, 768, 1440 px | 120 | 21 |
| **Total** | All three scenarios, all six widths | **381** | **50** |

The many-scenario desktop skip excludes a mobile-only interaction; empty/one skips are inapplicable multi-record or absent-media cases, not waived failures. All existing assertions remain in place. These 381 fixture passes are separate from the three real local-service workflows; neither is a production-inventory certification.

An earlier local fixture Lighthouse run recorded **99 performance / 100 accessibility**; it is historical, not fresh or final-domain evidence.

Reproduction commands and the separate default-3000/fixture-3100/integration-3200 contracts are in [../README.md](../README.md). After the catalog fix, the normal build passed with `SHAGUN_TEST_FIXTURES=false` and the browser at `http://localhost:3000/` again confirmed the honest empty preparation state, with no synthetic warning or inventory. The restored normal preview remains running. Never reuse a mismatched build or weaken assertions to obtain a pass.

## Published review revisions and hosted evidence

[../.github/workflows/ci.yml](../.github/workflows/ci.yml) runs Node **22** quality checks/database-free public fixtures, then Node **24** real local Auth/publishing/Storage workflows on an isolated Docker-backed Supabase stack. The authenticated workflow suppresses credentials, Auth traces, populated form snapshots and database dumps; its stop step uses `always()` to clean up only that stack. No production credentials or managed test records are required.

**Review publication — SUCCESS:** [audit/second-pass-2026-09-09](https://github.com/RichardHenryJames/shagun/tree/audit/second-pass-2026-09-09) contains the published follow-up commit **`9db51bd5b0a11395d62401353fde3e0db03a59fe`**. It follows original audit commit **`2072dc7f8aba3e492d448c94d703450aa0312a75`**, whose local/GitHub branch SHA match was confirmed at its publication. The final code is therefore not the original audit revision.

### Original audit hosted CI — SUCCESS at `2072dc7`

[Run 34320416797](https://github.com/RichardHenryJames/shagun/actions/runs/34320416797) **succeeded in both jobs**. Actual hosted logs confirmed:

| Job | Confirmed execution at `2072dc7` |
| --- | --- |
| Node **22** quality/public fixtures | Full check **950 tests / 14 files**; `many` fixture scenario **166 passed / 1 skipped**. No hosted `empty`/`one` matrix is claimed. |
| Node **24** real local Auth/Storage | Auth, Chapra/venue creation, media, publishing and cleanup: **3 passed in 1.9 minutes**, **after the sitemap refactor at this commit**. These are real isolated services hosted by CI, not managed production acceptance. |

This closes the original audit CI check. The later code has its own successful run in `FOLLOW_UP_HOSTED_CI_RESULT` above, including the two new regressions and all three configured Auth workflows. Initial [run 34222982087](https://github.com/RichardHenryJames/shagun/actions/runs/34222982087), which passed for `2edd4fd` without fetched hosted counts, remains earlier history.

### Actual Vercel Preview smoke — `2072dc7`, one defect found

GitHub deployment **6344149398** records `environment: Preview`, **`production_environment: false`** and state **`success`** for `2072dc7`. The actual preview was [https://shagun-hs7en3zi0-richards-projects-224a1dea.vercel.app](https://shagun-hs7en3zi0-richards-projects-224a1dea.vercel.app).

| Actual preview surface | Observed response |
| --- | --- |
| `/` | Honest empty preparation state. |
| `/cities`, `/search` | **200**, noindex. |
| Missing city URL and `/city/hazaribag` | **404**, noindex. |
| `/admin/login` | **200**, noindex. |
| `/robots.txt` | **200**, disallow all. |
| `/sitemap.xml` | **404**. |
| Unconfigured `/api/admin/city-catalog` | Sanitized **500**, no leak; this actual smoke finding led to the later fix. |

**This was not an all-green preview smoke.** Deployment state `success` did not negate the catalog 500. These observations remain scoped to `2072dc7`; the corrected catalog response below was checked locally, not retroactively verified on this old preview.

### Catalog follow-up — `9db51bd`, local and hosted checks passed

The published fix adds an **`isConfigured` guard before client construction**: a missing Supabase URL or public key returns **503**, private/no-store and noindex, with no catalog data. The configured path retains fresh managed Auth and active-UUID allowlist checks unchanged. Two new unit cases cover missing URL and missing key; no SQL or shared settings changed. This corrects an unconfigured response-status defect, not a demonstrated data leak or Auth bypass.

After the fix, the full local check and normal fixtures-false build passed as recorded above. Actual localhost:3000 catalog requests with **valid and malformed queries** both returned **503**, `Cache-Control: private, no-store`, noindex and the **exact asserted non-secret error message**, with no catalog data. The normal empty home was restored and confirmed. The final-code hosted pass was independently confirmed through run metadata and the exact log totals above.

GitHub deployment **6344431243** records `environment: Preview`, **`production_environment: false`** and state **`success`** for `9db51bd`, at [https://shagun-ykfvegpke-richards-projects-224a1dea.vercel.app](https://shagun-ykfvegpke-richards-projects-224a1dea.vercel.app). Its actual browser smoke passed all asserted responses: empty home; cities/search and admin login **200/noindex**; missing city and Hazaribag **404/noindex**; sitemap **404/noindex**; robots **200/disallow all**; and both valid/malformed catalog queries **503/private/no-store/noindex**, containing only the exact non-secret setup error and no catalog data. This confirms the original preview defect is fixed on the new deployment. It does not establish a configured managed admin session or production inventory behavior.

### Observed promotion boundary

The GitHub `main` API confirmed the remote branch unchanged at **`b62d6eda5fde1fe5e588ef3a4b2a5cdeb4693908`**; the user's local `main` remains at **`b066ed5`**. Only the recorded **Preview/non-Production** deployment is established; no production promotion occurred. The Vercel production-branch setting itself was not fetched, so these observations are not a global provider-setting claim. **Do not promote `main` or Production.**

## Remaining evidence required

- **Critical shared Order/ContactMessage exposure:** separately authorized owner remediation and safe verification without retrieving customer rows; preserved baseline flags are not clearance.
- User dashboard sign-in, append-only Shagun API exposure preserving other entries/private exclusion, and real anonymous/ordinary/admin/revoked REST/RPC/Storage checks.
- Human-provisioned managed admin, hosted login/refresh/expiry/recovery and revocation; approved real research import/review and any photo permissions.
- **Managed HTTPS acceptance:** final-code hosted CI and Preview smoke passed, but preserve the Windows matrix's pre-catalog-guard scope. Owner-gated managed acceptance still needs HTTPS inventory metadata/sitemaps, secure cookies, image caching, six-width accessibility and final-domain performance; the unconfigured Preview smoke is not production acceptance.
- Multiple real concurrent editor sessions, lock/quota/finalization races and managed-provider partial-upload/cleanup failure paths.
- Supported recovery of current database, object bytes, Auth identities/settings, roles/permissions and deployment configuration. The public-only scratch restore closes only its stated limited check.

[DEPLOYMENT.md](DEPLOYMENT.md) defines closure criteria. No managed Hazaribag launch, complete recovery or universal security/accessibility certification follows from local passes.