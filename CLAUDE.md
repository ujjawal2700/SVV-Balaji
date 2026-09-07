# SVV Balaji — Read This First

**Project:** Farm-to-Customer Food Processing & Supply Chain Management System
**Client:** SVV Balaji Food & Beverages Pvt. Ltd. · **Vendor:** Appzeto
**Programme:** 18 weeks, Week 1 commenced 4 Aug 2026

This file is the entry point for anyone — human or agent — picking up work on this project.
Two developers work on this repo with separate agent sessions, so **shared state lives in files
here, never in one person's chat history.**

---

## Where to look

| File | What it holds |
|---|---|
| `PROJECT_STATE.md` | **Read this second.** Current status, all client decisions, what's built, what each developer does next. |
| `DEV_LOG.md` | Chronological log. Append an entry after every work session. |
| `SVV_Balaji_Module_Roadmap_TechStack.md` | Build order, role→panel mapping, full tech stack with rationale. |
| `SVV_Balaji_Client_Decision_Memo.md` | The four decisions put to the client. Answers are in `PROJECT_STATE.md`. |
| `SVV_Balaji_Weekly_Project_Report.xlsx` | Gantt, schedule baseline, weekly progress, action tracker. Client-facing. |
| `SVV_Balaji_Weekly_Progress_Report.md` | Narrative weekly report that accompanies the workbook. |
| `SVV Balaji Functional Requirement Document.pdf` | Client FRD — 35 sections, 10 roles. The source of truth for requirements. |
| `svv-balaji-backend/README.md` | Backend architecture, module-by-module detail, API conventions. |

---

## Who owns what

| Developer | Workstreams |
|---|---|
| **Ujjawal Mahawar** | Backend API (WS1.x), integrations & infra (WS4.x), Warehouse & Delivery mobile apps (WS3.3–3.4), testing/CI/deployment (WS5.1, 5.2, 5.5) |
| **Raunak** | Admin web panel (WS2.x), Agriculture Expert & Sales Executive mobile apps (WS3.1–3.2), data migration (WS5.3) |
| **Ravi Tiwari** | Client liaison, weekly reporting |

**Do not edit outside your workstream without logging it in `DEV_LOG.md`.** The backend API is the
contract between us — if you change a route, DTO or enum, log it, because the other side is
building against it.

---

## Rules for agents working on this project

1. **Read `PROJECT_STATE.md` before doing anything.** It is more current than this file.
2. **Append to `DEV_LOG.md` when you finish a session.** One entry: date, who, what changed, what
   the other developer needs to know. This is how the other agent learns what happened.
3. **Update `PROJECT_STATE.md`** when status changes — a phase completes, a decision arrives, a
   blocker clears. Do not let it go stale.
4. **Never assume scope.** Where the FRD and the signed SOW disagree, raise it as a client
   decision rather than building on a guess. Three such gaps have already caused blocked work.
5. **The API is documented at `/api/docs` (Swagger).** Frontend and mobile work should read the
   live schema there rather than guessing shapes.
6. **Traceability is the core promise of this project.** Any change touching the
   farmer → raw batch → production batch → finished goods chain needs a test proving the chain
   still resolves end to end.

---

## Backend quick reference

Stack: NestJS + TypeScript · PostgreSQL 16 · Prisma · Redis · JWT + RBAC · Swagger

```bash
cd svv-balaji-backend
docker compose up -d          # Postgres + Redis + API
npx prisma migrate dev        # apply migrations
npm run start:dev             # dev server
npm test                      # unit + integration
./smoke-test.sh               # end-to-end flow check
```

Code formats issued by the system:

| Format | Meaning |
|---|---|
| `SVV-2026-000001` | Farmer traceability ID — issued on approval, not registration |
| `RM-20260807-001` | Raw material batch |
| `PB-20260807-001` | Production batch |
| `FG-20260807-001` | Finished goods batch — this is what the QR on the pack resolves |

`GET /api/v1/trace/:fgBatchNumber` resolves a pack all the way back to the farmer.
Global API prefix is `api/v1`; Swagger is served at `/api/docs` (no prefix).

---

*Maintained by the Appzeto development team. Last updated 11 August 2026.*
