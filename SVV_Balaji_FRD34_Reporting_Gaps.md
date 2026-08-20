# FRD §34 — Reports & Analytics: what the data can and cannot answer

**For:** the client (via Appzeto) · **From:** Raunak · **Date:** 19 August 2026
**Status:** Three questions before WS2.6 is built. One item was not a question
and is already done — see §0.

FRD Section 34 names roughly forty reports across nine families. I checked each
one against the schema rather than against the plan. Thirty-five of them are
answerable from data the system already captures, and the reporting module will
produce them.

Five are not, because the inputs were never collected. This document covers
those five. None of them is hard to fix; all of them get harder the longer we
wait, because you cannot reconstruct a measurement that was never taken.

---

## 0. Delivery timing — closed, no decision needed

**Reports affected:** Delivery Performance, Delayed Shipments (2 of 4 Delivery
Reports).

An order's status told us it had been dispatched. It did not tell us *when* —
there was no timestamp on either the dispatch or the delivery. Both reports are
arithmetic on dates that did not exist.

This was the one item I did not bring as a question, because waiting had a cost
and acting did not. A timestamp is the only kind of data that cannot be
backfilled: every order dispatched before the fix would have been permanently
unmeasurable, and "we started measuring in November" is a much worse
conversation than a two-column migration.

**Done:** `orders.dispatchedAt` and `orders.deliveredAt`, stamped server-side at
their transitions, with a check constraint refusing a delivery earlier than its
own dispatch. Existing orders are null, which reads correctly as "not captured"
rather than being backfilled with a date that would invent a fleet of on-time
deliveries.

**Migration:** `20260819100000_order_delivery_timestamps`.

---

## 1. Production cost — is it in scope?

**Reports affected:** Production Cost, Profit Analysis (2 of 4 Financial
Reports).

**The gap.** `ProductionBatch` carries no cost fields of any kind. Procurement
cost is fine — the collection records a rate per unit, so we know what the raw
material cost. Revenue is fine — the order carries subtotal, tax and total. The
middle of the P&L is missing entirely: there is nothing recording what it cost
to turn the raw material into the finished product.

Without it, Production Cost has no input, and Profit Analysis can only produce
gross margin over raw material — which is a real number, but it is not profit
and should not be labelled as such.

**What we need to know:** is a conversion cost per batch something operations
will actually enter, and at what grain?

- **Nothing.** We drop both reports and label Financial Reports as revenue and
  procurement cost only. Honest, and no data-entry burden.
- **One number per batch.** A single conversion cost the supervisor enters at
  batch completion. Cheapest thing that makes Profit Analysis real.
- **Broken down.** Labour, power, packaging, overhead as separate fields. Gives
  a genuine cost sheet, and is materially more to type on every run.

**My recommendation: one number per batch.** It makes both reports produce a
defensible figure, and a single field at completion is a habit a supervisor will
keep. A four-field cost sheet is the kind of thing that gets filled with zeroes
by week three, which is worse than not asking — it looks like data.

---

## 2. Machine utilization — what does it mean here?

**Reports affected:** Machine Utilization (1 of 5 Production Reports).

**The gap.** There is no machine master. `ProductionBatch` has `machineName` and
`machineNumber` as free text, and nothing captures run time. So we can count how
many batches were typed against a given string, but "utilization" — time in use
against time available — has no numerator and no denominator.

Two further problems with the free text: "Mill 2", "mill-2" and "Mill No. 2"
are three different machines to a report, and there is no list of what machines
exist, so a machine that ran nothing is invisible rather than idle.

**What we need to know:** is machine utilization a number the client actually
manages the plant by, or was it listed for completeness?

- **Not really needed.** We drop the report. Nothing else in §34 depends on it.
- **Run counts are enough.** A machine master (so the names are consistent) plus
  batches per machine per period. Small change, and it answers "which machines
  are we leaning on" without claiming to be utilization.
- **Real utilization.** Machine master, plus run start and end time captured on
  every production batch. This is the only version that produces a percentage,
  and it means the operator logs two more times per run.

**My recommendation: run counts, with the machine master.** The master is worth
having regardless — it fixes the three-spellings problem — and it is a small
step from there to real utilization later if the client wants it. Asking
operators for start and stop times before anyone has asked for the percentage is
how you get times that are all entered at the end of the shift from memory.

---

## 3. Credit period — thirty days from what?

**Reports affected:** Revenue Report; also the credit check on every B2B order.

**The gap.** Customers carry payment terms of `CREDIT_7` through `CREDIT_45`.
Nothing in the system says what day the count starts from, so "overdue" is not
currently computable and the credit check treats every unpaid confirmed order as
equally outstanding regardless of age.

This is not really a reporting question — it is a commercial one that reporting
happened to surface. It affects what the sales team is told about a customer at
the moment they raise the next order.

**The candidates:**

- **Order date.** Simplest. Also the most generous reading against us: the clock
  starts before the customer has anything.
- **Dispatch date.** The point the customer received value. Now available —
  see §0.
- **Invoice date.** The conventional answer in trade, but the system does not
  currently raise an invoice as a distinct object, so this would mean building
  one first.

**My recommendation: dispatch date**, and I have written the schema comment that
way so it is not silently assumed. It is defensible to a customer, it is the
date they will themselves argue from, and the field now exists. If the client
says invoice date, that is a bigger conversation than a config change and should
be raised now rather than after invoicing is built.

---

## What happens if none of this is answered

WS2.6 gets built with the thirty-five reports that have inputs. The five above
render an explicit "not captured" panel naming the missing field, rather than an
empty chart that reads as "no activity this month". Nothing is blocked; the
reports simply stay unavailable until the underlying data starts being
collected, and the delivery timestamps at least start accumulating today.
