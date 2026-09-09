# Shagun — verification record

**Evidence cutoff: 2026-09-09; runs span 8–9 September.** This records supplied execution results, local evidence and previously confirmed GitHub branch/run metadata, not an inferred total session duration. Local tests, managed SQL/HTTP checks, review publication and hosted CI have distinct environment/revision boundaries. A passing result applies only to its stated environment and scope.

## Latest autocomplete and operator evidence — 2026-09-09

**Review-branch publication and the harness-fix hosted CI are confirmed successful. Production Hazaribag remains unavailable.** The results below apply to `ce533444a26e50cd42c4be2b0d4cb9f2a0703d5f`; its own hosted run closes the earlier browser-harness failure, rather than borrowing the old green result at `5a4003b`. This section supersedes the historical “final” labels below. Engineering checks, provider access and real editorial publication remain separate evidence.

| Current update label | Recorded result / next evidence |
| --- | --- |
| `AUTOCOMPLETE_RELEASE_RESULT` | **REVIEW PUBLICATION CONFIRMED / PRODUCTION BLOCKED:** application revision [c494a9c01c247b71ac5e5edeaaebfd0d326dfb80](https://github.com/RichardHenryJames/shagun/commit/c494a9c01c247b71ac5e5edeaaebfd0d326dfb80), followed by harness-only [ce533444a26e50cd42c4be2b0d4cb9f2a0703d5f](https://github.com/RichardHenryJames/shagun/commit/ce533444a26e50cd42c4be2b0d4cb9f2a0703d5f), are published on [audit/second-pass-2026-09-09](https://github.com/RichardHenryJames/shagun/tree/audit/second-pass-2026-09-09). The follow-up changes context-level interception for public delayed/error stubs, **not application Auth**. Publication is not pending and is not a Production release. |
| `AUTOCOMPLETE_HOSTED_CI_RESULT` | **PASS, both jobs:** [run 34350892886](https://github.com/RichardHenryJames/shagun/actions/runs/34350892886) completed successfully for `ce533444a26e50cd42c4be2b0d4cb9f2a0703d5f`. GitHub separately confirms **Checks and isolated browser QA** and **Real local Auth, city publishing and Storage** both succeeded. Local totals below are not presented as fetched hosted totals. The failed parent run remains recorded below. |
| `LOCAL_INTEGRATION_STOP_RESULT` | **SUCCESS:** `npm run integration:stop` stopped the dedicated integration stack and retained its local data. The run's temporary random accounts had already been deleted; they are not available for handoff. This does not assert the state of unrelated containers. |
| `NORMAL_BUILD_RESTORATION_RESULT` | **PASS:** after the latest real integration run, the ordinary production build completed successfully with fixtures disabled. No migration, seed or provisioning was run by the build. |
| `NORMAL_PREVIEW_RESTORATION` | **PASS:** the normal preview task reported ready at localhost:3000. Fresh browser navigation found the city combobox and no synthetic banner; an anonymous `/api/cities/suggestions?q=haza` request returned **200**, `no-store`, and exactly an empty `items` array. This verifies the no-database preparation state, not a connected/public Hazaribag launch. |
| `CURRENT_DATA_API_VERIFICATION` | **UNCONFIRMED:** earlier conversation reported append-only API exposure, anonymous **200** and private denial; fresh Data API verification is not yet confirmed. The old **406 / PGRST106 is historical**, not a fresh current failure. No API settings were changed by this continuation. |
| `PRIVATE_OPERATOR_ACCESS` | **PRIVATE HUMAN SIGN-IN REQUIRED:** a fresh Supabase **Authentication → Users** page briefly showed the shell, then redirected to sign-in. Normal **Continue with GitHub** at **12:22 UTC** reached the real GitHub owner login, requiring private human input. At **12:45 UTC**, the Vercel project-settings URL also redirected to Vercel login. No account cookies/tokens were copied or bypassed. The old settings page is not fresh authorization evidence; these redirects do **not** establish a new HTTP 401 or missing saved keys. |
| `PRODUCTION_ADMIN_PROVISIONING` | **PENDING PRIVATE INPUT / ACTUAL UUID:** only the **supplied identity** is approved; no new private password or actual-UUID administrator provisioning is complete. Enter a new unique password privately, meeting the unchanged **12-character minimum**, then explicitly allowlist the actual managed UUID. Never persist a chat-supplied credential or reuse deleted local test accounts. |
| `SHARED_OWNER_REMEDIATION_AUTHORIZATION` | **NOT AUTHORIZED:** the separate approval request received an automated “user unavailable” response, not approval. A general request to complete the task does not override this gate. No sibling permissions were changed and no customer rows were retrieved. |

**Public URL and access boundary:** the Production public URL is [https://shagun-peach.vercel.app](https://shagun-peach.vercel.app). Its earlier anonymous home response was **200**; a fresh browser navigation in this continuation to `/cities?q=haza` again showed **“No city guides match your search.”** The hosted directory still has the older plain search field. These observations do not establish current Supabase API exposure and confirm that public Hazaribag readiness has **not** been achieved. The review Preview requires **Vercel access**, not a Shagun customer login; Shagun has no customer registration.

**Current review deployment:** GitHub records deployment **6349647523** for `ce533444` as **Preview**, `production_environment=false`, state **success**, at [https://shagun-c9t7iwgbu-richards-projects-224a1dea.vercel.app](https://shagun-c9t7iwgbu-richards-projects-224a1dea.vercel.app). This is provider deployment evidence, not a new authenticated Preview smoke. A fresh GitHub branch query confirmed remote `main` remains **`b62d6eda5fde1fe5e588ef3a4b2a5cdeb4693908`**, while the review branch points to **`ce533444a26e50cd42c4be2b0d4cb9f2a0703d5f`** at this observation. No Production promotion occurred.

**Minimum private operator actions:** complete the official owner sign-in privately; verify the actual Data API schema list and zero-row role boundaries, appending `shagun` **only if absent and authorized**, preserving every other entry and excluding `shagun_private`; provision the supplied identity with a new private password and actual-UUID allowlisting; obtain separate shared-owner authorization before any sibling remediation. The **12 Hazaribag candidates remain unimported/unreviewed**, with no actual review or established photo rights. No public Hazaribag import/publication is authorized. Editorial review, managed Auth/REST/Storage acceptance, concurrency, complete recovery and final-domain checks remain independent gates—not work that a harness fix alone can close.

### Published application CI failure and harness-only follow-up

[Run 34337558019](https://github.com/RichardHenryJames/shagun/actions/runs/34337558019) at **`c494a9c01c247b71ac5e5edeaaebfd0d326dfb80` FAILED**: the full `many` scenario recorded **185 passed / 1 skipped / 1 failed**, with `route.continue` attempting to handle an already handled route. This was one public browser harness failure, **not all tests failing**. That failed run has **no passing real-Auth job**; earlier hosted Auth passes do not supply one for it.

The published `ce533444a26e50cd42c4be2b0d4cb9f2a0703d5f` follow-up moves the public delayed/error stubs to the **browser-context interception layer**, retaining owned fulfillment, awaited gates, cleanup and assertions. It is a **harness-only repair**, not an application authorization change or a mock of the real integration Auth workflow.

### Local check and public browser matrix

- **Current full check PASS:** lint, route type generation, strict typecheck and **991 tests across 15 files**, including **39 city-suggestion unit tests**, with **no warnings**, on the working code published as `ce533444a26e50cd42c4be2b0d4cb9f2a0703d5f`.
- **Current focused harness repeat PASS:** **20 repeat cases**—two tests × two widths × five repeats—in **1.7 minutes**, at the context-layer working fix. These focused cases are not added to full-matrix totals.
- **Current fresh full `many` PASS:** **186 passed / 1 intentional skip in 2.8 minutes**, at **320, 375, 390, 414, 768 and 1440 px**, on the same working fix. **`empty` and `one` were not rerun after this context-layer-only repair.**

**Earlier autocomplete matrix — preserved history, before the context-layer-only fix:** the following runs followed the `MediaPhoto` fallback fix, at all six widths in every scenario. The earlier callback-ownership repair preceded the recorded `empty` and `one` runs.

| Scenario | Passed | Intentional skips | Duration |
| --- | ---: | ---: | --- |
| `many` | 186 | 1 | 2.5 minutes |
| `empty` | 109 | 34 | 2.9 minutes |
| `one` | 140 | 21 | 2.4 minutes |
| **Total** | **435** | **56** | All three scenarios, all six widths |

The prior **435 passes / 56 intentional, inapplicable skips** remain valid **only at that earlier scope**, not as a newly rerun full matrix at `ce533444`. They are not 491 passes. Coverage adds **seven autocomplete browser tests** and a deterministic image pre-hydration test applicable only to nonempty inventory. No assertions were weakened; neither focused repeats nor the fresh `many` rerun are added to this historical total.

- **Image regression:** the first full `many` run exposed image-fallback failures. `MediaPhoto` now checks `node.complete` and `naturalWidth` without requiring `currentSrc`. A deterministic regression fails an SSR image while hydration is held; a healthy-image control and the focused gallery target passed **6/6**. This closes a conditional detection gap; the old failure did **not** capture runtime evidence proving `currentSrc` was empty.
- **Earlier harness regression:** the initial `empty` run failed when the delayed-response helper attempted to continue an already handled route. The callback-ownership repair and exact **six repeat phone/desktop cases passed** before the recorded `empty` and `one` runs. That evidence remains historical; it did not prevent the later hosted recurrence, which led to the context-layer-only repair above. Neither repair waived an application assertion.

### Current real local integration — post-sitemap PASS

On the same code as **`ce533444a26e50cd42c4be2b0d4cb9f2a0703d5f`**, `npm run build:integration` **passed**, then `npm run test:integration` passed **3/3 workflows in 2.7 minutes**, at **390, 768 and 1440 px**, with **all 12 substeps each**. This is current **post-sitemap** owned-service evidence, not the older pre-refactor run. These are three complete workflows, not 36 independently counted tests.

- Real random managed **local** email/password accounts exercise wrong-password rejection, actual login/refresh and ordinary non-admin denial. No Auth bypass or fabricated session is used.
- The UI creates a synthetic Chapra test city and venue. **New city-cover coverage** uploads actual PNG bytes, verifies responsive variants and authenticated private preview, and keeps the cover hidden publicly until city activation. Venue coverage uploads actual PNG/JPEG/WebP bytes and exercises cover selection, reordering, editing and deletion.
- Publication/activation verifies public autocomplete alongside valid public inventory counts; suggestions remain a name/slug/state projection. An admin cookie never widens public visibility to drafts. An active guide remains discoverable when empty until explicitly deactivated.
- Cleanup removes **only exact run-owned records** and all city-cover/venue variants, preserving Hazaribag. Every random local account created for the run was removed. No persistent production administrator or production test inventory was created.

This uses actual isolated Auth/REST/Storage/PostgreSQL at API **127.0.0.1:55321**, database **55322**, and app **localhost:3200**, with **`SHAGUN_TEST_FIXTURES=false`**. Inventory/images are synthetic and local; this is **not managed Production acceptance**. Test-owned record/media/account cleanup completed. Stack shutdown, the normal production rebuild and fresh localhost:3000 verification succeeded as recorded above. **No test accounts remain available for handoff.**

**Earlier autocomplete checkpoint:** the previously recorded local integration run passed **3/3 in 2.3 minutes**, with 12 substeps at the same three widths. Its stack stop, normal fixtures-false build and localhost:3000 restoration also passed at that checkpoint; only unrelated `biharibhojan-db` remained running then. The local `haza` combobox showed **“No public city guides match yet.”**, without synthetic inventory, and the hosted admin login was configuration-unavailable at that observation. These historical results are not the latest 2.7-minute run, current container/preview state or fresh hosted-admin verification.

### Earlier shared read-only inspection — PASS, not another apply

At that inspection, the read-only results were **1 city, 0 venues, 0 media assets, 0 administrators and 0 managed Auth users**. All **five ledger checksums were unchanged**, with **0 pending migrations**; sibling data matched the recorded baseline. This operation reported **`preservationComparisonPerformed: false`**: do not present the seven historical apply-time preservation flags below as a fresh seven-check comparison. **No production SQL mutations were performed in this inspection.** These SQL counts do not establish fresh Data API or public readiness; use the current operator labels above.

## Historical catalog/review results and labels

The following labels describe the **earlier catalog revisions**, not the current autocomplete work. `FINAL_RELEASE_RESULT` distinguished successful review publication, hosted checks for both catalog-era application revisions and blocked production. Their completed runs remain historical evidence; consult the current labels above for the latest work.

| Label | Recorded result / next evidence |
| --- | --- |
| `FINAL_CHECK_RESULT` | **PASS after `9db51bd`:** `npm run check` passed lint, route type generation, strict typecheck and **952 tests across 14 files**. The **60 catalog tests** include two new missing-URL/missing-public-key cases; the **19 request-time sitemap tests** and integration-reset guards remain included. |
| `LOCAL_INTEGRATION_BUILD` | **PASS:** `npm run build:integration`, a production-mode Next build for the exact local Supabase/localhost:3200 environment, fixtures disabled, before the sitemap refactor. Not a normal release build or deployment. |
| `LOCAL_INTEGRATION_BROWSER` | **PASS:** `npm run test:integration` completed **3/3 workflows on Windows**, at **390, 768 and 1440 px**, **11 substeps each**, in **2.4 minutes**, after the `.a-table-wrap` positioning fix and **before the sitemap refactor**. Real local Auth, REST, PostgreSQL and Storage plus signed-in axe/no-overflow checks were used. This historical run and the separate hosted `2072dc7` run have different scopes from the new 12-substep run above. |
| `FINAL_NORMAL_BUILD_RESULT` | **PASS after `9db51bd`:** normal `npm run build` with **`SHAGUN_TEST_FIXTURES=false`**. Request-time sitemaps are dynamic, with **no database queries during compilation**; builds never migrate, seed or provision users. The normal localhost:3000 empty preview was restored and confirmed at that checkpoint, not the current one. |
| `FINAL_FIXTURE_MATRIX_RESULT` | **PASS, Windows matrix before the final catalog-only guard:** `many` **166/1**, `empty` **95/28**, and `one` **120/21**, all at **six widths** (passed/skipped). **381 passes / 50 intentional, inapplicable skips**, no failures. Hosted audit CI ran only `many`, not this whole matrix. |
| `FOLLOW_UP_HOSTED_CI_RESULT` | **PASS, both jobs:** [run 34322083604](https://github.com/RichardHenryJames/shagun/actions/runs/34322083604) completed successfully at **`9db51bd5b0a11395d62401353fde3e0db03a59fe`**. Actual logs confirm Node 22 full check **952 tests / 14 files**, `many` public fixtures **166 passed / 1 skipped**, and Node 24 real isolated Auth/Storage workflows **3 passed in 1.8 minutes**, followed by successful stack shutdown. |
| `FINAL_RELEASE_RESULT` | **HISTORICAL REVIEW PUBLICATION: SUCCESS / CATALOG APPLICATION CI: PASS / PRODUCTION: BLOCKED.** Published [audit/second-pass-2026-09-09](https://github.com/RichardHenryJames/shagun/tree/audit/second-pass-2026-09-09) contains the tested follow-up [9db51bd](https://github.com/RichardHenryJames/shagun/commit/9db51bd5b0a11395d62401353fde3e0db03a59fe), not just original `2072dc7`. Its own hosted CI and Preview smoke passed within their stated scopes. Only Preview deployment was recorded; remote/local `main` were unchanged at that observation. Critical shared-security, API, real-admin, reviewed-inventory and full managed-acceptance/recovery gates remain open. |

Toolchain: Windows, locally tested Node **24**; pinned Next.js **16.3.3**, TypeScript **5.9.3** and development-only Supabase CLI **2.116.0**. Reproduce with [../package.json](../package.json) and [../package-lock.json](../package-lock.json).

## Managed SQL installation — historical apply PASS

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
- **The supplied identity is approved as a decision only; no production admin is provisioned.** API access and private provisioning still gate account creation/actual-UUID allowlisting. Enter a new unique password privately, never through chat; local Auth and the trusted provisioning helper retain their **12-character minimum** (the helper accepts **12–128**). Do not persist a chat-supplied credential or weaken Auth policy. Vercel secret storage is not local provisioning setup.
- The **12 real source-cited Hazaribag candidates** remain **unimported/unreviewed**, with no photos and unknown rights. Website-derived evidence is not verified contacts, editorial approval or exhaustive coverage.
- **Seven official primary sources returned 200 at the recorded source check**: partial website evidence for seven candidates only, not contact verification or a new source check in this update. The Aranya email mismatch is already recorded in private review notes; it and ambiguous “AC rooms” evidence remain unresolved. Do not silently reconcile claims or fabricate reviews. Five candidates remain follow-up holds. See [HAZARIBAG_RESEARCH.md](HAZARIBAG_RESEARCH.md).
- **No Chapra production record has been created.** Integration workflows use explicitly synthetic, temporary local records. The last recorded public `/cities?q=haza` search showed no matching guides; it does not establish fresh API readiness or launch acceptance.

## Historical managed HTTP probes — confirmed shared exposure and earlier schema failure

These probes preserve the earlier evidence, not a fresh current HTTP check. See `CURRENT_DATA_API_VERIFICATION` above for the later reported exposure/200 and the still-unconfirmed fresh verification; **do not present the old 406 as the current failure**.

The public publishable key was **momentarily revealed in the browser UI**, used only in browser memory for legitimate read-only, zero-row probes, then hidden before tool results. Its value was not printed or returned to the model. **Private/backend secrets were not read or revealed**; this is not a claim that no key was ever shown in the UI.

| Historical anonymous probe | Observed result at that checkpoint |
| --- | --- |
| `HEAD /rest/v1/Order?select=id&limit=0` | **200**; existing shared `public.Order` API access confirmed. |
| `HEAD /rest/v1/ContactMessage?select=id&limit=0` | **200**; existing shared `public.ContactMessage` API access confirmed. |
| `/rest/v1/cities?select=id&limit=0` with `Accept-Profile: shagun` | **406 / PGRST106 / Invalid schema: shagun**. |

**No customer rows were retrieved.** The first two results corroborate the already observed anonymous/authenticated SELECT grants with RLS disabled. Those probes established reachability, not merely hypothetical risk; the empty Order/ContactMessage baseline does not protect future rows. This preexisting security risk was **not changed by Shagun installation**. Remediation requires **separate shared/BihariBhojan-owner authorization**, never unilateral sibling grants/RLS changes or customer-row retrieval. Historical preservation success is not security clearance.

An authorized operator must verify the actual exposed-schema list and append `shagun` **only if absent**, preserving **every** other entry and excluding `shagun_private`. **At this earlier checkpoint**, the expired dashboard session's management request returned **401** and the GitHub button did not navigate. The later successful navigation to the real GitHub login is recorded in `PRIVATE_OPERATOR_ACCESS`; the old 401 is not a fresh status for that redirect. No API-list or shared Auth change was made by these historical probes.

**Release decision:** review publication and the original audit's hosted CI pass do not clear these gates. Do not promote `main`/Production, force launch, fabricate an admin/review or run a production Hazaribag import while they remain open. Exact owner/operator steps are in [DEPLOYMENT.md](DEPLOYMENT.md).

## Windows real local-service browser workflow — historical 3 PASSED

The historical run of [../tests/integration/admin-workflow.spec.ts](../tests/integration/admin-workflow.spec.ts) covered the following **11 substeps at each of 390, 768 and 1440 px**. These were three complete workflow tests, not 33 independently counted tests; the new 12-substep scope is recorded above.

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

**Historical local integration shutdown:** `npm run integration:stop` succeeded at that checkpoint; only the unrelated `biharibhojan-db` container remained running and local test data was retained. This is not the current process state; use the latest restoration label above.

## Unit/database tests versus service tests

`npm run check` covers local validation, authorization/action/route contracts, Sharp image handling, catalog/preview behavior and SQL migrations, grants, lifecycle, exact optimistic versions, upload reservations and cleanup. PGlite uses synthetic managed-schema scaffolding and a single connection; mocked route/action clients are not live Supabase. The separate workflow above adds actual local Auth/REST/Storage evidence, not managed-project certification.

The historical post-catalog-fix local **952-test / 14-file** run included **60 catalog tests**, **19 request-time sitemap tests** and both reset guards; the current check is recorded separately above. The original hosted audit ran **950 tests / 14 files before the two catalog regressions were added**; these are supplied execution counts, not inferred totals. The malformed-ZIP advisory in the city-import dependency was fixed by pinning `fflate` **0.8.3**; the subsequent package-manager audit reported **zero vulnerabilities**. Supabase CLI remains **2.116.0**.

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

Reproduction commands and the separate default-3000/fixture-3100/integration-3200 contracts are in [../README.md](../README.md). At that historical catalog checkpoint, the normal build passed with `SHAGUN_TEST_FIXTURES=false` and the browser at `http://localhost:3000/` confirmed the honest empty preparation state, with no synthetic warning or inventory. This does not establish the current build or preview state. Never reuse a mismatched build or weaken assertions to obtain a pass.

## Historical published review revisions and hosted evidence

[../.github/workflows/ci.yml](../.github/workflows/ci.yml) runs Node **22** quality checks/database-free public fixtures, then Node **24** real local Auth/publishing/Storage workflows on an isolated Docker-backed Supabase stack. The authenticated workflow suppresses credentials, Auth traces, populated form snapshots and database dumps; its stop step uses `always()` to clean up only that stack. No production credentials or managed test records are required.

**Historical review publication — SUCCESS:** [audit/second-pass-2026-09-09](https://github.com/RichardHenryJames/shagun/tree/audit/second-pass-2026-09-09) contains the published follow-up commit **`9db51bd5b0a11395d62401353fde3e0db03a59fe`**. It follows original audit commit **`2072dc7f8aba3e492d448c94d703450aa0312a75`**, whose local/GitHub branch SHA match was confirmed at its publication. Neither revision represents the new autocomplete changes; the later supplied `5a4003b` green checkpoint also predates them.

### Original audit hosted CI — SUCCESS at `2072dc7`

[Run 34320416797](https://github.com/RichardHenryJames/shagun/actions/runs/34320416797) **succeeded in both jobs**. Actual hosted logs confirmed:

| Job | Confirmed execution at `2072dc7` |
| --- | --- |
| Node **22** quality/public fixtures | Full check **950 tests / 14 files**; `many` fixture scenario **166 passed / 1 skipped**. No hosted `empty`/`one` matrix is claimed. |
| Node **24** real local Auth/Storage | Auth, Chapra/venue creation, media, publishing and cleanup: **3 passed in 1.9 minutes**, **after the sitemap refactor at this commit**. These are real isolated services hosted by CI, not managed production acceptance. |

This closes the original audit CI check. The later **catalog follow-up** has its own successful run in the historical `FOLLOW_UP_HOSTED_CI_RESULT` above, including the two new regressions and all three configured Auth workflows; that is not the current autocomplete CI result. Initial [run 34222982087](https://github.com/RichardHenryJames/shagun/actions/runs/34222982087), which passed for `2edd4fd` without fetched hosted counts, remains earlier history.

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

### Historical observed promotion boundary

At that observation, the GitHub `main` API confirmed the remote branch unchanged at **`b62d6eda5fde1fe5e588ef3a4b2a5cdeb4693908`** and the user's local `main` at **`b066ed5`**. These are historical SHAs, not a fresh branch query. Only the recorded **Preview/non-Production** deployment is established; no production promotion occurred. The Vercel production-branch setting itself was not fetched, so these observations are not a global provider-setting claim. **Do not promote `main` or Production.**

## Remaining evidence required

- **Current build/preview and CI:** fill `NORMAL_BUILD_RESTORATION_RESULT`, then `NORMAL_PREVIEW_RESTORATION` from fresh process/HTTP evidence; complete `AUTOCOMPLETE_HOSTED_CI_RESULT` from the follow-up run's actual job results. Do not reuse the old DOM or report the failed parent run's real-Auth job as passed.
- **Critical shared Order/ContactMessage exposure:** separately authorized owner remediation and safe verification without retrieving customer rows; preserved baseline flags and an unavailable approval response are not clearance. Keep `SHARED_OWNER_REMEDIATION_AUTHORIZATION` explicit.
- Complete `PRIVATE_OPERATOR_ACCESS` through private human sign-in and `CURRENT_DATA_API_VERIFICATION` through fresh checks. Confirm the actual schema list; append `shagun` only if absent and authorized, preserving other entries/private exclusion. Neither the historical 406 nor the later reported anonymous 200 is fresh verification. Complete real anonymous/ordinary/admin/revoked REST/RPC/Storage checks.
- Complete `PRODUCTION_ADMIN_PROVISIONING` privately for the supplied identity with a new unique password meeting the unchanged minimum and actual-UUID allowlisting; then verify hosted login/refresh/expiry/recovery and revocation. Real research import/review and any photo permissions still require their own approval and evidence.
- **Current-code hosted evidence and managed HTTPS acceptance:** earlier catalog CI/Preview passes do not cover the published autocomplete/harness revisions. Preserve the current local repeats/`many`/post-sitemap owned-Auth scope and the earlier `empty`/`one` matrix history; do not call those scenarios rerun. Owner-gated managed acceptance still needs HTTPS inventory metadata/sitemaps, secure cookies, image caching, six-width accessibility and final-domain performance; unconfigured or Vercel-protected Preview access is not production acceptance.
- Multiple real concurrent editor sessions, lock/quota/finalization races and managed-provider partial-upload/cleanup failure paths.
- Supported recovery of current database, object bytes, Auth identities/settings, roles/permissions and deployment configuration. The public-only scratch restore closes only its stated limited check.

[DEPLOYMENT.md](DEPLOYMENT.md) defines closure criteria. No managed Hazaribag launch, complete recovery or universal security/accessibility certification follows from local passes.