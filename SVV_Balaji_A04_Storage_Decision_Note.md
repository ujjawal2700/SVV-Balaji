# A-04 — Cloud storage: decision needed

**For:** Ravi Tiwari → SVV Balaji
**From:** Appzeto delivery team
**Date:** 14 August 2026
**Action ref:** A-04 (raised 7 Aug, target 14 Aug — **now due**)
**Decision required by:** 21 August 2026

---

## What we are asking for

One answer: **where should SVV Balaji's photographs and documents be stored, and who owns
that account?**

That is the whole decision. We are not asking the client to research providers — a
recommendation is below, and a "yes to the recommendation" closes this.

---

## Why it matters now

Until this week the question was theoretical. It is not any more.

The system now captures photographs at four points in the chain, and each one is
evidence somebody may need to produce later:

| Where | What is photographed | Why it is kept |
|---|---|---|
| Field visits | Crop health, pest damage, growth stage | The record of what the agronomist actually saw |
| Harvest inspection | Grain condition before collection | The basis on which a farmer's crop was accepted or rejected |
| Training sessions | Handouts, attendance, session photos | Evidence of the extension work the branch has done |
| Farmer registration | Aadhaar, PAN, bank proof | KYC for payments |

The Agriculture Expert's job is largely photographic. A field module without working
photo capture is a notepad.

**We have not let this block delivery.** As of today the system uploads to a Cloudinary
account on an interim basis, so the field work module ships on schedule. But that is a
holding position, and it carries two things the client should be aware of:

1. **The account is not yet SVV Balaji's.** Ownership of the media, and of the bill,
   needs to sit with the client rather than with the vendor.
2. **Moving providers is cheap now and expensive later.** Today there are a handful of
   files. Once a season of field visits and inspections has accumulated, migration means
   moving assets *and* rewriting every stored URL in the database.

---

## What we recommend

**Cloudinary, on an SVV Balaji-owned account**, unless there is a reason to prefer
otherwise.

| | Why |
|---|---|
| **Fit** | Purpose-built for images. Automatic resizing and format conversion matters here — a 5 MB phone photograph served to a consumer scanning a QR code on a pack is a slow page and a data cost the consumer pays |
| **Cost** | The free tier covers roughly 25 GB of storage and delivery. On our estimate of field-visit volume, SVV Balaji would not reach a paid tier in the first year |
| **Effort** | Already integrated. Transferring to a client-owned account is a credentials change, not a development task |
| **Exit** | Assets are downloadable in bulk; nothing is proprietary |

**The alternative worth considering** is AWS S3 or Google Cloud Storage, which is
cheaper at large scale and consolidates with other infrastructure — but has no image
processing, so consumer-facing images would need work we would otherwise not do.

We have built this so the answer is reversible. Storage sits behind a single interface
in the codebase; switching provider is one new class and one line, and does not touch
any screen or any other endpoint. **That was deliberate, precisely because this decision
was outstanding.**

---

## What we need from SVV Balaji

1. **Confirm the provider** — Cloudinary as recommended, or nominate another.
2. **Open the account in SVV Balaji's name** and share credentials with the delivery team,
   so the media and the billing belong to the client from the start.
3. **Confirm the retention position on KYC documents.** Aadhaar and PAN images are
   personal data. We need to know how long they should be kept and who may view them —
   this shapes access control, not just storage.

Point 3 is the one most likely to be overlooked and the one with the most regulatory
weight. It is worth a short conversation rather than a yes/no.

---

## If the answer slips again

Nothing stops. The interim account keeps the field module working. What accumulates is
migration cost and the awkwardness of production photographs sitting in a vendor-owned
account — neither is a crisis this month, and both get worse every week.

---

## Summary

| | |
|---|---|
| **Decision** | Where photographs and documents are stored, and who owns the account |
| **Recommendation** | Cloudinary, on an account opened by SVV Balaji |
| **Blocked today** | Nothing — interim storage is live |
| **At risk if it slips** | Migration cost, and client media held in a vendor account |
| **Also needed** | Retention and access policy for farmer KYC documents |
| **Requested by** | 21 August 2026 |
