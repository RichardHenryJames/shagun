# Shagun workspace instructions

## Product boundaries
- City-first public venue discovery; private editorial administration, not a booking marketplace.
- Hazaribag, Jharkhand is the only seeded city, and starts as a normal draft record. The seed contains no venues, photos or accounts. Future cities are admin-created.
- Real Hazaribag research is a separate source-cited batch, not the schema seed or a public hardcoded fallback. Import explicitly as unverified drafts through an active admin; never overwrite existing edits or fabricate a review.
- Never fabricate real venue facts, contacts, photos, ratings or metrics. No Google scraping, public registration, booking, payments or gated contacts.
- Synthetic records and diagrams are local QA only, clearly labelled and rejected on Vercel or with a configured database.

## Implementation conventions
- Work in the existing project root (`.`); preserve user configuration and unrelated changes. No more scaffolding or extensions are needed.
- Next.js App Router, strict TypeScript 5, React, Supabase PostgreSQL/Auth/private Storage. Node 24 is the locally tested runtime; keep dependency locks reproducible.
- Server Components by default. Public data uses anonymous clients and active-city/published-venue predicates, never a service-role inventory read.
- Reuse the approved shared BihariBhojan Supabase project only through isolated `shagun` / `shagun_private` namespaces, private `shagun-media` storage and `shagun-admin-auth` cookies. Never change sibling data, shared Auth settings, managed ownership or existing API schema entries as a side effect.
- Reauthorize every action and private endpoint against managed Auth and the active UUID allowlist; preserve RLS and SQL grants. No auth bypass for previews/tests.
- Keep the admin catalog's `isConfigured` guard before client construction: missing URL/public key yields private/no-store, noindex 503 with no catalog data. Configured requests still require fresh Auth and active allowlist checks.
- Validate server input; use atomic save RPCs for facts, facilities and research. Keep exact optimistic timestamp strings; never round-trip through JavaScript Date.
- Preserve slugs/city association after launch/publication. Private research must not enter public descriptions, city metadata or photo credits.
- Upload genuine decoded/re-encoded images only. Reserve durable cleanup before writing Storage; finalize atomically. Cleanup ready, unreferenced roots only, remove all variants before acknowledgement.
- Public city/venue existence checks must precede streaming. Do not reintroduce ancestor loading boundaries that turn missing pages into HTTP 200.
- Use restrained public editorial styling and productivity-focused admin styling. Keep labels, keyboard dialogs, focus and 320px layouts accessible.
- Never request secrets through chat or commit them. Admin provisioning is an explicit trusted-terminal operation, not a build step.
- Read architecture, design and operations documentation before changing related behavior. Keep communication brief and distinguish local checks from real-service certification.

## Verification
- `npm run check`: lint, route type generation, strict typecheck and isolated Vitest/PGlite tests.
- `npm run build`: normal production build, never migration/seed execution.
- `npm run build:qa` then `npm run test:e2e`: shared localhost:3100 origin and no database; do not hand-edit QA origins or reuse a mismatched production build.
- `npm run integration:start`, `npm run build:integration`, `npm run test:integration`: real isolated Auth/REST/Storage at 127.0.0.1:55321 and app localhost:3200, with fixtures disabled and random private test accounts. Never point these tests at hosted data. Stop only this stack with `npm run integration:stop`.
- The default preview is **Shagun: Local app preview** at localhost:3000 with fixtures disabled. Keep synthetic UI only in deliberately labelled QA mode; never remove its warning while retaining invented data.
- Test all six widths and empty/one/many inventory scenarios. Do not weaken test assertions to hide real failures.
- Real Supabase Auth/REST/Storage, concurrent sessions, backups and final-domain performance remain deployment checks, not proven by local fixtures.
- Keep the latest hosted run state only in [../docs/VERIFICATION.md](../docs/VERIFICATION.md); link there rather than duplicating volatile progress. A hosted pass applies only to its exact code revision and test scope.

## Setup progress
- [x] Requirements and product/technical decisions documented.
- [x] Application scaffold and compatible locked dependencies installed.
- [x] Public discovery, city-first admin, actions, database, storage, SEO and analytics foundation implemented.
- [x] No additional extensions needed.
- [x] After the catalog fix, full local lint/typecheck and 952 tests across 14 files passed (60 catalog tests, including two new missing-URL/key cases, and 19 sitemap tests); normal production build passed with fixtures false.
- [x] Twelve real source-cited Hazaribag candidates and an authenticated, insert-only research import are prepared; no direct contact checks or photo rights are claimed.
- [x] Post-fix actual local catalog valid/malformed queries returned 503, private/no-store and noindex with the exact non-secret response and no catalog data. Normal localhost:3000 was restored and confirmed empty without synthetic labels. The old QA preview and owned integration stack are stopped; unrelated `biharibhojan-db` was left running.
- [x] Windows public matrix before the final catalog-only guard: all six widths, many 166/1, empty 95/28, one 120/21 (passed/skipped); 381 passes / 50 intentional skips. Windows real-service 3/3 at 390/768/1440 px with axe/overflow checks remains pre-sitemap history, not the only Auth evidence: original hosted audit CI passed after the sitemap refactor. Hosted fixtures covered only many; earlier Lighthouse scores remain historical.
- [x] Shared database installation: catalog inspection repaired, public backup restored locally and matched, five migrations plus draft Hazaribag applied with all seven shared-data/metadata preservation checks passing. No production venue/admin/photo records were created.
- [x] Initial code pushed to `RichardHenryJames/shagun` main; hosted GitHub CI passed on commit `2edd4fd`. This is historical, not a result for the latest review revision.
- [x] Review publication succeeded: [audit/second-pass-2026-09-09](https://github.com/RichardHenryJames/shagun/tree/audit/second-pass-2026-09-09) contains published fix `9db51bd5b0a11395d62401353fde3e0db03a59fe`. Both original `2072dc7` hosted jobs passed, including post-sitemap real Auth/Chapra/media/publishing/cleanup. Follow-up code CI status belongs only in [../docs/VERIFICATION.md](../docs/VERIFICATION.md); never transfer the original pass to later code.
- [x] The catalog follow-up has its own passing hosted CI and asserted Preview smoke; exact run/count/revision evidence is in [../docs/VERIFICATION.md](../docs/VERIFICATION.md). The new deployed catalog returns the intended private 503 without data when unconfigured, while all three configured real-service Auth workflows pass.
- [x] Actual original Preview smoke found a sanitized catalog 500 without a leak, leading to the later 503 guard; do not call the old smoke all green. Recorded deployment 6344149398 is Preview, `production_environment=false`, state success. GitHub main API remains unchanged at `b62d6eda5fde1fe5e588ef3a4b2a5cdeb4693908`; user-local main stays `b066ed5`. No production promotion; this is not a global Vercel production-branch-setting claim.
- [ ] Release gate: both API keys are saved in Vercel Production, but hosted Shagun API access returns 406 / PGRST106 until authorized private dashboard sign-in and append-only exposure preserve the existing list and exclude `shagun_private`. A human-approved real admin identity/private password, real inventory review/photo rights and full managed acceptance/concurrency/recovery/final-domain checks remain required. Do not ask for secrets in chat.
- [ ] Critical shared-owner gate: zero-row anonymous HEAD requests to existing Bihari `Order` and `ContactMessage` APIs returned 200; SQL grants/no-RLS confirm risk. Do not change sibling permissions without separately approved scope. Keep publication review-branch-only; `main`/Production promotion and force launch remain blocked until separately authorized remediation and all API/admin/editorial/full-managed gates are complete.
