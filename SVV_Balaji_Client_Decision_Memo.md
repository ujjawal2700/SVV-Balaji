# SVV Balaji — Decisions Needed to Proceed

**To:** SVV Balaji Food & Beverages Pvt. Ltd.
**From:** Appzeto — Development Team
**Date:** 7 August 2026
**Re:** Four decisions required before Phase 4 (Sales, Dispatch & Delivery)

---

## Where the build currently stands

Development is progressing on schedule. Four of six phases are complete and tested:

| Phase | Scope | Status |
|---|---|---|
| 0 | Platform foundation, user roles & permissions | ✅ Complete |
| 1 | Farmer registration, agreements, seed distribution, training, field monitoring | ✅ Complete |
| 2 | Procurement, harvest inspection, raw material batching, warehouse & inventory | ✅ Complete |
| 3 | Cleaning & grading, recipes, production, quality control, packaging | ✅ Complete |
| 4 | Sales, order fulfilment, dispatch & delivery | ⏸ Awaiting decisions below |
| 5 | Customer feedback & analytics | Not started |

**The traceability chain is live and working.** Scanning the code on a finished pack now resolves
back through the production run, the raw material batch, and on to the individual farmer — their
name, village, district and farm location — along with the harvest inspection and quality checks
that batch passed. This was the core promise of the project and it is functioning end to end.

To begin Phase 4 we need decisions on four items. Each is listed below with our recommendation.
**You can respond with a simple yes/no or a choice per item** — no detailed brief required.

---

## Summary

| # | Decision | What it affects | Urgency |
|---|---|---|---|
| 1 | Sales channels — B2B only, or consumer-facing too? | Shape of the entire order module | **Blocking Phase 4** |
| 2 | GST e-invoicing & e-way bill | Legal ability to dispatch goods | **Blocking dispatch** |
| 3 | Cloud storage for photos & videos | Field photos, QR process videos, delivery proof | Needed before go-live |
| 4 | Multigrain recipe engine | Blended product manufacturing | Ready when confirmed |

---

## Decision 1 — Sales channels: B2B only, or consumer-facing as well?

**What we need decided:** whether the system handles orders from distributors and retailers only,
or also sells directly to consumers.

**Why it matters now.** The current scope of work covers a **business-to-business** system: your
sales executives take orders from distributors and retailers through a mobile app, and the admin
team fulfils them. The Functional Requirement Document additionally describes consumers browsing
products, placing their own orders, paying online, and orders arriving from Amazon, Flipkart and
WhatsApp.

These are different systems. The order module is built around the answer, and adding a consumer
channel later means rebuilding rather than extending. It is much cheaper to decide now.

**Options:**

| | Option | What it includes |
|---|---|---|
| **A** | **B2B only** *(recommended for launch)* | Sales-executive app, distributor/retailer orders, admin fulfilment. Matches the current signed scope. Fastest to launch. |
| **B** | B2B + consumer app/website | Adds product browsing, cart, consumer accounts, online payments (Razorpay), order tracking. Requires additional scope, cost and timeline. |
| **C** | B2B + marketplace integration | Adds Amazon / Flipkart order sync. Each marketplace is a separate integration with its own approval process. |

**Our recommendation:** launch with **Option A**, and treat B and C as a defined Phase 2 of the
engagement. This gets you operational fastest, and the system is being built so that consumer
channels can be added without rework — provided we know now that they are coming.

**If deferred:** Phase 4 cannot begin. This is the one item that blocks all further progress.

---

## Decision 2 — GST e-invoicing and e-way bill

**What we need decided:** whether we integrate electronic invoicing and e-way bill generation,
and through which provider.

**Why it matters.** Under GST rules, businesses above the prescribed turnover threshold must
generate invoices through the government's e-invoicing system (obtaining an IRN) rather than
issuing invoices from their own software alone. Separately, an e-way bill is generally required
for the movement of goods above the prescribed consignment value.

The current scope includes GST invoice generation, but **not** e-invoicing or e-way bill
integration. If these apply to SVV Balaji, the system would be unable to legally support dispatch
without them.

**Action requested:** please confirm with your finance team or chartered accountant whether SVV
Balaji currently falls within the e-invoicing turnover threshold, and whether your consignments
typically exceed the e-way bill value threshold. We are flagging this rather than assuming, as the
thresholds have changed periodically and depend on your turnover.

**If it applies, the options are:**

| | Option | Notes |
|---|---|---|
| **A** | Integrate via a GST Suvidha Provider *(recommended)* | ClearTax, MasterGST or Cygnet. They handle IRN generation, QR, and keep pace with regulatory changes. Subscription cost, borne by SVV Balaji. |
| **B** | Direct integration with the government portal | Lower ongoing cost, significantly higher build and maintenance burden, and we absorb every future rule change. |
| **C** | Not required | Only if your finance team confirms the thresholds do not apply. |

**Our recommendation:** **Option A**. This is regulated territory that changes periodically;
a specialist provider is the appropriate place for that risk to sit.

**If deferred:** invoicing and dispatch can be built, but the system will not be able to produce
compliant invoices at go-live. We would rather raise this now than at launch.

---

## Decision 3 — Cloud storage for photos, documents and videos

**What we need decided:** approval to set up cloud object storage, and confirmation of who holds
the account.

**Why it matters.** The system captures a growing volume of files: crop and field inspection
photos, quality certificates, farmer documents, training materials, delivery proof photos, and —
if you want it — the process videos linked from the product QR code. Currently the system stores
references to these files but has nowhere to put them.

The single server in the current hosting arrangement is not suitable for this: it will fill up,
and it has no redundancy. As previously agreed, storage costs sit with SVV Balaji.

**Options:**

| | Option | Notes |
|---|---|---|
| **A** | Cloudflare R2 *(recommended)* | No charge for data transfer out, which matters once consumers begin scanning QR codes and loading videos. Lower running cost at scale. |
| **B** | Amazon S3 | Functionally equivalent, widely recognised, marginally higher cost due to data transfer charges. |

**Also to confirm:** do you want **process videos** linked from the product QR code? The FRD
mentions this. It is achievable, but video storage and delivery is the largest cost driver here,
so we would like it confirmed rather than assumed.

**Our recommendation:** **Option A**, with video included only if it is genuinely wanted for the
consumer experience.

**If deferred:** photo and document uploads cannot go live. Everything else continues to work.

---

## Decision 4 — Multigrain recipe engine

**What we need decided:** confirmation that ratio-based blended production is in scope.

**Why it matters.** Single-grain production (wheat flour, rice flour, millet flour — one grain in,
one product out) is built and working. Multigrain products require more: defining a formula with
percentages per grain, weighing each to that ratio, blending, and recording a homogeneity check.

The FRD describes this in detail. The current scope of work lists only general production entry.
We have already built the underlying structure so that enabling it is a configuration change
rather than new development — but we would like it confirmed before switching it on.

**Options:**

| | Option | Notes |
|---|---|---|
| **A** | Confirm in scope *(recommended if you sell blended products)* | We enable it. Structure is already in place. |
| **B** | Single-grain only for now | Multigrain remains available to enable later, at no additional structural cost. |

**Our recommendation:** if multigrain atta is part of your product range at launch, confirm
**Option A** now. The work to support it is largely done.

**If deferred:** single-grain production continues unaffected.

---

## How to respond

A short reply is enough — for example:

> 1. B2B only for launch
> 2. Yes, e-invoicing applies — proceed with ClearTax
> 3. Cloudflare R2, no process videos for now
> 4. Yes, enable multigrain

We will confirm any cost or timeline implications in writing before proceeding on anything that
falls outside the current scope of work.

**Items 1 and 2 are the priority** — Phase 4 cannot begin without item 1, and item 2 affects your
ability to dispatch legally from day one.

---

*Prepared by the Appzeto development team. Happy to walk through any of these on a call if that is
easier than responding in writing.*
