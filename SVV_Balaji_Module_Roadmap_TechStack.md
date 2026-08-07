# SVV Balaji — Module Roadmap & Tech Stack

---

## 1. Module Build Order

Build in dependency order, not visual Zone order — auth and master data must exist before anything else, and the farmer/batch chain (Zones 1-3) must exist before sales (Zone 4) can reference real batches, since batch-wise traceability was flagged Critical.

### Phase 0 — Foundation (Sprint 0–1, ~2 weeks)
Nothing ships without this; do it first even though it's invisible to the client.
- Repo, branching strategy, CI/CD pipeline, Docker-based dev/staging/prod environments
- Auth + RBAC: roles for Admin, Warehouse Manager, Sales Executive, Delivery Partner, Farmer/FPO (view-only)
- Core masters: Users, Product/SKU, Warehouse/Location, UOM
- API scaffolding with OpenAPI/Swagger docs from day 1 (this *is* your "open REST APIs" answer to the checklist)

### Phase 1 — Zone 1: Farm Sourcing & Planning
- Farmer/FPO registration + **Unique Farmer ID / Traceability ID** generation (this is the anchor of the whole QR chain — build it first, not later)
- Pre-season Rate/Quality/Quantity Agreement screen
- Certified seed & input distribution log
- Farmer training records, field visit / crop monitoring logs

### Phase 2 — Zone 2: Procurement & Raw Material Control
- Pre-harvest quality check form
- Raw material collection entry (links to Farmer ID)
- Raw material batch number generation at store (auto-numbered, immutable)
- Segregated batch-wise storage/inventory ledger

### Phase 3 — Zone 3: Processing, QA & Packaging
- Cleaning/grading/quality verification
- Single-grain processing (milling/grinding/roasting/oil extraction) batch entry
- **Multigrain BOM/ratio engine**: define recipe, weigh-per-ratio, blend, homogeneity check — this is the module the current SOW doesn't cover, build it as a first-class formula/recipe system, not a bolt-on
- In-process & finished product QC
- Packaging + **QR code generation**, encoding farmer, farm location, batch no., mfg details, process video link
- Finished goods inventory, batch-wise

### Phase 4 — Zone 4: Sales, Order Fulfillment & Delivery
- Order intake — start with B2B channels only (Sales-Exec app → distributor/retailer), per current signed scope
- Inventory check & order confirmation
- Batch-wise picking & packing (pulls from Phase 3 batches — this is where traceability either works or breaks)
- GST invoice generation, then **e-invoicing (IRN/IRP) + e-way bill** integration
- Dispatch handoff to logistics
- Delivery app: route, live tracking, POD (photo/OTP), delivery status

### Phase 5 — Zone 5: Feedback & Improvement
- Customer feedback/ratings capture
- Complaint handling / ticketing workflow
- Farmer & product performance dashboards
- Analytics for continuous improvement

### Phase 6 — Cross-Cutting / Hardening (run in parallel from Phase 2 onward, not a final step)
- WhatsApp/SMS/push notifications
- Reporting & export (Excel/PDF)
- Data migration tooling for existing customer/product masters
- Automated backups + disaster recovery runbook
- Load testing, security review, UAT, client training, go-live

**Where to start this week:** Phase 0 (foundation) in parallel with Phase 1 (Farmer ID + agreement screen). That gets the traceability anchor live early, which was your #1 Critical checklist item, and de-risks it before the client asks again.

---

## 2. User Roles & Panel Mapping

The FRD defines 10 distinct user roles (Section 5). They don't need 10 separate applications — group them into panels by how and where each role actually works.

| # | Role | Core Responsibility | Panel/App |
|---|---|---|---|
| 1 | Super Admin | Full org control, all branches, recipes, master settings, QR traceability | Admin Web Panel |
| 2 | Branch Manager | Branch-level oversight of procurement/production/warehouse/sales | Admin Web Panel |
| 3 | Procurement Manager | Farmer list, purchase planning, batch assignment, raw material inspection | Admin Web Panel |
| 4 | Production Manager | Production planning, recipe execution, batch production, machine monitoring | Admin Web Panel |
| 5 | QA Manager | Quality inspection, batch approval/rejection, rework | Admin Web Panel |
| 6 | Warehouse Manager | Stock entry, batch storage, transfers, dispatch prep | Admin Web Panel |
| 7 | Sales Team | Customer/order management, invoicing, payment tracking | Admin Web Panel (or Sales-Exec mobile app if field-based, per current SOW) |
| 8 | Agriculture Expert | Farmer visits, crop monitoring, field reports, training records | Field Mobile App |
| 9 | Logistics Team | Shipment assignment, route management, delivery tracking, POD | Delivery Mobile App |
| 10 | Customer | Browse, order, track, scan QR, ratings, complaints | Customer App/Website |

**Practical build plan — 4 interfaces, not 10:**

1. **Admin/Ops Web Panel** (roles 1–7) — one React app, role-based menus and permissions via RBAC. This is the highest-leverage build: most of the FRD's 34 modules live here.
2. **Field Mobile App** (role 8, Agriculture Expert) — offline-capable, camera/photo upload for crop monitoring and field visits.
3. **Delivery Mobile App** (role 9, Logistics/Delivery) — route, live tracking, OTP/photo proof of delivery. Can be combined with the Sales-Exec app if the same field staff handle both, per your current SOW structure.
4. **Customer App/Website** (role 10) — browse, order, QR scan for traceability, feedback. **Flag: this is the one piece not currently in your signed SOW** (which is B2B-only) — confirm with the client whether/when this gets built before committing engineering time to it.

Build order follows the module roadmap above: stand up the Admin Web Panel first since it covers the farmer→batch→production→order chain end to end, then layer in the Field and Delivery mobile apps as their underlying modules (Zone 1 and Zone 4) come online. The Customer app is last, and only once scope is confirmed.

---

## 3. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| **Database** | **PostgreSQL 16** | As requested — relational integrity is essential here (farmer→batch→production→order chain is a strict FK graph, not document-shaped data). Use partitioning on batch/order tables once volume grows. |
| **Cache / Queues** | **Redis** | Session cache, rate limiting, and job queues (BullMQ) for async work — e-invoice submission, WhatsApp sends, report generation shouldn't block API responses. |
| **Backend** | **Node.js + NestJS (TypeScript)** | Modular-by-design architecture maps directly onto your module-by-module build plan — each Zone becomes a NestJS module with clear boundaries. TypeScript keeps backend and admin frontend in one language, which matters for a small team. |
| **ORM** | **Prisma** | Type-safe queries, clean migrations, and a schema file that doubles as living documentation of the batch-genealogy data model — useful when you need to prove traceability to the client. |
| **API style** | **REST, OpenAPI/Swagger-documented** | Matches the "open REST APIs" requirement from the checklist. Add GraphQL later only if a specific integration needs it — don't add complexity upfront. |
| **Auth** | **JWT (access + refresh tokens) + RBAC** via Passport.js | Standard, well-understood, easy to audit — matches the "role-based auth/audit logs" checklist item. |
| **Admin Web Panel** | **React + TypeScript (Vite)**, component library **shadcn/ui** or **Ant Design** | Ant Design if you want fast CRUD-heavy screens out of the box (lots of tables/forms — this app is mostly that); shadcn/ui if you want more design control. For an ops-heavy admin panel, I'd lean Ant Design for speed. |
| **Mobile apps** (Sales-Exec, Warehouse, Delivery) | **Flutter** | Single codebase for Android + iOS, strong offline-first support (field staff and delivery partners will hit patchy rural connectivity), and mature camera/QR/barcode scanning plugins. Better fit than React Native here specifically because of offline sync needs. |
| **File/Media Storage** | **Cloudflare R2** (or AWS S3 if the client prefers a more "enterprise-recognizable" name) + CDN | S3-compatible API either way. R2 has no egress fees, which matters once QR-linked process videos and delivery photos scale up — storage cost is already flagged as the client's responsibility, so keep it lean. |
| **QR Codes** | `qrcode` (Node) generating codes that encode a **public traceability URL** (not raw data) | Lets you update linked info (e.g., swap a process video) without reprinting packaging — the QR just points to a batch page. |
| **Real-time / tracking** | **Socket.io** for live order/delivery status + **Google Maps Platform** (or Mapbox as a cheaper alt) for delivery location | Needed for Zone 4 delivery tracking. |
| **Push notifications** | **Firebase Cloud Messaging** | Free, works across the three field apps. |
| **WhatsApp** | **WhatsApp Business API via a BSP** (Interakt / AiSensy / Gupshup) | Already clarified with client — cost borne by them (₹1,500–5,000/mo + Meta charges). Don't build a direct Meta integration; a BSP is faster and handles template approval. |
| **SMS/OTP** | **MSG91** (or Twilio if you want a more global-recognized vendor) | Cheaper per-SMS rates for Indian numbers with MSG91. |
| **GST E-Invoicing / E-Way Bill** | Integrate via a **GSP (GST Suvidha Provider)** — ClearTax GST API, MasterGST, or Cygnet — rather than building direct NIC/IRP integration | This is regulated, changes periodically, and a GSP handles IRN generation, QR, and compliance updates for you. Flagged Critical in the checklist — don't build from scratch. |
| **Payments** (future D2C phase) | **Razorpay** | Best Indian payment gateway coverage if/when a consumer storefront is added later; not needed for current B2B scope. |
| **Infra / Hosting** | **Docker + Docker Compose**, **Nginx** reverse proxy, deployed on a scalable VM (DigitalOcean Droplet or AWS Lightsail — upgrade path beyond the current single Hostinger VPS), **Certbot** for SSL | Containerizing now means moving off a single VPS to proper cloud infra later is a config change, not a rewrite. |
| **CI/CD** | **GitHub Actions** | Auto-deploy to staging on merge, manual promote to prod. |
| **Monitoring / Errors** | **Sentry** (errors) + **UptimeRobot** (uptime) | Lightweight, cheap, enough for this team size. |
| **Backups** | Automated nightly `pg_dump` → object storage, documented restore runbook | Flagged as a gap in the checklist — set this up in Phase 0, not as an afterthought. |
| **Testing** | **Jest** (backend unit/integration) | Prioritize tests on the batch-genealogy and invoicing logic — those are the modules where a bug is a compliance or trust problem, not just an inconvenience. |

### Notes on trade-offs
- **NestJS vs Django:** Django + DRF would give you a faster out-of-the-box admin panel, but NestJS's modular structure matches your Zone-by-Zone build plan more naturally and keeps the whole team in TypeScript alongside the React admin panel and (optionally) React web pieces. Either is defensible; NestJS is the better fit given you're building this module-by-module with reuse across web and mobile clients via one API.
- **Flutter vs React Native:** if your team is already strongly JS/TS-skilled and offline support isn't a hard requirement, React Native keeps everyone in one language. Given the field-use context (farms, delivery routes), Flutter's offline-first tooling tips it in Flutter's favor.
- **R2 vs S3:** functionally near-identical (S3-compatible API), R2 is simply cheaper at scale due to no egress fees. If the client's IT/security team specifically wants "AWS" on paper, S3 is the safer political choice even at slightly higher cost.
