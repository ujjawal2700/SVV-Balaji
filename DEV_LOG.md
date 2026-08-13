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

## 2026-08-14 (evening) — Raunak

**Did:** **A-05 is closed — the client has confirmed multigrain is in scope.** Removed the gate and
built the thing it was standing in for.

**The flag is gone rather than set to `true`.** A stale `.env` carrying `MULTIGRAIN_ENABLED=false`
on somebody's machine would have silently refused production runs with no clue as to why, and
`.env.example` now says so where the variable used to be.

**But removing the gate on its own would have been the wrong change,** and this is the part worth
reading. Approving a recipe fixed a ratio; nothing made that ratio true at production time. A 60/40
wheat-bajra blend could have been produced from 90% wheat, packed, labelled and sold as the
approved blend, and the system would have agreed with the label. That is a mislabelled-food
problem, not a data-quality one.

So `createProductionBatch` now enforces the blend on every MULTI_GRAIN run:

- **every grain in the formula must be present** — a three-grain blend made from two grains is a
  different product, not a rounding error;
- **each grain's share of the total input must be within `BLEND_TOLERANCE_POINTS` (0.5 pp)** of its
  recipe percentage.

Two decisions in there that are worth disagreeing with if you want to:

1. **Ratios are measured against total input, not planned output.** The recipe describes the mix
   going in; process loss applies to the mix as a whole and is only known at completion. So a run
   that inputs 1,020 kg against a 1,000 kg plan passes, as long as the proportions hold. Checking
   against the plan would fail honest runs.
2. **0.5 percentage points.** Tight enough that 60/40 cannot quietly become 65/35, loose enough to
   absorb drawing whole-ish quantities from stock — 5 kg of slack per grain on a 1,000 kg mix. It
   is a named constant, and the panel mirrors it with a comment pointing back here.

Crop names are matched case- and whitespace-insensitively. "Wheat" on the recipe and `"wheat "`
typed by a collection clerk in the field are the same grain, and blocking a legitimate run over a
trailing space would be the first thing anyone hit.

**The refusal names the fix**, not just the failure:

> The mix does not match recipe MG-ATTA: Wheat is 90.00% of the mix but the recipe says 60.00%
> (needs 600.00 of the 1000.00 total). Blends may drift by at most 0.5 percentage points.

**Panel — the blend worksheet.** `BlendPlanner.tsx` does the same arithmetic live while the run is
being set up: a row per grain showing the recipe percentage, the target quantity for the planned
output, what is in the mix so far, and the running share with a tick or a warning. The submit
button stays disabled until every grain is green, so an off-ratio run cannot be started rather than
being refused after the fact. Single-grain runs are untouched — there is no ratio to hold.

All the "disabled pending A-05" copy is gone. Where it sat on the recipe form, it now says what the
percentages actually commit you to: *once this version is approved, every run made from it has to
hold this ratio.*

**Contract changes:** none — no route, DTO or enum changed. `POST /production-batches` accepts a
MULTI_GRAIN recipe where it used to refuse one, and refuses an off-ratio mix where it used to
accept one. Behavioural, and worth a line in your notes.

**Other developer needs to know (Ujjawal):**

- **`MULTIGRAIN_ENABLED` no longer exists.** Drop it from your local `.env`; nothing reads it.
- **17 tests** in `blend-ratio.service.spec.ts` — exact match, tolerance boundary either side,
  missing grain, multiple batches of one grain, case/whitespace crop matching, and that the
  existing gates (unapproved recipe, QA-rejected batch, insufficient stock, reserved stock) still
  fire before the ratio check. Suite should now be **251** across 20 spec files. Still cannot run
  them here — no npm registry in my sandbox.
- **`completeProduction` still allows a negative `productionLoss`** when actual output exceeds
  planned. It mattered less when blends could not run; now that yields are the point of the
  feature, it is worth a look. Left alone — your call, your module.

**Workbook updated:** A-05 closed with the date and effect. Open actions 11 → 10, closed 2 → 3.
Weighted completion unchanged at **35.65%** — this closes a decision and completes a gated path
rather than adding new scope.

**Next:** WS2.5 — customers, price lists, orders. Still wants an A-13 answer before the order
screen is designed; `PATCH /customers/:id` already exists, so that screen gets edit for free.

---

## 2026-08-14 — Raunak

**Did:** Finished the job started last night — edit and delete on the transactional screens too.
**22 more endpoints**, again in your workstream, again because none existed. Every form on every
screen now opens pre-filled in edit mode; the create modal is reused rather than duplicated.

**The guard is per-record state here, not per-type** — which is the thing worth reading. A
transactional record stays correctable exactly as long as nothing downstream has relied on it:

| Record | Editable until | Deletable until |
|---|---|---|
| Agreement | a harvest inspection is raised against it | same |
| Seed distribution | always | always |
| Training session | always | attendance is marked |
| Field visit | always | always (takes its documents) |
| Procurement plan | it leaves DRAFT / SCHEDULED | an inspection is booked against it |
| Harvest inspection | a collection is recorded against it | same |
| Collection | the batch is cleaned, inspected, consumed or moved since receipt | same, plus: farmer unpaid, no later receipt that day |
| Raw material batch | — acts on its collection — | — acts on its collection — |

**New routes (contract change):**

```
PATCH  /agreements/:id                            SUPER_ADMIN, PROCUREMENT_MANAGER
DELETE /agreements/:id                            SUPER_ADMIN

GET    /seed-distribution/:id                     any authenticated
PATCH  /seed-distribution/:id                     SUPER_ADMIN, AGRICULTURE_EXPERT
DELETE /seed-distribution/:id                     SUPER_ADMIN

PATCH  /training-sessions/:id                     SUPER_ADMIN, AGRICULTURE_EXPERT
DELETE /training-sessions/:id                     SUPER_ADMIN
DELETE /training-sessions/:id/attendance/:farmerId  SUPER_ADMIN, AGRICULTURE_EXPERT
DELETE /training-sessions/:id/materials/:materialId SUPER_ADMIN, AGRICULTURE_EXPERT

PATCH  /field-visits/:id                          SUPER_ADMIN, AGRICULTURE_EXPERT
DELETE /field-visits/:id                          SUPER_ADMIN
DELETE /field-visits/:id/documents/:documentId    SUPER_ADMIN, AGRICULTURE_EXPERT

GET    /procurement-plans/:id                     any authenticated
PATCH  /procurement-plans/:id                     SUPER_ADMIN, PROCUREMENT_MANAGER, BRANCH_MANAGER
DELETE /procurement-plans/:id                     SUPER_ADMIN

PATCH  /harvest-inspections/:id                   SUPER_ADMIN, PROCUREMENT_MANAGER, QA_MANAGER
DELETE /harvest-inspections/:id                   SUPER_ADMIN
DELETE /harvest-inspections/:id/documents/:documentId  SUPER_ADMIN, PROCUREMENT_MANAGER, QA_MANAGER

PATCH  /collections/:id                           SUPER_ADMIN, PROCUREMENT_MANAGER
DELETE /collections/:id                           SUPER_ADMIN
```

New DTOs: `UpdateAgreementDto`, `UpdateSeedDistributionDto`, `UpdateTrainingSessionDto`,
`UpdateFieldVisitDto`, `UpdateProcurementPlanDto`, `UpdateHarvestInspectionDto`,
`UpdateCollectionDto`. All `PartialType(Create…)` except the last.

**`GET /batches` now includes `collection`** (id, receipt number, weights, rate, payment status).
The batches screen offers Correct and Delete, both acting on the collection, and without the
include that would be a round trip per row.

---

### `PATCH /collections/:id` is the one to look at

**This is the correction path the system had no answer for.** A weighbridge slip read as 500
instead of 50 currently means cancelling and re-collecting the harvest, which is worse than the
typo. It is also the only edit that reaches outside its own row: the net weight lives in four
places — the collection, the batch quantity, the warehouse stock line and the movement ledger.

So the update does all four in one transaction and writes an **`ADJUSTMENT` movement** carrying
the before/after and the reason the user typed. Your invariant — *stock is only ever mutated
inside a transaction that also writes a movement row* — is preserved rather than worked around.

`UpdateCollectionDto` deliberately excludes three fields, and the reasoning is in the file:

- **`inspectionId`** — unique relation. Repointing it leaves the original inspection looking
  uncollected while its batch still traces through it.
- **`warehouseId`** — stock moves between warehouses through transfer, which writes the ledger.
  Changing it here relocates stock with no entry, which is the exact drift the ledger prevents.
- **`collectionDate`** — encoded into the receipt and batch numbers, already printed on the
  farmer's copy. Changing the date makes them wrong rather than regenerating them.

**`DELETE /collections/:id` takes the batch, its stock line and its receipt movement with it**, in
one transaction — a batch without its collection has no farmer path and would sit in the warehouse
untraceable.

**And it surfaced a real bug of yours, which I have guarded rather than fixed.**
`generateReceiptNumber()` counts the day's receipts instead of using `SequenceService` beside it,
so deleting a receipt makes the *next* collection reuse its number — two farmers, two payments,
one receipt number, indistinguishable afterwards. Until that is fixed, `remove()` refuses when a
later receipt exists for the same day, with that explanation in the message. **One line to fix:**
`SequenceService.next(tx, 'RC', collectionDate)`. I have left it alone because it is the same
defect I flagged on 11 Aug and it is yours to close.

---

**Contract changes:** yes — the 22 routes above, plus the `collection` include on `GET /batches`.
Swagger annotated.

**Other developer needs to know (Ujjawal):**

- **49 more tests** in `collection-correction.service.spec.ts`,
  `procurement-maintenance.service.spec.ts`, `agreements.service.spec.ts` and
  `training.service.spec.ts` — the four-way weight correction, the untouched-batch guard, the
  collected-inspection lock, the in-progress plan lock. Suite should now be **234**. Still cannot
  run them here (no registry access in my sandbox) — please confirm on your machine.
- **The receipt counter, again.** See above. It now has a user-visible consequence rather than
  just a theoretical one.
- **`assertBatchUntouched` in `collection.service.ts` is reusable** and probably wants to move
  somewhere shared when you add order cancellation — "has anything downstream used this" is the
  same question there.

**Next:** WS2.5 — customers, price lists, orders — which still wants an A-13 answer before the
order screen is designed. `PATCH /customers/:id` already exists, so that screen gets edit for free.

---

## 2026-08-13 (late) — Raunak

**Did:** Added edit and delete to the master screens — and had to build the endpoints first,
because **the backend had no generic update route except `PATCH /customers/:id`, and no `@Delete`
route anywhere at all.** 14 new routes, 5 modules, in your workstream. Details below; shout if you
want any of it changed.

**The rule I applied, since "delete" is not one thing in a traceability system:**

| Kind of record | What the panel offers |
|---|---|
| Masters — branch, user, farmer, product, warehouse | Full edit, plus deactivate / reactivate |
| Anything, when genuinely unused | Real `DELETE`, refused with a reason the moment something references it |
| Traceability and ledger rows — batches, movements, inspections, consumption | No delete. Correction is a new record, the way `adjust` already works |

Deactivation is the routine action and delete is for entries created by mistake. That is stated in
the confirm dialogs, so the distinction is not folklore.

**New routes (contract change):**

```
PATCH  /branches/:id                 SUPER_ADMIN
PATCH  /branches/:id/active          SUPER_ADMIN     { isActive: boolean }
DELETE /branches/:id                 SUPER_ADMIN
GET    /branches?activeOnly=true                     (new query param)

PATCH  /users/:id                    SUPER_ADMIN
PATCH  /users/:id/status             SUPER_ADMIN     { status: UserStatus }
PATCH  /users/:id/password           SUPER_ADMIN     { password: string }
DELETE /users/:id                    SUPER_ADMIN
GET    /users?branchId=&status=                      (new query params)

PATCH  /farmers/:id                  SUPER_ADMIN, BRANCH_MANAGER, PROCUREMENT_MANAGER
DELETE /farmers/:id                  SUPER_ADMIN

PATCH  /products/:id                 SUPER_ADMIN
PATCH  /products/:id/active          SUPER_ADMIN
DELETE /products/:id                 SUPER_ADMIN
GET    /products?includeInactive=true                (new query param)

GET    /warehouses/:id               any authenticated
PATCH  /warehouses/:id               SUPER_ADMIN, BRANCH_MANAGER
PATCH  /warehouses/:id/active        SUPER_ADMIN, BRANCH_MANAGER
DELETE /warehouses/:id               SUPER_ADMIN
GET    /warehouses?includeInactive=true              (new query param)
```

New DTOs: `UpdateBranchDto`, `UpdateUserDto`, `UpdateUserStatusDto`, `ResetUserPasswordDto`,
`UpdateFarmerDto`, `UpdateProductDto`, `UpdateWarehouseDto`, and a shared `SetActiveDto` in
`src/common/dto/`. All are `PartialType(Create…)` so nothing new to validate.

**Two `GET` defaults changed, both non-breaking:** `/products` and `/warehouses` already filtered to
active only; they now accept `includeInactive` so the master screens can see and reinstate a
deactivated row. Without that, deactivating something hides it from the one screen able to bring it
back. `/branches` still returns everything by default and now accepts `activeOnly`, which is what
the pickers pass.

**`src/common/dependants.ts` is the piece worth knowing about.** Every relation in the schema is
RESTRICT, so a blocked delete would otherwise surface as `P2003 Foreign key constraint failed` —
true, and useless. `assertDeletable()` counts the referencing rows first and throws a 409 naming
them: *"Branch "Nagpur" cannot be deleted — 12 farmers, 3 warehouses and 1 user still reference it.
Deactivate it instead…"*. The panel shows that message verbatim, which is the whole point of
writing it carefully. Reuse it for customers and price lists in WS2.5.

**Guards worth reviewing, because they are the ones protecting against a locked-out system:**

- **A user cannot demote, deactivate or delete themselves**, and **the last active Super Admin
  cannot be demoted or deactivated by anyone.** Without the second one, two clicks leave nobody able
  to administer the system and recovery means a script against the database — which we have already
  done once this week.
- **Deactivating a user clears `refreshTokenHash`**, so a session they currently hold stops working
  rather than surviving until the token expires. Same for a password reset. For someone who has just
  left, that is the difference that matters.
- **An approved farmer can never be deleted** — the `SVV-YYYY-NNNNNN` code comes from an atomic
  per-year counter and is never reissued, so a printed agreement carrying it would resolve to
  nothing. The refusal names the code and points at INACTIVE / BLACKLISTED instead.
- **A branch with active users cannot be deactivated** — they would sign in with no branch context.
- **A warehouse still holding stock cannot be closed** — closing removes it from the transfer
  picker, so the stock would be stranded with no screen able to move it.

**Also fixed while I was in there:** `GET /users` now includes the `branch` relation (the list was
showing a raw uuid) and accepts `branchId` / `status` filters. That was the gap I raised on 12 Aug —
an ex-employee could not be deactivated at all.

**Contract changes:** yes — the 14 routes and 4 query params above. Swagger is annotated;
`/api/docs` is accurate.

**Other developer needs to know (Ujjawal):**

- **These are edits inside your workstream.** Everything follows the existing style — service holds
  the rules, controller is thin, `@Roles()` on every write. Nothing existing changed behaviour
  except the two `GET` defaults noted above, both additive.
- **57 tests added** across `dependants.spec.ts`, `branches.service.spec.ts`,
  `users.service.spec.ts`, `farmers-delete.service.spec.ts` and
  `warehouse-master.service.spec.ts` — the delete guards, the lockout guards and the refusal
  wording. Suite should now be **185**. I could not run them here (no registry access in my
  sandbox); please confirm on your machine.
- **The three stock-mutation races are still open** and now sit next to a delete button. Nothing I
  added makes them worse, but `warehouse.setActive` reads the stock count outside a transaction for
  the same structural reason `stockOut` does.

**Next:** the same treatment for the transactional screens — agreements, seed distribution,
training, field visits, procurement plans, harvest inspections and collections. Those need
edit-while-unconsumed rather than edit-always, so the guard is per-record state rather than per-type,
and I want your view on where the line sits before I build it.

---

## 2026-08-13 (evening) — Raunak

**Did:** Built WS2.4 — Zone 3, processing, QA and packaging. Six screens, 24 files. Panel is now
**22 of 25 screens**. `/trace` can resolve a real pack for the first time.

**Products (`/products`).** Master list with type, crop, HSN, GST and the two-price channel split
(B2B / B2C) that A-08 introduced. Both prices are shown side by side rather than one "price" column,
because the sales screens will filter by channel and a single figure would be ambiguous.

**Recipes (`/recipes`).** Create, approve, and a version drawer. The server's two hard rules are
enforced in the form before submit: SINGLE_GRAIN takes exactly one ingredient, MULTI_GRAIN takes two
or more whose percentages total 100 (±0.05). The running total is displayed live as you type, so you
find out at the third ingredient rather than on the error toast. Reusing a `recipeCode` mints a new
version rather than editing in place — the drawer makes that lineage visible, which matters because
a production run references the version it was made against.

**Cleaning & grading (`/production/cleaning`).** Records the step and shows the yield loss against
input quantity.

**Production batches (`/production`).** Create, start, complete, and a detail drawer showing
consumption per raw-material batch. The form only offers APPROVED recipes; once a recipe is chosen
the raw-material picker is filtered to that recipe's crops **and** to stock actually available in the
nominated warehouse, so you cannot compose a run the server will reject. Multigrain runs are blocked
at the OK button with the reason on screen (pending A-05).

**Quality inspections (`/quality`).** One form, three stages. The stage selection drives the target
picker, the parameter set and the consequence text; switching stage clears the other target ids
because the server requires exactly one. Per your 07-Aug note the gates are surfaced as hard stops:
selecting FAIL shows what it will do before you save — raw material FAIL rejects the batch
permanently, finished-goods FAIL withdraws release.

**Finished goods (`/packaging`).** Pack a completed run, release after QA, print the label, book into
stock. The pack form warns live when net weight × pack count exceeds what the run actually produced,
and says the server also counts what was already packed from that run. The label modal renders your
server-generated QR and barcode SVGs as-is — the panel never builds the traceability URL itself, so
the printed code and the server's idea of it cannot drift.

**Contract changes:** none. Front-end only.

**Other developer needs to know (Ujjawal):**

- **A-12 is still outstanding** and there are now 22 screens on the unpaginated shape. The adapter
  absorbs it, but the production and quality lists join the movement ledger as lists that grow
  monotonically on real data.
- **A-05 (multigrain production) now has a visible cost.** The recipe screen accepts multigrain
  recipes because the API does, then disables the production button for them. That is an obviously
  incomplete path for anyone demoing the panel.
- **A-13 still shapes WS2.5.** The remaining three screens are customers, price lists and orders.

**Next:** WS2.4 manual test pass, then WS2.5 — the last three screens.

---

## 2026-08-13 — Raunak

**Did:** Finished WS2.3 and built the traceability screen. Panel is now **16 of 25 screens**.

**Zone 2 — Procurement (5 screens).** Procurement plans, harvest inspections, collections, raw
material batches with an upstream trace drawer, plus the farm-to-fork trace screen.

The gates are visible in the UI rather than discovered through errors: the inspection form's farmer
picker is restricted to approved farmers only, and says so when the list is empty; the collection
form's harvest picker offers only APPROVED inspections that are not already collected; choosing a
non-APPROVED result shows a warning that it blocks collection permanently. Where an agreement is
linked, the rate field reads "leave empty to use the agreed rate of ₹X".

**Zone 2 — Warehouse (3 screens).** Warehouses with occupancy, batch-wise stock with all four
mutations, and the movement ledger.

One deliberate deviation worth knowing about: **the occupancy view does not always show your
`utilisationPercent`.** `warehouse.status()` sums `quantity` across batches ignoring `unit`, so a
warehouse holding both KG and QUINTAL reports a meaningless figure — and a percentage derived from
it looks authoritative while being nonsense. The drawer computes its own per-unit breakdown from the
stock rows and only draws the utilisation bar when every batch shares one unit; otherwise it says
why it cannot. If the API starts normalising units, that branch just stops being reached.

**Traceability screen (`/trace`).** Enter an `FG-` number and it renders the chain as steps, the
product and production cards, quality checks, and the farmers behind the pack with village, district
and GPS. Worth having ready for the staging demo. It currently resolves nothing because no finished
goods exist yet — WS2.4 fixes that.

**Contract changes:** none. Front-end only.

**Other developer needs to know (Ujjawal):**

- **A-12 was due today and has not landed** — no `src/common/pagination.dto.ts` yet. Sixteen screens
  are now built against the unpaginated shape. The adapter means nothing breaks, but
  `/warehouses/movements` in particular is append-only and never pruned, so it is the first list that
  will become unusable on real data. The proposal has the interceptor, the DTO and a migration path
  that keeps the smoke test green throughout.
- **The stock over-draw race is now reachable from the UI.** `stockOut`, `transfer` and `adjust` read
  available stock outside the transaction. With the warehouse screens live, a warehouse manager and a
  production manager drawing the same batch at once can drive the quantity negative, and the screen
  will faithfully display it. Client-side validation does not help — both checks happen before the
  commit.
- A-13 (order DRAFT state, finished-goods movement ledger, allocation history on cancel) shapes WS2.5.
  I would like an answer before I design the order screen.

**Workbook updated:** WS2.3 to 100% Complete on the Gantt, baseline and weekly progress. Weighted
completion **29.9% → 31.65%**.

**Next:** Zone 2 manual test (warehouse → collection → stock in → transfer → adjust → ledger), then
WS2.4 — products, recipes, cleaning & grading, production batches, quality inspections, finished
goods. That block is also what makes `/trace` resolve for real.

---

## 2026-08-12 — Raunak

**Did:** Finished Zone 1 in the panel, and fixed a trap in the seed script that cost me an hour.

**1. Zone 1 screens complete (WS2.2).** Agreements, seed distribution, training and field visits, all
on the shared layer from the previous session. Panel is now **8 of 25 screens** built: dashboard,
branches, users, farmers, agreements, seed distribution, training, field visits.

Notable bits: training attendance is a multi-select seeded with whoever is already marked, submitted
whole rather than diffed — safe because your `markAttendance` upserts. The field-visit form separates
*observed* from *advised*, because when a batch later fails inspection the question is always which
of the two was wrong. Both file-attachment spots state on screen that they are links only and why
(A-04), rather than leaving a mystery where an upload button should be.

Page size is **20** everywhere, per your call — `DEFAULT_PAGE_SIZE`, the size options, and the A-12
proposal so the backend default matches.

**2. Route-level code splitting.** The panel was importing every page statically, so the login screen
pulled in the whole admin app. Screens are now `React.lazy` with the Suspense boundary inside the
layout, so the shell stays put while a chunk loads. Vendor chunks split too. Not urgent, but it would
have been embarrassing at the staging demo.

**3. `prisma/seed.ts` — your file, changed. Please read this bit.**

The old script bailed at the top:

```ts
if (existing) { console.log('Super Admin already exists'); return; }
```

So changing `SEED_SUPER_ADMIN_PASSWORD` in `.env` and re-running the seed printed a success message
and changed nothing — the password is a bcrypt hash in `users`, and `.env` only supplies it at
creation. That is a very easy hole to fall into and it gives no signal at all; it cost me an hour of
looking in the wrong place. The seed now:

- bcrypt-compares the `.env` password against the stored hash and, when they differ, says so
  explicitly with instructions rather than reporting success
- resets the password when `SEED_RESET_PASSWORD="true"` is set, clearing `refreshTokenHash` so a live
  session cannot outlive the password it was issued under
- reactivates the admin if it is ever left non-`ACTIVE` or demoted — `AuthService` refuses any
  non-ACTIVE user, so that state locks everyone out of the panel with no route back through the UI
- creates the default branch independently of the admin. It used to sit *after* that early return, so
  a database with an admin but no branch was a dead end — farmers, users and warehouses all need one

**4. New utility: `npm run admin:password`.** Lists every user with role and status; with arguments
(`-- <email> "<password>"`) it sets a password directly, no `.env` involved. Also reports when the
password already matched, which points at a config mismatch rather than a credential problem. Worth
knowing about before UAT, since there is still no `PATCH /users/:id`.

**Contract changes:** none. `prisma/seed.ts` behaviour changed (above) and one npm script added.

**Other developer needs to know (Ujjawal):**

- **A-12 is the one blocking me.** Proposal is in `SVV_Balaji_A12_Pagination_and_Envelope_Proposal.md`
  — concrete shapes, the interceptor, the DTO, and a migration path where the panel and the smoke test
  both stay green while you go endpoint by endpoint. Target was 13 Aug. Everything left in WS2.3 is a
  list screen.
- Two traps flagged in that doc worth not discovering the hard way: the envelope interceptor must skip
  raw strings or the `qr.svg` endpoints break, and `findMany`/`count` must share a transaction or the
  last page vanishes under load.
- Still open from before: `GET /users` has no `branch` include, and there is no `PATCH /users/:id`.
- A-13 (order drafts, finished-goods movement ledger, allocation history on cancel) shapes the WS2.5
  screens. Not urgent this week.

**Next:** click through Zone 1 against real data end to end (register → approve → agreement → seed →
training → field visit), then the traceability screen, then WS2.3 procurement and warehouse.

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
