# Weekly Project Progress Report

**Project:** Farm-to-Customer Food Processing & Supply Chain Management System
**Client:** SVV Balaji Food & Beverages Pvt. Ltd.
**Vendor:** Appzeto
**Reporting week:** Week ending 7 August 2026
**Prepared by:** Ujjawal Mahawar — Development
**Accompanying file:** `SVV_Balaji_Weekly_Project_Report.xlsx`

| Sheet | Contents |
|---|---|
| 1. Gantt Chart | 18-week visual timeline, 29 activities, current-week marker |
| 2. Schedule Baseline | Activity-wise plan with owners, effort weighting and % complete |
| 3. Weekly Progress | Planned vs actual with variance for the reporting week |
| 4. Action Tracker | Consolidated open actions with ageing |

---

## Preliminary note — schedule baseline

Your note asks that progress be tracked against the *approved activity-wise Gantt chart*. On
reviewing the project records, **no activity-wise schedule was formally approved at
commencement.** This is the underlying reason that variance reporting could not be presented in
the previous meeting, and we accept that it should have been established at the outset.

Rather than raise this as a blocker, we have prepared a **proposed activity-wise Gantt chart and
baseline** (Sheets 1 and 2 of the attached workbook): 29 activities across five workstreams over
an 18-week schedule, with planned start and finish, effort weighting, and assigned owners.

The Gantt chart is formula-driven — adjusting an activity's start or finish week redraws its bar
automatically, so it can be maintained and reissued each week without rebuilding.

**Request:** please review and approve this baseline, or return it with amendments, by
**14 August 2026**. Once approved, every subsequent weekly report will show percentage complete
and schedule variance against it, in the format you have requested. This is tracked as action
**A-01**.

---

## 1. Activity-wise progress

Full detail in Sheet 1 and Sheet 2 of the attached workbook. Summary:

| Workstream | Share of total effort | Complete |
|---|---|---|
| Backend API / platform | 35% | 23% of 35% |
| Admin web panel (frontend) | 25% | 0% |
| Mobile applications (4 apps) | 20% | 0% |
| Integrations & infrastructure | 7% | 0% |
| Quality, deployment & handover | 13% | 1% of 13% |
| **Overall weighted completion** | **100%** | **23.9%** |

**Important clarification.** What is complete is the **backend system and business logic** —
the engine that runs the operation. The **admin web panel and the four mobile applications have
not yet started**, and together represent 45% of total project effort. We want this stated
plainly so that "Phase 3 complete" is not read as "the application is nearly ready."

Completed activities this reporting period:

| WBS | Activity | Status |
|---|---|---|
| WS1.1 | Foundation — architecture, authentication, role-based permissions, CI pipeline | 100% |
| WS1.2 | Farm sourcing — farmer registry, traceability ID, agreements, seed distribution, training, field monitoring | 100% |
| WS1.3 | Procurement — planning, harvest inspection, collection, batch generation, warehouse & inventory | 100% |
| WS1.4 | Processing — cleaning & grading, recipes, production, quality control, packaging, finished goods | 100% |
| WS5.1 | Automated test suite & continuous integration | 45% (ongoing) |

---

## 2. Schedule variance

| Status | Count | Activities |
|---|---|---|
| Ahead of schedule | 3 | WS1.2, WS1.3, WS1.4 — backend delivered faster than planned |
| On schedule | 2 | WS1.1, WS5.1 |
| Delayed | **0** | — |
| Blocked (awaiting client decision) | 3 | WS1.5, WS4.1, WS4.4 |
| Not yet started (per plan) | 21 | Frontend, mobile, remaining integrations, deployment |

**No activity is currently behind schedule.** Three activities cannot begin until decisions are
received from SVV Balaji — these are listed in section 10 and are not attributable to development
delay. If those decisions arrive by the target dates, no schedule impact is expected.

---

## 3. Information / clarification required from SVV Balaji

| Ref | Required from SVV Balaji | Needed by |
|---|---|---|
| A-01 | Approval of the proposed activity-wise schedule baseline | 14 Aug 2026 |
| A-02 | Sales channel scope — B2B only, or consumer/marketplace channels also | **12 Aug 2026** |
| A-03 | GST e-invoicing applicability (turnover threshold) and preferred provider — requires input from your finance team or chartered accountant | 14 Aug 2026 |
| A-04 | Cloud storage provider approval, and confirmation of whether QR-linked process videos are required | 14 Aug 2026 |
| A-05 | Confirmation that multigrain (blended) production is in scope | 14 Aug 2026 |
| A-06 | Existing customer and product master data, for migration planning | 28 Aug 2026 |
| A-07 | Nomination of UAT participants and availability window | 28 Aug 2026 |

A separate decision memo covering items A-02 to A-05 in detail, with our recommendation for each,
has been issued alongside this report.

---

## 4. Development challenges

| Challenge | Impact | Corrective action |
|---|---|---|
| **No approved baseline schedule** existed at commencement, so variance could not be reported | Reporting quality | Baseline proposed for approval (A-01). All future reporting will track against it. |
| **Scope ambiguity between the FRD and the signed SOW** on sales channels, multigrain production and e-invoicing | Rework risk if built on assumption | Raised formally as decisions A-02 to A-05 rather than assumed. Multigrain has been built so it can be enabled by configuration once confirmed, avoiding rework either way. |
| **Current hosting (single VPS)** is not sufficient for photo and video storage at scale, and has no automated backups | Go-live readiness | Storage provider decision requested (A-04). Backup and DR scheduled in WS5.5; recommend bringing forward if live data is used during UAT (A-09). |

---

## 5. Recovery plan

**No activity is currently delayed, so no recovery plan is required at this stage.**

Preventive measures for the risks identified above:

- Backend delivery is running **ahead of plan**, which creates buffer for the frontend and mobile workstreams in the second half of the programme.
- Should decisions A-02 to A-05 not be received by their target dates, we will re-forecast the affected activities and present a revised timeline in next week's report rather than allowing silent slippage.
- If the sales channel decision (A-02) extends beyond 19 August, Phase 4 backend work will be re-sequenced behind the admin panel workstream so that overall progress is not stalled.

---

## 6. Deliverables completed this week

All items below are working software, available for demonstration.

| Deliverable | Evidence available |
|---|---|
| User management with role-based access control across 9 staff roles | Live demonstration; automated permission tests |
| Farmer registration, verification workflow and audit trail | Live demonstration |
| **Unique farmer traceability ID** (format `SVV-2026-000001`) issued on approval, with QR code and barcode | Live demonstration — scan resolves to farmer record |
| Pre-season agreements, seed distribution, training records, field monitoring | Live demonstration |
| Procurement planning and harvest quality inspection | Live demonstration |
| **Raw material batch generation** (format `RM-20260807-001`) linked to the originating farmer | Live demonstration |
| Warehouse inventory with full movement audit trail, transfers and stock adjustments | Live demonstration |
| Recipe management with versioning and approval control | Live demonstration |
| Production batches consuming specific raw material batches | Live demonstration |
| Quality control at raw material, in-process and finished goods stages | Live demonstration |
| Packaging, product labels and **finished goods batch** (format `FG-20260807-001`) | Live demonstration |
| **Complete farm-to-fork traceability** | See below |

### Demonstration: end-to-end traceability

Scanning the code on a finished pack now resolves the full chain:

```
FG-20260807-001   finished pack (QR code on packaging)
   └─ PB-20260807-001   production run — recipe and version recorded
        └─ RM-20260807-001   raw material batch
             └─ SVV-2026-000001   farmer — name, village, district, farm location
```

The response includes manufacturing and expiry dates, quality inspection history, the recipe
version used, and the farmer behind the product. **This is the core objective of the project and
it is functioning end to end.**

### Verification evidence

- **50 automated unit tests** — all passing
- **90 automated integration checks** covering the complete business flow — all passing
- **Interactive API documentation** available for review at `/api/docs`
- Quality controls verified as enforcing, not merely recording: a failed raw-material inspection prevents that batch entering production; a failed finished-goods inspection prevents dispatch

We would welcome the opportunity to demonstrate this live at the next weekly meeting.

---

## 7. Next week's plan (w/c 11 August 2026)

| WBS | Planned activity | Target | Dependency |
|---|---|---|---|
| WS2.1 | Admin web panel — scaffolding, authentication, role-based navigation | 40% | Owner assignment (A-08) |
| WS2.2 | Admin panel — farmer and master data screens | Start | WS2.1 |
| WS4.1 | Cloud object storage setup | 100% | **Decision A-04** |
| WS5.2 | Staging environment for SVV Balaji review access | 60% | — |
| WS1.5 | Sales & order fulfilment backend | Start | **Decision A-02** |
| WS5.1 | Automated test coverage | 50% | — |

Expected deliverables by 14 August: admin panel shell with working login and role-based
navigation; staging environment accessible to SVV Balaji for review.

Activities marked with a decision dependency will not commence until that decision is received.

---

## 8. Responsibilities and deadlines

| Activity | Responsible | Target date |
|---|---|---|
| Backend development — all workstreams (WS1.x) | Ujjawal Mahawar | Per baseline |
| Integrations — storage, WhatsApp, SMS, e-invoicing (WS4.x) | Ujjawal Mahawar | Per baseline |
| Admin web panel (WS2.x) | Raunak | From Week 4 |
| Mobile — Agriculture Expert & Sales Executive apps (WS3.1, WS3.2) | Raunak | From Week 10 |
| Mobile — Warehouse & Delivery apps (WS3.3, WS3.4) | Ujjawal Mahawar | From Week 13 |
| Automated testing & CI (WS5.1) | Ujjawal Mahawar | Ongoing |
| Staging environment & deployment (WS5.2) | Ujjawal Mahawar | Week 6 |
| Data migration (WS5.3) | Raunak | Week 15 |
| UAT support, training, go-live (WS5.4, WS5.6, WS5.7) | Ujjawal Mahawar & Raunak | Weeks 15–18 |
| Project coordination & client liaison | Ravi Tiwari | Ongoing |
| Decisions A-02 to A-05 | SVV Balaji management | 12–14 Aug 2026 |
| Master data for migration (A-05) | SVV Balaji | 28 Aug 2026 |

---

## 9. Dependencies

The following external and client-side dependencies affect delivery. Each is tracked in the
action tracker.

| Ref | Dependency | Required from | Needed by |
|---|---|---|---|
| D-01 | Sales channel scope confirmation — determines the order module design | SVV Balaji | 12 Aug 2026 |
| D-02 | GST e-invoicing applicability and choice of GST Suvidha Provider | SVV Balaji (Finance) / third-party provider | 14 Aug 2026 |
| D-03 | Cloud object storage provider approval and account | SVV Balaji | 14 Aug 2026 |
| D-04 | Multigrain production scope confirmation | SVV Balaji | 14 Aug 2026 |
| D-05 | WhatsApp Business Solution Provider account and Meta template approval | SVV Balaji (cost) / third-party BSP | Week 9 |
| D-06 | SMS / OTP gateway account | SVV Balaji (cost) | Week 9 |
| D-07 | Existing customer and product master data for migration | SVV Balaji | 28 Aug 2026 |
| D-08 | UAT participants nominated and availability confirmed | SVV Balaji | 28 Aug 2026 |
| D-09 | Hosting upgrade path confirmed for media storage at scale | Joint | 21 Aug 2026 |

Third-party dependencies (D-02, D-05) involve external approval processes that are outside
Appzeto's control; we have scheduled them with allowance for provider onboarding time.

## 10. Decisions required from management

| Ref | Decision | Required by | Consequence if not received |
|---|---|---|---|
| **A-02** | **Sales channel scope** — B2B only, or consumer/marketplace channels also | **12 Aug 2026** | Phase 4 (sales, dispatch, delivery) cannot commence |
| **A-03** | **GST e-invoicing** — applicability and provider | **14 Aug 2026** | System may not support compliant dispatch at go-live |
| **A-04** | **Cloud storage provider**, and whether QR process videos are required | 14 Aug 2026 | Photo, document and video upload cannot go live |
| **A-05** | **Multigrain production** in scope | 14 Aug 2026 | Blended products cannot be manufactured through the system |
| **A-01** | **Approval of the schedule baseline** | 14 Aug 2026 | Variance reporting cannot be presented in the format requested |

A detailed decision memo covering A-02 to A-05, with recommendations, accompanies this report.

---

## 11. Action tracker

Maintained in Sheet 3 of the attached workbook and reviewed at every weekly meeting. Open actions
remain until formally closed, with ageing calculated automatically.

**Current position: 9 open actions, 2 of critical priority, 0 closed, 0 overdue.**

| Ref | Action | Responsible | Target | Status |
|---|---|---|---|---|
| A-01 | Approve schedule baseline | SVV Balaji | 14 Aug | Open |
| A-02 | Decision: sales channel scope | SVV Balaji | 12 Aug | Open — **Critical** |
| A-03 | Decision: e-invoicing applicability & provider | SVV Balaji — Finance | 14 Aug | Open — **Critical** |
| A-04 | Decision: storage provider & process videos | SVV Balaji | 14 Aug | Open |
| A-05 | Decision: multigrain production scope | SVV Balaji | 14 Aug | Open |
| A-06 | Provide master data for migration | SVV Balaji | 28 Aug | Open |
| A-07 | Nominate UAT participants | SVV Balaji | 28 Aug | Open |
| A-08 | Confirm hosting upgrade path | Joint | 21 Aug | Open |
| A-09 | Set up staging environment for client access | Appzeto | 21 Aug | Open |

---

## Summary

Development is **ahead of plan on the backend**, with the core traceability objective working end
to end and available for demonstration. Overall project completion is **23.9%**.

Two matters require attention:

1. **From SVV Balaji** — five decisions, of which the sales channel scope (A-02) is blocking and needed by 12 August.
2. **Dependencies** — several third-party accounts and approvals (storage, WhatsApp BSP, e-invoicing provider) need to be initiated in good time; these are listed in section 9.

We have proposed a schedule baseline for approval so that from next week onward, this report can
present progress and variance in exactly the format requested.

---

*Prepared for the weekly project review. The schedule baseline, activity-wise progress, action
tracker and risk register are provided in the accompanying workbook.*
