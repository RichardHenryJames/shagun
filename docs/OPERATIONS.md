# Inventory operations

Shagun is an editorial directory, not a booking or venue-approval service. Use researched facts and authorized photographs, never invented inventory.

**As of 2026-09-09:** the five migrations and draft Hazaribag seed are installed, and Production keys are saved in Vercel. **Production promotion is blocked** by the critical shared Order/ContactMessage exposure and independently gated API, private-administrator, editorial and managed acceptance work. Current HTTP/sign-in/provisioning evidence, research status, checks, publication scope and process state are canonical in [VERIFICATION.md](VERIFICATION.md); historical failures are not fresh HTTP results. Identity approval alone is not a provisioned account or completed password/API gate. Publication remains review-branch-only; no `main`/Production promotion or force launch.

## Local walkthrough versus real administration

The default normal preview contract is localhost:3000 with fixtures disabled and normally no database. Labelled public fixtures use 3100; real local Supabase integration uses Next on 3200 and API/database ports 55321/55322. These modes share build output: rebuild normally before restoring the default preview after tests. Actual preview/stack state is recorded only in [VERIFICATION.md](VERIFICATION.md), not implied by this default.

The real local workflow uses random managed local Auth accounts, synthetic Chapra inventory, city-cover/venue uploads and exact run-owned cleanup; it is not a production test or persistent admin provisioning. Never create manual production test records. Commands and process ownership are in [../README.md](../README.md); current results and older run scopes remain in the verification record.

## 1. Exact city-first publishing workflow

This is the later, owner-approved editorial workflow, **not authorization to publish during the current security hold**.

1. Provision the approved real administrator privately through the dashboard/actual-UUID allowlist procedure or trusted-terminal alternative below, then sign in at `/admin/login` and open **Cities**. A stored service key does not itself grant a browser session.
2. Open the existing **Hazaribag** workspace; do not recreate the seed. For a later city, use **Add city**, type its name, check the state/district in the nationwide results and select the correct place. Choose **Create city** to save a draft and open its workspace. Selecting a result alone creates nothing.
3. The server fills the selected name, correct state, **India**, an available URL slug and draft defaults. SEO title/description use the standard city-page defaults; no override, introduction or JSON entry is required. Existing matching workspaces open without overwriting edits. Optional introduction, SEO overrides, lifecycle and cover photos remain in the saved city's **Edit city** screen. Existing manual records need no forced catalog association.
4. In the saved workspace, explicitly choose **Add researched drafts** for a matching batch, **Import Excel** for your own researched spreadsheet, or **Add venue** with that city's UUID preselected. Save real facts as a draft; leave unknown fields blank. Use the correct price basis and do not assume WhatsApp support, zero prices/capacity or a city-centre location.
5. Record private sources, dates, uncertainties and permission references. Save each owner before uploading an authorized city cover or venue photos, then inspect private preview, alt text, public credit, cover and order. A draft city's cover stays hidden publicly until activation. Missing photos may remain missing; never substitute fake venue photography.
6. Inspect **Saved preview** for the venue and **Saved city preview** at `/admin/cities/[slug]/preview`. The city preview uses actual shared `CityDiscovery`, with saved draft/published inventory and full server-side filters/counts. Both previews are authenticated/noindex/no-store, omit analytics and show saved data only, not unsaved edits or a shareable public link.
7. Review current facts/sources explicitly. Publishing requires a full address, nonempty private notes and the editorial-review confirmation. Use the individual editor or **Review & publish** on a venue list for a selected page of drafts/unpublished venues. Keep verification **Unverified** unless an actual dated check supports **Verified**. Publish selected venues, then separately activate the city only when useful inventory is ready; at least one published venue is required, not proof of adequate coverage.
8. In a separate signed-out browser on the intended real domain, verify city autocomplete/native GET discovery, actual counts, venue details, contacts, images and sitemap eligibility. A published venue under a draft/inactive city must remain hidden; an admin cookie must not widen public results. Complete the managed acceptance checklist before claiming launch.

UI sources: [../src/components/admin/venue-form.tsx](../src/components/admin/venue-form.tsx), [../src/components/admin/city-form.tsx](../src/components/admin/city-form.tsx), [../src/components/admin/photo-manager.tsx](../src/components/admin/photo-manager.tsx).

### Research imports — explicit and draft-only

- [../src/lib/actions/research.ts](../src/lib/actions/research.ts) rechecks managed Auth/active allowlist for summaries and imports. A batch must match the saved city's **slug, state and country**; the complete payload is validated before any write.
- Existing `(city_id, slug)` records in **every status** are skipped, never overwritten. Each missing venue is saved atomically with facts, facilities and private notes as draft/unverified/unreviewed, with no fabricated review or verification date. No photos or city lifecycle changes are imported.
- The prepared batch distinguishes website-led review candidates from follow-up holds. Readiness flags and source-page dates are not editorial approval, contact verification or image rights. The source-cited detail is in [HAZARIBAG_RESEARCH.md](HAZARIBAG_RESEARCH.md); recorded counts belong in [VERIFICATION.md](VERIFICATION.md).
- Recorded source-page checks and current import/review status belong in [VERIFICATION.md](VERIFICATION.md); website responses are not contact verification. The **Aranya email mismatch is already recorded in private review notes**; it and ambiguous **“AC rooms”** evidence need human resolution. Do not silently reconcile them, publish unsupported claims or fabricate completed reviews.
- The batch is **not** one transaction. Inspect confirmed partial progress or an ambiguous response before retry; created/skipped counts are not publication counts. Provenance stays in `venue_research.source_notes`, never public fields.

### Excel imports for a saved city

1. Save the city first, open its workspace and choose **Import Excel**. Confirm the displayed city/state, then **Download template**. The workbook is blank: it supplies a `Venues` sheet with all **29 supported columns** and a `Fields` guide, not example venue facts.
2. Fill real venue details in `Venues`, with one venue per row. `name` and `venue_type` are required for a draft; a blank `slug` is generated from the name. The template covers address/locality, contacts, capacity/price ranges and basis, coordinates, description, SEO, private `source_notes` and nine facilities. Unknown fields stay blank.
3. Upload a plain **`.xlsx` of at most 2 MiB**, with at most **1,000 populated venue rows** through Excel row 1001. Use the template's dropdown values, ordinary decimal numbers, and phone numbers stored as text with a country code. Facilities accept `yes`/`no` or blank; `no` and blank mean unrecorded, not a verified negative claim. Do not include formulas, dates, macros, embedded images, hidden populated rows/columns or extra sheets/columns. City IDs, record IDs, lifecycle/review fields and photo URLs are not import fields.
4. Choose **Validate workbook**. Validation writes no inventory. Fix every reported Excel row/column error and upload the corrected file; any validation error prevents all saves. A valid preview lists new drafts and same-city slugs that already exist. Selecting a different file clears the preview and requires validation again.
5. Confirm **Import N drafts** once. The page advances through confirmed **100-row requests** and displays progress; keep it open while importing. Every new venue is saved atomically with its facilities and private notes, as **draft, unverified and unreviewed**, without a verification date. No city is created or activated, no existing venue is updated, and nothing is published. Matching city/slug records in any lifecycle are skipped, including on a repeated import.
6. Open the resulting saved drafts, correct facts, upload only authorized images, inspect preview and complete the existing explicit review/publish workflow. `source_notes` remains private; workbook upload does not establish source accuracy or photo rights.

The workbook is **not a single transaction**. **Stop import**, closing the page, a provider failure or a request deadline can leave confirmed drafts plus unconfirmed or unattempted rows. Stopping prevents further requests but does not roll back work already received by the server. Inspect the saved inventory before revalidating/retrying; do not assume an unconfirmed request failed to commit. Keep the same slugs to preserve retry matching. Split files larger than 1,000 rows or the byte limits; this is not a background bulk job. The application processes the workbook in memory and does not retain the uploaded file in Storage.

Template download, validation and import each require a fresh managed session and active administrator membership. The city is reloaded server-side, and confirmation is bound to that city and the exact validated workbook bytes. Technical limits and failure handling are in [ARCHITECTURE.md](ARCHITECTURE.md#city-scoped-excel-import).

## 2. Lifecycle, review and stable URLs

### Bulk review and publication

1. Open a saved city workspace or **All venues**, apply the desired search/publication filter, and select draft or unpublished rows. The header checkbox selects only eligible statuses on the **current page, at most 25 venues**, never unseen pages. Published and archived rows cannot be selected.
2. Choose **Review & publish** to load the selected saved versions, their private source notes and publication requirements. This step writes nothing. Missing addresses/notes, invalid facts and changed records appear with an editor link; only ready rows can be included in the confirmation.
3. Review the displayed facts and sources. Deselect any venue that should stay private, then explicitly confirm **I have reviewed the selected venues' recorded facts and sources, and approve publication**. Changing inclusion or reopening the dialog clears that confirmation. **Cancel** or Escape before publication makes no writes.
4. Choose **Publish N venues**. The current managed administrator is recorded as the reviewer by the existing atomic save RPC. This records the administrator's editorial decision, not independent research by automation. No check date, verified status, source text, photo, venue fact or city activation is invented or changed.
5. Inspect per-row results before continuing to the next page. A changed venue is not overwritten; reload and review its new saved version. A stopped/ambiguous request can include confirmed publications and unconfirmed saves, so inspect saved inventory before starting a new review. Never blindly retry. Publication under a non-active city remains private until that city is separately activated.

Each venue save is atomic; the selection is not a single transaction. The operation remains subject to fresh Auth/active membership, RLS, exact optimistic versions, rate/time bounds and existing database publication requirements. No constraint removal, service-role inventory write or direct SQL bypass is involved.

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
- An active city can become empty after venues are hidden. It stays discoverable in `/cities` and public autocomplete until explicitly deactivated; its empty page is noindex and omitted from inventory sitemap entries. Do not impose a new nonempty-venue rule just for suggestions.
- Counts describe recorded inventory, not geographic coverage, popularity, bookings or a fabricated completion percentage.

## 3. Public versus private information

**Public when eligible:** city introductions and `cities.metadata`, venue descriptions/addresses/business contacts/recorded facts, photo alternative text and photo credit. City metadata is a flat scalar JSON object, **not private provenance**.

Public city suggestions are narrower: at most eight records containing only `name`, `slug` and `state`, read anonymously with no-store behavior. They never expose the private GeoNames catalog, research, metadata or admin inventory. Full native GET city search remains available without JavaScript; venue search is unchanged.

**Private:** `venue_research.source_notes`, review attribution/records and operational tables. Do not place passwords, tokens, unnecessary personal data or sensitive permission correspondence in any field. Store a minimal private reference to permission evidence; publish only an appropriate rights-holder/licence credit. A source URL or an upload checkbox is not proof of image permission.

Saved previews omit private research from the shared public components. Actions reject invalid/non-ISO check dates and over-budget UTF-8 metadata; PostgreSQL's formatted JSON byte limit remains authoritative. The reserved geographic source ID counts toward that metadata budget and must not be manually reassigned.

## 4. Photo rules and delivery boundaries

| Rule | Limit/behavior |
| --- | --- |
| Input | One file per request; JPEG, PNG or WebP only; **≤3 MiB (3,145,728 bytes)**. The UI's “3 MB” refers to this bound. |
| Decode | Actual image bytes must decode; no animation, SVG or arbitrary remote URL fetching. Decoded pixel count **≤40,000,000**, maximum **20,000 pixels per side**, regardless of compressed file size. |
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

1. `begin_media_upload` commits a durable reservation **before** Storage writes, with a non-renewable **15-minute** database deadline. After all variants upload, `finalize_media_upload` atomically consumes it and inserts the photo; failure retains cleanup work. Deleted records instead queue immediately ready jobs.
2. Cleanup reauthorizes and selects at most **25 ready jobs**, then rechecks each root has no live `media_assets` reference. Future reservations, live references and failed lookups must be left alone.
3. Remove **all three 480/960/1600 variants before acknowledgement**. Provider or acknowledgement failures remain retryable. “No jobs ready” can be normal; inspect outcomes before retrying.

Never delete jobs to clear a counter, extend deadlines, reuse roots, overwrite objects or purge the bucket. An absent photo row alone is not permission to delete an in-flight upload. For ambiguous upload responses, refresh saved photos before retrying: finalization may have committed. No automatic sweeper/cron is configured. Local Storage evidence in [VERIFICATION.md](VERIFICATION.md) does not replace managed fault/concurrency testing.

## 7. Administrator access and secret incidents

- **Approval is not provisioning:** current supplied-identity/API/provisioning evidence is recorded only in [VERIFICATION.md](VERIFICATION.md). Verify API readiness and enter a new unique password privately. Local Auth and the provisioning helper retain their **12-character minimum** without exceptions; never lower it or persist a chat-supplied credential. Identity approval alone does not satisfy private password entry, API access or actual-UUID allowlisting.
- **Dashboard provisioning:** after authorized private sign-in and API readiness, open Supabase **Authentication → Users** and create only the approved account, entering a unique password of at least **12 characters** in the dashboard, not chat. A trusted operator must then resolve the actual returned UUID and explicitly insert that approved `id`, display name and `is_active=true` into `shagun.admin_users`. Never invent a UUID, infer authorization from an email suffix or elevate every Auth user. The account is not a Shagun administrator until allowlisted.
- **Trusted-terminal alternative:** privately configure `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` according to [../.env.example](../.env.example) and the existing package-script environment contract. Vercel settings are already saved but do not populate a local terminal; the dashboard path avoids copying the backend key. Run `npm run admin:create` only in a trusted interactive TTY, without arguments or redirected input/output. The human enters the approved email/display name and a unique **12–128-character password**, with password/confirmation hidden. Never request keys/passwords in chat or fabricate an account.
- [../scripts/create-admin.ts](../scripts/create-admin.ts) checks Data API schema access before requesting a password or creating Auth state, creates the managed user, then inserts that returned UUID into the active allowlist. It does not promote existing users on email conflict. On allowlist failure it attempts to remove only the account created by that run; an unconfirmed rollback requires inspection before retry.
- A confirmed Auth account created by this CLI is not an invitation email or proof of mailbox ownership. Verify the recipient separately. Use the approved managed recovery process; there is no application self-service reset workflow.
- **Revocation:** deactivate the actual UUID's `shagun.admin_users` row and test the existing session/private endpoints. Retain referenced review history and coordinate any project-wide session revocation. An existing JWT does not override inactive membership.
- **Shared boundary:** do not change BihariBhojan signup/providers, password/email/redirect policy or Storage ownership/grants as a Shagun side effect. The local integration email-provider settings are not managed-project defaults.
- **Confirmed shared-data exposure:** historical zero-row/SQL evidence for `public.Order` and `public.ContactMessage`, and the actual owner-approval status, are in [VERIFICATION.md](VERIFICATION.md). Do not fetch customer rows to demonstrate impact. Escalate to the shared/BihariBhojan owners for **separately authorized remediation**; an unavailable response or general request to finish is not approval. Do not alter sibling grants/RLS or replace the exposed-schema list without that authority; production promotion remains blocked. See [AUDIT.md](AUDIT.md).
- **Secret incident:** revoke/rotate through supported provider controls, update affected environments privately and verify again. A service key bypasses RLS; policy edits alone do not contain its exposure. Never record key/password values in logs or incident documents.

## 8. Recurring maintenance and privacy

- Review the dashboard's actual city, published, draft, recheck and cleanup counts. Set an operator-owned cadence; no always-on worker or scheduler is required by this architecture.
- Prioritize flagged/unverified listings and checks older than 90 days. Confirm contacts, facilities, price basis and rights; publish a new check date only after a real check. Hide misleading or unauthorized content promptly.
- Keep a monitored corrections/privacy mailbox if `NEXT_PUBLIC_CONTACT_EMAIL` is configured. With it blank, no fake contact channel is promised. Use listing URLs and minimal correction evidence, not identity documents or payment details.
- Analytics is off by default. If enabled, it records aggregate city/venue events, not raw searches, IPs/emails or visitor profiles, and respects Do Not Track/Global Privacy Control. Security rate buckets are HMAC-based; hosting/security logs are a separate provider concern.
- Aggregate-event housekeeping removes older-than-90-day rows in bounded batches on valid writes; rate-limit housekeeping is also bounded and request-driven. Do not promise an independent exact-time deletion scheduler when traffic stops.
- Monitor Auth/service errors, quota/egress growth, inactivity pauses, storage backlog and backup freshness. Do not log private source notes, provider responses, credentials or unnecessary request identifiers while troubleshooting.

## 9. Backups and tested restore

**Completed, limited rehearsal:** before installation, a public-schema archive and separate Auth/Storage logical metadata were saved under ignored, private [../.qa/backups/](../.qa/backups/). Only the **public-schema archive** was restored into a new local scratch database; shared-table fingerprints matched and scratch/copy cleanup completed. Original owners/ACLs were not replayed and role restoration was not tested. See [VERIFICATION.md](VERIFICATION.md).

That pre-install artifact is **not** a current Shagun backup or complete managed Auth/settings/service recovery. Assign an owner, retention, encrypted/off-site storage and measured recovery objectives. With the shared owner, back up and rehearse:

1. Current `shagun` / `shagun_private` schema/data, all **five** migrations/ledger, functions/RLS/grants, UUID relationships, reviews and cleanup deadlines.
2. Actual private image bytes and exact variant roots, manifests, bucket configuration/policies and rights evidence; Storage metadata is not a byte backup.
3. Supported managed Auth identity/settings recovery, UUID-to-allowlist continuity, roles/permissions and safe session/key revocation. A public-schema dump cannot recreate these services.
4. Hosting/domain/environment configuration through a private recovery channel, then signed-in/revoked and anonymous REST/Storage visibility checks in an isolated recovery environment.

Do not restore over production to test recovery, drain reservations blindly after restore or treat an application rollback as recovery of deleted objects. Verify actual plan backup coverage rather than assuming the vendor plan includes everything.

### Current local encrypted SQL backup

[../scripts/db-backup-current.ts](../scripts/db-backup-current.ts) is a separate, explicit Windows operator workflow, not a replacement for the historical public-only helper or a build hook. The **Shagun: Create encrypted local backup** task uses the selected guarded connection and writes a uniquely named encrypted archive and receipt directly in the project root, as requested. The exact current artifact, custodian, timestamps and checks are in [VERIFICATION.md](VERIFICATION.md); both artifact patterns are excluded by [../.gitignore](../.gitignore). Never force-add them, put them in public assets, or upload private SQL contents to diagnostics.

- Reads only current `shagun` / `shagun_private` application rows/ledger and bounded dependency metadata, through verified TLS and a read-only transaction. A shared exported PostgreSQL snapshot binds the native `pg_dump` to the data/metadata comparison. It does not export sibling business rows, Auth users/passwords/sessions, provider secrets or global role passwords.
- Includes five migration sources/checksums and Shagun bucket/policy metadata. The runner currently **refuses nonempty media, Storage objects or cleanup queues**; it is not a future image-byte backup implementation and must not silently ignore uploaded files.
- Uses authenticated **AES-256-GCM**, with the random key wrapped by **Windows DPAPI CurrentUser** in [../scripts/backup-key.ps1](../scripts/backup-key.ps1). Keys travel only through child-process pipes. No password/key is requested in chat or stored in plaintext. **The same Windows user profile is required to decrypt.** Copying this archive to another machine is not sufficient: independent key escrow/portable recovery remains an additional controlled procedure.
- Reopens the saved encrypted file and restores its native archive into a new **network-disabled, read-only-root, tmpfs PostgreSQL container**, with no exposed ports or application stack changes. Owners/ACLs are replayed; all-row fingerprints and named metadata are compared. Two known slug CHECK expressions are reparsed on independent empty scratch tables to prove equal parse/deparse fixed points; predicates, constraint flags, data and every other metadata field must still match.
- The sandbox creates UUID-only `auth.users` **reference stubs**, plus the source `auth.uid()` SQL definition, solely to satisfy restored SQL dependencies. These are not authenticated users or a substitute for managed Auth, JWT verification, REST or Storage acceptance. No hosted authorization check uses these stubs.
- `--verify-backup` accepts only an existing root archive and performs decryption/local SQL verification **without connecting to the source database**. Reverify an existing artifact after an interrupted run before taking another capture. An existing receipt is not overwritten. The tool logs only safe counts, hashes, flags and failure stages; no private row bodies or SQL definitions are emitted.

This closes only the scope recorded in the receipt. A root-local, Windows-profile-bound copy is **not off-device protection or complete managed recovery**. Retention, private off-device storage, independent recovery-key custody, managed Auth/settings continuity, actual object bytes and full-service restore acceptance remain distinct responsibilities.

## 10. Troubleshooting without weakening security

| Symptom | Safe next step |
| --- | --- |
| Empty public directory | Normal no-database preview and the managed draft-only seed both legitimately have no public inventory. A service error is different from an empty result. Do not enable fixtures or expose research JSON to conceal either. |
| Public city suggestions are empty or unavailable | Only current active public cities qualify, including active empty guides. Distinguish no matches from errors; use retry or native GET search. Never substitute the private catalog/research, add Auth or widen visibility. Validation and request bounds are in [ARCHITECTURE.md](ARCHITECTURE.md). |
| Anonymous Order/ContactMessage access | Confirmed critical baseline exposure; stop production promotion and obtain separate shared-owner authorization for remediation. Do not retrieve customer rows or change sibling grants/RLS unilaterally. |
| SQL works but a fresh API probe returns 406 / PGRST106 | Verify the actual exposed-schema list after authorized private sign-in; append `shagun` only if absent, preserve every other entry and exclude `shagun_private`, then recheck with zero-row probes. Do not assume a historical 406 is current; current evidence is in [VERIFICATION.md](VERIFICATION.md). Keys are already saved in Vercel. Never weaken TLS, grants or RLS. |
| Supabase dashboard redirects to sign-in | Complete the official Supabase/GitHub owner login with private human input. A redirect alone does not establish HTTP 401, and an old settings tab is not proof of a current session. Do not bypass login or ask for passwords/tokens in chat; current access evidence is in [VERIFICATION.md](VERIFICATION.md). |
| Login unavailable/rejected | Check readiness issues, supported host, managed Auth and active UUID membership privately; actual provisioning status is in [VERIFICATION.md](VERIFICATION.md). Invalid credentials/non-admin/provider failures deliberately use generic feedback. |
| Unconfigured city catalog returns 503 | The published guard checks `isConfigured` before client construction and returns private/no-store, noindex **503** with no catalog data when the URL/public key is absent. This replaces the non-leaking 500 found in the original Preview smoke. Configured requests still require fresh managed Auth and active allowlist membership; do not bypass either or treat unavailability as no matches. |
| Save conflict or changed record after photo operation | Reload and compare the newest saved version. Do not remove version checks or turn a save into independent table writes. |
| Publish/activate blocked | Check address, private sources, explicit current editorial review and actual check date if verified; publish a venue before activating its city. |
| Preview/upload/cleanup fails | Check session, owner, image/rights limits and ready reservations; inspect saved photos before retrying. Never make the bucket public, distribute signed URLs or discard unacknowledged jobs. |
| Sitemap returns 404 or 503 | Local/noindex environments and invalid partitions intentionally return 404. The request-time index discovers eligible inventory; invalid/private rows, limit violations and service failures yield sanitized no-store 503s. Async robots lists only the index and makes no database query. Do not force indexing or rebuild just to add partitions; verify HTTPS separately. |
| Browser test cannot start | Use the matching fixture or integration build, leave its exact origins intact and stop only the conflicting owned process. Never point tests at the managed project. |

[VERIFICATION.md](VERIFICATION.md) is the single record for current checks, browser/integration results, read-only inspection and preview restoration, with older hosted evidence explicitly historical. [DEPLOYMENT.md](DEPLOYMENT.md) remains the operator checklist; this document authorizes no production promotion, automatic provisioning/publication or sibling changes.