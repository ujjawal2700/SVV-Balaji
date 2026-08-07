# SVV Balaji — Client Meeting Prep Notes
**Date:** 4 Aug 2026 | **Project:** Farm-to-Customer Supply Chain Management Application | **Vendor:** Appzeto / Budgetaddaa | Quote #0001789 (06-Jul-2026)

---

## 1. What This Meeting Is Actually About

The "Revised SOW Checklist" document header says it plainly: **the vendor (you) must confirm every open item before the advance is released.** Three items (6, 9, 30) already have written clarifications and one signature on the doc — the other **32 items are still open**. Tonight is very likely about walking through those, so go in ready to give a clear yes/no/phase-2 answer on each, not vague reassurance.

---

## 2. Project in One Paragraph

SVV Balaji wants a full **farm-to-fork traceable ERP**: register and pay farmers, track every raw-material batch from a specific farm through cleaning, milling/blending, packaging, warehouse, sale, and delivery — so a customer can scan a QR code on a bag of atta and see exactly which farmer grew the grain. The **FRD** (34 modules) describes this full vision. Your **signed SOW/Quotation**, however, scopes something narrower: a B2B sales/inventory/dispatch/delivery system with only *"limited scope"* farm & production modules bolted on. That gap between FRD ambition and SOW reality is what the checklist is flagging.

---

## 3. Overall App Flow (5 Zones, from their process diagram)

**Zone 1 – Farm Sourcing & Planning:** Farmer selection (via FPO) → unique Farmer ID → pre-season rate/quality/quantity agreement → certified seed distribution → farmer training → periodic field supervision by agri experts.

**Zone 2 – Procurement & Raw Material Control:** Pre-harvest quality check → collection from farmer/FPO → raw-material batch number created at store → segregated batch-wise storage.

**Zone 3 – Processing, QA & Packaging:** Cleaning/grading → product-specific processing (single grain: milling/grinding/roasting/oil extraction; multigrain: weigh-per-ratio → blend → homogeneity check) → in-process & finished QC → packaging with batch number + QR code → finished goods storage.

**Zone 4 – Sales, Order Fulfillment & Delivery:** Order received (Amazon/Flipkart/WhatsApp/own app/website/distributor/retailer) → inventory check & confirm → batch-wise pick & pack → invoice → dispatch to logistics → delivery tracking to customer.

**Zone 5 – Feedback & Improvement:** Customer ratings/reviews → complaint handling → farmer & product performance review → continuous improvement loop.

The QR code is the thread tying it all together — scan it and trace back through farmer → farm location → procurement batch → production batch → packaging → delivery.

---

## 4. The Core Tension to Address Tonight

| | FRD (client's full vision) | Your SOW/Quote (what's actually contracted) |
|---|---|---|
| Farmer traceability | Full Farmer ID + QR/barcode, agreements, seed distribution, training, field visits | "Farmer/FPO Master" only — listed as **limited/supporting** scope |
| Order channels | Amazon, Flipkart, WhatsApp, own app, website, distributor | **B2B only** — Sales-Exec app + Admin. No storefront, no marketplace, no payment gateway |
| Production | Full recipe/BOM engine, multigrain ratio + blending + homogeneity check | Generic "Production Batch Entry" — no formula/ratio logic |
| QR content | Farmer, farm location, batch, mfg details, **process video** | QR + batch + mfg details — video field not in data model |
| Hosting | Needs to store QR videos, delivery photos at scale | Single Hostinger **VPS**, storage explicitly **excluded** from price |
| Invoicing | GST invoice | ✅ included, but **E-Invoicing (IRN/IRP) + E-Way Bill** — legally required for dispatch — **not scoped** |

This is the crux: **the client is picturing the FRD; you're building the SOW.** Tonight needs to either close that gap in writing (with a price/timeline adjustment) or get explicit client sign-off that certain FRD items are phase-2.

---

## 5. CRITICAL Items — Must Get a Clear Answer Tonight

1. **End-to-end batch genealogy** (Farmer ID → raw batch → production batch → finished batch → order → delivery) — confirm the DB schema supports this full chain from day 1, even if data-entry screens for some stages come later. No retrofit later.
2. **QR code fields** — confirm the data model includes Farmer, Farm Location, Batch No., Manufacturing details, **and Process Video link**. Current quote lists QR but not the farm-origin fields.
3. **Hosting/storage** — a single VPS won't hold QR videos + delivery photos at scale. Needs S3-compatible storage + CDN + automated backups. (Note: point 6's clarification already puts storage *cost* on the client — but the *architecture* to use it still needs confirming.)
4. **Unique Farmer ID / Traceability ID** — currently **not in the quote at all**, yet it's the anchor of the entire QR-traceability promise the client is expecting. This needs to be added or explicitly declined.
5. **Multigrain Atta processing (BOM/ratio-based production)** — quote only has generic "Production Batch Entry." If they're selling blended products, formula-based batch production needs to be added.
6. **Order channels — clarify in writing** that the quote is B2B only (Sales-Exec app + Admin). No customer storefront, no Amazon/Flipkart integration, no payment gateway. This is probably the single biggest expectation gap — say it out loud, get it acknowledged.
7. **E-Invoicing (IRN/IRP) + E-Way Bill** — legally required for GST-compliant dispatch, not currently scoped. This isn't a nice-to-have; without it they may not be able to legally ship.
8. **Open REST APIs** — confirm APIs are genuinely open/documented for future integrations (marketplace, Tally/ERP, payment gateway, logistics, IoT), not just internal-only.

---

## 6. HIGH Priority — Should Be Addressed, Can Follow Up in Writing

- Farmer/FPO Master — confirm included (it is, per quote)
- Pre-season rate/quality/quantity agreement — add master screen (already clarified: included)
- Raw-material batch creation at store — confirm auto batch numbering + segregated storage flag
- Customer-facing D2C app/website + payment gateway — timeline doc mentions "payment gateways" but scope has none; confirm inclusion/price or exclusion
- GST invoice generation — ✅ confirmed included
- Delivery OTP verification — currently **optional**, client wants it **mandatory**
- Multi-warehouse/multi-location architecture — confirm it's genuinely supported, not bolted on
- Official WhatsApp Business API — already clarified: ₹1,500–5,000/month + Meta message charges, client bears cost (signed off)
- Role-based auth/audit logs — ✅ confirmed included
- Automated backups + documented disaster recovery — not currently scoped, needs adding
- Data migration of existing customer/product masters — not scoped, needs adding + import templates

---

## 7. Already Resolved — Don't Reopen, Just Confirm They're Still Fine

- **Point 6:** Agreement master screen will be provided. Cloud storage & related costs = client's responsibility.
- **Point 9:** Field visit / crop monitoring logs — included in scope.
- **Point 30:** Official WhatsApp Business API — ₹1,500–5,000/month + Meta charges (Utility ~₹0.12/msg, Marketing ~₹0.86/msg), borne by client. Already signed.

---

## 8. Suggested Talking Points / Questions to Open With

- "Before we go through the checklist — can we align on one thing first: this SOW is scoped as a **B2B order-fulfillment system with limited farm-tracking**, not the full consumer-facing farm-to-fork platform in the FRD. Is that still the shared understanding, or has the ask changed?"
- "For each Critical item, I want to give you one of three answers tonight: **in scope as quoted**, **add with a cost/timeline change**, or **phase 2**. Let's go item by item."
- "The E-Invoicing/E-Way Bill gap concerns me most — that's a compliance requirement, not a feature request. Can we treat that as must-have?"
- "On hosting — a single VPS excluded from price won't hold QR videos or delivery photos. Want to lock in the storage decision tonight so it doesn't block launch."
- Close by asking: **"Which of tonight's confirmations do you need in writing before releasing the advance?"**
