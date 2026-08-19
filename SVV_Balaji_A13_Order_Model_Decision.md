# A-13 — Order model decisions

**For:** Ujjawal · **From:** Raunak · **Date:** 16 August 2026
**Status:** Recommendation. Raised 15 Aug, overdue. I am building WS2.5 against
these now rather than waiting; each is contained, and if you disagree the change
is one screen and one migration, not a rework.

Three questions. Each one changes the shape of the order screen, which is why
they held WS2.5.

---

## 1. Should an order have a DRAFT state?

**Recommendation: yes. Open it.**

`OrderStatus.DRAFT` already exists and `ALLOWED_TRANSITIONS` already permits
`DRAFT → PLACED | CANCELLED`. The only thing missing is that `create()`
hardcodes `status: OrderStatus.PLACED`, so nothing can ever be in it.

Why it matters: a B2B order is a phone call with a customer reading out a list.
Sales staff expect to save half of one and come back. Without DRAFT the only way
to hold an incomplete order is to not create it, which means it lives on paper
until it is complete — and paper is where orders get lost.

**Proposed:** `CreateOrderDto` takes an optional `status` of `DRAFT | PLACED`,
defaulting to `PLACED` so nothing that exists today changes behaviour.

**One thing to get right.** Price is resolved from the price list and frozen
onto the line *at placement*, not at draft creation. A draft saved on Monday and
placed on Friday must take Friday's price. Freezing at draft would let a
salesperson park an order to lock in an old rate, which is a commercial hole
rather than a technical one.

---

## 2. Should finished goods get a movement ledger?

**Recommendation: yes, and reuse `StockMovement` rather than adding a table.**

Right now the two halves of the system disagree with themselves. Raw material
holds a real invariant — stock is never mutated except alongside a
`StockMovement` row, which is what makes the collection correction path safe.
Finished goods have `FinishedGoodsStock.quantity`, which is decremented on
dispatch, incremented on stock-in, and leaves no trace of either.

That asymmetry costs us the moment anyone asks why the count is wrong. There is
no answer, because nothing was written down.

**Proposed:** `StockMovement.batchId` becomes nullable and a nullable
`fgBatchId` is added beside it, with a check that exactly one is set. Every
finished-goods stock-in, dispatch and adjustment writes a row.

**Why not a second table:** one ledger means one place to read for "everything
that happened to stock", one report, one screen. Two tables means every
inventory question is asked twice and joined. The nullable pair is slightly
uglier in the schema and much simpler everywhere else.

---

## 3. Should allocation history survive a cancel?

**Recommendation: yes. Stop deleting the rows.**

`cancel()` currently releases the reservations, then runs
`orderAllocation.deleteMany({ where: { orderId } })`. The reservations are
correctly returned — that part is right — but the record of *which batches were
promised to this customer* is destroyed.

Two reasons that hurts:

- **Disputes.** "You allocated me batch FG-20260812-003 and then cancelled" has
  no answer in the data. For a traceability product, losing the traceability of
  a cancellation is a strange place to economise.
- **Reading the ledger.** Once finished goods have movements (question 2), a
  reservation and its release will appear as stock activity with nothing to
  explain them.

**Proposed:** add `releasedAt DateTime?` and `releasedReason String?` to
`OrderAllocation`. Cancel sets them instead of deleting. Every read of live
allocations filters `releasedAt: null`, so nothing downstream changes.

---

## What I am building against

| # | Decision | Migration |
|---|---|---|
| 1 | DRAFT creatable; price frozen at placement, not at draft | none |
| 2 | One ledger — nullable `batchId` / `fgBatchId` on `StockMovement` | yes |
| 3 | Allocations released, never deleted | yes |

Both migrations are additive and nullable. Nothing existing breaks, and an
existing database comes up behaving as it does now.

**If you disagree**, say which number. (1) is a DTO default. (2) and (3) are one
migration each and are reversible before anyone depends on them — after WS2.5
ships and real orders exist, they are not.
