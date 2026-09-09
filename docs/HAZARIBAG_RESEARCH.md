# Hazaribag venue research — 2026-09-08

**Current status — 2026-09-09: managed SQL installed; research unimported; production promotion blocked.** All **five migrations and the draft Hazaribag seed are installed**; the former catalog snapshot `22023` blocker is resolved. Both API keys are already saved in Vercel **Production**, but there is no real admin, venue or photo inventory. The implemented private import has **not run: all 12 candidates remain unimported and unreviewed**. Shagun's actual zero-row API probe returned **406 / PGRST106**. Anonymous zero-row `HEAD` probes of shared Order/ContactMessage returned **200**, corroborating SQL SELECT grants with RLS disabled; no customer rows were retrieved. Separate shared-owner remediation and API/admin/editorial gates block promotion. The planned **`audit/second-pass-2026-09-09`** review branch is not yet pushed. See [VERIFICATION.md](VERIFICATION.md) and [DEPLOYMENT.md](DEPLOYMENT.md).

## Scope and evidence boundary

[../data/research/hazaribag-2026-09-08.json](../data/research/hazaribag-2026-09-08.json) contains **12 real, source-cited business candidates with 27 source references for private editorial review**, not a complete inventory of Hazaribag venues, a verified directory or a live catalogue. **The first seven contain actual website-derived facts and source citations**, not synthetic placeholders or phone-verified records; they are marked for editor review. **Five social-page/inconsistent-evidence records** need primary-source/contact follow-up. None has completed editorial review. The request for all Hazaribag venues is **not fulfilled exhaustively** by this batch, and no present business activity or contact confirmation is claimed.

The compilation uses the supplied source-review findings. This documentation-only pass inspected local source and preserves the recorded catalog facts, contact-field counts, source references, ready flags and caveats. It did not modify the catalog, revisit websites, call or message businesses, visit venues, download photographs, run commands or access external services. The recorded research method is:

> Manual review of publicly accessible venue websites and business pages; no phone/site visit confirmation

`researched_on` and every source `checked_on` are **2026-09-08**, the supplied web-source review date. They are not contact-verification dates, dates of current business operation, price-validity dates or photo-permission dates. Older visible posts and varying Facebook accessibility remain explicit private caveats. A source entry does not guarantee that its URL is accessible now.

The supplied follow-up source audit confirmed **seven official-source HTTP 200 responses**: partial website evidence for seven candidates, **not contact verification or completed editorial review**. The **Aranya email mismatch is already recorded in private review notes**, with its public-eligible email left null; it and ambiguous “AC rooms” evidence remain unresolved. No new venue facts, ready flags, reviews or photo rights are inferred from those responses.

Only the supplied venue websites, business pages and named directory corroboration are used. No Google scraping, invented contacts, map coordinates, ratings, popularity metrics, synthetic venues or fabricated photographs are included. Short original descriptions and factual paraphrases replace promotional copy.

## Data contract and implemented private import

- The root contains `city`, `researched_on`, `method` and `venues`. The city name is Hazaribag, state Jharkhand, country India and stable slug `hazaribag`; the description and SEO text contain no private research.
- Every venue includes the same explicit contact, location, capacity, price, facility, source, review and lifecycle keys. Unknown optional values are `null`, not zero, empty strings or estimates.
- Every record has `status: "draft"`, `verification_status: "unverified"`, `verified_at: null` and `photos: []`.
- `ready_for_editorial_review` is **queue triage only**. `true` means the supplied website evidence can be presented to an editor; it does not mean reviewed, verified, publication-ready or approved. `false` identifies a record needing additional primary evidence first.
- Venue types and facilities use the vocabulary in [../src/lib/types.ts](../src/lib/types.ts). An empty facility array means no supported facilities were recorded, not that the venue has none. A hotel, restaurant, bar or resting space does not automatically establish other event facilities.
- `sources` records each supplied URL, publisher, source kind, review date and short factual observations. `venue_website` and `business_page` are primary business claims, not independent certification. `directory` is explicitly secondary evidence; disputed claims stay out of public-eligible fields.
- The implemented importer forces `reviewed: false`, retains unverified/draft state and a null `verified_at`, and creates no review attribution or publication timestamp. New `reviewed_at` and `reviewed_by` remain null. Readiness and source-check dates never become completed review or verification.
- Only whitelisted factual fields enter venue columns. `sources`, `review_notes`, website/gallery references, the research method/date and the triage flag are deliberately mapped into **private** `shagun.venue_research.source_notes`. Research objects are not spread into public columns, city metadata, SEO, descriptions or photo credits. Notes exceeding the validation limit fail rather than being silently truncated.
- The city object is catalog identity/metadata, not a write or activation instruction. The importer preserves the saved city's fields/lifecycle and existing operator edits; initial Hazaribag should remain draft until the separate editorial workflow is complete. It neither creates a city nor activates one.

### Matching city workspace → Add researched drafts

1. A real active administrator must sign in and open an existing saved city workspace. [../src/lib/actions/research.ts](../src/lib/actions/research.ts) registers the catalog **server-side only** and reauthorizes even the summary read. A batch matches the saved city's **slug, state and country**, not a hardcoded display name or default-city fallback.
2. [../src/components/admin/research-import.tsx](../src/components/admin/research-import.tsx) receives only a flat summary: 12 candidates, 27 source references, 11 with address/contact fields present, seven marked for review and five needing follow-up. Field presence is not accuracy, approval or verified contact. Private notes/catalog rows do not become browser props.
3. The user explicitly chooses **Add researched drafts**. The action rechecks managed Auth/active UUID allowlist, reloads the saved city, validates the request and all mapped inputs, and rate-limits the operation. The pure [../src/lib/research-catalog.ts](../src/lib/research-catalog.ts) module validates/maps data without loading the catalog or doing I/O; it is not a public inventory source.
4. Every existing `(city_id, slug)` record is **skipped in any lifecycle state**, with no update, upsert or overwrite of editor changes. Each missing candidate is inserted through `save_venue`, atomically saving its facts, facilities and private source notes. **All 12 are eligible only as private, unreviewed drafts**, including the five follow-up holds; seven ready flags do not limit import to seven or grant approval.
5. The whole batch is not one transaction. Partial or unconfirmed results require inspection of saved inventory before retrying. No uncertain save is counted as confirmed, and retry is not permission to overwrite existing records. The city lifecycle stays unchanged; no photos, activation, verification or publication is performed.
6. An editor must open each saved draft, inspect sources/caveats, resolve follow-up, use **Saved preview**, and explicitly review/publish through the existing editor. A verification claim needs a real dated check; photo upload needs actual rights. City activation is a separate action.

**No research import has been performed: all 12 are still prepared catalog records, not database venues.** The separate [../supabase/seed.sql](../supabase/seed.sql) **was applied with all five migrations** and remains draft-city-only, with no venues, photos or accounts. The import feature is implemented, but its managed Auth/editorial execution remains blocked by the release gates.

Keep catalog data out of public assets and **public** runtime reads. Only the authorized server-side administration path loads it; public discovery continues to use anonymous database access with active-city/published-venue predicates and **no JSON fallback**. Later cities are created by administrators, not supplied by a hardcoded normal-UI list. Normal preview must remain fixture-free; its restoration is being checked and current availability is not yet confirmed. Separate QA fixtures retain their labels and safeguards. See [OPERATIONS.md](OPERATIONS.md) and [ARCHITECTURE.md](ARCHITECTURE.md).

## Candidate register

| Candidate / primary reference | Type | Locality | Source references | Editorial queue |
| --- | --- | --- | ---: | --- |
| [Tilak Baag](https://www.tilakbaag.com/contact-us.html) | `banquet_hall` | Kumhartoli | 3 | Ready to review |
| [The Floresta Hotels & Banquets](https://www.theflorestahotelsandbanquets.com/contact-us) | `hotel` | New Forest Colony | 4 | Ready to review |
| [Hotel Aranya Vihar](https://hotelaranyavihar.com/contact-us/) | `hotel` | Hearngunj | 3 | Ready to review |
| [Ananta - By The Hill](https://anantabythehill.com/contact) | `resort` | Canary Hill Road | 3 | Ready to review |
| [Hotel Hill Side](https://thehotelhillside.in/) | `hotel` | Dipugarha | 1 | Ready to review |
| [Hotel Sunshine Heritage](https://www.hotelsunshineheritage.in/contact-us/) | `hotel` | Railway station area | 2 | Ready to review |
| [Mehfil Banquet](https://mehfilbanquet.com/) | `banquet_hall` | Sindoor | 1 | Ready to review |
| [Shubh Shambhu Banquet Hall](https://www.facebook.com/shubhshambhubanquethall.in/) | `banquet_hall` | Lower Malviya Marg | 2 | Hold: primary-page access and contact freshness |
| [Dikshit's Grand](https://www.facebook.com/DikshitsGrandbanquethall/) | `banquet_hall` | Ravindra Path | 2 | Hold: older primary evidence and contact freshness |
| [Rings & Roses Banquet Hall](https://www.facebook.com/people/Rings-Roses-Banquet-hall/100083502815265/) | `banquet_hall` | Hearngunj | 3 | Hold: primary address and direct contact missing |
| [The Taj Banquet Hall](https://www.facebook.com/THETAJ0786/) | `banquet_hall` | Pugmil | 2 | Hold: older primary evidence and contact freshness |
| [Hotel Swayamvar Palace](https://www.facebook.com/hotel.swayamvar.palace/) | `hotel` | Hearanganj | 1 | Hold: entrance details and contact freshness |

The source column totals **27 entries in the `sources` arrays**, not 27 independent confirmations or a count of additional website/gallery links. The Floresta's named halls are not separate venues. No thirteenth record is implied by this batch, and the count is not a claim of citywide coverage.

## Field-level decisions

### Contacts and WhatsApp

The current catalog has **11 non-null primary `phone` fields**, **one non-null `alternate_phone`** (Hotel Sunshine Heritage) and **five non-null `whatsapp` fields**. These are field counts, not confirmed contacts. Recorded numbers come from the supplied primary websites/business pages, not directory lead-routing numbers. `+91` normalization is not a successful call or message test. Rings & Roses has no supported direct contact, so every contact field is null. Hotel Aranya Vihar's email is null because its displayed and linked addresses disagree.

Exactly **five** WhatsApp numbers have explicit business-link evidence:

| Venue | Recorded WhatsApp | Supplied link evidence |
| --- | --- | --- |
| The Floresta Hotels & Banquets | +919955119221 | [Contact page](https://www.theflorestahotelsandbanquets.com/contact-us) links to [wa.me/919955119221](https://wa.me/919955119221). |
| Hotel Aranya Vihar | +917479655611 | [Contact page](https://hotelaranyavihar.com/contact-us/) has an explicit business WhatsApp link. |
| Ananta - By The Hill | +919942631802 | [Contact page](https://anantabythehill.com/contact) has an explicit business WhatsApp link. |
| Hotel Hill Side | +917992392177 | [Homepage](https://thehotelhillside.in/) has an `api.whatsapp.com` business-booking link. |
| Hotel Sunshine Heritage | +918709822355 | [Contact page](https://www.hotelsunshineheritage.in/contact-us/) displays `wa.me/8709822355`; the omitted country code is normalized using its matching Indian alternate business phone. |

No other phone is presumed to support WhatsApp. Sunshine's malformed source link is documented rather than represented as a tested working link. Ananta's separate home-delivery contact is excluded from venue contacts.

### Capacity, pricing, location and facilities

- **Only Mehfil Banquet has a numeric capacity:** `capacity_max: 275`, a generic website guest-capacity claim. It is not a confirmed seated layout or certified occupancy limit. Every `capacity_min` is null; all other maxima are null.
- Every `price_min`, `price_max` and `price_type` is null. Mehfil's undated conditional tariff is retained only in its private `review_notes`; it is not a current offer. Hotel room rates are never substituted for event prices.
- Every latitude and longitude is null. No geocoding, city-centre fallback or inferred venue pin is included.
- Preserve primary address spellings and scope, including Hazaribagh, Hearngunj and Hearanganj. Do not silently normalize similarly named localities into one place or fill missing street/PIN details from snippets.
- Rings & Roses is the explicit address exception: two directories supply the same landmark/locality/PIN, while the primary page establishes only the city. Its address remains provisional and its queue flag is false.
- Facility flags follow the approved positive evidence. No parking, AC, catering, accessibility, lift or other service is inferred merely from a venue type. Specific exclusions are recorded below and in each record's private notes.

## Per-venue editorial notes

### 1. Tilak Baag

- The [contact page](https://www.tilakbaag.com/contact-us.html) supplies the railway-station/Gandhi Smarak address, telephone and email. [Facilities](https://www.tilakbaag.com/facilities.html) support the halls, lawn, accommodation, owned parking, kitchens and generator; the [AC banquet page](https://www.tilakbaag.com/banquet-hall-ac.html) supports AC.
- Generator provision is listed without diesel. Confirm fuel arrangements and charges rather than claiming inclusive power backup. The ambiguous overall capacity and sofa-seat reference are not a banquet-hall capacity.

### 2. The Floresta Hotels & Banquets

- The [homepage](https://www.theflorestahotelsandbanquets.com/) advertises 23 rooms. The [souvenir-path page](https://www.theflorestahotelsandbanquets.com/banquet-hall-souvenir) is headed Grand Banquet Hall with Lawn and mentions parking and a pool; the [medium-path page](https://www.theflorestahotelsandbanquets.com/banquet-hall-medium) uses Souvenir and mentions catering.
- Conflicting homepage/banquet guest figures are omitted. Resolve the layout and confusing page labels with the operator; do not create another venue for Souvenir. AC is not inferred, and a pool has no corresponding facility enum.

### 3. Hotel Aranya Vihar

- The [homepage](https://hotelaranyavihar.com/) supports rooms, AC, power backup and in-house food; [Victoria](https://hotelaranyavihar.com/victoria/) describes wedding receptions with food service.
- The [contact page](https://hotelaranyavihar.com/contact-us/) displays `mbkhresort@gmail.com` but links to `info@hotelaranyavihar.com`. Neither is chosen as the email field. Confirm the correct inbox, hall cooling and event backup arrangements. Room tariffs do not establish event prices.

### 4. Ananta - By The Hill

- [Experiences](https://anantabythehill.com/experiences) describes wedding banquet spaces, lawns, a pool and a restaurant; [rooms](https://anantabythehill.com/rooms) supports the sole recorded facility flag.
- The [contact address](https://anantabythehill.com/contact) lacks a PIN. Do not infer event catering from the restaurant or hall AC from a bar. Exclude the separate home-delivery number from venue contacts. The experiences page is also the supplied gallery reference, not an image asset.

### 5. Hotel Hill Side

- The [homepage](https://thehotelhillside.in/) supplies the venue identity, wedding banquet reference, rooms, locality address and business contacts. Obtain a complete entrance address directly.
- Generic travel-template image text, room ratings and room prices are excluded. The gallery reference uses the homepage because no specific gallery anchor was established in the supplied evidence; no fragment or fuller PDF address is invented.

### 6. Hotel Sunshine Heritage

- The [homepage](https://www.hotelsunshineheritage.in/) advertises three halls, ten rooms, a garden and parking, with references to Kud railway station and Hazaribagh Town station. The [contact page](https://www.hotelsunshineheritage.in/contact-us/) supplies two phones, email and the explicit WhatsApp evidence.
- Confirm the entrance and railway-station wording. The supplied review flagged a wedding-service page using Rana Palace; those claims are not merged into this hotel. Room/hall counts do not establish guest capacity. The WhatsApp country-code normalization is recorded above.

### 7. Mehfil Banquet

- The [venue website](https://mehfilbanquet.com/) supports the Sindoor/NH-33 address, contacts, AC party/dining halls, generic guest maximum, parking, food options, decoration and generator. Parking is advertised for 20 cars and 50 bikes, not used as an event-capacity proxy.
- Its 2BHK rest space does not establish guest-room accommodation. Keep the conditional, undated tariff in private notes only and obtain a current layout-specific capacity and event quote before adding pricing. No explicit WhatsApp evidence was supplied.

### 8. Shubh Shambhu Banquet Hall

- The [business page](https://www.facebook.com/shubhshambhubanquethall.in/) supplies the street/landmark and phone; [Mandap](https://www.mandap.com/hazaribag/shubh-shambhu-banquet-hall-in-hazaribag) corroborates the identity but adds a PIN not adopted in the primary address.
- The supplied initial page review was public, but a subsequent supplied check met a login wall. Recheck accessible primary evidence and contact freshness without bypassing access restrictions. Conflicting establishment years are omitted; no facility or capacity claims are accepted.

### 9. Dikshit's Grand

- The [business page](https://www.facebook.com/DikshitsGrandbanquethall/) supplies the Ravindra Path/Mission Hospital landmark, phone and wedding/anniversary use. Visible 2019 material is not proof of a current contact.
- [Mandap](https://www.mandap.com/hazaribag/dikshits-grand-marriage-and-banquet-hall-in-hazaribag) corroborates the identity only. Its dubious parking figure and all unsupported capacities/facilities are excluded. Reconfirm the business and entrance before advancing the record.

### 10. Rings & Roses Banquet Hall

- The [business page](https://www.facebook.com/people/Rings-Roses-Banquet-hall/100083502815265/) establishes the city, not a complete primary address or usable phone. [Mandap](https://www.mandap.com/hazaribag/rings-and-roses-banquet-hall-in-hazaribag) and [EventPlanet](https://eventplanet.in/venue/banquet-halls/rings-and-roses-hazaribagh) independently list the Kargil Petrol Pump/Hearngunj location.
- Their room, parking and capacity claims contradict one another and are not imported. Do not copy a directory enquiry number into a business contact field. Keep the record on hold until direct contact and a primary address are obtained; the gallery reference remains the business-page base URL.

### 11. The Taj Banquet Hall

- The [business page](https://www.facebook.com/THETAJ0786/) supplies the Pugmil/petrol-pump address and phone. Visible 2021 content requires current contact reconfirmation, not a verification-date stamp.
- [Mandap](https://www.mandap.com/hazaribag/the-taj-banquet-hall-in-hazaribag) contains an Indore copy error. None of its numbers or other venue details are adopted. Confirm the actual petrol-pump landmark and entrance without guessing a name or PIN.

### 12. Hotel Swayamvar Palace

- The [business page](https://www.facebook.com/hotel.swayamvar.palace/) supports the Hearanganj locality, business phone, hotel rooms and wedding-banquet use.
- Obtain street/entrance details and contact reconfirmation directly. Preserve the primary spelling; do not extend the address from snippets. Relative post-age labels do not establish phone freshness, and no inferred activity timestamp is recorded.

## Photographs and gallery references

**No photo permission has been obtained for any of the 12 records. Every `photos` array is empty.** No image is downloaded, copied, hotlinked, scraped, synthesized, seeded or placed in Storage by this handoff.

`website_url` and `gallery_url` are supplied business-page references for later editorial work, not licensed image URLs or evidence that a pictured space is current. Some references are ordinary home/experiences pages; Facebook photos routes may require login. Do not assume a gallery-page link provides access, permission, authorship or a usable publication credit.

A later authorized editor must establish rights/provenance and suitable public credit, then use the existing genuine-image decode/re-encode/upload workflow. Source notes and private permission correspondence must not appear in public photo credits or descriptions. Missing authorized photos must not be replaced with unrelated hotel stock images or QA diagrams.

## Excluded leads — not claims of nonexistence

These names are **not venue records in this batch**. Reasons below are supplied research findings, not network checks performed by this documentation refresh. Exclusion does not establish that a business is closed or nonexistent. Do not guess source URLs, contacts or addresses for these leads.

| Lead | Reason omitted / evidence needed |
| --- | --- |
| Crown | Conflicting phone information, stock imagery and site errors; resolve the primary identity and business contact before creating a record. |
| Prowess | Placeholder WhatsApp content and unrelated tropical-coastline material; a reliable primary business page is needed. |
| Sri Vinayak | The supplied primary-source attempt returned HTTP 404; obtain retrievable primary evidence. |
| Celebration | Certificate validation failed for the supplied HTTPS source; do not bypass the certificate failure or create a factual record without retrievable primary evidence. |
| Jalsa | Insufficient primary evidence in the approved review. |
| Other directory-only leads | Retain as future research leads, not imported venue facts; identity, primary contact and location need independent editorial work. |

## Handoff checklist

- [x] Exactly 12 distinct candidates; Floresta sub-halls deduplicated.
- [x] Same explicit venue keys, 27 source references, source-check dates and private caveats throughout.
- [x] All records draft/unverified with null verification dates and empty photos.
- [x] Seven review-queue candidates and five evidence/contact holds; no completed editorial reviews.
- [x] Current fields checked: 11 primary phones, one alternate phone and five evidence-backed WhatsApp fields; no contact confirmation claimed.
- [x] Only Mehfil has a numeric guest maximum; all prices, minimum capacities and map coordinates are null.
- [x] Authenticated matching-city import card, server-only action and pure validator/mapper implemented; insert-only per-venue atomic saves, no overwrite, private notes and no automatic review/publication/activation.
- [x] Draft-city-only seed remains separate; public discovery has no catalog fallback or hardcoded city list.
- [x] Catalog snapshot `22023` fixed; guarded installation of all five migrations and draft Hazaribag completed with all seven preservation checks passing. Existing policy delegation was used without owner escalation or a forced bypass; preservation is not clearance of the insecure shared baseline.
- [ ] Separately authorized shared-owner remediation of confirmed anonymous Order/ContactMessage exposure; no customer-row retrieval or unilateral sibling permission changes.
- [ ] Authorized API configuration and real admin Auth session; **all 12 drafts still need explicit import**.
- [ ] Resolve holds, confirm current contacts/entrances and assess each fact before editorial sign-off.
- [ ] Obtain photo rights before any real image upload.
- [ ] Explicit editorial publication and city activation, followed by real-service acceptance, if authorized later.

The final full `npm run check` **passed 950 tests across 14 files**, lint, route type generation and strict typecheck, including the research contracts in [../tests/unit/research.test.ts](../tests/unit/research.test.ts) and **19 request-time sitemap tests**. The final normal `npm run build` **passed with `SHAGUN_TEST_FIXTURES=false`**, dynamic request-time sitemaps and **no database queries during compilation**. Builds never migrate, seed, import or provision users.

Fresh public fixtures passed at **all six widths (320, 375, 390, 414, 768, 1440 px)**: **many 166/1, empty 95/28, one 120/21** (passed/skipped), totaling **381 passes / 50 intentional, inapplicable skips**, no failures. Real local Supabase workflows passed **3/3 in 2.4 minutes** at 390, 768 and 1440 px after the table-wrapper fix, with axe/no-overflow checks across Auth, Chapra/venue creation, uploads, cover/reorder/delete, publish/unpublish and cleanup. **That run preceded the sitemap refactor**; post-refactor SEO evidence is unit/public tests, not a rerun of authenticated or managed acceptance. No Chapra production record was created.

Initial commit [2edd4fd](https://github.com/RichardHenryJames/shagun/commit/2edd4fd831808e6b8ffdf30c46d7265bc734c410) and [hosted run 34222982087](https://github.com/RichardHenryJames/shagun/actions/runs/34222982087) remain historical pushed/passing evidence, not certification of this tree. The planned **`audit/second-pass-2026-09-09`** review branch is **not yet pushed**; the new CI's Node **22** quality and Node **24** real local Auth/Storage jobs are defined, with no credential-bearing output/artifacts from the authenticated job, but hosted execution remains pending. Saved [Production](https://shagun-peach.vercel.app) configuration is not managed acceptance. Only `FINAL_RELEASE_RESULT` remains pending in the final-result table in [VERIFICATION.md](VERIFICATION.md). This docs-only pass ran no commands, tests, network checks, Git operations, deployments, migrations or imports. Source-backed draft preparation does not complete the live/exhaustive Hazaribag request or establish confirmed contacts.