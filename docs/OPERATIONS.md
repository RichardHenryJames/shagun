# Inventory operations

Shagun is an editorial directory, not a booking or venue-approval service. Use researched facts and authorized photographs, never invented inventory.

**As of 2026-09-09:** the five migrations and draft Hazaribag seed are installed; there are no venues, photos or admins. Production keys are already saved in Vercel. **Production promotion is blocked:** anonymous access to shared Order/ContactMessage is confirmed, Shagun's API schema is missing (406 / PGRST106), dashboard access needs sign-in after a 401, and no approved real admin email is available. All **12 research candidates remain unimported/unreviewed**, with no photos or established rights. The next push is review-branch-only; do not force launch. Follow the owner/operator gates in [DEPLOYMENT.md](DEPLOYMENT.md).

## Local walkthrough versus real administration

The default normal preview is localhost:3000 with fixtures disabled and normally no database. Its normal build passed; restoration is being checked, so current availability is not yet confirmed. Labelled public fixtures use 3100; real local Supabase integration uses Next on 3200 and API/database ports 55321/55322. The latter tests actual services with temporary synthetic inventory, not the managed project. Commands and build/process ownership rules are in [../README.md](../README.md). Never create manual production test records; no Chapra production record has been created.

Real local Supabase workflows passed **3/3 in 2.4 minutes** at 390, 768 and 1440 px, covering Auth, Chapra/venue creation, uploads, cover/reorder/delete, publish/unpublish and cleanup with axe/no-overflow checks after the table-wrapper fix. **This run preceded the sitemap refactor**; post-refactor SEO coverage is unit/public tests, not a rerun of authenticated or managed acceptance.

## 1. Exact city-first publishing workflow

This is the later, owner-approved editorial workflow, **not authorization to publish during the current security hold**.

1. Provision the approved real administrator privately through the dashboard/actual-UUID allowlist procedure or trusted-terminal alternative below, then sign in at `/admin/login` and open **Cities**. A stored service key does not itself grant a browser session.
2. Open the existing **Hazaribag** workspace; do not recreate the seed. For a later city, use **Add city**, filter the GeoNames catalog by state/territory, explicitly select the correct place/district, or choose deliberate manual entry. Selection alone creates nothing; save as **Draft**.
3. Review the name, state/country, available slug and factual introduction before saving. The server validates catalog IDs and preserves `metadata.geographic_source_id` independently of editable metadata. Catalog availability is not city activation; existing manual records need no forced catalog association.
4. In the saved workspace, explicitly choose **Add researched drafts** for a matching batch, or **Add venue** with that city's UUID preselected. Save real facts as a draft; leave unknown fields blank. Use the correct price basis and do not assume WhatsApp support, zero prices/capacity or a city-centre location.
5. Record private sources, dates, uncertainties and permission references. Save before uploading authorized photos, then inspect alt text, public credit, cover and order. Missing photos may remain missing; never substitute fake venue photography.
6. Inspect **Saved preview** for the venue and **Saved city preview** at `/admin/cities/[slug]/preview`. The city preview uses actual shared `CityDiscovery`, with saved draft/published inventory and full server-side filters/counts. Both previews are authenticated/noindex/no-store, omit analytics and show saved data only, not unsaved edits or a shareable public link.
7. Review current facts/sources explicitly. Publishing requires a full address, nonempty private notes and the editorial-review confirmation. Keep verification **Unverified** unless an actual dated check supports **Verified**. Publish selected venues, then separately activate the city only when useful inventory is ready; at least one published venue is required, not proof of adequate coverage.
8. In a separate signed-out browser on the intended real domain, verify discovery, venue details, contacts, images and sitemap eligibility. A published venue under a draft/inactive city must remain hidden. Complete the managed acceptance checklist before claiming launch.

UI sources: [../src/components/admin/venue-form.tsx](../src/components/admin/venue-form.tsx), [../src/components/admin/city-form.tsx](../src/components/admin/city-form.tsx), [../src/components/admin/photo-manager.tsx](../src/components/admin/photo-manager.tsx).

### Research imports — implemented, not yet executed

- [../src/lib/actions/research.ts](../src/lib/actions/research.ts) rechecks managed Auth/active allowlist for summaries and imports. A batch must match the saved city's **slug, state and country**; the complete payload is validated before any write.
- Existing `(city_id, slug)` records in **every status** are skipped, never overwritten. Each missing venue is saved atomically with facts, facilities and private notes as draft/unverified/unreviewed, with no fabricated review or verification date. No photos or city lifecycle changes are imported.
- The prepared batch has seven website-led review candidates and five follow-up holds. Readiness flags and source-page dates are not editorial approval, contact verification or image rights. The source-cited detail is in [HAZARIBAG_RESEARCH.md](HAZARIBAG_RESEARCH.md).
- Seven official primary sources were freshly rechecked and returned **200**; this supports partial website evidence for seven candidates, not contact verification. The **Aranya email mismatch is already recorded in private review notes**; it and ambiguous **“AC rooms”** evidence still need resolution. Do not silently reconcile them, publish unsupported claims or fabricate completed reviews.
- The batch is **not** one transaction. Inspect confirmed partial progress or an ambiguous response before retry; created/skipped counts are not publication counts. Provenance stays in `venue_research.source_notes`, never public fields.

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

Never delete jobs to clear a counter, extend deadlines, reuse roots, overwrite objects or purge the bucket. An absent photo row alone is not permission to delete an in-flight upload. For ambiguous upload responses, refresh saved photos before retrying: finalization may have committed. No automatic sweeper/cron is configured. Real local Storage cleanup passed; managed fault/concurrency testing remains open.

## 7. Administrator access and secret incidents

- **Dashboard provisioning:** after the user signs in privately, open Supabase **Authentication → Users** and create only the approved real account, entering its password in the dashboard, not chat. A trusted operator must then resolve the actual returned UUID and explicitly insert that approved `id`, display name and `is_active=true` into `shagun.admin_users`. Never invent a UUID, infer authorization from an email suffix or elevate every Auth user. The account is not a Shagun administrator until allowlisted.
- **Trusted-terminal alternative:** privately configure `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` according to [../.env.example](../.env.example) and the existing package-script environment contract. Vercel settings are already saved but do not populate a local terminal; the dashboard path avoids copying the backend key. Run `npm run admin:create` only in a trusted interactive TTY, without arguments or redirected input/output. The human enters the approved email/display name and a unique **12–128-character password**, with password/confirmation hidden. Never request keys/passwords in chat or fabricate an account.
- [../scripts/create-admin.ts](../scripts/create-admin.ts) checks Data API schema access before requesting a password or creating Auth state, creates the managed user, then inserts that returned UUID into the active allowlist. It does not promote existing users on email conflict. On allowlist failure it attempts to remove only the account created by that run; an unconfirmed rollback requires inspection before retry.
- A confirmed Auth account created by this CLI is not an invitation email or proof of mailbox ownership. Verify the recipient separately. Use the approved managed recovery process; there is no application self-service reset workflow.
- **Revocation:** deactivate the actual UUID's `shagun.admin_users` row and test the existing session/private endpoints. Retain referenced review history and coordinate any project-wide session revocation. An existing JWT does not override inactive membership.
- **Shared boundary:** do not change BihariBhojan signup/providers, password/email/redirect policy or Storage ownership/grants as a Shagun side effect. The local integration email-provider settings are not managed-project defaults.
- **Confirmed shared-data exposure:** anonymous zero-row `HEAD` probes of existing `public.Order` and `public.ContactMessage` returned **200**, with SELECT grants and RLS already disabled. No customer rows were retrieved; do not fetch any to demonstrate impact. Escalate to the shared/BihariBhojan owners for **separately authorized remediation**. Do not alter sibling grants/RLS or replace the exposed-schema list without that authority; production promotion remains blocked. See [AUDIT.md](AUDIT.md).
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

## 10. Troubleshooting without weakening security

| Symptom | Safe next step |
| --- | --- |
| Empty public directory | Normal no-database preview and the managed draft-only seed both legitimately have no public inventory. A service error is different from an empty result. Do not enable fixtures or expose research JSON to conceal either. |
| Anonymous Order/ContactMessage access | Confirmed critical baseline exposure; stop production promotion and obtain separate shared-owner authorization for remediation. Do not retrieve customer rows or change sibling grants/RLS unilaterally. |
| SQL works but the API returns 406 / PGRST106 | Shagun is absent from exposed schemas. After authorized dashboard sign-in, preserve all existing entries, append `shagun` and exclude `shagun_private`; verify with zero-row probes. Keys are already saved in Vercel. Never weaken TLS, grants or RLS. |
| Supabase dashboard management request returns 401 | The session expired. The official sign-in page is visible, but the GitHub button did not navigate; the user must complete sign-in privately. Do not bypass it or ask for a password/token in chat. |
| Login unavailable/rejected | Check readiness issues, supported host, managed Auth and active UUID membership privately. No admin is currently provisioned. Invalid credentials/non-admin/provider failures deliberately use generic feedback. |
| Save conflict or changed record after photo operation | Reload and compare the newest saved version. Do not remove version checks or turn a save into independent table writes. |
| Publish/activate blocked | Check address, private sources, explicit current editorial review and actual check date if verified; publish a venue before activating its city. |
| Preview/upload/cleanup fails | Check session, owner, image/rights limits and ready reservations; inspect saved photos before retrying. Never make the bucket public, distribute signed URLs or discard unacknowledged jobs. |
| Sitemap returns 404 or 503 | Local/noindex environments and invalid partitions intentionally return 404. The request-time index discovers eligible inventory; invalid/private rows, limit violations and service failures yield sanitized no-store 503s. Async robots lists only the index and makes no database query. Do not force indexing or rebuild just to add partitions; verify HTTPS separately. |
| Browser test cannot start | Use the matching fixture or integration build, leave its exact origins intact and stop only the conflicting owned process. Never point tests at the managed project. |

[VERIFICATION.md](VERIFICATION.md) records the **950-test / 14-file** full check, passing final normal build with fixtures false/dynamic sitemaps/no build-time database queries, and **381 public passes / 50 intentional, inapplicable skips** across all three scenarios and all six widths. Only `FINAL_RELEASE_RESULT` remains pending in the final-result table: the planned **`audit/second-pass-2026-09-09`** review branch is not yet pushed, and its new hosted CI result is unconfirmed. [DEPLOYMENT.md](DEPLOYMENT.md) remains the operator checklist; this document authorizes no production promotion, automatic provisioning/publication or sibling changes.