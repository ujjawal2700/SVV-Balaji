# SVV Balaji — Phase 0 Kickoff Checklist

Companion to `svv-balaji-backend/` (the starter repo) and `SVV_Balaji_Module_Roadmap_TechStack.md`. Use this to track what's done and what's next as the team picks up the code.

## What's already scaffolded (in `svv-balaji-backend/`)

- [x] NestJS project structure (`package.json`, `tsconfig.json`, `nest-cli.json`)
- [x] Prisma schema — `User`, `Branch`, `Farmer` (with `farmerCode` traceability field), `Product`, `Warehouse` masters
- [x] Auth module — JWT login (access + refresh tokens), bcrypt password hashing
- [x] RBAC — `@Roles()` decorator + guard, covering the 7 desk-based roles (Super Admin, Branch Manager, Procurement Manager, Production Manager, QA Manager, Warehouse Manager, Sales Team)
- [x] Users module — CRUD, Super-Admin gated
- [x] Branches module — CRUD, matches FRD Section 6
- [x] Swagger/OpenAPI docs wired up at `/api/docs`
- [x] Docker Compose — Postgres + Redis + API
- [x] GitHub Actions CI — install, generate, migrate, lint, build, test
- [x] Seed script — creates a default Super Admin + Head Office branch

**Not yet run:** `npm install` and the first `prisma migrate dev` haven't been executed against a real database — do that first when you pick this up locally (commands are in the repo's `README.md`).

## Your first week — task by task

### Day 1-2: Get it running
- [ ] `git init` the repo, push to your team's Git host (GitHub/GitLab/Bitbucket)
- [ ] Set branch protection on `main` (require PR review before merge)
- [ ] Copy `.env.example` to `.env`, generate real `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` (don't reuse the placeholders)
- [ ] `docker compose up -d postgres redis`
- [ ] `npm install`
- [ ] `npx prisma migrate dev --name init` — creates the first migration and applies it
- [ ] `npm run prisma:seed` — creates your Super Admin login
- [ ] `npm run start:dev` — confirm the API boots and Swagger loads at `/api/docs`
- [ ] Log in via `POST /api/v1/auth/login` with the seeded credentials, confirm you get an access token

### Day 2-3: Team environment
- [ ] Every dev has their own `.env` with local DB credentials (never commit `.env`)
- [ ] Set up a shared staging environment (server or cloud VM) — this is where CI will eventually auto-deploy
- [ ] Add repo secrets for CI (`DATABASE_URL`, JWT secrets) if you extend CI to deploy
- [ ] Agree on branch naming (`feature/...`, `fix/...`) and PR template

### Phase 1 — done, verify before moving on
Phase 1 (Farm Sourcing & Planning, FRD Sections 7-12) is now built: Farmers (registration +
verification + `farmerCode` auto-generation via an atomic per-year counter), Agreements, Seed
Distribution, Training, and Field Monitoring modules. Before treating it as finished:
- [ ] Run `npx prisma migrate dev --name phase1` to apply the new tables (`Agreement`,
  `SeedDistribution`, `TrainingSession`, `TrainingAttendance`, `TrainingMaterial`,
  `FieldVisit`, `FieldVisitDocument`, `FarmerVerificationLog`, `FarmerCodeCounter`)
- [ ] Register a farmer via `POST /api/v1/farmers`, then approve it via `PATCH
  /api/v1/farmers/:id/verify` (Super Admin token) and confirm a `farmerCode` like
  `SVV-2026-000001` comes back
- [ ] Spot-check the RBAC gates match the FRD: farmer approval is Super-Admin-only (5.1),
  registration is Procurement Manager/Branch Manager/Super Admin (7.1), seed
  distribution/training/field visits are Agriculture Expert/Super Admin (5.4)
- [ ] Decide on object storage (S3/R2) before training materials or field visit documents go
  beyond test data — those endpoints currently just store a `fileUrl` string, they don't
  handle the upload itself yet

### Phase 2 — done, verify before moving on
Phase 2 (Procurement & Raw Material Control, FRD Sections 13-17) is built: procurement
planning, harvest inspection with quality checklist, raw material collection with
`RM-YYYYMMDD-NNN` batch generation, and the warehouse/inventory ledger. Before treating it
as finished:
- [ ] Run `npx prisma migrate dev --name phase2` to apply the new tables (`ProcurementPlan`,
  `HarvestInspection`, `HarvestInspectionDocument`, `RawMaterialCollection`,
  `RawMaterialBatch`, `BatchNumberCounter`, `WarehouseStock`, `StockMovement`)
- [ ] `./smoke-test.sh` — now 66 checks covering Phases 0, 1 and 2
- [ ] Confirm the end-to-end trace works: `GET /batches/RM-YYYYMMDD-001/trace` should return
  the farmer, farm village, harvest inspection and stock history for that batch
- [ ] Sanity-check the ledger invariant on real data: for any batch, the sum of its
  StockMovement rows should equal its on-hand WarehouseStock quantity

### Next: Phase 3 (Processing, QA & Packaging)
- [ ] Recipe/BOM management (FRD 19) — **confirm the multigrain ratio engine is in scope with the client first**; it was a Critical gap in the SOW checklist
- [ ] Single-grain and multigrain production batch execution (FRD 20)
- [ ] In-process and finished goods QA (FRD 21)
- [ ] Packaging + product label + finished-goods QR (FRD 22) — reuses `CodesService`, already built
- [ ] Finished goods warehouse (FRD 23)

### Ongoing / don't skip
- [ ] Write a test for the login flow and the RBAC guard before adding more protected routes — this is the piece a bug in is hardest to catch later
- [ ] Set up error tracking (Sentry) before the first module beyond auth ships — cheap now, painful to retrofit
- [ ] Confirm automated Postgres backups are running on whatever environment holds real farmer/procurement data, even in early testing — flagged as a gap in the client checklist, don't let it become a bad habit from day one

## Reference

- Full phase-by-phase module sequence: `SVV_Balaji_Module_Roadmap_TechStack.md`
- Role → panel/app mapping: same doc, Section 2
- Client scope gaps to keep in mind while building: `SVV_Balaji_Meeting_PrepNotes.md`
