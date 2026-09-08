# Inventory operations

Shagun is an editorial directory, not a booking or venue-approval service. Use only researched facts and authorized photographs. The initial seed is a **draft Hazaribag city with no venues or photographs**; it is not a populated launch catalogue. All later cities and venues are operator-created.

**Current status — 2026-09-08: live operations blocked by snapshot code and unavailable app credentials; release PENDING.** The completed lint/typecheck and **692-test / 8-file baseline** passed before five new database-access tests; the expanded **697-test run is in progress, with its result pending verification**. The normal Next.js production build has a recorded pass. Earlier **207 browser passes / 22 skips are historical QA only**; no new full matrix was run. **All 12 candidates remain unimported and unreviewed.** Existing Supautils delegation already authorizes Storage-policy management; the earlier permissions denial was a resolved local-runner false positive. Managed read-only inspection now fails **`stage=metadata-public code=22023`** in the catalog/preservation snapshot. No database write occurred and `shagun` does not exist; further database writes/debugging are stopped pending review, guard repair and successful read-only inspection before any apply. API keys and a real admin account remain unavailable. Initial commit/push through the configured owner Git credential is pending, not proven impossible. See [VERIFICATION.md](VERIFICATION.md) and [DEPLOYMENT.md](DEPLOYMENT.md).

## Local walkthrough versus real administration

The first task in [../.vscode/tasks.json](../.vscode/tasks.json) is now **Shagun: Local app preview**: `npm run start -- --hostname localhost`, with `SHAGUN_TEST_FIXTURES=false`, serves the normal build at **http://localhost:3000**. The old demo on port 3100 is stopped. The supplied manual check of four normal routes found no synthetic/test strings; the UI shows an **empty, unconfigured preparation state**, not live Hazaribag data. There is no Shagun local environment file/API configuration or authenticated admin session. A successful read-only operator database connection does not configure the app.

Optional synthetic QA remains separate: `npm run build:qa` followed by `npm run preview:qa` or `npm run test:e2e` uses localhost:3100 and the shared [../scripts/qa-environment.ts](../scripts/qa-environment.ts). Keep the same `empty`, `one` or `many` scenario for compilation and runtime, with labels and safeguards intact. Stop the normal preview before replacing shared build output and any optional port-3100 QA preview before Playwright starts its own server. Return to a normal `npm run build` before restarting the default app task. See [../README.md](../README.md).

## 1. Exact city-first publishing workflow

1. Sign in at `/admin/login` using a securely provisioned active administrator. Open **City workspaces** on **Inventory overview**, or **Cities** at `/admin/cities`.
2. Open **Hazaribag**. If the explicit seed was not applied, an empty admin directory is legitimate; use **Add city** only after confirming the intended record does not already exist. Do not substitute another initial city or import synthetic fixtures.
3. In **Edit city**, record the real name, state/country, stable slug and factual introduction. Keep **City status: Draft** and choose **Save city**. A newly created city uses **Save city & continue**. Save before its optional cover upload; nothing activates automatically.
4. For a matching research batch, review the workspace's research summary and deliberately choose **Add researched drafts**. This can add all missing candidates, including follow-up holds, as private drafts only; read the import safeguards below. Alternatively choose **Add venue**: `/admin/venues/new?city=…` preselects that saved city's UUID. Check **Associated city**; city-first entry remains the normal workflow.
5. Open each imported draft to inspect its facts and private sources. For manual entry, supply the real name, recorded type and stable slug, leave unknown facts blank and choose **Save venue & continue** with **Publication status: Draft**. The prepared research is not a reason to check editorial review automatically.
6. Complete the saved venue's factual public address, appropriate business contacts, capacity/pricing/facilities and optional coordinates. Prices require the correct per-day/per-event/per-plate basis. Do not assume a phone supports WhatsApp, substitute zero for unknown values, invent a city-centre venue location or mark unrecorded facilities absent.
7. Record sources, dates, uncertainties and permission references under **Private research & editorial review**. **Save venue** before uploading photos; photo operations refresh saved data and are not a way to preserve unsaved form edits.
8. Under **Photos**, choose authorized files, write meaningful alternative text per image and a rights/provenance credit for the batch, then choose **Upload photos**. Wait for the sequential batch to finish. Set the cover and order; inspect every saved photo. An image is not mandatory database proof of readiness, and a missing image must not be replaced by a fake venue photograph.
9. Open **Saved preview** at `/admin/venues/[id]/preview`. It shows saved data only, in an authenticated noindex/no-store view using the public detail component. It is not a shareable public review link. Save corrections and preview again.
10. Read the current facts and sources and explicitly confirm **I have reviewed the recorded facts and their sources**. To publish, supply a full address and nonempty private source notes, choose **Publication status: Published** and **Save venue**. Verification is independent: keep **Unverified** unless an actual dated check supports **Verified**.
11. While its city is draft/inactive, even a published venue remains hidden from public visitors. Return to **Edit city → City lifecycle**, choose **Active**, then **Save city** only when the real inventory is ready. Activation/reactivation requires at least one published venue; this minimum is not a claim of adequate city coverage.
12. Use a separate signed-out browser to verify the city, venue, recorded contacts, images and sitemap on the real domain. Complete the production checklist before calling the launch verified.

UI sources: [../src/components/admin/venue-form.tsx](../src/components/admin/venue-form.tsx), [../src/components/admin/city-form.tsx](../src/components/admin/city-form.tsx), [../src/components/admin/photo-manager.tsx](../src/components/admin/photo-manager.tsx).

### Research imports — implemented, not yet executed

- [../src/components/admin/research-import.tsx](../src/components/admin/research-import.tsx) shows only an authorized, matched batch summary. [../src/lib/actions/research.ts](../src/lib/actions/research.ts) rechecks managed Auth and the active UUID allowlist for both the summary and **Add researched drafts**. No demo account or authentication bypass is provided.
- The pure [../src/lib/research-catalog.ts](../src/lib/research-catalog.ts) validator matches the saved city's **slug, state and country** and validates every whitelisted payload before any write. Display-name edits are not geographic identity. There is no automatic city creation, hardcoded public city list or JSON fallback for empty published inventory.
- The current catalog has **12 real candidates / 27 source references**: the first seven contain actual website-derived data for review, not phone verification; five are source/contact follow-up holds. It records **11 primary phones and five WhatsApp fields**, not confirmed contacts or exhaustive coverage. All records retain draft/unverified status and `photos: []`; prices and coordinates are null, and only Mehfil's generic website maximum of 275 is recorded. See [HAZARIBAG_RESEARCH.md](HAZARIBAG_RESEARCH.md).
- Existing `(city_id, slug)` records in **every status** are skipped without changing edits. New records use `save_venue` with insert-only arguments: facts, facilities and private notes save atomically per venue. They remain draft, unverified, `verified_at: null` and `reviewed: false`, with no review attribution or publication timestamp. No city fields/lifecycle or photos are changed.
- Source URLs, method/dates, readiness flags, website/gallery references and caveats stay in `shagun.venue_research.source_notes`. Source-page checks and the seven ready flags are not completed reviews, dated contact verification or image permission.
- The batch is not an all-or-nothing transaction. On partial progress or an unconfirmed response, inspect saved inventory before retrying; never assume all 12 were saved. Reported created/skipped totals are not publication totals.

**Current outcome: all 12 are still unimported.** A real authorized admin must perform import and editor review before any publication; initial Hazaribag activation remains a separate explicit decision. No public live catalogue is documented by this preparation work.

## 2. Lifecycle, review and stable URLs

| Record/state | Meaning |
| --- | --- |
| City `draft` | Preparation, not public. |
| City `active` | Discoverable; only its published venues are public. |
| City `inactive` / `archived` | City and its inventory are hidden publicly; records remain for authorized operations. |
| Venue `draft` | Work in progress, private. |
| Venue `published` | Public only while the parent city is active. |
| Venue `unpublished` / `archived` | Hidden without permanent deletion. Archive is the normal retirement choice. |
| Verification `unverified` / `needs_review` / `verified` | A separate information-check state, not publication, endorsement, approval, availability or a quality rating. |

- **Staleness is not approval.** Review/recheck counts include non-archived venues that are not verified, lack a check date or were checked more than **90 days** ago. Review counts overlap publication counts. The public fresh “Details checked” label requires a verified, nonfuture date within that window; an old date is not a renewed guarantee.
- Checking the editorial-review box never invents a check date. Use the actual date; do not stamp today merely to clear the queue. A venue may be published while unverified if its publication prerequisites are met.
- Changing factual venue fields, sources or facilities invalidates the previous review. For a published/verified save, consciously review the current changes again. The atomic `save_venue` RPC stages, updates related data and restores the requested state in one transaction; intermediate drafts are not a partial public write.
- City slugs lock after first activation. Venue slugs and city association lock after first publication, including subsequent unpublish/archive cycles. Renaming a display name does not change its indexed URL. Do not work around the locks by deleting/recreating a record.
- An active city can become empty after venues are hidden. It is not automatically deactivated; its empty page is noindex and omitted from inventory sitemap entries. Deactivate it explicitly if the whole guide should be hidden.
- Counts describe recorded inventory, not geographic coverage, popularity, bookings or a fabricated completion percentage.

## 3. Public versus private information

**Public when eligible:** city introductions and `cities.metadata`, venue descriptions/addresses/business contacts/recorded facts, photo alternative text and photo credit. City metadata is a flat scalar JSON object, **not private provenance**.

**Private:** `venue_research.source_notes`, review attribution/records and operational tables. Do not place passwords, tokens, unnecessary personal data or sensitive permission correspondence in any field. Store a minimal private reference to permission evidence; publish only an appropriate rights-holder/licence credit. A source URL or an upload checkbox is not proof of image permission.

The saved preview intentionally omits private research from the public component. Never paste source notes into a public description, SEO field, metadata or credit. Existing Server Action guards reject non-ISO check dates and metadata over the UTF-8 byte budget before writing. PostgreSQL's formatted JSON byte check remains final, so keep metadata comfortably below the limit; see [../supabase/README.md](../supabase/README.md).

## 4. Photo rules and delivery boundaries

| Rule | Limit/behavior |
| --- | --- |
| Input | One file per request; JPEG, PNG or WebP only; **≤3 MiB (3,145,728 bytes)**. The UI's “3 MB” refers to this bound. |
| Decode | Actual image bytes must decode; no animation, SVG or arbitrary remote URL fetching. Decoded pixel count **≤40,000,000**, regardless of compressed file size. |
| Processing | Server rotates/re-encodes and strips metadata; WebP variants target maximum widths of **480, 960 and 1600** pixels, each **≤3 MiB**, preserving the oriented aspect ratio without enlarging smaller sources. Do not distribute original uploads through the application. |
| Ownership | Exactly one saved owner: maximum **1 city cover** or **24 venue photos**. No upload against an unsaved record. |
| Description/rights | Alternative text 5–250 characters; credit 5–300 characters. Credit is public-facing: identify rights/permission without private contact information. |
| Storage | Private `shagun-media`; immutable random UUIDv4 root with three variants. New uploads/replacements use new roots and `upsert: false`, never in-place overwrite. |

The first photo becomes cover automatically. **Set cover**, **Up**, **Down** and **Edit alternative text & credit** are explicit saved operations. Deleting a cover promotes the first remaining ordered photo. Owner-row locks and indexes enforce cover/count/order invariants; photo changes also update the owner's optimistic version.

The browser sends uploads and changes through authenticated admin endpoints. Upload, preview, edits and cleanup use current session authorization and the active allowlist; the public app does not receive a service key. Preview delivery is `/api/admin/media/[id]?w=…`, with private/no-store caching.

Public `/media/[id]/[width]` delivery first checks the media owner with anonymous RLS, then performs gated server-side retrieval from the private bucket. A storage root or media ID is not a capability to read drafts. Do not make the bucket public, share direct object URLs or create/distribute signed URLs to make a missing image work.

**Previously public media cannot be recalled.** Public image delivery permits a CDN cache window of at most **60 seconds**. Unpublishing/deactivating prevents fresh authorized delivery, but an already cached public response can remain during that window, and visitor downloads or external caches can persist longer. Unauthorized draft images must never be served or cached publicly. For rights/privacy removal, hide/delete the affected asset and use provider cache-removal controls as appropriate; never promise that external copies have disappeared.

## 5. Saves, conflicts and destructive changes

- Forms are not autosaved. **Saved preview** means saved database state, not unsaved browser state.
- Save/delete RPCs lock the row and compare the exact `expected_updated_at` value with the database version. Keep its fractional seconds and time-zone offset unchanged; do not normalize it through JavaScript `Date` or omit it to force a write.
- A conflict means reload, compare and intentionally reapply the change. Preserve any necessary draft text privately before reloading, without copying private research to a public place. Photo/facility changes or another editor can make an open form stale.
- For a correction or emergency hide, select **Unpublished** on the venue and save; select **Needs review** if current verification cannot be supported. To hide a city and all its venues, save **Inactive** or **Archived** on the city. Confirm visibility signed out; remember the public-image cache caveat.
- Prefer **Archived** to deletion. Permanent deletion requires the exact current name and version, and the record must not be active/published. A city containing **any** venue, including draft/archived venues, cannot be deleted. Do not bypass the foreign key; resolve records deliberately or retain the archived city.
- Database deletion and object removal are separate transactions. The SQL deletion commits its cleanup outbox entry; provider failure does not make the deleted listing public again.

## 6. Cleanup and partial-upload recovery

Open `/admin` → **Storage cleanup** → **Retry storage cleanup**. The dashboard count includes deletion jobs **and unexpired upload reservations**; not every counted job is ready, and the count is not a complete storage audit.

1. Before **any Storage write**, the upload route waits for `begin_media_upload` to commit a durable root reservation. Its `ready_at` is database transaction time plus **15 minutes**; a duplicate request cannot renew that deadline. Record/photo deletion, including cascades, instead creates immediately eligible work in the deletion transaction.
2. After all three variants upload through the admin session, `finalize_media_upload` consumes the reservation and inserts the media row in **one transaction**. Ownership, metadata or photo-limit errors roll back both changes and retain the reservation. Expired/missing reservations and deletion jobs cannot finalize.
3. Cleanup revalidates the current admin session and reads at most **25** jobs with `ready_at <=` the action's current UTC time, ordered by readiness and ID. Future upload reservations are not selected. “No cleanup jobs are ready” can be normal during the 15-minute window; eligibility is not an automatic deletion schedule.
4. Before removing objects, the action rechecks `media_assets` for a live reference to the root. A live reference or failed lookup leaves the job untouched for investigation; it does not authorize deletion.
5. Using that admin session, cleanup removes **all three 480/960/1600 variants**, then acknowledges the matching job **only after the provider reports success**. Provider failure, missing authorization or unconfirmed acknowledgement leaves work retryable. Missing files after an earlier partial removal are expected on retry; read the result and retry later without hammering a rate-limited action.
6. Do not delete a job merely to make the count zero, extend its deadline, reuse its root, overwrite existing objects or purge the whole bucket.

The reservation covers **interrupted uploads with no media row**, including a process dying after only some variants reached Storage; cleanup does not depend on a catch handler surviving. Local SQL/route/action tests cover this lifecycle, readiness, live-reference checks and retries. Real managed Storage failure-path verification is still required before launch. No automatic sweeper or cron service is configured.

For an ambiguous upload result, refresh and inspect saved photos before retrying: finalization may have committed even if the response was lost. The UI retries failed/remaining files, not completed ones. A zero queue count does not audit historical or out-of-band objects; have a trusted operator reconcile exact roots against `media_assets`, reservations and in-flight uploads when needed. Never treat the absence of a media row alone as permission to delete a recent upload.

## 7. Administrator access and secret incidents

- Creation: follow [DEPLOYMENT.md](DEPLOYMENT.md) and run `npm run admin:create` only in a trusted TTY, with no password arguments. Shagun has no public registration; **do not globally disable signup/anonymous sign-ins or alter shared Auth settings without assessing BihariBhojan and obtaining operator approval**. The command is not a bulk importer or an existing-user promotion script.
- Recovery: use the managed Auth dashboard's approved reset/recovery process; do not promise an application reset screen or configured email service that does not exist.
- Revocation: a trusted operator should deactivate the **actual Auth UUID's** `shagun.admin_users` row. Coordinate any managed Auth session revocation with the shared account's BihariBhojan impact. Retain the row where review history references it; do not delete unrelated accounts or change shared Storage ownership/grants.

Bound-parameter revocation template for a trusted administrative SQL client (`$1` is the actual account UUID, not a test ID):

```sql
update shagun.admin_users
set is_active = false
where id = $1::uuid
returning id, is_active;
```

Confirm the intended row changed, then probe a previously authenticated browser and direct private endpoints. Fresh app checks and RLS deny inactive members; neither an old UI nor an existing JWT is evidence of continuing admin permission.

If a privileged key/password is exposed, restrict access, rotate/revoke through the provider's supported procedure, update every affected environment securely and verify again. A service-role key bypasses RLS; changing a table policy does not contain a leaked service key. Rebuild when public configuration changes. Do not put the old or new secret in incident notes, shell arguments or CI artifacts.

## 8. Recurring maintenance and privacy

- Review the dashboard's actual city, published, draft, recheck and cleanup counts. Set an operator-owned cadence; no always-on worker or scheduler is required by this architecture.
- Prioritize flagged/unverified listings and checks older than 90 days. Confirm contacts, facilities, price basis and rights; publish a new check date only after a real check. Hide misleading or unauthorized content promptly.
- Keep a monitored corrections/privacy mailbox if `NEXT_PUBLIC_CONTACT_EMAIL` is configured. With it blank, no fake contact channel is promised. Use listing URLs and minimal correction evidence, not identity documents or payment details.
- Analytics is off by default. If enabled, it records aggregate city/venue events, not raw searches, IPs/emails or visitor profiles, and respects Do Not Track/Global Privacy Control. Security rate buckets are HMAC-based; hosting/security logs are a separate provider concern.
- Aggregate-event housekeeping removes older-than-90-day rows in bounded batches on valid writes; rate-limit housekeeping is also bounded and request-driven. Do not promise an independent exact-time deletion scheduler when traffic stops.
- Monitor Auth/service errors, quota/egress growth, inactivity pauses, storage backlog and backup freshness. Do not log private source notes, provider responses, credentials or unnecessary request identifiers while troubleshooting.

## 9. Backups and tested restore

Assign an owner, frequency, retention, encrypted/off-site destination and recovery-time/data-loss objectives before launch. A plan name or a successful export is not a tested restore. **Supabase Free has no automatic backups in the architecture's recorded assumptions; verify current plan behavior.**

Back up and recover these as a coordinated set using supported provider procedures:

1. **Database:** `shagun` and `shagun_private`, all four migrations and their private checksum ledger, data, UUID relationships, review history, functions/grants/RLS, cleanup jobs/reservations and their `ready_at` deadlines, and relevant operational data. Coordinate recovery with the shared project's owner; a public-table export is neither a Shagun inventory backup nor a complete managed Auth backup.
2. **Storage:** actual bytes of every required `shagun-media` derivative, object paths/manifests, private bucket configuration and Shagun policies. Preserve unrelated buckets and managed ownership/grants. Database rows or Storage metadata alone do not include image files. Retain rights evidence under its appropriate private access policy.
3. **Auth:** supported identity/account recovery preserving UUID-to-allowlist relationships, project Auth settings, email/redirect policy and a plan for credentials/session revocation. Do not invent password-hash migrations or assume an application database dump recreates managed Auth.
4. **Configuration:** securely recover environment settings, domain/hosting setup and key-rotation procedures separately from public source control. Never put secrets in a public backup manifest.

Rehearse in an **isolated non-production project**, with public discovery/activation controlled. Restore schema/data/objects and supported Auth identities, check root/row consistency and cleanup jobs before draining them, then test login, active/revoked membership, public published content and denial of draft/private content through REST and Storage. Missing/changed Auth UUIDs break admin access and review attribution; restore/reconcile them deliberately. Revoke obsolete sessions and rotate/rebind project credentials as required by the recovery procedure.

Record the actual restore result and measured recovery objectives. Do not restore over production or run destructive verification without an approved recovery plan and backup. Application rollback cannot undo schema changes or recover deleted files by itself.

## 10. Troubleshooting without weakening security

| Symptom | Safe next step |
| --- | --- |
| Empty public directory | The current normal preview is unconfigured. Check API configuration and city/venue states; a draft Hazaribag-only seed is also intentionally empty. Do not enable fixtures or fall back to the research JSON as published inventory. |
| Earlier shared inspection reported `MIGRATION_PRIVILEGES` | **Resolved local-runner false positive:** delegation detection was missing. `storage_policy_manager=true` reflects already-configured [Supautils policy authority](https://github.com/supabase/supautils#manage-policies) for the exact current role on `storage.objects`; false owner usage/membership is not a blocker. Updated preflight validates protected `pg_settings` context and exact JSON capability. No new grants, ownership or RLS changes are needed or were made. |
| Current inspection fails `stage=metadata-public code=22023` | **Unresolved catalog/preservation snapshot runtime blocker.** The earlier SQL syntax error `42601` was fixed and parsed in isolated PGlite, not a managed snapshot success. Database writes/debugging are stopped pending review; review/fix the guard and obtain successful full read-only inspection before any separately authorized apply/seed. `shagun_exists=false`; no database writes occurred. Do not force a bypass or escalate ownership to solve code. |
| Database TLS trust failure | The recorded failure was resolved using the official Supabase production CA through the existing task's `NODE_EXTRA_CA_CERTS`. Keep certificate and hostname verification enabled; never use an insecure TLS fallback. See [DEPLOYMENT.md](DEPLOYMENT.md). |
| App has no Data API access despite a working database connection | Database credentials are not API/service keys. An authorized operator must supply those privately and append `shagun` to the existing exposed-schema list without removing other entries; keep `shagun_private` excluded. |
| Login unavailable or repeatedly rejected | Check service configuration, limiter secret, managed Auth status and matching active allowlist UUID privately. Bad credentials/non-admin/provider failures deliberately do not reveal detailed identity information. |
| Save conflict or changed record after photo operation | Reload and compare the newest saved version. Do not remove version checks or turn a save into independent table writes. |
| Publish/activate blocked | Check address, private sources, explicit current editorial review and actual check date if verified; publish a venue before activating its city. |
| Date or metadata rejected on save | Actions reject non-ISO/invalid/future check dates and over-budget UTF-8 metadata. Use an actual ISO date and small scalar metadata; near the cap, PostgreSQL's formatted JSON byte check is still final. See [../supabase/README.md](../supabase/README.md). |
| Draft preview image denied | Check the current admin session and owner record. Never switch the bucket to public or distribute a signed URL. |
| Upload failed or duplicates uncertain | Check byte/pixel/type/rights/count limits, inspect saved photos, and reconcile partial-upload cleanup before retrying blindly. |
| Cleanup count persists | Reservations may not yet be ready. Inspect the result, session, provider/policies and any live-reference protection; retry eligible work later. Retain jobs until all variants are removed and acknowledgement is confirmed. |
| Robots/sitemap fails although inventory works | Confirm all four migrations are applied; `sitemap_entries` and its null/range guards come from the third. Check grants, final HTTPS origin and publication predicates; never list drafts to make a sitemap nonempty. |
| Fixture browser test fails to start | Stop the normal **Shagun: Local app preview** before replacing shared build output, and any optional QA preview occupying localhost:3100. Run `npm run build:qa` for the intended scenario, then `npm run test:e2e`. Keep the shared QA environment, labels and guards; never point fixture tests at a managed deployment. |

The completed 692-test baseline, pending expanded 697-test check and separately labelled historical QA are recorded in [VERIFICATION.md](VERIFICATION.md). The **BLOCKED / PENDING** checklist in [DEPLOYMENT.md](DEPLOYMENT.md) governs managed production acceptance. Vercel has no production deployment, and no live editorial workflow or public inventory is certified. This docs-only refresh ran no commands or external checks.