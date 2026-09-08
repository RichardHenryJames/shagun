# Indian place selection catalog — GeoNames

This is a **local, source-derived selection aid for authenticated administrators**, not launched Shagun city inventory, a census, verified business research, or a public fallback. It creates no database cities, venues, accounts, publication state, or schema changes. A missing place may be entered through the separately integrated, explicit manual workflow using researched facts; never invent a master record to make a search succeed.

## Attribution and licence

Geographical data © [GeoNames](https://www.geonames.org/), licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/). The [GeoNames dump documentation](https://download.geonames.org/export/dump/readme.txt) and [About page](https://www.geonames.org/about.html) identify the licence. Preserve this attribution, the licence link and the change description when redistributing this derived snapshot. No GeoNames endorsement is implied.

GeoNames supplies data **as is**, without a representation of accuracy, timeliness or completeness. Names and administrative assignments can change. Codes below are the actual GeoNames administrative codes, **not a hand-maintained state list or an ISO subdivision-code conversion**. State options include union territories represented in the input.

## Source snapshot

[indian-cities.json](indian-cities.json) records version, retrieval timestamp, source URLs and the SHA-256 of each original downloaded file. The ZIP hash covers the archive, not its expanded text. All four sources are official downloadable GeoNames exports:

| Input | Role |
| --- | --- |
| [cities500.zip](https://download.geonames.org/export/dump/cities500.zip) | Only actual `country code = IN`, `feature class = P` rows in the contained cities500 text are retained. |
| [admin1CodesASCII.txt](https://download.geonames.org/export/dump/admin1CodesASCII.txt) | Country-prefixed source code → state/territory name, using its ASCII name when supplied. |
| [admin2Codes.txt](https://download.geonames.org/export/dump/admin2Codes.txt) | Country + state + district code → district label, using the supplied ASCII name. |
| [countryInfo.txt](https://download.geonames.org/export/dump/countryInfo.txt) | Confirms the source's `IN` → `India` country mapping rather than inventing one. |

Observed on **2026-09-08**, retrieved at **2026-09-08T12:54:29.535Z**:

- **7,112** populated-place records; **36** represented states/territories.
- **752** distinct state + district label pairs; **44** places have no matching district and retain `null`.
- **227** records in Bihar and **237** in Jharkhand; no special selection of these states was applied.
- Compact UTF-8 snapshot: **1,784,994 bytes**, below the 5 MiB ceiling.

GeoNames defines cities500 as places above its population threshold **or qualifying administrative seats**. The importer applies no additional population cutoff, so source administrative seats with a zero population field remain present. This extract is not every Indian village, nor proof of complete current administrative coverage.

### Actual source-name examples, not parser exceptions

| Stable ID | ASCII canonical name | State / source code | District | Suggested slug |
| --- | --- | --- | --- | --- |
| `geonames:1274353` | Chapra | Bihar / `IN.34` | Saran | `chapra` |
| `geonames:1270164` | Hazaribagh | Jharkhand / `IN.38` | Hazaribag | `hazaribagh` |

Chapra's source aliases include **Chāpra**, **Chhapra** and **छपरा**. Hazaribagh's include **Hazāribāgh**, **Hazaribag** and **Hazārībāg**. Regression tests assert these observed records; implementation has no city-name branches. Other source places named Chapra/Chhapra remain distinct by ID, state and district. Existing Shagun display names and launched slugs are not changed by this catalog.

## Derivation and limits

- `id` is `geonames:` followed by the source's original integer ID as a string. State codes and all geographic labels are joined from the files above, never guessed from spelling or coordinates.
- `name` defaults to the supplied ASCII name, falling back to the original source name only if ASCII is absent. Both source names are retained in `aliases`, followed by actual source alternate names. Trim/NFC normalization and exact deduplication are applied; at most **64 aliases**, each at most **200 characters**. Oversized or control-character aliases are omitted, not truncated into invented names. No new transliterations or spelling substitutions are fabricated.
- Missing state joins fail the import. Missing district joins become `null`, not a fabricated district. Same-named places are never merged.
- Population is used only to order the import, with deterministic code-point tie breaks. Population, coordinates, elevation, claimed verification and inventory status are **not stored in the snapshot or sent to the UI**.
- Slugs are bounded ASCII suggestions derived from the canonical source name; duplicate suggestions are possible and are not database identity. An editor can deliberately choose a different display label and an available slug during integration. The authoritative selected ID still supplies state/country. Never silently rename a launched slug.
- ZIP download: **≤50 MiB**. Each downloaded/expanded source file: **≤100 MiB**. ZIP metadata bounds are checked before synchronous `fflate` extraction; only the exact expected cities member is read, never archive paths on disk. Downloads use fixed HTTPS URLs, disallow redirects and have a timeout. Generated JSON: **≤5 MiB**.

## Import and update

[../../scripts/city-catalog-import.ts](../../scripts/city-catalog-import.ts) is an explicit developer operation, never a build, seed, migration or runtime API call. It requires the exactly pinned `fflate` development dependency. From the project root, run `node --use-system-ca ./node_modules/tsx/dist/cli.mjs scripts/city-catalog-import.ts`. This initial form **refuses an existing snapshot before downloading anything**.

After reviewing a refresh, the same invocation with `--update` explicitly permits atomic replacement of the snapshot. Source changes must be reviewed before committing the generated diff; compare hashes, counts, name/state/district changes and the real-place regression assertions. Update this dated observation section after a reviewed regeneration. Do not hand-edit the generated JSON or add convenient aliases.

Offline reproduction is supported with `--source-dir` pointing to a directory containing the four original files under their original names, plus `--retrieved-at` containing their recorded ISO UTC retrieval timestamp. The latter is accepted only with local source files, so it does not backdate a fresh network download. Identical input bytes and retrieval timestamp produce identical compact JSON. Local reads obey the same byte limits. Files are hashed again, not trusted from an old manifest.

Publication stages a complete, validated, flushed temporary file in the destination directory. Initial creation uses an exclusive hard link, protecting against concurrent no-update runs; explicit updates use same-directory atomic rename. Failed validation/downloads preserve the existing snapshot. Reporter output contains only public provenance and counts, never credentials or environment contents.

## Server integration contract

[../../src/lib/city-catalog.ts](../../src/lib/city-catalog.ts) is the **server-only** snapshot boundary. Client code may import the `GeoCity`/`CatalogState` types with `import type`, not runtime catalog code or JSON. [../../src/lib/city-catalog-data.ts](../../src/lib/city-catalog-data.ts) contains pure contracts, source parsing and the search index, with no I/O or snapshot import.

Runtime exports:

- `searchCityCatalog(query, stateCode?, limit = 12): GeoCity[]`
- `searchCityCatalogWithCount(query, stateCode?, limit = 12): { items, total }`
- `getCatalogCity(id): GeoCity | null`
- `getCatalogStates(): { code, name }[]`
- `catalogSummary`: version, country, city/state/distinct-district counts, missing-district count and complete source metadata.

Search is Unicode/case/accent folded and uses word prefixes across names, genuine aliases, state and district labels. Multiple terms can disambiguate a place and state/district. Exact canonical names precede exact aliases, then prefixes, with source-derived import order as the tie break. The total is the full matching count before the result limit. Empty/punctuation-only queries return no cities, not the entire master. Results and lookups are defensive copies.

Authenticated `GET /api/admin/city-catalog?q=Cha&state=IN.34&limit=12` returns `{ items, total, states, source: { name, license, url } }`. Each request first executes fresh managed Auth and the current active UUID allowlist check. No inventory query, service-role read, durable write or cached authorization is used. Success and error responses have private/no-store caching and noindex/nofollow headers. Queries longer than 100 characters, control characters, unknown state codes, duplicate parameters and malformed limits produce 400 after authorization; valid limits are capped at **25**. An empty search returns `items: []`, `total: 0` and the small source-derived state list.

The parent integration owns forms/actions and any explicit manual fallback. On submission, look up the selected **ID** using `getCatalogCity()` server-side and derive its state/country there; never trust posted hidden labels. Selecting a master place alone must not activate or publish a city, change an existing city, or override its immutable URL. No integration or managed-service certification is claimed by these isolated backend additions.

Focused, offline tests are in [../../tests/unit/city-catalog.test.ts](../../tests/unit/city-catalog.test.ts). They validate the full snapshot, observed real places, generic synthetic parser fixtures, bounded search/download/ZIP handling, no-overwrite publication and the real fresh Auth/allowlist route logic with mocked providers. They make no external network or database calls.