# SVV Balaji — Project State

**Last updated:** 11 August 2026 (evening) · **Updated by:** Raunak
**Programme week:** 2 of 18 (Week 1 commenced 4 Aug 2026)

> This is the living status of the project. Anyone starting work — human or agent — reads this
> first. Keep it current; a stale state file is worse than none.

---

## 1. Client decisions — current position

Four decisions were put to the client in `SVV_Balaji_Client_Decision_Memo.md`. Three answers have
now been received.

| # | Decision | Client answer | Received | Effect |
|---|---|---|---|---|
| 1 | Sales channels | **Both B2B and B2C, with different pricing per channel** | 11 Aug 2026 | ✅ WS1.5 unblocked · ⚠️ scope increase |
| 2 | GST e-invoicing | **Approved — integrate via a GST Suvidha Provider** | 11 Aug 2026 | ✅ WS4.4 unblocked |
| 3 | Cloud storage provider | *No answer yet* | — | 🔴 WS4.1 still blocked |
| 4 | Multigrain recipe engine | *No answer yet* | — | 🟡 Built, awaiting confirmation to enable |
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
- The **Agriculture Expert mobile app (WS3.1) must work offline.** The executive is standing in a
  field with poor connectivity. Capture locally, sync on return. This is why Flutter was chosen —
  do not weaken this requirement.
- Same pattern applies to field visits and crop monitoring: executive-captured, offline-first.

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

### Admin panel — started 11 Aug (evening)

`svv-balaji-admin/` — Vite + React + TypeScript + Ant Design. **WS2.1 is in: authentication,
boot-time session restore, single-flight token refresh, sign-out, role-filtered navigation across
all 22 screens, and route-level role guards, all working against the live API.** The screens
themselves are placeholders that state what each will do and which routes it drives, so the shell
is demonstrable to the client today.

Navigation and routing are both generated from `src/layout/navigation.tsx` — one entry per screen,
with the roles that may see it. A screen cannot appear in the menu and be missing from the router.

This unblocked a backend gap first: `/auth/refresh`, `/auth/logout` and `/auth/me` did not exist,
so no client could hold a session past 15 minutes. Those are now built with rotating refresh
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
2. **WS2.2 Master data & farmer management screens — next.** Farmers first (list, register,
   verification workflow, traceability codes), then agreements, seed distribution and training.
   **Blocked on one thing:** a pagination convention. Every list endpoint returns an unbounded
   array; agreeing a `page`/`limit` + `{ data, total }` shape with Ujjawal now means ~20 list
   screens get built once instead of reworked later.
3. When you reach the training screens, remember: **executive-entered, no farmer login.** Design
   for a staff member typing up a visit, not a farmer self-reporting.
4. **Product screens now carry two prices.** `GET /price-lists/product/:id/comparison` returns both
   channels side by side. Prices must not be editable in place — changing one means calling
   `supersede`, which closes the old rule and opens a new one, so render it as "change price from
   [date]". Overwriting a rate in the UI would stop historical invoices reproducing.
5. **Customer forms are channel-dependent.** Choose channel first, then show the rest: B2B gets a
   mandatory GSTIN, credit limit, payment terms and an executive picker; B2C gets none of those.
6. **WS3.1 Agriculture Expert app** — offline-first is a hard requirement, not a nice-to-have.

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
| A-04 | Decision 3 — storage provider & process videos | SVV Balaji | 14 Aug | Open — blocking WS4.1 |
| A-05 | Decision 4 — multigrain in scope | SVV Balaji | 14 Aug | Open |
| A-06 | Provide customer & product master data | SVV Balaji | 28 Aug | Open |
| A-07 | Nominate UAT participants | SVV Balaji | 28 Aug | Open |
| A-08 | Confirm hosting upgrade path | Joint | 21 Aug | Open |
| A-09 | Staging environment for client access | Appzeto | 21 Aug | Open |
| **A-10** | **Agree cost & timeline for added B2C scope, in writing** | Ravi / SVV Balaji | **18 Aug** | **Open — Critical** |
| **A-11** | **Confirm GSP vendor, GSTIN and API credentials** | SVV Balaji (Finance) | **18 Aug** | **Open — Critical** |
| **A-12** | **Agree a pagination convention for list endpoints** | Ujjawal / Raunak | **13 Aug** | **Open** — blocks WS2.2 list screens being built once |
| A-13 | Decide: order `DRAFT` state, finished-goods movement ledger, allocation history on cancel | Ujjawal / Raunak | 15 Aug | Open — shapes WS2.5 screens |

---

## 5. Risks worth watching

| Risk | Why it matters | Mitigation |
|---|---|---|
| B2C scope added without a signed variation | We build 4+ weeks of unpaid work, or stop mid-stream | A-10 — get it in writing before the consumer workstream starts |
| 45% of effort (panel + 4 mobile apps) not started at week 2 | The back half of the programme carries all the risk | Backend running ahead creates buffer; start WS2.1 immediately |
| Consumer channel drives media volume up sharply | QR scans loading images/video from a single VPS will not hold | A-04 storage decision + A-08 hosting upgrade both become more urgent under B2C |
| GSP onboarding is an external process | Vendor approval can take weeks; it is not in our control | A-11 raised with a 18 Aug target to leave runway |
