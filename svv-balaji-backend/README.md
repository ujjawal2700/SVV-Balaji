# SVV Balaji Backend — Phases 0–4

Farm-to-Customer Supply Chain Management System. NestJS + Prisma + PostgreSQL + Redis.

Covers **Phase 0** (foundation), **Phase 1** (Farm Sourcing & Planning), **Phase 2**
(Procurement & Raw Material Control) and **Phase 3** (Processing, QA & Packaging), per the
module roadmap. Sales, Dispatch, Delivery and Feedback follow in Phase 4–5 — see
`SVV_Balaji_Module_Roadmap_TechStack.md` for the full sequence.

## The traceability chain is now complete

`GET /trace/:fgBatchNumber` takes the code printed on a finished pack and resolves it all the
way back to the farm:

```
FG-20260807-001  (finished pack, QR-encoded)
  -> PB-20260807-001  (production run, recipe + version pinned)
    -> RM-20260807-001  (raw material batch consumed)
      -> SVV-2026-000001  (farmer, village, district, GPS)
```

It returns product details, manufacturing and expiry dates, QA inspection history, the recipe
version used, and every farmer behind the pack. That is the "Farm to Kitchen, Verified"
promise from the client's process diagram, working end to end.

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

**Phase 3 - Processing, QA & Packaging (FRD Sections 18-23)**
- **Cleaning & Grading** (FRD 18): per-batch cleaning activities, grading parameters, wastage,
  QA sign-off.
- **Recipes** (FRD 19): versioned formulas, Super-Admin-only, with an approval gate. Approving
  a version supersedes the previous one, so exactly one is live per recipe code. Multigrain
  percentages must total 100 (±0.05 for thirds) or the blend is unreproducible.
- **Production** (FRD 20): consumes named raw material batches, decrements stock, logs
  movements, and records consumption — all in one transaction. Validates that each consumed
  batch is actually an ingredient of the recipe, isn't QA-rejected, and has sufficient stock.
  Derives process loss on completion.
- **Quality** (FRD 21): inspections at raw-material, in-process and finished-goods stages.
  These *gate* the flow rather than just annotating it — a raw-material FAIL marks the batch
  REJECTED so it can't enter production; a finished-goods FAIL withdraws QA release.
- **Packaging + Finished Goods** (FRD 22-23): FG batch generation, print-ready labels with QR
  and barcode, and finished-goods stock. Refuses to pack more than the run actually yielded,
  and refuses to stock anything not QA-released.

### Multigrain production is deliberately gated

The recipe/BOM ratio engine (FRD 19.3 / 20.4) was flagged as a **Critical gap** in the SOW
checklist — the client's FRD assumes weigh-per-ratio, blending and homogeneity checks; the
signed quote only covers generic "Production Batch Entry".

The data model supports multigrain fully. Only *execution* is gated behind
`MULTIGRAIN_ENABLED` in `.env`, which defaults to `false` and returns a clear error. Once the
client confirms it's in contracted scope, flip the flag — no migration, no restructure.

Two invariants worth preserving as Phase 4 builds on this:
- **Stock balance and ledger move together.** `WarehouseStock.quantity` is only ever mutated
  inside a transaction that also writes a `StockMovement` row. If those drift apart, inventory
  discrepancies become impossible to investigate after the fact.
- **Stock can't be over-drawn.** Reserved quantity counts as unavailable, so a failed
  withdrawal leaves the balance untouched rather than going negative.

**Phase 4 — Sales & Order Fulfilment (FRD Sections 24-28)**

The client confirmed on 11-Aug-2026 that they sell through **both** channels — B2B to
distributors and retailers, B2C direct to consumers — at **different prices**. That decision
shapes this whole phase.

- **Customers** (FRD 24): one registry, two channels. B2B customers must carry a GSTIN (it goes
  on the tax invoice) and may hold credit terms and a limit; B2C consumers carry none of that and
  pay up front. The rules live in `CustomersService` rather than in database constraints, so they
  are testable and produce a readable error instead of a constraint violation. Codes are
  `CUST-B2B-000001` / `CUST-B2C-000001` — the channel is in the code because operations staff read
  these aloud on the phone. **Channel is fixed at registration**: moving an account between
  channels would leave its pricing and invoicing history meaningless.
- **Pricing** (WS1.6): price is *not* a column on the product. It is a dated rule on
  `(product, channel, customerType, minQuantity)`. Precedence is customer-type over channel-wide,
  then the highest qualifying quantity break, then the most recent effective date. Rules are
  **superseded, never edited** — `POST /price-lists/:id/supersede` closes the old rule the instant
  before the new one starts, which is what keeps an invoice raised last quarter reproducible.
- **Sales** (FRD 24-27): orders are priced once, at placement, in the customer's own channel, and
  the resolved rate is frozen onto the line together with the rule that produced it. B2B orders on
  credit terms are checked against the limit; a customer on credit with *no* limit recorded is
  refused rather than treated as unlimited. Lifecycle is forward-only:
  `PLACED → CONFIRMED → ALLOCATED → PACKED → DISPATCHED → DELIVERED`, with `CANCELLED` available
  until dispatch.

### Allocation is where traceability survives into sales

`POST /orders/:id/allocate` is batch-wise picking (FRD 25). It draws only **QA-released,
unexpired** stock from the fulfilling warehouse, **first-expiry-first-out**, and writes an
`OrderAllocation` row naming the exact pack batch behind every unit on the line.

That row is the entire point. Without it a delivered order is anonymous and the farm-to-fork
promise stops at the warehouse door. With it, `GET /orders/number/:orderNumber/traceability`
resolves a whole shipped order back through its production runs and raw material batches to the
farmers who grew it — the order-level equivalent of scanning the QR code on a single pack.

Three properties are enforced and tested, and should not be softened:

- **Channel cannot leak.** Channel is part of the price resolution query, not a filter applied
  afterwards, so there is no code path by which a B2C order picks up a B2B rate.
- **Stock cannot be promised twice.** Allocation increments `reservedQuantity`; reserved units are
  unavailable to the next order. Cancelling releases them.
- **Dispatch moves real stock.** On dispatch, held and on-hand quantities come down together, so a
  physical count and the system agree the moment the vehicle goes.

**Not built yet in Phase 4:** invoicing (awaiting the GSP vendor and credentials — action A-11),
the dispatch module proper (vehicle, driver, route, proof of delivery), and delivery tracking.
Consumer-facing endpoints — accounts, cart, checkout, payments — are deliberately untouched
pending written agreement of the added B2C scope (action A-10).

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

## Next steps (finishing Phase 4, then Phase 5)

In order:

1. **GST invoice generation.** Build it now and structure it so the GSP call slots in without a
   refactor once credentials arrive. B2C invoices differ from B2B — no counterparty GSTIN — so
   handle both formats from the start rather than retrofitting.
2. **E-invoicing via the GST Suvidha Provider** (client approved the GSP route on 11-Aug; vendor
   and credentials tracked as action A-11). Queue IRN submission through BullMQ — never block an
   API response on a government endpoint.
3. **Dispatch module**: vehicle, driver, route, consignment. The order lifecycle already has a
   `DISPATCHED` state waiting for it.
4. **Delivery module**: live tracking, OTP and photo proof of delivery, delivery status.
5. **Phase 5**: customer feedback, complaint handling, farmer and product performance dashboards.

Held pending client decisions: cloud object storage (A-04, blocking photo and document upload)
and all consumer-facing B2C endpoints (A-10, pending written agreement of the added scope).

See `../SVV_Balaji_Module_Roadmap_TechStack.md` for the full phase-by-phase sequence and the
reasoning behind the build order, and `../PROJECT_STATE.md` for current status and open actions.
