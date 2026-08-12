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

## 2026-08-11 (late evening) — Raunak

**Did:** WS2.2 first pass — the shared front-end layer, then Branches, Users and Farmers as real
screens. 22 new files in `svv-balaji-admin/`. Farmers is the substantial one and is the pattern the
remaining ~18 list screens will copy, so it is worth a look before I repeat it.

**Architecture, agreed before building:**

- **Generic response envelope.** Screens are written against `ApiResult<T>` / `Paginated<T>`
  (`src/api/envelope.ts`), and adapters absorb the fact that the API currently returns bare arrays
  and objects. When the envelope lands server-side, one file changes and no screen does. Proposed
  shape is in that file's header — see A-12 below.
- **TanStack Query for all server state.** No `useEffect` fetching anywhere. Query keys live in one
  hierarchy (`src/api/queryKeys.ts`) so mutations can invalidate a resource without knowing which
  filter combinations are cached — ad-hoc key strings are how invalidation quietly breaks at twenty
  screens. Global `QueryCache`/`MutationCache` error handlers catch anything a screen forgets.
  Deliberate exception: `AuthProvider` stays outside the cache, since the session decides whether
  queries may run at all and routing it through would create a bootstrap cycle.
- **Validation mirrors your DTOs.** `src/validation/rules.ts` holds the patterns and cross-field
  rules in one place, each citing the backend rule it mirrors — GSTIN (copied verbatim from
  `customers.service.ts`), Aadhaar, PAN, IFSC, mobile, plus `netWeight <= grossWeight`,
  `effectiveTo > effectiveFrom`, `scheduledTo >= scheduledFrom`, `expiry > manufacturing`. One file
  to follow when a DTO changes.
- **Shared `DataTable`.** Loading, error-with-retry and empty states handled once. Pagination sits
  behind its own prop: client-side today, server-side the moment A-12 lands, with no screen edits.
- **Role guarding is centralised and action-level.** `src/auth/permissions.ts` maps every action to
  its roles, each entry citing the `@Roles()` decorator it mirrors, and `useCan()` / `<Can do="…">`
  consume it. Nothing relies on catching a 403. Every Phase 2–4 permission is registered already,
  so those screens have theirs waiting.

**Screens:** Branches (list + create). Users (list + create, role and branch pickers; the list is
gated on `USER_VIEW` and shows an explanation rather than firing a request that would 403). Farmers
— list with name/village/district/branch/status filters, registration form in four sections,
profile drawer pulling verification trail + agreements + seed distributions + field visits from the
single `GET /farmers/:id`, the verification workflow, and a printable QR/barcode view.

Three backend rules encoded in the farmer UI: `farmerCode` renders as "Not yet issued" rather than
an empty cell, the Verify action is hidden entirely for non-Super-Admins, and the ACTIVE option in
the status selector is disabled while `farmerCode` is null, since the API refuses it.

**Contract changes:** none. Front-end only.

**Other developer needs to know (Ujjawal):**

- **A-12 is now blocking real work, and it is two things, not one.** Alongside `page`/`limit`, I
  would like the response envelope settled in the same change — `{ data }` for a single object,
  `{ data, meta: { total, page, limit } }` for a list. My adapter already accepts both shapes, so
  you can land it endpoint by endpoint without breaking the panel or the smoke test at any point.
  Everything after Farmers is a list screen; the sooner this is fixed the fewer get built twice.
- **`GET /users` returns no `branch` relation**, unlike `GET /farmers`. The users table has to fetch
  all branches separately just to show a branch name. A `branch: { id, name }` include would remove
  that second request — small, and the same pattern farmers already uses.
- **No `PATCH /users/:id`.** There is no way to deactivate a user, change a role, or reset a
  password from the panel. Worth knowing before UAT: an ex-employee currently cannot be locked out
  except in the database.
- A-13 (order drafts, finished-goods movement ledger, allocation history on cancel) is still open
  and shapes the WS2.5 screens. No rush this week, but I would rather not design around a guess.

**Run:**

```bash
cd svv-balaji-admin && npm install && npm run typecheck && npm run dev
```

**Next:** the remaining Zone 1 screens — agreements, seed distribution, training, field visits — all
reusing the layer above. Holding them until Farmers has been reviewed, since they will copy its
shape.

---

## 2026-08-11 (evening) — Raunak

**Did:** Two things — closed the session gap in the backend, then started WS2.1.

**1. Auth session endpoints (backend — Ujjawal's workstream, logged here per CLAUDE.md).**
`/auth/login` was the only route, but it minted a refresh token and stored its hash with nothing
able to spend it. With a 15-minute access token that meant every panel session died after a quarter
of an hour with no way back, so the panel could not be built around it. Added:

- `POST /auth/refresh` — verifies the signature *and* the stored hash, then **rotates**: issues a
  new pair and stores the new hash, so a refresh token is spendable exactly once. Replaying a
  rotated-away token ends the session outright rather than reissuing, since that is either theft or
  a broken client.
- `POST /auth/logout` — clears `refreshTokenHash`. The already-issued access token stays valid until
  it expires; that is the accepted trade-off of stateless JWTs and why the access lifetime is short.
- `GET /auth/me` — role, status and branch for the signed-in user. The panel calls it on boot to
  build navigation; login's payload does not carry the branch.

Token issuance is now a single private `issueSession()` that both login and refresh go through, so
the two cannot drift apart in claims or lifetime. Added `auth.service.spec.ts` — **15 tests**
covering rotation, replay detection, logout invalidation, suspended users, and that no route leaks
`passwordHash` or `refreshTokenHash`. Suite should now be **128**.

**2. Admin panel scaffolding (WS2.1)** — new `svv-balaji-admin/` alongside the backend. Vite +
React 18 + TypeScript + Ant Design, per the roadmap. Working end to end against the live API: login,
boot-time session restore, single-flight token refresh, sign-out, role-filtered navigation across
all 22 screens, and route-level role guards. Screens themselves are placeholders that state what
each will do and which routes it drives — so the shell is demonstrable to the client now, and WS2.2
starts from the contract rather than from Swagger.

**Contract changes:**

| Method | Route | Auth | Notes |
|---|---|---|---|
| POST | `/auth/refresh` | none | Body `{ refreshToken }`. Returns the same shape as login. **Rotates** — the token sent in is invalidated. |
| POST | `/auth/logout` | Bearer | Clears the stored refresh hash. Returns `{ success: true }`. |
| GET | `/auth/me` | Bearer | `{ id, email, fullName, phone, role, status, branchId, branch, createdAt }`. |

New DTO `RefreshTokenDto` in `src/auth/dto/refresh.dto.ts`. No schema change, no migration.

**Other developer needs to know (Ujjawal):**

- **Refresh rotation means clients must serialise refreshes.** Firing several concurrent refreshes
  with the same token logs the user out — the second one is a replay by definition. The panel does
  this with a shared in-flight promise (`refreshOnce()`); the mobile apps will need the same.
- **One session per user, and I did not change it.** `User.refreshTokenHash` is a single column, so
  signing in on the panel ends that user's session on their phone. Fixing it properly needs a
  sessions table and a migration, which is your call and your workstream — flagging rather than
  doing.
- **I verified the migration chain.** Your note said the Phase 4 SQL was hand-written without
  Postgres and might report drift. I applied all five migrations to a clean Postgres 16: they apply
  cleanly, produce 36 tables matching the 36 models, 20/20 enums, no column drift, 75 FKs, 53 unique
  indexes. That caveat can be closed.
- **Pagination is the thing I most need from you.** Every list endpoint is an unbounded `findMany`.
  I am about to build ~20 list screens; if we agree a page/limit + `{ data, total }` shape now, they
  get built once. If it lands later, all of them get reworked. This is the highest-leverage small
  change on the backend right now.
- **Three Phase 4 questions that shape screens I am about to draw**, in order of how much they cost
  me: (a) `OrderStatus.DRAFT` is unreachable — `create()` hardcodes `PLACED`. Should the order screen
  offer a draft, or do I hide the state? (b) `FinishedGoodsStock` has no movement ledger, unlike raw
  material — nothing records who stocked, allocated or dispatched a pack batch. (c) `cancel()` hard
  deletes `OrderAllocation` rows, so a cancelled PACKED order loses the record of what was reserved
  against it.
- Two lower-priority ones from reading Phase 2 and 4: `generateReceiptNumber()` in
  `collection.service.ts` still uses `count()` rather than the atomic counter beside it (your new
  `SequenceService.next(tx, 'RC', …)` would fix it in a line), and `stockOut`/`transfer`/`adjust` in
  `warehouse.service.ts` read available stock *outside* the transaction, so concurrent withdrawals
  can drive quantity negative despite the README's invariant.
- Docs gone stale: the README's Testing section still says "42-check, Phase 0 + Phase 1" (actual:
  113 tests, 32 smoke steps through Phase 4), and `SVV_Balaji_Testing_Guide.md` still leads with the
  long-resolved Prisma 7/5 mismatch.

**Run before anything else:**

```bash
cd svv-balaji-backend && npm test        # 128 expected
cd ../svv-balaji-admin && npm install && npm run dev
```

**Next:** WS2.2 — farmer management and master data screens, starting with farmers (list, register,
verification workflow, traceability codes). Holding off on list-heavy screens until the pagination
shape is agreed.

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
