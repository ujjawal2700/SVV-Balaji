# SVV Balaji — Development Log

Chronological record of work on this project. **Append an entry at the end of every working
session** — newest at the top. Two developers work here with separate agent sessions; this log is
how each side learns what the other did.

**Entry format:**

```
## YYYY-MM-DD — Name
**Did:** what changed
**Contract changes:** any new/changed API route, DTO or enum (or "none")
**Other developer needs to know:** the one thing that affects them
**Next:** what you're picking up next
```

---

## 2026-08-11 (afternoon) — Ujjawal

**Did:** Built the first half of Phase 4 — WS1.6 (channel pricing engine) and the order half of
WS1.5 — now that Decision 1 has unblocked it. Three new backend modules: `customers`, `pricing`,
`sales`. 5 new Prisma models, 5 new enums, one migration. 48 new unit tests; full suite is
**113 passing**, build and lint clean.

**⚠️ Run this before anything else:**

```bash
cd svv-balaji-backend
npx prisma migrate dev          # applies 20260811120000_phase4_sales
npm test                        # 113 tests
./smoke-test.sh                 # now covers steps 25-31, both channels end to end
```

The migration SQL was hand-written and has not been applied against a live database yet — it was
written in an environment without Postgres. If `migrate dev` reports drift, trust Prisma and let it
regenerate, then commit the corrected file.

### Contract changes — read this if you are building screens

**New enums** (`@prisma/client`): `SalesChannel` (B2B | B2C), `CustomerType` (DISTRIBUTOR |
RETAILER | INSTITUTIONAL | CONSUMER), `CustomerStatus`, `PaymentTerms` (PREPAID | CREDIT_7 |
CREDIT_15 | CREDIT_30 | CREDIT_45), `OrderStatus` (DRAFT → PLACED → CONFIRMED → ALLOCATED → PACKED
→ DISPATCHED → DELIVERED, plus CANCELLED).

**New models:** `Customer`, `PriceList`, `Order`, `OrderItem`, `OrderAllocation`.

**New routes** (all under `/api/v1`, documented at `/api/docs`):

| Method | Route | Notes |
|---|---|---|
| POST | `/customers` | B2B requires GSTIN; B2C rejects GSTIN, credit and an assigned executive |
| GET | `/customers` | filters: `channel`, `type`, `status`, `branchId`, `search` |
| GET | `/customers/:id/credit` | limit, exposure, headroom — the same check orders run |
| PATCH | `/customers/:id`, `/customers/:id/status` | channel cannot be changed after registration |
| POST | `/price-lists` | dated rule per product + channel (+ optional customer type, qty break) |
| GET | `/price-lists/resolve` | `?productId&channel&customerType&quantity&on` → the rate and why |
| GET | `/price-lists/product/:id/comparison` | both channels side by side — for the product master screen |
| POST | `/price-lists/:id/supersede` | the only supported way to change a price |
| POST | `/orders` | prices every line in the customer's channel and freezes it |
| GET | `/orders` | filters: `channel`, `status`, `customerId`, `warehouseId`, `from`, `to` |
| GET | `/orders/number/:orderNumber/traceability` | order → batches → production → farmers |
| PATCH | `/orders/:id/confirm` · POST `/orders/:id/allocate` | allocate = batch-wise picking |
| PATCH | `/orders/:id/pack` · `/dispatch` · `/deliver` · `/cancel` · `/payment-status` | forward-only lifecycle |

Order numbers are `SO-YYYYMMDD-NNN`. Customer codes are `CUST-B2B-000001` / `CUST-B2C-000001` —
the channel is in the code because operations staff read these aloud on the phone.

**Other developer needs to know (Raunak):**

- **Product screens now need two prices, not one.** `GET /price-lists/product/:id/comparison`
  returns the B2B and B2C rates side by side, which is the shape the product master screen wants.
- **Price fields must not be editable in place.** A price is changed by calling `supersede`, which
  closes the old rule and opens a new one. If the UI lets someone overwrite a rate, historical
  invoices stop reproducing. Render it as "change price from [date]", not as a text box.
- **Customer forms are channel-dependent.** Pick the channel first, then show the rest: B2B gets
  GSTIN (mandatory), credit limit, payment terms and an executive picker; B2C gets none of those.
  The API will reject the wrong combination with a readable message — surface it verbatim.
- **Order screens need a channel column and filter.** Channel is stamped on the order and never
  changes.
- **Allocation is a server-side action, not a form.** `POST /orders/:id/allocate` picks the batches
  itself, first-expiry-first-out, from QA-released stock only. The response lists which batches were
  taken, which is what the picking slip should print.
- **Statuses are forward-only.** Disable buttons rather than letting the API refuse — the allowed
  next states are in `ALLOWED_TRANSITIONS` in `sales.service.ts`.

**Not built yet in Phase 4:** invoicing (waiting on the GSP vendor and credentials, A-11), the
dispatch module proper (vehicle, driver, route, POD), and delivery tracking. Consumer-facing
endpoints (accounts, cart, checkout) are deliberately untouched pending A-10.

**Next:** GST invoice generation, structured so the GSP call slots in without a refactor; then the
dispatch and delivery modules.

---

## 2026-08-11 (morning) — Ujjawal

**Did:** Received and recorded three client decisions. Created this log, `PROJECT_STATE.md` and
`CLAUDE.md` so both developers and their agents work from shared written state instead of
separate chat histories. Updated the client workbook (Gantt, baseline, weekly progress, action
tracker) to reflect the new scope.

The decisions:

1. **Sales channels — both B2B and B2C, with different pricing per channel.** This is Option B
   from the decision memo, above the signed B2B-only SOW. WS1.5 is unblocked but the scope has
   grown: consumer app/website, consumer accounts, cart, online payments and B2C invoicing all
   come in. New action A-10 raised to get cost and timeline agreed in writing before the consumer
   workstream starts.
2. **GST — approved to use a GST Suvidha Provider** rather than managing compliance in-house.
   Our recommended option. WS4.4 unblocked, pending vendor choice and credentials (A-11).
3. **Farmer training — no farmer app.** The Agriculture Expert visits the farm in person, runs
   the training, and logs the entry into the portal afterwards. Everything is stored server-side
   against the farmer record. Confirms existing scope; no rework needed.

**Contract changes:** none yet. The Phase 4 sales models are being designed now — `Order` will
carry a `channel` enum (`B2B` / `B2C`), and pricing moves to a `PriceList` table keyed on
`(productId, channel, effectiveFrom)` rather than price columns on `Product`. Will log the exact
shapes here once the migration lands.

**Other developer needs to know (Raunak):**

- **Nothing blocks WS2.1.** Auth, RBAC and all Phase 1–3 endpoints are live and documented at
  `/api/docs`. Start the admin panel scaffolding now.
- **Training screens are staff-facing, not farmer-facing.** Design them for an executive typing up
  a visit they just made — no farmer login exists or is planned.
- **The Agriculture Expert app must work offline.** The executive is standing in a field with bad
  signal. Capture locally, sync on return.
- **Sales and customer screens (WS2.5) now need a channel dimension.** Order lists filter by
  channel; product screens show two prices, not one. Worth knowing before you design the master
  data screens, since the product form changes.

**Next:** WS1.5 sales module — channel-aware order and pricing model, then batch-wise picking and
packing against Phase 3 finished-goods batches.

---

## 2026-08-08 — Ujjawal

**Did:** Issued the weekly progress report and the accompanying workbook (Gantt chart, proposed
schedule baseline, weekly progress, action tracker). No formal baseline existed at project
commencement, which is why variance reporting could not be presented previously — a proposed
18-week, 29-activity baseline was submitted for client approval (A-01).

**Contract changes:** none.

**Other developer needs to know:** owner assignments are in the baseline — WS2.x and WS3.1–3.2 are
Raunak's, from Week 4.

**Next:** chase the four outstanding client decisions.

---

## 2026-08-07 — Ujjawal

**Did:** Completed backend Phase 3 (processing, recipes, quality control, packaging, finished
goods) ahead of plan. Full farm-to-fork traceability now resolves end to end: scanning a finished
pack returns the production run, the raw material batch, and the individual farmer with village,
district and farm location, plus every quality check the batch passed.

Issued `SVV_Balaji_Client_Decision_Memo.md` covering the four decisions blocking Phase 4.

**Contract changes:** Phase 3 modules added — products, recipes, production, quality, packaging.
See `/api/docs`.

**Other developer needs to know:** quality gates are enforcing, not advisory. A failed raw-material
inspection blocks that batch from entering production; a failed finished-goods inspection blocks
dispatch. The UI must surface these as hard stops with a clear reason, not as warnings.

**Next:** Phase 4, once the sales channel decision arrives.

---

## 2026-08-04 → 08-06 — Ujjawal

**Did:** Backend Phases 0–2. Foundation (auth, RBAC across 9 roles, Swagger, Docker, CI), farm
sourcing (farmer registry, `SVV-YYYY-NNNNNN` traceability ID generated atomically on approval,
agreements, seed distribution, training, field monitoring, QR/barcode generation), and procurement
(planning, harvest inspection, raw material collection, `RM-YYYYMMDD-NNN` batching, warehouse
stock and movement ledger).

**Contract changes:** initial API surface established.

**Other developer needs to know:** the QR code encodes a **public traceability URL, not raw data**.
Packaging is printed once and cannot be reissued, so pointing at a URL means linked information
(farm details, process video) can change later without a reprint. Do not change this.

**Next:** Phase 3 processing and packaging.
