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

## Setup progress
- [x] Requirements and product/technical decisions documented.
- [x] Application scaffold and compatible locked dependencies installed.
- [x] Public discovery, city-first admin, actions, database, storage, SEO and analytics foundation implemented.
- [x] No additional extensions needed.
- [x] Latest lint/typecheck, 950 unit/database tests and final normal production build passed.
- [x] Twelve real source-cited Hazaribag candidates and an authenticated, insert-only research import are prepared; no direct contact checks or photo rights are claimed.
- [x] Normal localhost:3000 preview is running without demo records or test/synthetic labels; the old localhost:3100 demo preview was stopped.
- [x] Fresh public QA across six widths: many 166/1, empty 95/28, one 120/21 (passed/skipped); 381 passes. Real local Auth/Chapra/venue/media/publishing/cleanup workflows passed at mobile/tablet/desktop with axe and overflow checks. Earlier Lighthouse scores remain historical.
- [x] Shared database installation: catalog inspection repaired, public backup restored locally and matched, five migrations plus draft Hazaribag applied with all seven shared-data/metadata preservation checks passing. No production venue/admin/photo records were created.
- [x] Initial code pushed to `RichardHenryJames/shagun` main; hosted GitHub CI passed on commit `2edd4fd`.
- [ ] Release gate: both API keys are saved in Vercel Production, but hosted Shagun API access returns PGRST106 until its schema is exposed. Real admin identity/input and editorial publication remain required. Do not ask for secrets in chat.
- [ ] Critical shared-owner gate: zero-row anonymous HEAD requests to existing Bihari `Order` and `ContactMessage` APIs returned 200; SQL grants/no-RLS confirm risk. Do not change sibling permissions without separately approved scope. Push audit work to a review branch, not production, until resolved.
