# SVV Balaji — Decisions Received: Confirmation & Scope Impact

**To:** SVV Balaji Food & Beverages Pvt. Ltd.
**From:** Appzeto — Development Team
**Date:** 11 August 2026
**Re:** Confirmation of decisions received, and what they change

---

Thank you for the decisions received on 11 August. This note confirms our understanding, states
what each decision unblocks, and — for one of them — sets out a scope impact that needs to be
agreed before we commit engineering time.

---

## What we have received

| Decision | Your answer | Status |
|---|---|---|
| **1. Sales channels** | Both B2B and B2C, with separate pricing per channel | ✅ Received — **scope impact, see below** |
| **2. GST e-invoicing** | Approved to use a GST Suvidha Provider | ✅ Received — proceeding |
| **Farmer training** | No farmer channel; executives visit, train, and log entries in the portal | ✅ Confirmed — no change required |
| **3. Cloud storage provider** | — | 🔴 Still outstanding |
| **4. Multigrain production** | — | 🟡 Still outstanding |

**Work unblocked today:** Phase 4 (sales, order fulfilment, dispatch and delivery) and the GST
e-invoicing integration. Both were blocked; both start this week.

---

## Decision 1 — B2B and B2C, with separate pricing

**Our understanding.** The system will handle two distinct sales channels. Your sales executives
take orders from distributors and retailers, and consumers separately buy directly. A product
carries a different price depending on which channel it is sold through — a distributor rate and
a consumer rate — and the correct one is applied automatically based on who is ordering.

We have already begun building the order module so that channel is a first-class concept rather
than something bolted on later, and pricing is held as a dated price list per channel so that
historical invoices remain correct when prices change.

### What this adds beyond the signed scope of work

The signed scope of work covers a **business-to-business** system only. Selling directly to
consumers requires the following, none of which is in the current agreement:

| Addition | Why it is needed |
|---|---|
| Consumer application or website | Consumers need somewhere to browse products, build an order and check out |
| Consumer accounts | Registration, login, saved addresses, order history |
| Online payment gateway (Razorpay) | Consumers pay at the point of order; distributors are invoiced on credit terms |
| Consumer order tracking | A consumer expects to see where their order is; a distributor does not |
| B2C-format GST invoicing | Consumer invoices carry no counterparty GSTIN and are treated differently for e-invoicing |
| Channel-specific pricing engine | Dated price lists per channel, with the correct rate applied automatically |
| Higher media and hosting capacity | Consumers scanning QR codes and loading traceability pages drives file delivery volumes well above internal staff use |

### What we need from you

**A written agreement on the cost and timeline for this additional scope**, before we begin the
consumer-facing workstream. We would rather raise this now than present it as a surprise later.

Our proposal, for your consideration:

- **B2B remains the launch priority and stays on the current schedule.** Your operation can go
  live and start transacting without waiting on the consumer channel.
- **The consumer channel is built as a defined addition**, with its own cost and timeline, running
  after or alongside the B2B launch depending on how quickly you need it.
- **We build channel-aware from today at no additional cost**, so that adding the consumer channel
  later is genuinely additive work rather than a rebuild. This is the part that protects you
  either way, and it is the reason the answer to this question mattered so much.

This is tracked as action **A-10**, targeted for **18 August**. Phase 4 B2B work proceeds in the
meantime and is not held up by it.

---

## Decision 2 — GST Suvidha Provider approved

**Our understanding.** We integrate e-invoicing (IRN generation) and e-way bill generation through
a GST Suvidha Provider, rather than building a direct integration with the government portal or
managing the compliance detail in-house. This was our recommendation, and it places responsibility
for keeping pace with regulatory change with a specialist provider.

**To proceed we need three things from your finance team:**

| # | Required | Why |
|---|---|---|
| 1 | **Choice of provider** — ClearTax, MasterGST or Cygnet | Each has a different API; we build against the one you select. **ClearTax is our recommendation** for coverage and API maturity. |
| 2 | **Company GSTIN**, and confirmation of who holds the subscription | The provider account is registered to SVV Balaji; subscription cost sits with you, as previously agreed |
| 3 | **Sandbox and production API credentials** | We build and test against sandbox, then switch to production for go-live |

Provider onboarding is an external process with its own approval timeline, outside our control.
We have set a target of **18 August** for these three items to leave adequate runway before
dispatch functionality is needed. Tracked as action **A-11**.

We will build the invoicing layer against the provider's sandbox as soon as credentials arrive,
and queue submissions asynchronously so that a slow response from the government portal never
holds up your team's work in the application.

---

## Farmer training — confirmed as a manual, executive-led process

**Our understanding.** There is no farmer-facing application, and none is planned. The process is:

> Your agriculture executive travels to the farm, conducts the training session in person, and
> then records the session in the portal on return. The session details, which farmers attended,
> and any materials used are stored permanently against each farmer's record.

This matches what we have already built, so **no change or rework is required**. Training records,
attendance and materials are all executive-entered and are already part of the farmer's permanent
history — they appear in the farmer's record and form part of the traceability picture behind
every batch that farmer supplies.

One point worth noting: because your executives are recording this while working in the field,
the Agriculture Expert mobile application is being built to **work without a mobile signal**.
Entries are captured on the device and upload automatically once the executive is back in
coverage. Nothing is lost if the farm has no network, which in practice most will not.

---

## Still outstanding

Two decisions from the original memo remain open, both targeted **14 August**:

**Decision 3 — cloud storage provider.** Photo, document and video upload cannot go live without
this, and the decision has become **more urgent** now that a consumer channel is confirmed:
consumers scanning QR codes will be loading traceability pages and images at a volume the current
single server cannot serve. Our recommendation remains Cloudflare R2. We also still need to know
whether you want process videos linked from the product QR code.

**Decision 4 — multigrain production.** The underlying capability is already built; enabling it is
a configuration change. We simply need confirmation that blended products are part of your range
so we can switch it on and test it.

---

## Where this leaves the programme

Development remains **ahead of plan on the backend**. With Phase 4 and the GST integration now
unblocked, the two remaining decisions above are the only items holding back scheduled work.

The one matter genuinely requiring your attention is **A-10** — agreeing the cost and timeline for
the consumer channel. We are proceeding with the B2B build regardless, and building it in a way
that keeps the consumer option open, so nothing is being held up while that is settled.

We will present the revised schedule and updated action tracker at the next weekly review.

---

*Prepared by the Appzeto development team. Happy to walk through the consumer-channel scope on a
call if that is easier than corresponding in writing.*
