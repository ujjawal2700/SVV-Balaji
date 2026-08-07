# SVV Balaji Backend — Phases 0, 1 & 2

Farm-to-Customer Supply Chain Management System. NestJS + Prisma + PostgreSQL + Redis.

Covers **Phase 0** (foundation), **Phase 1** (Farm Sourcing & Planning) and **Phase 2**
(Procurement & Raw Material Control), per the module roadmap. Production, QA, Packaging and
Sales modules get added module-by-module in the phases that follow — see
`SVV_Balaji_Module_Roadmap_TechStack.md` in the project folder for the full sequence.

**Traceability today:** a finished batch number resolves all the way back to the farmer who
grew it — `GET /batches/:batchNumber/trace` returns farmer identity, farm location, the
harvest inspection that approved it, and its full stock movement history. That chain is what
the consumer QR code will ultimately read from once packaging lands in Phase 3.

## What's here

**Phase 0 - Foundation**
- **Auth**: JWT login (access + refresh tokens), password hashing with bcrypt
- **RBAC**: `@Roles()` decorator + guard, covering the 7 desk-based roles from the FRD (Super
  Admin, Branch Manager, Procurement Manager, Production Manager, QA Manager, Warehouse
  Manager, Sales Team) that will share the Admin Web Panel
- **Users module**: CRUD, Super-Admin gated
- **Branches module**: CRUD, matches FRD Section 6 (Branch Management)
- **Swagger/OpenAPI docs**: auto-generated at `/api/docs` — this is the "open REST APIs"
  answer flagged in the client checklist
- **Docker Compose**: Postgres + Redis + API, one command to stand up locally
- **CI**: GitHub Actions — install, generate, migrate, lint, build, test

**Phase 1 - Farm Sourcing & Planning (FRD Sections 7-12)**
- **Farmers module**: registration, search/filter (village/district/state/branch/status),
  verification workflow (approve/reject/request-docs) with a full audit trail
  (`FarmerVerificationLog`). Approval auto-generates the `SVV-YYYY-NNNNNN` traceability code
  via an atomic per-year counter (`FarmerCodeCounter`) — safe under concurrent approvals,
  and only assigned on approval per FRD 8.1, not at registration
- **Agreements module**: pre-season rate/quality/quantity agreements, status lifecycle
  (Pending → Active → Completed/Cancelled)
- **Seed Distribution module**: seed/input distribution log tied to farmer + batch number
- **Training module**: sessions, attendance (bulk mark, idempotent via upsert), materials
  upload references
- **Field Monitoring module**: field visits with crop health/growth stage/pest/disease
  observations, agronomic recommendations, yield prediction, and document attachments
- **Codes module (FRD 8.2 / 8.3)**: QR code + Code 128 barcode generation for farmers.
  Registered globally because Phase 2 (batch tracking) and Phase 3 (packaging labels,
  FRD 22.3/22.4) need the identical generation — built once rather than duplicated.
  Endpoints: `GET /farmers/:id/codes`, `/farmers/:id/qr.svg`, `/farmers/:id/barcode.svg`

  Two decisions worth knowing:
  - **QR encodes a public traceability URL, not raw data.** Packaging is printed once and
    can't be reissued, so pointing at a URL means linked info (farm details, process video)
    can change without reprinting a single bag. Set `PUBLIC_TRACEABILITY_BASE_URL` in `.env`.
  - **The Code 128 encoder is in-house** (`src/codes/code128.ts`), not a dependency. The codes
    printed here are plain uppercase alphanumeric + hyphen, which subset B covers fully. Keeps
    the dependency surface small and the logic unit-testable — it's verified against the
    ISO/IEC 15417 reference vector.

Farmer approval is Super-Admin-only per FRD 5.1 ("Farmer Approval" permission); registration
is open to Procurement Manager / Branch Manager / Super Admin per FRD 7.1. Seed distribution,
training, and field visits are gated to Agriculture Expert + Super Admin per FRD 5.4.

File uploads (training materials, field visit documents) currently accept a `fileUrl` string —
actual object storage (S3/R2) integration is a separate decision flagged in the meeting prep
notes, not yet wired in.

**Phase 2 - Procurement & Raw Material Control (FRD Sections 13-17)**
- **Procurement module**: procurement planning (crop/branch/quantity/schedule) and pre-harvest
  quality inspection with the full FRD 13.2 checklist (moisture, foreign matter, grain size,
  colour, smell, physical damage). Inspections are refused for farmers who aren't approved —
  without a traceability code, nothing collected from them could be traced downstream.
- **Collection module**: records collection of an approved harvest and mints its raw material
  batch in one transaction. Batch numbers use FRD 15.1 format `RM-YYYYMMDD-NNN` via a per-day
  atomic counter, so concurrent collections can't collide. Purchase rate falls back to the
  pre-season agreement rate when not supplied. Gated so only `APPROVED` inspections can be
  collected (FRD 13.5), and a harvest can only be collected once.
- **Warehouse module**: stock in/out, inter-warehouse transfers, physical-count adjustments,
  live occupancy vs capacity, low-stock alerts, and the full movement audit trail.
- **Batch trace**: `GET /batches/:batchNumber/trace` walks the chain back to farmer, farm
  location, inspection and stock history.

Two invariants worth preserving as Phase 3 builds on this:
- **Stock balance and ledger move together.** `WarehouseStock.quantity` is only ever mutated
  inside a transaction that also writes a `StockMovement` row. If those drift apart, inventory
  discrepancies become impossible to investigate after the fact.
- **Stock can't be over-drawn.** Reserved quantity counts as unavailable, so a failed
  withdrawal leaves the balance untouched rather than going negative.

## Getting started

```bash
cp .env.example .env
# edit .env - set real secrets before anything beyond local dev

docker compose up -d postgres redis
npm install
npx prisma migrate dev --name init
npm run prisma:seed   # creates a Super Admin user - check the console output for the password
npm run start:dev
```

API: `http://localhost:3000/api/v1`
Swagger docs: `http://localhost:3000/api/docs`

## Testing

```bash
npm run lint     # ESLint
npm test         # Jest unit tests
./smoke-test.sh  # 42-check end-to-end API walkthrough (needs the server running)
```

Unit tests cover the two riskiest pieces: the `farmerCode` generation logic (format,
sequencing, no-collision, no-reissue-on-re-approval, audit logging) and the RBAC guard
(including the Super-Admin-only farmer approval boundary from FRD 5.1). The Code 128
encoder is tested against the ISO/IEC 15417 reference vector.

The smoke script walks the entire Phase 0 + Phase 1 flow against a live API. It was itself
validated by injecting deliberate bugs into a mock and confirming each was caught — a FAIL
there means a real problem, not a flaky assertion.

Or run everything in Docker:

```bash
docker compose up --build
```

## Next steps (Phase 2 — Procurement & Raw Material Control)

Once Phase 1 is merged and running, Phase 2 adds:

- Pre-harvest quality check form
- Raw material collection entry (linked to Farmer ID and, where applicable, an Agreement)
- Raw material batch number generation at store (auto-numbered — same atomic-counter pattern as `farmerCode`, reuse it)
- Segregated batch-wise storage/inventory ledger

See the roadmap doc for the full phase-by-phase sequence and the reasoning behind the build order.
