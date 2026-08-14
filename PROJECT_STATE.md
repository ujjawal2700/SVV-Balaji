# SVV Balaji — Project State

**Last updated:** 15 August 2026 · **Updated by:** Raunak
**Programme week:** 2 of 18 (Week 1 commenced 4 Aug 2026)

> This is the living status of the project. Anyone starting work — human or agent — reads this
> first. Keep it current; a stale state file is worse than none.

---

## 1. Client decisions — current position

Four decisions were put to the client in `SVV_Balaji_Client_Decision_Memo.md`. **Three of the four
are now answered** — only cloud storage (Decision 3) is still outstanding.

| # | Decision | Client answer | Received | Effect |
|---|---|---|---|---|
| 1 | Sales channels | **Both B2B and B2C, with different pricing per channel** | 11 Aug 2026 | ✅ WS1.5 unblocked · ⚠️ scope increase |
| 2 | GST e-invoicing | **Approved — integrate via a GST Suvidha Provider** | 11 Aug 2026 | ✅ WS4.4 unblocked |
| 3 | Cloud storage provider | *No answer yet* | — | 🟡 **Unblocked in practice** — interim Cloudinary account in use since 14 Aug; the decision is now about ownership and permanence, not capability |
| 4 | Multigrain recipe engine | **Confirmed in scope** | 14 Aug 2026 | ✅ Gate removed, blend ratio now enforced at production time |
| — | Farmer training channel | **No farmer app — executive visits the farm, trains, logs manually in the portal** | 11 Aug 2026 | ✅ Scope confirmed, no change needed |

### Decision 1 — B2B + B2C with per-channel pricing

The client chose **Option B**, not our recommended Option A. The signed SOW covers B2B only, so
this is added scope. What it means for the build:

- Every order carries a **channel** (`B2B` / `B2C`). Nothing in the order module may assume a
  single channel.
- **Pricing is per channel, per product.** A product has a distributor/retailer price *and* a
  consumer price. Model this as a price-list table keyed on `(productId, channel)` with
  effective-from dates — not as two columns on `Product`, because prices change and history
  matters for invoicing disputes.
- **B2C requires a consumer-facing app or website**: browsing, cart, consumer accounts, order
  tracking, QR scan for traceability. This is the fourth interface from the roadmap and was
  previously out of scope.
- **Payment gateway (Razorpay) moves from "on hold" to in scope** — B2C means collecting money
  online. WS4.5 is activated.
- **B2C invoicing differs from B2B**: consumer invoices carry no counterparty GSTIN and are
  aggregated differently for e-invoicing purposes. Factor this into the GSP integration.

> ⚠️ **Open commercial item.** The client has confirmed the *requirement* but has not agreed the
> cost or timeline impact of the added scope. Ravi to get this in writing before the consumer
> workstream starts. Tracked as **A-10**.

**Build approach agreed:** make the order and pricing model channel-aware from day one so B2C is
an additive UI and configuration layer, not a rebuild. B2B remains the launch priority.

### Decision 2 — GST via a Suvidha Provider

Approved. We integrate IRN generation and e-way bills through a GSP rather than building direct
NIC/IRP integration. Compliance risk sits with the provider, which is where it belongs.

**Still needed before WS4.4 can start:** the GSP vendor (recommendation: ClearTax), the company
GSTIN, sandbox and production API credentials, and confirmation that SVV Balaji holds the
subscription. Tracked as **A-11**.

### Farmer training channel — confirmed as manual

There is **no farmer-facing app or portal**, and none is planned. The workflow is:

```
Agriculture Expert travels to the farm
  → conducts the training session in person
    → returns and logs the session in the portal
      → session, attendance and materials stored against each farmer record
```

Consequences for the build, so nobody designs the wrong thing:

- Farmers are **data subjects, not users**. No farmer login, no farmer self-service, no
  farmer notifications requiring an app install.
- `TrainingSession`, `TrainingAttendance` and `TrainingMaterial` are **executive-entered**.
  Attendance is marked in bulk against a session (already implemented, idempotent via upsert).
- **WS3.1 changed on 15 Aug: no Flutter.** The Agriculture Expert interface is now a responsive web
  panel in the existing React codebase (`/field`), with a phone layout that reads as an app —
  bottom tabs, bottom sheets, card lists. One codebase, one set of validation rules, no app store,
  works on whatever handset the executive already owns.
- **This weakens the offline requirement, deliberately.** A website needs a connection. What it
  serves is the workflow the client actually described — the executive returns to the branch and
  writes the day up. Field capture with no signal would need a service worker plus an IndexedDB
  queue: real work, but *this* codebase rather than a second one, and addable later without
  rewriting the panel. **Worth confirming with the client rather than assuming either way.**
- Same pattern applies to field visits and crop monitoring: executive-captured, written up on
  return.

---

## 2. What is built

**Backend Phases 0–3 are complete, tested and demonstrable.** Repo: `svv-balaji-backend/`

| Phase | Scope | Modules |
|---|---|---|
| 0 | Foundation | auth (JWT access+refresh), users, branches, RBAC guard, Swagger, Docker, CI |
| 1 | Farm sourcing | farmers (+ traceability ID), agreements, seed-distribution, training, field-monitoring, codes (QR/barcode) |
| 2 | Procurement | procurement (plans, harvest inspection), collection (raw material, batching), warehouse (stock, movements) |
| 3 | Processing | products, recipes (versioned, approval-gated), production, quality (3-stage QC), packaging (labels, FG batches) |

| 4 | Sales *(in progress)* | customers (both channels), pricing (dated per-channel price lists), sales (orders, batch-wise allocation, fulfilment lifecycle) |

36 Prisma models. **128 unit tests passing**, build and lint clean. Quality gates are *enforcing*,
not advisory — a failed raw-material inspection blocks production; a failed FG inspection blocks
dispatch; and allocation refuses to pick anything that is not QA-released.

### Phase 4 so far (11 Aug)

Built: `customers`, `pricing`, `sales`. Channel is a first-class column on customers and orders.
Prices are dated rules keyed on product + channel + customer type, resolved once at placement and
frozen onto the order line together with the rule that produced them. Allocation picks
first-expiry-first-out from QA-released stock only, reserves it, and records the exact pack batch —
which is what carries traceability through the sales half of the system. Dispatch decrements real
stock; cancellation gives reservations back.

Not built: invoicing (blocked on A-11 credentials), the dispatch module proper (vehicle, route,
POD), delivery tracking, and every consumer-facing endpoint (held pending A-10).

**Anyone pulling this must run `npx prisma migrate dev` first** — migration
`20260811120000_phase4_sales` adds 5 tables and 5 enums. Full route list is in `DEV_LOG.md`.

**Traceability works end to end:**

```
FG-20260807-001   finished pack (QR on packaging → public trace URL)
  └─ PB-20260807-001   production run, recipe + version pinned
       └─ RM-20260807-001   raw material batch
            └─ SVV-2026-000001   farmer — name, village, district, GPS
```

### Admin panel — started 11 Aug (evening), **23 of 26 screens built as at 14 Aug**

`svv-balaji-admin/` — Vite + React + TypeScript + Ant Design.

| Workstream | Screens | State |
|---|---|---|
| WS2.1 Scaffolding & auth | login, dashboard shell | ✅ Complete |
| WS2.2 Zone 1 — master data & farm sourcing | branches, users, farmers, agreements, seed distribution, training, field visits | ✅ Screens complete, manually tested |
| WS2.3 Zone 2 — procurement & warehouse | procurement plans, harvest inspections, collections, raw material batches, warehouses, stock, movement ledger, trace | ✅ Complete |
| WS2.4 Zone 3 — processing, QA & packaging | products, recipes, cleaning & grading, production batches, quality inspections, finished goods | ✅ Complete, multigrain live |
| WS2.5 Zone 4 — sales | customers, price lists, orders | ⬜ Placeholders — held on A-13 |
| WS2.6 Dashboards & reports | trace screen built; dashboards/MIS outstanding | 🟡 15% |
| — Field executive (WS3.1, rescoped) | `/field` — Home, Visits, Seed, Training. Sider on desktop; bottom tabs, sheets and card lists on a phone. Real photo upload throughout | ✅ Complete (15 Aug) |

Auth is real: boot-time session restore, single-flight token refresh, sign-out, role-filtered
navigation and route-level role guards, all against the live API. Navigation and routing are both
generated from `src/layout/navigation.tsx` — one entry per screen, with the roles that may see it.
A screen cannot appear in the menu and be missing from the router. Routes are code-split with
`React.lazy`, so the login page does not pull the whole application.

Standing conventions in the panel, worth knowing before adding to it:

- **`src/api/envelope.ts`** is the single response contract. Screens are written against
  `ApiResult<T>` / `Paginated<T>` while the API still returns bare arrays; the adapter absorbs the
  difference, which is what makes A-12 a non-breaking change. Page size is 20.
- **All server state goes through TanStack Query**, keyed from `src/api/queryKeys.ts`. No component
  fetches directly.
- **`src/auth/permissions.ts`** maps every guarded action to the roles allowed it, each entry citing
  the backend `@Roles()` it mirrors. It is a usability layer, not a security boundary — the server
  still decides.
- **`src/validation/rules.ts`** mirrors the backend class-validator DTOs, so the form rejects what
  the server would reject, with the same message.
- **`src/components/DataTable.tsx`** is the only table. Loading, error-with-retry, empty and
  pagination behave identically everywhere.
- **Decimals are typed as `string`** throughout. Prisma returns them as JSON strings; coercing at
  the boundary would hide precision loss on money and weights.
- **`src/uploads/` in the backend is the only place a file enters the system.** `StorageService` is
  an abstract class, `CloudinaryStorage` implements it, and `uploads.module.ts` binds them.
  Answering A-04 with S3 or GCS is a new class in that folder and one line in that module — no
  screen, endpoint or DTO changes. The panel's counterpart is `FileUploadField`, used on every
  surface that takes an attachment.
- **`src/pages/production/BlendPlanner.tsx`** holds the multigrain worksheet and
  `BLEND_TOLERANCE_POINTS`, which mirrors the constant of the same name in the backend's
  `production.service.ts`. Change one, change the other — it decides both what the operator is
  shown and whether the server will accept the run.
- **`src/components/RowActions.tsx`** is the row action menu on every master screen — edit,
  deactivate/reactivate, delete. It shows the server's refusal message verbatim, because that
  message names what is blocking the delete and is the whole reason the user clicked.
- **One modal per entity, used for both create and edit.** A separate edit form is how the two
  quietly drift apart until a field validated on create is accepted on edit.

### Edit and delete semantics (agreed 13 Aug, completed 14 Aug)

This is a traceability system, so "delete" is not one thing:

| Kind of record | What the panel offers |
|---|---|
| Masters — branch, user, farmer, product, warehouse | Full edit, plus deactivate / reactivate |
| Anything, while genuinely unused | Real `DELETE`, refused with a reason the moment something references it |
| Traceability and ledger rows — production batches, movements, quality inspections, consumption | No delete. Correction is a new record, the way `adjust` already works |

For the transactional records the guard is **per-record state, not per-type** — a record stays
correctable exactly as long as nothing downstream has relied on it:

| Record | Editable until | Deletable until |
|---|---|---|
| Agreement | a harvest inspection is raised against it | same |
| Seed distribution | always | always |
| Training session | always | attendance is marked |
| Field visit | always | always (takes its documents) |
| Procurement plan | it leaves DRAFT / SCHEDULED | an inspection is booked against it |
| Harvest inspection | a collection is recorded against it | same |
| Collection | the batch is cleaned, inspected, consumed or moved since receipt | same, plus: farmer unpaid, no later receipt that day |
| Raw material batch | — has no figures of its own; both act on its collection — ||

**`PATCH /collections/:id` is the correction path the system had no answer for.** A weighbridge
figure entered as 500 instead of 50 previously meant cancelling and re-collecting the harvest. It
is also the only edit that reaches outside its own row — the net weight lives in the collection,
the batch quantity, the warehouse stock line and the movement ledger — so it updates all four in
one transaction and writes an `ADJUSTMENT` movement carrying the before/after and the reason. The
invariant that stock is only ever mutated alongside a movement row is preserved, not worked around.

`src/common/dependants.ts` in the backend is the shared refusal. Every relation in the schema is
RESTRICT, so a blocked delete would otherwise surface as `P2003 Foreign key constraint failed`.
`assertDeletable()` counts first and throws a 409 naming the blockers. Reuse it for customers and
price lists in WS2.5.

The guards that matter, because they are what keeps the system reachable: nobody can demote,
deactivate or delete themselves; the last active Super Admin cannot be demoted or deactivated at
all; deactivating a user clears their refresh token so a live session stops working; an approved
farmer can never be deleted (the traceability code is never reissued); a branch with active users
cannot be deactivated; a warehouse holding stock cannot be closed.

This work unblocked a backend gap first: `/auth/refresh`, `/auth/logout` and `/auth/me` did not
exist, so no client could hold a session past 15 minutes. Those are now built with rotating refresh
tokens and replay detection (see `DEV_LOG.md` for the contract).

**Still not started — the four mobile apps.** Together with the remaining panel screens that is
still the bulk of the front-end effort. State this plainly to the client; "Phase 4 in progress"
must not be read as "nearly ready".

---

## 3. What happens next

### Ujjawal — backend & integrations

1. ~~**WS1.5 order intake + WS1.6 pricing engine**~~ — ✅ **done 11 Aug.** Customers, dated
   per-channel price lists, orders, batch-wise allocation and the fulfilment lifecycle are in.
2. **GST invoice generation — next.** Build the invoice layer now, structured so the GSP call slots
   in without a refactor when credentials arrive. B2C invoice format differs from B2B (no
   counterparty GSTIN) — handle both from the start.
3. **Dispatch & delivery modules** — vehicle, driver, route, OTP and photo proof of delivery.
   The order lifecycle already has DISPATCHED and DELIVERED states waiting for them.
4. **WS4.4 GST e-invoicing — unblocked pending credentials (A-11).** Build against the GSP
   sandbox. Queue IRN submission through BullMQ; never block an API response on a government
   endpoint.
5. **WS5.2 Staging environment** — client needs review access (A-09), targeted 21 Aug.
6. **WS4.1 Cloud storage — still blocked** on Decision 3. Do not start.

### Raunak — admin panel & mobile

1. ~~**WS2.1 Panel scaffolding, auth, role-based navigation**~~ — ✅ **done 11 Aug (evening).**
   Also added the missing `/auth/refresh`, `/auth/logout` and `/auth/me` to the backend, without
   which no client could hold a session.
2. ~~**WS2.2 Zone 1 — master data & farm sourcing**~~ — ✅ **done 12 Aug**, manually tested 13 Aug.
3. ~~**WS2.3 Zone 2 — procurement & warehouse**~~ — ✅ **done 13 Aug**, plus the `/trace` screen.
4. ~~**WS2.4 Zone 3 — processing, QA & packaging**~~ — ✅ **done 13 Aug (evening).** Products,
   recipes with versioning, cleaning & grading, production batches, quality inspections, finished
   goods. `/trace` now has something real to resolve.
5. ~~**Edit / deactivate / delete across the panel**~~ — ✅ **done 13–14 Aug.** Required building
   **36 backend endpoints** first: there was no generic update route except `PATCH /customers/:id`,
   and no `@Delete` route anywhere in the API. Masters got edit + deactivate + guarded delete;
   the transactional screens got edit-while-unconsumed. See DEV_LOG for the full contract and the
   per-record boundary table. Every form on every screen now opens pre-filled in edit mode.
6. **Manual test pass on WS2.4 — next.** Suggested order, because each step feeds the next:
   product → recipe → approve recipe → cleaning & grading → production batch → start → complete →
   quality inspection (in-process) → pack → finished-goods inspection → release → stock in → then
   open `/trace` with the `FG-` number and check the chain resolves back to the farmer.
6. **WS2.5 Zone 4 — sales (customers, price lists, orders)** is the last block, and the only one
   with an open design question: **A-13**. Get an answer before building the order screen.
   - **Product screens carry two prices.** `GET /price-lists/product/:id/comparison` returns both
     channels side by side. Prices must not be editable in place — changing one means calling
     `supersede`, which closes the old rule and opens a new one, so render it as "change price from
     [date]". Overwriting a rate in the UI would stop historical invoices reproducing.
   - **Customer forms are channel-dependent.** Choose channel first, then show the rest: B2B gets a
     mandatory GSTIN, credit limit, payment terms and an executive picker; B2C gets none of those.
7. **WS2.6 dashboards & MIS reports** — the trace screen is done; the dashboards are not.
8. **WS3.1 Agriculture Expert app** — offline-first is a hard requirement, not a nice-to-have.

### Both

- Log every session in `DEV_LOG.md`.
- Any change to a route, DTO or enum in the backend is a contract change — log it explicitly.

---

## 4. Open actions

| Ref | Action | Owner | Target | Status |
|---|---|---|---|---|
| A-01 | Approve the schedule baseline | SVV Balaji | 14 Aug | Open |
| A-02 | Decision 1 — sales channel scope | SVV Balaji | 12 Aug | ✅ **Closed 11 Aug** — B2B + B2C |
| A-03 | Decision 2 — GST e-invoicing route | SVV Balaji | 14 Aug | ✅ **Closed 11 Aug** — GSP approved |
| A-04 | Decision 3 — storage provider & process videos | SVV Balaji | **21 Aug** | Open — no longer blocking. Escalation note issued 14 Aug (`SVV_Balaji_A04_Storage_Decision_Note.md`). Also needs a retention/access policy for farmer KYC images |
| A-05 | Decision 4 — multigrain in scope | SVV Balaji | 14 Aug | ✅ **Closed 14 Aug** — confirmed. Flag removed; blend ratio enforced within 0.5pp on every run |
| A-06 | Provide customer & product master data | SVV Balaji | 28 Aug | Open |
| A-07 | Nominate UAT participants | SVV Balaji | 28 Aug | Open |
| A-08 | Confirm hosting upgrade path | Joint | 21 Aug | Open |
| A-09 | Staging environment for client access | Appzeto | 21 Aug | Open |
| **A-10** | **Agree cost & timeline for added B2C scope, in writing** | Ravi / SVV Balaji | **18 Aug** | **Open — Critical** |
| **A-11** | **Confirm GSP vendor, GSTIN and API credentials** | SVV Balaji (Finance) | **18 Aug** | **Open — Critical** |
| **A-12** | **Agree a pagination convention for list endpoints** | Ujjawal / Raunak | **13 Aug** | **Open — target date reached.** 22 panel screens now built against the unpaginated shape; the envelope adapter absorbs it, so nothing is blocked, but the movement ledger, production and quality lists grow monotonically |
| A-13 | Decide: order `DRAFT` state, finished-goods movement ledger, allocation history on cancel | Ujjawal / Raunak | 15 Aug | Open — shapes WS2.5 screens |

---

## 5. Risks worth watching

| Risk | Why it matters | Mitigation |
|---|---|---|
| B2C scope added without a signed variation | We build 4+ weeks of unpaid work, or stop mid-stream | A-10 — get it in writing before the consumer workstream starts |
| 45% of effort (panel + 4 mobile apps) not started at week 2 | The back half of the programme carries all the risk | Backend running ahead creates buffer; start WS2.1 immediately |
| Consumer channel drives media volume up sharply | QR scans loading images/video from a single VPS will not hold | A-04 storage decision + A-08 hosting upgrade both become more urgent under B2C |
| GSP onboarding is an external process | Vendor approval can take weeks; it is not in our control | A-11 raised with a 18 Aug target to leave runway |
