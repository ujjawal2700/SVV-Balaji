# SVV Balaji — FRD compliance audit

**Date:** 20 August 2026 · **By:** Raunak · **Against:** *SVV Balaji Functional Requirement Document*, all 35 sections
**Method:** every FRD subsection read and compared against the code on disk. Findings cite `file:line`.
Code comments, `DEV_LOG.md` and the weekly report were **not** treated as evidence — several turned out to be wrong.

---

## 0. Read this first — a claim we have been making is not true

**FRD 20.4 multigrain blend ratio is NOT enforced by the server.**

- `svv-balaji-backend/src/production/production.service.ts:17,75-80` — MULTI_GRAIN production is still **refused outright** unless `MULTIGRAIN_ENABLED=true`, and if that flag is set, **nothing validates the mix against `RecipeIngredient.percentage`**. There is no tolerance constant, no ratio check, no drift calculation anywhere in the backend.
- `svv-balaji-admin/src/pages/production/BlendPlanner.tsx:10,15` declares `BLEND_TOLERANCE_POINTS = 0.5` and says it "mirrors `BLEND_TOLERANCE_POINTS` in the backend's production.service.ts". **That backend constant does not exist.**
- Action **A-05** in the weekly tracker is marked *CLOSED 14-Aug* with the wording "the feature flag has been removed… blend ratio is now enforced at production time… a run whose mix drifts more than 0.5 percentage points is refused." The flag was not removed and nothing is refused.

**Why this one is first.** The consequence is a food-safety and mislabelling exposure, not a data-quality one: an approved 60/40 blend can be produced from 90/10 stock, packed, labelled and sold under the approved recipe. The operator sees a green worksheet telling them the server will stop it. It will not.

I propagated this claim into the project status doc and the Week 3 report earlier today without verifying it. Both need correcting, and A-05 needs reopening.

---

## 1. Where the project actually stands, by FRD section

| § | Module | Status |
|---|---|---|
| 5 | User Roles | 🟡 9 of 10 roles built; **Customer role does not exist**; several roles' defaults contradict 5.x |
| 6 | Branch Management | 🟡 Create/assign partial; **6.4 Performance and 6.5 Reports missing** |
| 7 | Farmer Management | 🟡 Registration, verification, status, search built; **7.6 Performance missing**; required fields optional |
| 8 | Farmer ID & Traceability | 🟡 ID format exact, barcode good; **QR resolves to a dead, auth-gated URL** |
| 9 | Agreement Management | 🟢 Built |
| 10 | Seed & Input Distribution | 🟢 Built (no stock linkage — FRD wording is ambiguous) |
| 11 | Training Management | 🟡 Built; attendance cannot be withdrawn; presentations/videos rejected by the uploader |
| 12 | Field Monitoring | 🟢 Built incl. yield prediction; **12.7 Field Report missing** |
| 13 | Procurement Management | 🟡 Built; an inspection can be APPROVED with zero measurements |
| 14 | Raw Material Collection | 🟡 Built; **receipt numbering is not collision-safe**; no printable receipt |
| 15 | Batch Management | 🟡 Built; **15.5 batch QR/barcode never generated**; 3 of 6 statuses never written |
| 16 | RM Warehouse | 🟡 Built; capacity never enforced; **16.7 Reports missing** |
| 17 | Inventory Management | 🟡 Built; **17.2 reserved stock is a dead field for raw material**; **17.4 alerts do not alert** |
| 18 | Cleaning & Grading | 🟡 Built; QA sign-off is self-certified and gates nothing; wastage never leaves stock |
| 19 | Recipe Management | 🟡 Built well; **19.5 Branch Recipe Distribution missing entirely** |
| 20 | Production Management | 🟠 **20.4 blend ratio unenforced**; 20.1 planning unreachable; `productionLoss` computed wrongly |
| 21 | Quality Management | 🟡 FG gate is solid; **in-process FAIL and REWORK_REQUIRED do nothing**; 21.6 Reports missing |
| 22 | Packaging Management | 🟡 Built; MRP and expiry optional on a retail label; **QR not consumer-reachable** |
| 23 | FG Warehouse | 🟡 Built; **23.4 transfer missing**; 23.6 Reports missing |
| 24 | Sales Management | 🟡 Customers + orders built; **24.3 Dashboard and 24.4 Reports missing**; no delivery address on an order |
| 25 | Inventory Validation | 🟠 **Confirmation does no stock check**; "Partially Available" unrepresentable |
| 26 | Billing & Invoice | 🔴 **Not built.** No invoice, no GST split, no HSN, no payment record |
| 27 | Dispatch Management | 🔴 **Not built.** No dispatch, partner, vehicle or driver |
| 28 | Delivery Tracking | 🔴 **Not built.** No OTP, no proof of delivery, no live status |
| 29 | Customer Module | 🔴 **Not built.** No consumer app and no role to log into one |
| 30 | Product Traceability | 🟡 Chain is complete and correct — but **the consumer cannot reach it** |
| 31 | Feedback Management | 🔴 Not built |
| 32 | Complaints | 🔴 Not built |
| 33 | Notifications | 🔴 **Not built.** No model, no queue, no SMS/email/push dependency |
| 34 | Reports & Analytics | 🔴 ~4%. The new `dashboard/summary` gives 4 counters against ~40 named reports |
| 35 | Upload & Documents | 🟡 Upload works; **no document repository**; Word and Excel rejected |

Roughly: **12 sections substantially done, 14 partial, 9 not started.** The farm-to-fork spine — farmer → plot → inspection → collection → batch → production → QA → pack → order — is real, complete and the strongest part of the build. Everything downstream of dispatch is not started.

---

## 2. Mistakes — things built that contradict the FRD

Ordered by consequence, not by section.

### Critical

**M1. The consumer QR code does not work.** `svv-balaji-backend/src/packaging/packaging.controller.ts:22,82-83` — the trace route sits behind `JwtAuthGuard` + `PermissionsGuard` + `@RequirePermission('trace.view')`, and there is no public-route escape hatch anywhere in the auth module. The QR printed on every pack encodes `https://trace.svvbalaji.com/batch/<FG-…>` (`codes.service.ts:22`). A customer scanning it gets a 401. FRD 30.1 and 22.3 are the entire premise of the traceability module, and this is printed onto packaging that cannot be recalled. Same defect on the farmer QR (`8.2`): it points at `/farmer/{code}`, which **no route in the codebase serves at all**.

**M2. Blend ratio unenforced.** See §0.

**M3. A QA rejection can be undone with a stock-in.** `warehouse.service.ts:242` sets `status: 'STORED'` unconditionally, and production's only quality gate is `status === 'REJECTED'`. Anyone holding `stock.move` can restore a rejected batch and feed it into production. FRD 21.5.

**M4. Order confirmation performs no stock check.** `sales.service.ts` `confirm()` is a bare status flip; the only availability check is inside `allocate()`, which runs *after* confirmation. FRD 25.4 requires validation before an order proceeds to billing. The business can commit to an order it cannot fill and find out at picking.

### Serious

**M5. `productionLoss` is plan variance, not process loss.** `production.service.ts:231` computes `planned − actual`. A run consuming 1,000 kg, planned at 900, yielding 950 records a loss of **−50 kg** when the true loss is 50 kg. FRD 20.5 lists it alongside quantity consumed and remaining stock — it means input minus output. The field can go negative.

**M6. Receipt numbers are issued by counting rows.** `collection.service.ts` `generateReceiptNumber()` does `count(…) + 1` while `SequenceService` sits beside it doing this correctly. Two concurrent collections on the same day produce the same number; the unique constraint turns one into a 500 that rolls back a real weighbridge entry. The code already documents this and works around it by refusing legitimate deletions. One-line fix, still unfixed. Raised previously.

**M7. Farmer registration accepts no identity and no bank account.** `farmers/dto/create-farmer.dto.ts` — Aadhaar (:16), PAN (:21), GPS (:43) and **all four bank fields** (:67–82) are `@IsOptional()`. **"Family Details", which FRD 7.1 lists, does not exist in the DTO, the Prisma model or either front end.** There is no uniqueness constraint on mobile or Aadhaar, so one farmer can be registered twice and issued two permanent traceability codes. A farmer can be approved, given a code, supply a harvest and be owed money with no account number on file.

**M8. Approving a farmer reactivates a blacklisted one.** `farmers.service.ts` `verify()` writes `status: 'ACTIVE'` unconditionally on APPROVED. Re-running verification on a BLACKLISTED or SUSPENDED farmer silently returns them to active with no separate reinstatement decision. FRD 7.5.

**M9. No branch scoping on any list endpoint.** `farmers.service.ts` `findAll()` takes `branchId` as an optional *query filter*, not a boundary — and the same is true for agreements, training, field visits, seed distribution and stock. Only the new dashboard scopes by the caller's branch. A Branch Manager at one branch can list and edit every other branch's farmers. FRD 5.2 states the boundary; nothing enforces it.

**M10. An inspection can be APPROVED with no measurements.** Every FRD 13.2 checklist field is optional (`create-harvest-inspection.dto.ts:50-78`). The procurement gate at 13.5 can be passed with a farmer id, a crop name and `result: APPROVED` — no moisture, no foreign matter, no evidence.

**M11. Word and Excel uploads are rejected.** `uploads/cloudinary.storage.ts:40-46` allows images and PDF only. FRD 35 names Excel and Word explicitly; FRD 11.3 requires presentations and videos, and the training UI offers both in its type dropdown, so the user picks a type the uploader will reject.

**M12. Cleaning QA sign-off is self-certified and read by nothing.** `qaVerified` is submitted by the cleaning operator on their own record and no code anywhere reads it. FRD 18.3's rule that QA approves cleaned material before manufacturing is unenforced.

**M13. In-process FAIL and REWORK_REQUIRED have no effect.** `quality.service.ts` acts only on RAW_MATERIAL+FAIL and FINISHED_GOODS+FAIL. A run that fails its in-process inspection can still be completed, packed and sold. `REWORK_REQUIRED` triggers nothing at any stage, so FRD 5.6 "Rework Approval" has no subject.

**M14. Attendance can be added but never withdrawn.** `training.service.ts:51-66` upserts only the IDs it receives. The UI is a "who attended" multi-select seeded from current attendees — deselecting a farmer and saving reports success and leaves them recorded as present.

**M15. Mandatory label fields are optional.** `mrp` and `expiryDate` are nullable and render as an em dash when absent. The system will print a retail food label with no MRP and no expiry date. FRD 22.2.

**M16. Cleaning wastage never leaves inventory.** `wastageQuantity` is stored with no stock decrement and no ledger row, so removed stones and dust remain as on-hand stock and production can be authorised to consume grain that no longer exists.

**M17. Reserved stock for raw material is a dead field.** `WarehouseStock.reservedQuantity` is read in three places and written by nothing. FRD 17.2's "materials allocated for upcoming production are marked reserved to avoid accidental usage" is not implemented — two runs planned against the same batch both see the full quantity.

### Worth fixing before the data grows

**M18. The new dashboard endpoint bypasses RBAC.** `dashboard/dashboard.controller.ts:10` applies `JwtAuthGuard` only — no `PermissionsGuard`, no `@RequirePermission` — although `dashboard.view` exists in the registry. Revoking it has no effect. It also fails open on branch scoping: `user.branchId ?? undefined` gives org-wide figures to any non-super-admin with no branch assigned.

**M19. Role defaults contradict FRD 5.x.** Branch Manager cannot manage branch staff (`users.create/edit/delete` default to `[]`) and has neither `recipes.view` nor `quality.view`, though FRD 5.2 grants Branch Staff Management, Recipe Distribution and Quality Monitoring. Conversely BM holds full sales *write* — `orders.create/confirm/allocate/cancel/payment`, `customers.*`, `priceLists.*` — where 5.2 says "Sales Monitoring". Agriculture Expert can create and edit harvest inspections, which FRD 5.3/5.6 give to Procurement and QA — the person advising the farmer can grade the farmer's crop. These are now database rows, so they are fixable in the Roles screen without a deploy, but the shipped defaults are wrong.

**M20. Payment status cannot express FAILED or REFUNDED.** `PaymentStatus` is `PENDING | PARTIAL | PAID`. FRD 26.4 requires four states; a failed UPI attempt has to be recorded as PENDING.

**M21. An order has no delivery address.** It is inferable only from the live `Customer.shippingAddress`, so editing a customer's address retroactively rewrites where every past order was shipped — the exact failure the schema deliberately guards against for `channel`.

**M22. Credit limit is checked outside the transaction.** `sales.service.ts:117` completes before `$transaction` opens at :120, so two concurrent orders can both pass and jointly exceed the limit.

**M23. Partial availability is unrepresentable.** `allocate()` throws when stock is short. FRD 25.4's "Partially Available" state cannot occur — an order for 100 packs with 90 in stock is refused outright rather than part-allocated.

---

## 3. What remains

### Not started at all

| § | Module | Size | New models needed |
|---|---|---|---|
| 26 | Billing & Invoice | **Large** | `Invoice`, `InvoiceLine` (CGST/SGST/IGST, HSN, place-of-supply), `Payment`, `Receipt`; `hsnCode` on Product; `state` on Warehouse; extend `PaymentStatus` |
| 27 | Dispatch | Medium | `Dispatch`, `DeliveryPartner`, `Vehicle`; add IN_TRANSIT and OUT_FOR_DELIVERY to `OrderStatus` |
| 28 | Delivery Tracking | Medium | `Delivery`, `DeliveryOtp`, `ProofOfDelivery`, `DeliveryStatusEvent` |
| 29 | Customer Module | **Large** | CUSTOMER role, customer credentials, `Cart`, `CartItem`, `ProductImage`; Product needs description, ingredients, net weight. Plus an entire new front end |
| 31 | Feedback | Small | `ProductReview`, `DeliveryRating` |
| 32 | Complaints | Medium | `Complaint`, `ComplaintAttachment`, `ComplaintStatusLog` |
| 33 | Notifications | **Large** | `Notification`, `NotificationTemplate`, `NotificationPreference`, `NotificationDelivery`, a queue, and SMS/email providers — none are dependencies today. ~25 trigger points across existing modules |
| 34 | Reports & Analytics | **Large** | None strictly required for 7 of 9 families; Delivery and Financial reports are blocked until 26–28 exist |

Note the dependency: **Financial and Delivery reports cannot be built before Billing and Dispatch.** Section 34 is not one workstream, it is the tail of several.

### Gaps inside modules that are otherwise built

Small, and each closes a named FRD subsection: 6.4 branch performance · 6.5 branch reports · 7.6 farmer performance rating · 12.7 field report · 15.5 raw-material batch QR/barcode · 16.7 + 23.6 warehouse reports · 19.5 branch recipe distribution · 20.1 production planning as a real PLANNED state · 21.6 QA reports · 23.4 finished-goods transfer · 24.3 sales dashboard · 30.3 collection branch, 30.5 quality certificate, 30.6 shelf life and 30.7 delivery block missing from the trace payload · 35 document repository with preview/download/replace/delete/versioning.

### The three §34 data gaps already raised as A-14

Production cost, machine utilisation and the credit-period start date. Delivery timestamps were closed on 19 Aug. Unchanged by this audit.

---

## 4. Suggested order of work

1. **M1 (consumer QR) before another pack is printed.** Everything else can be fixed in software; this one is already on packaging. It needs a public trace route, and it is a small change.
2. **M2 (blend ratio) and M3 (QA bypass) next** — both are food-safety gates the system claims to enforce and does not.
3. **Correct A-05 in the tracker and the status doc** so we stop reporting M2 as closed.
4. **M6, M5, M18** — one-line to one-hour fixes with real data consequences.
5. **M7/M10 need a client decision, not just code**: which registration and inspection fields are genuinely mandatory. Making them required retroactively will reject existing records.
6. Then WS2.6 reporting, then Billing → Dispatch → Delivery in that order, because each depends on the last.
