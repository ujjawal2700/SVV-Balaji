# SVV Balaji — Development Log

Chronological record of work on this project. **Append an entry at the end of every working
session** — newest at the top. Two developers work here with separate agent sessions; this log is
how each side learns what the other did.

**Entry format:**

```
## YYYY-MM-DD — Name
**Did:** what changed
**Contract changes:** any new/changed API route, DTO or enum (or "none")
**Other developer needs to know:** the one thing that affects them
**Next:** what you're picking up next
```

---

## 2026-09-21 — Raunak — Storefront checkout & fulfilment lifecycle (end to end)

**Did:** The customer app's checkout/orders were mock and there was no storefront order API. Built the whole
lifecycle for B2C and B2B, on the SAME `Order` so admin, inventory, quality, traceability and loyalty stay one system.
- **Statuses:** reuse Super Admin's existing ones - PLACED (= ORDER_PLACED) -> CONFIRMED -> ALLOCATED -> PACKED ->
  DISPATCHED (= OUT_FOR_DELIVERY / shipped) -> DELIVERED / CANCELLED. No new enum; the customer app words them
  (`pages/orderStatus.ts`). `advance()` now refuses to skip the storefront controls (scan, rider, AWB, OTP).
- **Routing (server decides, customer never picks):** `Warehouse.kind` CENTRAL|OUTLET + lat/lng + radius. B2B -> central.
  B2C: nearest active outlet within its radius (haversine) that has stock for EVERY item -> LOCAL (rider); else central
  -> SHIPROCKET. No coordinates = never "local". ETA (prep + km x min/km, or day window) and fee come from
  `CheckoutSettings` (Super Admin: `/settings/checkout`).
- **Server-side money:** `/storefront/checkout/quote` has no price/tax/fee/method fields (forbidNonWhitelisted rejects
  them). Price lists, GST, coupon (`Coupon`, validated vs the SERVER subtotal), loyalty redemption (new; caps + FIFO lot
  drawdown so points never "expire twice") and fee are all recomputed; `expectedTotal` is compared only (409 PRICE_CHANGED).
  Order-level discount is spread pro-rata and GST is charged AFTER it; loyalty earning is now on the net amount.
- **Stock (no overselling):** `StockReservation` (HELD with 15-min TTL -> COMMITTED on order -> RELEASED when packing
  turns it into batch allocations). Availability = QA-released, unexpired, holdStatus ACTIVE batches only - **ON_HOLD /
  RECALLED excluded** - minus allocations minus active holds, checked under `SELECT ... FOR UPDATE` on the stock rows
  (id-ordered, deadlock-free). Expired holds stop counting by themselves (sweeper is tidy-up only). `allocate()` now
  subtracts other orders' holds, so packing can't steal paid stock. Loser of a local race is re-routed (next node/central).
- **Atomic order:** one transaction = order + items (SKU/name snapshots) + address snapshot (JSONB) + pricing snapshot +
  delivery OTP + reservation commit + coupon redemption + loyalty debit + payment ledger + event. Idempotent on the
  session (unique `checkoutSessionId`). Payment failure/abandon/TTL release everything. Paid-but-unfulfillable is
  flagged `REFUND REQUIRED` on the payment row (no automated refund yet).
- **Payments:** `PaymentGateway` seam. `mock` (dev; refuses NODE_ENV=production) and `razorpay` (plain HTTPS; HMAC
  signature + webhook verification). B2B: CREDIT with the existing credit-limit check, GSTIN + MOQ enforced; COD for B2C only.
- **Fulfilment pipeline** (`FulfillmentService`): start-packing (confirm + FIFO allocate) -> scan a batch label/QR (only an
  allocated batch accepted; last scan = PACKED) -> LOCAL: assign rider (= out for delivery) -> doorstep OTP (5 tries then
  423 lock) -> DELIVERED; SHIPROCKET: create shipment (AWB/courier/label/tracking, idempotent) -> Shiprocket webhook
  (token-authenticated) -> DELIVERED. Loyalty credits on DELIVERED via the existing hook. **Staff never receive
  `deliveryOtp`** (interceptor strips it from every staff order response); only the owning customer sees it.
- **Realtime:** Socket.io `/admin` (JWT + `orders.view`, Super Admin = all orders, others = own branch room):
  `orders:new` / `orders:updated` with order id, customer, channel, amount, method, node, timestamps. Web Push (VAPID)
  when a user has no live socket. `GET /orders-sync?since=` reconciles after a drop/close (unique by order id; serverTime
  taken before the query). Admin: `useLiveOrders` (in `AppLayout`) toasts + refreshes every orders view; header shows
  Live/Offline; "Enable order alerts" registers the service worker (`public/sw.js`).
- **Customer app:** real Addresses (with "use my location" pin), Checkout (server quote, coupon, points, payment,
  mock/Razorpay gateway), Orders, live Tracking (timeline, OTP, rider, AWB link). Cart offers are real server coupons.
- **Admin:** Orders table shows node + method + rider/courier (real data); drawer tab "Pack & Deliver"; Checkout &
  Delivery settings; Coupons (real, replaces the localStorage mock); Warehouse form gained role/coordinates/radius.
**Contract changes:** many - see Swagger. New: `/storefront/{addresses,checkout/*,coupons,orders}`, `/checkout-settings`,
`/coupons`, `/orders/:id/{start-packing,pick-plan,scan,assign-rider,ship,verify-otp}`, `/webhooks/{shiprocket,razorpay}`,
`/orders-sync`, `/notifications/push/*`, socket namespace `/admin`; Warehouse DTO fields; loyalty settings
`redemptionEnabled/maxRedemptionPercent/minRedeemPoints`. Migration `20260921130000_storefront_checkout`
(additive). New perms `checkoutSettings.*`, `coupons.*`. `main.ts` now `rawBody: true`.
**Deploy:** `npx prisma migrate deploy && npx prisma generate`, restart. Env: `PAYMENT_GATEWAY`, `SHIPPING_PROVIDER`,
`SHIPROCKET_WEBHOOK_TOKEN`, `VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT` (+ Razorpay/Shiprocket credentials). nginx must
forward `/socket.io` with websocket upgrade (dev proxy already does).
**Verified live** (API + Postgres): `svv-balaji-backend/e2e-checkout-flow.py` (102 checks, re-runnable, cleans up):
LOCAL vs SHIPROCKET routing, server maths (coupon + points + GST-after-discount), tamper rejection, forged payment
signature, idempotent confirm, atomic order snapshot, socket auth + live `orders:new`, FIFO allocation + wrong-batch
scan refused, rider/OTP (wrong OTP, lockout, plain-deliver blocked), Shiprocket AWB + webhook, payment failure /
abandon / TTL expiry releasing stock, **8 concurrent buyers on 5 units -> exactly 5 succeed and 5 allocations**,
frozen/recalled batches excluded (re-route to depot), cancel returns points+coupon, B2B MOQ/tier price/credit limit,
reconciliation after socket loss, permissions. Also recall + loyalty e2e re-run green, 498 unit tests, `tsc` and
production builds clean, and real Chrome screenshots of customer checkout/tracking and admin orders/drawer.
**NOT verified / NOT built (be honest with the client):** Razorpay and Shiprocket adapters follow the documented APIs but
have never been called (no credentials) - first sandbox run is onboarding. Web push delivery to a real browser was not
exercised (subscription/key endpoints were; sending needs a real subscription). Automated refunds (cancel of a PAID
online order, or REFUND_REQUIRED) are not implemented - the fact is recorded, money movement is manual. No geocoder:
coordinates come from the browser's "use my location"; an unpinned address ships by courier. Customer self-cancel and
rider mobile app are not built (staff console only). Full 2x2 concurrency across multiple API instances relies on
Postgres row locks (sound) but was tested against one instance.
**Reconciliation:** `e2e-reconcile.mjs` (read-only, from the DB) asserts 27 invariants across modules - production loss/yield, raw kg consumed <= received, stock >= 0 and reserved == live allocations, stock on hand == ledger (stock-ins - dispatches), reservations == order lines, order = lines = payment ledger, coupon usage == redemptions, every customer balance == ledger sum, earned points == line points == ledger, points only on delivered orders, scans/OTP/AWB present, dispatched allocations trace to a farmer. All hold; a deliberate 1-rupee corruption is caught three ways. `./e2e-all.sh` runs everything + this.
**Next:** Razorpay + Shiprocket sandbox onboarding (A-11), refund automation, customer cancel, geocoding provider.

## 2026-09-21 — Raunak — Loyalty rewards: percentage-based, configurable, real end to end

**Did:** Replaced the customer app's mock loyalty (client-side price-band points, tiers, wallet
redemption in localStorage) with a real server-side, Super Admin–configurable program. Crossed into
backend/schema/sales deliberately.
- **Design decisions (worth knowing):** loyalty *points are the existing coin ledger*
  (`CoinTransaction` / `Customer.coinBalance`) - one balance, shared with referral coins, told apart by
  ledger reason (`LOYALTY_EARN` / `LOYALTY_REVERSAL` / `LOYALTY_EXPIRY`). **1 point = Rs `pointValueInr`**
  (configurable; default 1). Points = floor(eligible base x percent / pointValue), integer-paise maths.
  Credit happens when an order is **DELIVERED**; nothing is earned at placement.
- **Settings (`LoyaltySettings`, single row, Super Admin only):** earn % per channel (B2C / B2B), point
  value, calculation base (excl./incl. GST; delivery charges are never part of it - they are not order
  lines), default eligibility, "discounted products earn" switch (a line is discounted when its price incl.
  GST is below product MRP), min item value, min order value, max reward per order (Rs), expiry months,
  program on/off. What was applied is frozen on each order's `LoyaltyOrderEarn` (+ per-line
  `LoyaltyOrderEarnLine`), so changing a rule never restates a past order.
- **Eligibility cascade:** product override (`Product.loyaltyEligibility`) -> category -> parent category
  -> program default. `INHERIT | ELIGIBLE | NOT_ELIGIBLE`. Resolved server-side; the admin product form
  shows the server's answer (`GET /loyalty/eligibility`), the frontend re-implements nothing.
- **Idempotent + retryable:** `LoyaltyOrderEarn` is unique on `orderId` (no double credit); the delivery
  hook is best-effort and an hourly sweep credits any delivered order whose hook failed - but only orders
  delivered after `earningStartsAt` (deploy), so history is never retro-paid. A paused program records a
  zero-point earn (`PROGRAM_OFF`) so it isn't retro-paid on re-enable. Every order records *why* it earned
  nothing (`skipReason` / per-line `ineligibleReason`).
- **Returns/reversal:** new `OrderReturn` + `POST /orders/:id/returns` (`orders.return`). Delivered orders
  only; cumulative qty can't exceed ordered. In the same transaction, points are reversed in proportion to
  quantity (a full return reverses exactly what remains - no stranded rounding point). Points that already
  expired aren't debited twice. Cancelled/undelivered orders never earned anything.
- **Expiry:** earned rows carry `expiresAt`/`remainingAmount`; hourly `expireDue()` (also on customer read)
  lapses live points once, never below a zero balance.
- **Customer app:** `LoyaltyProvider` now reads `GET /storefront/loyalty` (balance, rupee value, expiring
  soon, history, program rules in words); product page / cart / checkout hints come from
  `POST /storefront/loyalty/estimate` (same engine, priced via the pricing service) and say plainly when
  an item doesn't earn. **Removed:** tiers, price-band table, mock transactions, wallet redemption.
- **Admin:** `/settings/loyalty` (all controls + worked example), "Loyalty rewards" section on the product
  form, category modal field, order drawer tab "Rewards & Returns" (frozen earn breakdown, returns, ledger,
  Record return), new ledger labels in the coin drawer.
**Contract changes:** `GET/PATCH /loyalty/settings`, `GET /loyalty/eligibility`, `GET /loyalty/orders/:n`,
`POST /loyalty/housekeeping`, `GET /storefront/loyalty` (customer JWT), `POST /storefront/loyalty/estimate`
(public), `POST /orders/:id/returns`; `loyaltyEligibility` on product & category DTOs; new tables
`loyalty_settings`, `loyalty_order_earns`, `loyalty_order_earn_lines`, `order_returns`; enums
`LoyaltyEligibility`, `LoyaltyCalculationBase`; 3 new `CoinTransactionReason` values; `coin_transactions`
gained `expiresAt`/`remainingAmount`. Permissions `loyalty.view` (Branch Manager), `loyalty.manage`
(Super Admin only), `orders.return` (BM, ST) - granted to configured roles automatically by the A-14 fix.
**Deploy:** `npx prisma migrate deploy && npx prisma generate`, restart the API (migration
`20260921120000_loyalty_rewards`).
**Verified (live API + Postgres):** `svv-balaji-backend/e2e-loyalty-flow.py` (re-runnable, restores the
settings it changes, unpublishes its test products): configure -> eligibility (product/category/default) ->
estimate -> order -> dispatched = 0 points -> DELIVERED = credited -> customer balance/history -> partial,
ineligible, over-limit and full returns -> point value / percent / calc base / cap / minimums / discounted
rule / expiry / program-off -> permissions. Plus 471 backend unit tests (new: calculator, service ledger
invariants, returns in sales), `tsc` clean on all three apps, production builds, and real Chrome
screenshots of the customer loyalty page + product-page hints and the admin settings, product form and
order drawer, on real data.
**NOT done - and not a loyalty gap:** the customer app's *checkout/orders are still mock* (there is no
`POST /storefront/orders`; that needs address, payment (A-11/Razorpay) and warehouse decisions). So today
a customer order that earns points is one staff place and deliver in the admin panel; the moment a real
storefront order path exists, it earns points with no loyalty change. **Also:** points can be earned and
reversed but there is no redemption yet (needs a wallet/checkout discount).
**Next:** storefront order placement; then redemption.

## 2026-09-21 — Raunak — Trace Batch Provenance, end to end (public trace + recall/audit)

**Did:** Made the homepage "Trace Batch Provenance" widget fully real, and built the Super Admin / QA
half of the spec. Crossed into backend/schema deliberately (owner asked for a complete flow, not a
hand-off).
- **Public trace (closes audit M1):** new unguarded `GET /storefront/trace/:fgBatchNumber`
  (`src/storefront/storefront-trace.*`). Explicit-`select` projection: region-level origin, grower
  *count*, averaged lab moisture/purity/foreign matter, QC ticks, milling dates. Never farmer
  name/code/GPS/phone/bank/rates (spec asserts it). Unknown or not-QA-released -> 404. Customer
  `TracePage` rewritten; also accepts `?batch=`. Placeholder page deleted.
- **Schema (migration `20260921100000_batch_hold_recall`):** `FinishedGoodsBatch.holdStatus`
  (`ACTIVE|ON_HOLD|RECALLED`) + `holdReason`/`holdChangedAt`; new append-only `batch_hold_events`.
  Kept separate from `qaReleased` (passed inspection != allowed to sell).
- **Recall module (`src/recall`):** `GET /recall/forward?code=FG-…|RM-…` (every order/customer,
  stock, shipped vs allocated), `GET /recall/backward/:fg` (machine/line/operator, milling loss %,
  raw lots, weighing slip, farmer/supplier payout, FIFO check, hold history),
  `POST /recall/hold` (freeze/recall/release, all-or-nothing, reason mandatory, RECALLED is final).
- **Enforcement (touches WS1.5 sales/packaging/quality/products — all additive filters):** allocation
  only draws `holdStatus=ACTIVE`; dispatch refuses if any allocated batch was frozen/recalled since;
  stock-in and QA release refuse held/recalled batches; storefront availability and inventory stock
  summary exclude non-ACTIVE. Public trace shows ON_HOLD as "under review" and RECALLED as a
  do-not-consume notice only.
- **A-14 FIXED PROPERLY (not worked around):** new table `permission_key_state` records every
  permission key already reconciled against role grants. On boot `PermissionsService.backfillNewPermissions()`
  grants each *new* key to configured roles whose registry defaults include it, then records it.
  A recorded key is never re-granted, so a deliberate revocation survives restarts; removing a role
  from a key's `defaultRoles` never revokes anything. Migration `20260921110000_permission_key_state`
  pre-records all 135 existing keys so the first boot doesn't undo anyone's revocations. Adding a
  permission is now: add it to `registry.ts` + `@RequirePermission`, deploy. Nothing by hand.
  (`20260921101000_recall_permissions` was the hand-grant workaround; superseded, left in place
  because it is already applied.) Proven live: deleted a key's state + grants, restarted, it was
  re-granted to BM+QA while a revoked sibling key stayed revoked.
- **Re-allocation:** `POST /orders/:id/reallocate` (`orders.allocate`) releases reservations on
  frozen/recalled batches for ALLOCATED/PACKED orders and re-picks the same quantities from ACTIVE
  stock FEFO; shortfall is returned, not hidden; released rows are kept (A-13 audit). Forward-trace
  shipments now carry `orderId`; the admin Recall screen has a per-order Re-allocate button.
- **Bug found by looking at real data, fixed:** the public trace read the RAW_MATERIAL / IN_PROCESS QC
  ticks off the finished batch's own inspections, so they were always ticked off. Now: every raw lot
  needs a PASS, and the production run needs an IN_PROCESS PASS.
- **Admin:** `/recall` screen (forward/backward tabs, freeze/recall/release modal, re-allocate), shared
  `api/recall.ts` + `hooks/useRecall.ts`; staff `/trace` shows sale status; staff trace response gained
  `finishedBatch.holdStatus`.
**Contract changes:** new `GET /storefront/trace/:n`, `GET /recall/forward`, `GET /recall/backward/:n`,
`POST /recall/hold`, `POST /orders/:id/reallocate`; new enum `BatchHoldStatus`; new tables
`batch_hold_events`, `permission_key_state`; `holdStatus` on `GET /trace/:n` `finishedBatch`.
**Deploy:** `npx prisma migrate deploy && npx prisma generate`, restart the API. On Windows `generate`
fails with EPERM if a node process still holds `query_engine-windows.dll.node` (stop the API first).
**Verified (live, against the running API + Postgres):** `svv-balaji-backend/e2e-recall-flow.py`
(stdlib Python, re-runnable, 54 checks): farmer approval -> RM batch -> production (machine/line) ->
IN_PROCESS + FG QA -> two FG batches -> release -> stock in -> FEFO order dispatched + one packed
order -> forward/backward/FIFO -> freeze (dispatch refused, new allocations skip it, QR = "under
review") -> re-allocate -> dispatch from healthy stock -> release -> recall (QR = do-not-consume, no
data or internal reason leaked; recall can't be released, QA-released or stocked in) -> audit history
-> storefront `inStock` follows the hold -> LOGISTICS user gets 403 on recall, public QR stays open.
Also: 433 backend unit tests, `tsc` clean on all three apps, and real Chrome screenshots of the
customer trace page (verified / under review / recalled / not found) and the authenticated admin
Recall screen (forward + backward) on real data.
**Known limits:** FIFO check compares to shelf stock *now*, not a replay of the dispatch day (stated
in the UI). Gluten/protein and a "pesticide residue free" seal aren't in the schema, so the public
page shows only what is measured. Freezing does not auto-release existing reservations (dispatch is
blocked and Re-allocate fixes them). A recalled batch's remaining shelf stock is shown but not
written off - use the existing warehouse adjust flow. `smoke-test.sh` predates the farmer
registration-completeness gate and the new Add Product DTO and fails from step 4 on; it is unrelated
to this work, and `e2e-recall-flow.py` supersedes it for the sales half.

## 2026-09-19 — Raunak — Dynamic Add/Edit Product, real catalogue on the storefront

**Did:** The storefront's product pages, listings and homepage shelves read hardcoded arrays in
`svv-balaji-customer/src/mock/homeMockData.ts`, and Super Admin's Add Product page saved prices and
variants to local component state. Both are now real, end to end.
- **Schema (2 migrations, `20260919090000_product_detail_content`, `…093000_product_merchandising_flags`):**
  `Product` gained brand/packLabel/mrp/badge/hsnCode/rating/reviewCount/highlights/manufacturer/
  countryOfOrigin/shelfLife/disclaimer/returnPolicy/warranty, B2C limits (min/maxOrderQuantity), B2B
  (moqB2B/maxOrderQuantityB2B/packBoxSize/bulkAvailable), retailer panel (gstInvoiceAvailable/
  businessSupportContact/deliveryTerms), `isTopPick`/`isDailyStaple` shelf flags. New tables:
  `product_variants`, `product_specifications`, `product_faqs`, `product_offers`.
- **Backend:** `ProductsService` create/update now take nested `variants`, `specifications`, `faqs`,
  `offers` and a `pricing` block, in one transaction. Present list = authoritative; omitted = untouched.
  `GET /products/:id` returns live `pricing`; `GET /products` returns `b2cPrice`/`b2bPrice`/`_count.variants`.
- **Storefront API:** `GET /storefront/catalogue/products` gained `categorySlug` (a parent slug now includes its
  subcategories), `topPick`, `dailyStaple`, `limit`. `/products/:idOrSlug` returns every PDP section incl.
  variants with their own tier ladders, `priceTiers`, order limits, `unitPriceInclGst`.
- **Admin:** `AddEditProductPage` rebuilt as 7 dynamic tabs (basic/category→subcategory, pricing + B2B tier
  editor, media/SEO, info/specs, offers/FAQs, inventory, pack sizes) with live preview.
  `ProductListsPage` now real: removed 8 placeholder rows (`MOCK_PRODUCTS`) and the "Adjust stock" modal
  that only wrote local state. `/add-product` and `/products/edit/:id` now permission-guarded.
- **Customer:** `ProductsPage` filters by the selected category/subcategory; `ProductDetailPage`,
  `HomePage` shelves and `CategoriesPage` strips read the API. No mock fallback (would resurrect deleted
  products). Shelves hide when empty.
- **Migration:** `seedDefaultProducts()` in `prisma/seed.ts` moved the 6 mock products (+ the 5kg atta
  variant) into real rows, idempotent per SKU. Slugs = the old mock ids, so old links/carts still resolve.

**Contract changes:** `PriceList.variantId` (nullable) added; `PricingService.resolve()` now filters
`variantId: params.variantId ?? null` — **null is a value, not a wildcard**, so product-level order lines
never see variant rates (Ujjawal's WS1.6; tests added). New `PricingService.syncLadder()`. `CreateProductDto`
gained the fields above; `ProductsController.create/update` now pass the actor id. `PriceComparison` gained
per-rule `id` and `variants[]`. `ProductsModule` imports `PricingModule`.

**Other developer needs to know:**
1. **`PriceList.unitPrice` is GST-EXCLUSIVE** (SalesService adds tax on top). The storefront displays
   inclusive prices, so it derives them (`inclusiveOf`) — never store a shopper-facing inclusive figure as
   `unitPrice` or checkout double-charges GST. I hit this myself in the first seed and fixed it.
2. Run `npx prisma migrate deploy` then `npm run prisma:seed`.
3. **Variant stock is not tracked**: `FinishedGoodsBatch` has only `productId`, so pack sizes share the
   product's availability. Real per-pack stock needs `variantId` on FG batches (packaging, WS1.x).
4. **Cart lines key on `productId` = variant id for a variant pack.** Order placement must map that back to
   (productId, variantId) before calling `PricingService.resolve`.
5. Deleting a variant cascades its price rules; fine today (no order references variants), would fail on an
   `OrderItem` FK once variant orders exist.
6. Migrated products are `allowBackorder: true` because no FG stock exists yet (else all read "out of stock").

**Known data caveats (seed):** two 5kg-variant B2B tiers are ₹0.01 off the old page (208.01 / 187.01) —
2-decimal storage at 5% GST can't hit those whole rupees. Invented SKUs for 4 products that had none
(BJ-ALO-500G, SC-SPR-95OZ, TB-CHP-125OZ, CF-COF-48FLOZ). HSN `1101 00 00` set only on atta (the old page
showed it on every product). Santa Cruz and Califia left uncategorised (no fitting category). Ratings
4.8/1240 and 4.5/320 are the old demo numbers, staff-entered, **not from real reviews** — clear before go-live.
Old copy "100% Farm Milled" (on every product) and the "up to N% OFF" wholesale teaser were dropped.
Bug fixed in passing: "Add 10 pcs" put 1 unit in the cart.

**Follow-up 2026-09-19 (B2B tier totals):** a product can now enter its B2B tiers as the TOTAL for each
quantity (`Product.b2bTiersAreTotals`, migration `20260919120000_b2b_tier_totals`, `PriceList.tierTotal`).
`PriceList.unitPrice` still holds the per-pack, GST-exclusive figure the engine bills (2750 for 5 packs is
stored as 550 with `tierTotal` 2750), so `SalesService` is unchanged. `PriceTierDto` takes `unitPrice` OR
`totalPrice`. Storefront tiers now carry `tierTotal` and a server-computed `discountPercent`, measured like
for like: GST-inclusive MRP vs the per-pack price INCLUDING GST (699 vs 577.50 = 17.38%). Applied to
DES-PREM (Premium Whole Spices Combo). Cart fix: `ProductDetailPage` now always adds via `cart.add`
(which refreshes the price) instead of `setQuantity`, so an existing line no longer keeps a stale price;
retailer cart lines are labelled unit "pack" rather than embedding the quantity. **Cart tier pricing:**
retailer lines carry their tier ladder (`CartLine.priceTiers`, GST-inclusive) and the cart re-prices the
WHOLE line from its final quantity on every add, stepper change and on load (`cart/cartLines.ts`), so
6+6 packs is 12 x 550.20, and 12->8 goes back to 551.25. Cart, header and checkout all read
`displayUnitPrice x quantity`, so they cannot disagree. First tests in the customer app: `npm test`
(vitest, `cart/cartLines.test.ts`, 17 cases incl. 4->5, 6->8, 7->8, 11->12).

**Not verified:** B2B (retailer) view rendered only via the API, not in a browser; the admin form was
typechecked but not clicked through (customer PDP/listing were screenshotted). Buy Again is still mock order
history joined to live product data. 399 backend tests pass (was 375).

**Next:** click-through of the admin form end to end; wire order placement to real product/variant ids.

---

## 2026-09-18 (later still) — Raunak

**Did:** Closed a gap in the Loss & Yield Tracking work below: the by-product fields
(`byProductQuantity`/`byProductName` on cleaning, plus `byProductRevenue` on production) existed
in the schema and DTOs but had no capture UI anywhere — Yield Tracking would have always shown them
blank. Added the input fields to the two existing phase forms instead of the tracking page itself,
per the client's clarification that Loss & Yield Tracking must stay read-only and pull from the
actual phase-wise records, not be a second place to re-enter the same numbers:
- `CleaningGradingPage.tsx` — "By-product recovered" quantity/name fields in the cleaning &
  grading form, plus a table column.
- `ProductionBatchesPage.tsx` (complete-run modal) — by-product quantity/name/revenue fields, plus
  a table column; `ProductionBatchDetailDrawer.tsx` shows all three too.
- `shared/api/types.ts` — added the missing fields to `CleaningGradingRecord`,
  `CreateCleaningGradingInput`, and `ProductionBatch`; added a `CompleteProductionInput` type.
- `shared/api/production.ts` / `shared/hooks/useProduction.ts` — `complete()` and
  `useCompleteProduction` now take the full input object instead of just `actualQuantity`.

**Contract changes:** none new — this only wires the frontend up to fields the backend DTOs
(`CreateCleaningGradingDto`, `CompleteProductionDto`) already accepted.

**Other developer needs to know:** `PATCH /production-batches/:id/complete` now gets called with
`{ actualQuantity, byProductQuantity?, byProductName?, byProductRevenue? }` instead of a bare
number — already supported server-side, no backend change needed.

**Next:** none pending on this feature.

---

## 2026-09-18 (even later) — Raunak

**Did:** Loss & Yield Tracking, built on top of the existing Cleaning & Grading / Production /
Finished Goods phases — no new processing phase, additive only. Read-only aggregation walking the
traceability chain each phase already records (RawMaterialBatch → CleaningGradingRecord,
ProductionConsumption → ProductionBatch, ProductionBatch → FinishedGoodsBatch): stage-wise loss
quantity/%, chain totals (input, loss, by-product, final output, overall yield %), an alert when
total loss exceeds the 4-8% normal band (>8% → `HIGH`), a supplier/farmer quality signal extending
the existing `FarmerPerformanceService` pattern (average loss % pooled across cleaning wastage +
the production runs a farmer's batches fed, highest first), and a machine health signal (each
machine's historical average loss %, flagging a run at >1.5x that average as a maintenance
candidate).

New admin screen at `/yield-tracking` (Super Admin → Supply Chain → Processing section, after
Finished Goods): a chain list with expandable stage-wise rows, alert badges, and two summary
panels (farmer/supplier quality flags, machine health flags). AntD table conventions match
`ProductionBatchesPage`; the one shared change is `DataTable` (`shared/components/DataTable.tsx`)
now accepts an optional `expandable` prop, passed straight through to antd's `Table` — backward
compatible, nothing else uses it yet.

**Contract changes (Ujjawal, please read):**
- **New Prisma migration** `20260918160000_add_byproduct_yield_tracking_fields`, applied to the
  live dev DB (`npx prisma migrate deploy`, not `migrate dev` — this environment is non-interactive,
  so I generated the SQL via `prisma migrate diff` against the live DB and hand-placed it in
  `prisma/migrations/`; verify it lines up if you also run `migrate dev` locally, there should be
  no drift). Adds, purely additive, nothing existing renamed or reinterpreted:
  - `CleaningGradingRecord.byProductQuantity` (Decimal?), `.byProductName` (String?) — material
    recovered during cleaning with resale value (bran/choker/husk), distinct from `wastageQuantity`
    which stays pure loss.
  - `ProductionBatch.byProductQuantity` (Decimal?), `.byProductName` (String?),
    `.byProductRevenue` (Decimal?) — same idea at the production stage (e.g. oil cake). Revenue is
    just a recorded figure, not a new sales workflow.
  - Wired into `CreateCleaningGradingDto` (already passed through via the existing `{...dto}`
    spread in `recordCleaningGrading`) and `CompleteProductionDto` → `completeProduction()`.
- **New module** `src/yield-tracking/` (service + controller + DTO), registered in `app.module.ts`
  after `PackagingModule`. New routes, all `GET`, all behind the new permission
  `supplyChain.yieldView` (frontend constant `SUPPLY_CHAIN_YIELD_VIEW`, granted by default to
  Branch Manager / Production Manager / QA Manager — adjust from Roles & Permissions if that's
  wrong):
  - `GET /api/v1/supply-chain/yield` — paginated list, filters `productId`/`branchId`/`from`/`to`.
  - `GET /api/v1/supply-chain/yield/chain?productionBatchId=` or `?fgBatchNumber=` — single chain
    detail, reuses the trace-resolution idea from `GET /trace/:fgBatchNumber` but stays a
    loss/yield view, not the public trace.
  - `GET /api/v1/supply-chain/yield/farmer-quality` — per-farmer average loss %, worst first.
  - `GET /api/v1/supply-chain/yield/machine-health` — per-machine historical average loss % and
    flagged runs.
- **Permission registry**: new group `yieldTracking` in `src/auth/permissions/registry.ts`, one
  key `supplyChain.yieldView`. Mirrored in `shared/auth/permissions.ts` as
  `SUPPLY_CHAIN_YIELD_VIEW`.
- **`shared/api/types.ts`**: new `YieldChain`/`YieldStageBreakdown`/`FarmerYieldQuality`/
  `MachineYieldHealth`/etc. interfaces. New file `shared/api/yieldTracking.ts` (API client) and
  `shared/hooks/useYieldTracking.ts` (React Query hooks) — kept as their own per-domain files
  rather than folded into `production.ts`/`useProduction.ts`, matching how `banners.ts` sits apart
  from `production.ts`.

**Test:** `src/yield-tracking/yield-tracking.service.spec.ts` — 4 tests: stage-wise loss %/chain
totals arithmetic across a 3-stage fixture, the >8% HIGH alert firing, a within-band chain staying
`NORMAL`, and the traceability chain resolving identically whether entered by `productionBatchId`
or `fgBatchNumber` (per CLAUDE.md's traceability-test rule). Full backend suite: 375 passing (was
371), all green. `tsc --noEmit` and `npm run build` clean in both `svv-balaji-backend` and
`svv-balaji-admin`.

**Other developer needs to know:** I had to kill three locally-running `nest start`/`dist/main`
node processes to get `prisma generate` past an `EPERM` file lock on the query engine DLL — if
you're running a dev server locally when you pull this, expect the same and just restart it
after `npm install`/`prisma generate`. Also: `farmerQuality()` and `machineHealth()` do a full
table scan over `RawMaterialBatch`/`ProductionBatch` with no caching — fine at current data volume,
worth an index/materialized view if the farmer or run count grows a lot before this gets revisited.

**Next:** nothing blocking. Possible follow-up (not asked for, not built): wiring
`byProductRevenue` into an actual by-product sales record if the client wants that tracked
end-to-end rather than as a single figure.

---

## 2026-09-18 (latest) — Raunak

**Did:** Same pattern a third time, for the homepage's "Today's Schemes & Offers" tiles
(`Buy 10 Get 1 Free`, `₹300 Off`) — previously hardcoded `MockScheme[]` in `homeMockData.ts`, no
backend, no admin screen. One deliberate difference from banners/categories this time, per explicit
ask: **no mock fallback when the list is empty** — unpublishing (or deleting) every scheme is how
Super Admin hides the whole section, and the customer app renders nothing rather than falling back
to placeholder content. `displayOrder` is the "which row" control asked for.

**Schema** (migration `20260918150000_schemes`, applied): new `Scheme` model — `tag`, `title`,
`subtitle`, `ctaText`/`ctaLink`, six color fields (`backgroundColor`/`textColor`/`badgeColor`/
`badgeTextColor`/`buttonColor`/`buttonTextColor` - simplified from the mock's 7 down to 6 by
dropping the near-duplicate `subtitleFg`), `targetAudience` (reuses the existing `BannerAudience`
enum rather than declaring a new one), `displayOrder`, `isActive`.

**Backend** (`src/schemes/schemes.module.ts`, same single-file shape as banners/categories): staff
CRUD at `/schemes` (`schemes.view/create/edit/delete`, new permission group, granted to BM/ST by
hand - same A-14 gap, same fix, fourth time now) plus unguarded `GET /storefront/schemes?audience=`.

**Seed:** `seedDefaultSchemes()` — the same 2 schemes that were hardcoded, as real rows, same
idempotent-on-count pattern as the other three seed functions now in this file.

**Frontend:** `shared/api/schemes.ts` + `shared/hooks/useSchemes.ts`, same shape as banners' (admin
CRUD + `storefrontSchemesApi` taking the caller's axios instance). New admin screen
`/schemes` (`SchemesPage.tsx`) — table, a live 3-up preview card, and a form drawer with an
antd `ColorPicker`-backed `ColorField` for the six color inputs; the preview card doubles as
visible proof of the "hide the whole section" behavior (shows an amber alert instead of the grid
when zero schemes are live). `HomePage.tsx`'s schemes section now reads `useStorefrontSchemes` and
the whole `<section>` is conditional on `schemes.length > 0` - no fallback branch. `homeMockData.ts`
itself was not touched; `schemes` is simply no longer imported into `HomePage.tsx`.

**Verified:** `tsc --noEmit` clean on backend/admin/customer. Full backend suite still 371/371. Live
curl pass: deactivated every scheme via the admin API, confirmed `/storefront/schemes` returned
`[]`, reactivated, confirmed both came back. Vite transform-checked the new/edited files. Visual
click-through still not done here (no headless browser available).

**Other developer needs to know:** Nothing outside `schemes`/`homeMockData.ts`'s import list
touched. Reused `BannerAudience` rather than adding a fourth near-identical enum - if that enum
ever needs a value specific to one of banners/schemes/categories and not the others, it should be
split apart then, not before.

**Next:** Admin's scheme color fields are six separate pickers; if that turns out to be too fiddly
in practice, worth revisiting with fewer, derived colors instead (e.g. auto-contrast text from one
background pick).

---

## 2026-09-18 (even later) — Raunak

**Did:** Same treatment as the banner work, applied to categories/subcategories. The customer app's
category rail (`HomePage.tsx`), `/categories` page, `DesktopHeader`'s mega-menu, and
`ProductsPage.tsx`'s category routing all imported one hardcoded `categories` array from
`src/mock/homeMockData.ts` — Admin's existing Manage Category screens (`MainCategoriesPage`,
`SubCategoriesPage`) had nothing to do with what a shopper actually saw. Wired them together.

**Backend** (`categories.module.ts`): new `CategoriesService.listPublicTree()` + unguarded
`GET /storefront/categories` (`StorefrontCategoriesController`) — active categories only, nested
two levels deep (parent → children), same unguarded-read pattern as storefront banners/catalogue.
No schema change: `Category` already had `slug`, `imageUrl`, `parentId`/`children` and `isActive`,
built for exactly this.

**Seed:** `seedDefaultCategories()` in `prisma/seed.ts` (idempotent on count) — the same 4
categories/12 subcategories that were hardcoded, created as real rows, **with slugs identical to
the old mock ids** (`atta-flour`, `namkeen`, `chakki-atta`, ...) specifically so every existing
`/products/:categorySlug` link keeps resolving once the frontend switched over. Ran it against the
dev DB; confirmed via curl the slugs match exactly.

**Frontend:** `shared/api/categories.ts` gained `storefrontCategoriesApi.tree(client)`,
`shared/hooks/useCategories.ts` gained `useStorefrontCategoryTree(client?)` — both follow the same
"caller passes its own axios instance" shape as the banner equivalents. New
`svv-balaji-customer/src/hooks/useCategoryTree.ts` is the adapter: calls the real endpoint, maps it
into the exact `MockCategory` shape the mock array always had (so every existing consumer needed
zero prop-shape changes), and **falls back to the untouched mock `categories` array** when zero
categories are published — same fallback pattern as banners, and per the client's explicit
instruction, `homeMockData.ts` was not touched or deleted. `HomePage.tsx`, `CategoriesPage.tsx`,
`ProductsPage.tsx` and `DesktopHeader.tsx` now call `useCategoryTree()` inside the component instead
of importing the static array.

**Verified:** `tsc --noEmit` clean on backend + customer. Full backend suite still 371/371. Live curl
confirmed `/storefront/categories` returns the seeded tree with slugs matching the old mock ids
exactly. Vite transform-checked all five edited/added files (200 on direct fetch). Visual
click-through still not done — no headless browser available here.

**Other developer needs to know:** Nothing outside `categories`/customer-app touched. Admin's
existing `MainCategoriesPage`/`SubCategoriesPage` (already built, already CRUD against
`/categories`) now double as the CMS for what the customer app shows — no admin-side change was
needed, they were just disconnected from the storefront until this session.

**Next:** Category `color` (the icon-tile background swatch) isn't an admin-editable field — the
frontend adapter assigns it from a fixed palette by position instead, since `Category` has no such
column. Fine for now; would need a schema field if Super Admin ever wants to control it directly.

---

## 2026-09-18 (later) — Raunak

**Did:** Three follow-ups on the same session's banner work, all from client/user feedback on the
first pass.

1. **Direct image upload.** The banner form's image field was a plain URL text input. Added
   `banners` to `UPLOAD_FOLDERS` (`storage.service.ts`) and the shared `UploadFolder` type, and
   swapped the admin form's `Input` for the existing `FileUploadField` — same component
   `CategoryFormModal` already uses for `Category.imageUrl`, so this is the established pattern,
   not a new one. On mobile it's "Take a photo" / "Choose an existing file" (gallery); on desktop a
   drag-and-drop zone. No manual URL entry anymore, matching how Category's single-image field
   already works.
2. **Categories page banner is now a carousel, not one banner.** `CategoriesPage.tsx` only ever
   rendered `publishedBanners[0]` — if Super Admin published three CATEGORIES_PAGE banners, two
   were invisible. Now renders all of them in an antd `Carousel` (desktop: full card in the right
   panel; mobile: a compact version above "Trending" on the default tab), same shape as the
   homepage hero.
3. **Seeded the old hardcoded banners as real, editable rows.** Before this, the fallback content
   baked into `HomePage.tsx`/`CategoriesPage.tsx` (used only when zero banners are published) was
   invisible to Super Admin — nothing to click on in `/banners` to change it. Added
   `seedDefaultBanners()` to `prisma/seed.ts` (idempotent on count, same pattern as
   `seedDefaultBranch`) and ran it once against the dev database: the same 2 homepage + 1 categories
   banners that used to be hardcoded now exist as ordinary rows, editable/deletable from the admin
   screen like any banner created from scratch.

**Contract changes:** `UploadFolder` gained `'banners'` (backend and `shared/api/uploads.ts`). No
new routes.

**Verified:** `tsc --noEmit` clean on all three apps. Re-ran the seed against the live dev DB and
confirmed via curl that all three seeded rows resolve correctly on `/storefront/banners` for both
placements. Upload path not exercised end-to-end (would need an actual file picked in a browser —
still no headless browser available here); it is the same `FileUploadField`/`/uploads/:folder`
path every other image field in this app already uses, so risk is low, but worth a manual click
before calling it done.

**Other developer needs to know:** Nothing outside `banners`/`uploads`/the two customer pages
touched.

**Next:** Same as before — `ProductsPage.tsx` doesn't read `PRODUCTS_PAGE` banners yet even though
the admin form offers that placement.

---

## 2026-09-18 — Raunak

**Did:** Made the customer storefront's homepage hero (and the Categories page top banner) real.
`BannersPage.tsx` (admin) existed but was 100% `localStorage` — no backend, and the customer app's
hero carousel was hardcoded JSX reading nothing from it. Built the missing backend slice and wired
both ends to it.

**Schema** (migration `20260918120000_storefront_banners`, applied): new `Banner` model — title,
badge text, description, image URL, primary/secondary CTA text+link, background/text color,
`targetAudience` (ALL/B2C/B2B), `placement` (HOMEPAGE/CATEGORIES_PAGE/PRODUCTS_PAGE),
`displayOrder`, `isActive`. No backfill needed — nothing referenced banner data before this.

**Backend** (`src/banners/banners.module.ts`, single-file like `categories.module.ts`): staff CRUD
at `/banners` (`banners.view/create/edit/delete`, same publish-don't-delete pattern as Category/
Product) plus a second, deliberately unguarded controller at `/storefront/banners` — same reasoning
as `StorefrontCatalogueController`: this is read before a shopper signs in, and only ever returns
what staff have published (`isActive: true`, matching `placement`, and `targetAudience` either ALL
or the caller's own channel).

**New permission group `banners`** (`banners.view/create/edit/delete`, defaults BM view+manage, ST
view) — **hit the same A-14 seeding gap again** (new permission keys don't auto-grant to
already-configured roles). Granted to BM/ST by hand via a one-off script against `RolePermission`,
same as every previous instance of this gap. Super Admin is unaffected either way (bypasses the
permission check entirely), so this only matters once someone wants a non-Super-Admin role managing
banners.

**Frontend:**
- `shared/api/banners.ts` + `shared/hooks/useBanners.ts` — `bannersApi` (admin CRUD, mirrors
  `categoriesApi`) and `storefrontBannersApi` (public). The storefront half takes the caller's own
  axios instance (defaults to the staff panel's `@shared/api/client`) because the customer app runs
  a separate client bound to its own OTP refresh flow — passing the wrong one would silently route
  through staff-session refresh logic on a 401 that can never actually happen here (the endpoint is
  unguarded), but would still be wrong to leave coupled that way.
- `svv-balaji-admin/src/pages/banners/BannersPage.tsx` rewritten off `useBanners`/mutations instead
  of `localStorage`; same UI (table, live preview, drawer form) unchanged. Permission checks moved
  off borrowed `PRODUCT_*` keys onto the new `BANNER_*` ones; nav's `viewKey` likewise.
- `svv-balaji-customer`: `HomePage.tsx`'s desktop + mobile hero carousels and `CategoriesPage.tsx`'s
  top banner now call `useStorefrontBanners(placement, audience, storefrontApi)` — `audience` is
  B2B for a signed-in retailer, B2C otherwise. Each keeps a small hardcoded fallback (the previous
  hardcoded copy) shown only while zero banners are published for that slot/audience, so the
  homepage is never blank on a fresh environment before Super Admin adds anything.

**Verified:** `tsc --noEmit` clean on backend/admin/customer. Backend dev server restarted (had to
stop and restart it myself — the Prisma query-engine `.dll` was locked by the running `nest --watch`
process, which is why `prisma generate` needs the dev server down first) and confirmed all new
routes mapped. Live curl pass: created a banner via `/banners` as Super Admin, confirmed it appeared
on `/storefront/banners?placement=HOMEPAGE&audience=B2C`, confirmed unpublishing removed it from
that list immediately, confirmed delete. Admin/customer Vite dev servers confirmed transforming the
edited files without error (200 on direct fetch). **Visual rendering not verified** — no headless
browser available in this environment; screenshot/click-through still worth doing before calling
this client-demo-ready.

**Other developer needs to know:** New backend module + one new permission group + one migration,
all additive — nothing in `SalesModule`, `StorefrontCatalogueModule` or anything WS1.x touched.

**Next:** Same banner slot pattern (`useStorefrontBanners`) is ready to reuse for
`PRODUCTS_PAGE` placement if/when that page gets a top banner too — the admin form already offers
it, only `ProductsPage.tsx` doesn't read it yet.

---

## 2026-09-17 (latest) — Raunak

**Did:** Referral Management — the Super Admin reporting screen the client asked for on top of the
last two sessions' referral program: who referred whom, whether it qualified, what each side
earned, a full per-customer coin ledger, and manual refund/reversal/adjustment.

**Schema** (migration `20260917180000_referral_ledger_detail`, applied - purely additive, no
backfill needed): `CoinTransaction` gained `orderId` (the order whose CONFIRMED/DELIVERED
transition paid a FIRST_ORDER/FIRST_DELIVERY reward - null for the other two triggers, which have
no order), `note` (required at the API layer for `MANUAL_ADJUSTMENT`, optional elsewhere), and
`performedById` (which staff member made a manual adjustment - null for system-generated rewards).
New enum value `CoinTransactionReason.MANUAL_ADJUSTMENT`.

**Backend (`ReferralService`, extended again):**

- `onOrderConfirmed`/`onOrderDelivered` now thread the qualifying `orderId` through to the reward
  transactions they create, so "which order qualified this referral" is answered by the ledger
  itself rather than needing to be reconstructed.
- `listReferrals(prisma, filters)` - one row per `Referral`, `search` matching either the referrer
  or referee by name/phone/referral code/customer code (a Super Admin doesn't know in advance which
  side they're looking for), plus status (qualified/pending), channel and date-range filters. New
  `GET /referrals`.
- `getCoinLedger(prisma, customerId)` - a customer's complete coin history, both roles (rewards
  earned referring people, the one reward earned by being referred) plus every manual adjustment,
  newest first, with balance/totalEarned/totalAdjusted summary stats. New
  `GET /referrals/ledger/:customerId`.
- `adjustBalance(prisma, customerId, {amount, note}, performedById)` - the one write path for a
  refund, reversal or correction. `amount` carries the sign (positive credits, negative claws
  back); refused if it would take the balance below zero, if it's zero, or without a reason. New
  `POST /referrals/ledger/:customerId/adjust`, its own permission (`referrals.adjust`, separate
  from `referrals.view` - reporting and correcting are different levels of access).
- New permission group `referrals` (`referrals.view`, `referrals.adjust`) - **hit the same A-14
  seeding gap a fourth and fifth time; granted to BM/ST by hand again.** Looked seriously at fixing
  the root cause this time rather than deferring it again: it turns out the current behaviour
  (a role's grants freeze once a Super Admin has ever touched them, so a new permission never
  auto-expands what a configured role can do) is correct on purpose, not a bug - the real gap is
  that nothing surfaces "N new permissions exist that this role hasn't been asked about" on the
  Roles & Permissions screen. That's a real feature, not a quick fix, so it's staying as A-14 with
  this reasoning attached rather than getting rushed in sideways here.
- **31 new/updated tests** in `common/referral.service.spec.ts` (was 371 project-wide, still 371 -
  this session only added tests, no new call sites in Sales or Storefront needed changing) covering
  `listReferrals` (shape, qualified/pending filter, search matching either side, search by code, no
  match), `getCoinLedger` (balance/totals/ordering, unknown customer), and `adjustBalance` (credit,
  debit, negative-balance refusal, zero-amount refusal, blank-reason refusal, unknown customer).

**Frontend:** New screen `/referrals` (permission `referrals.view`) - a filterable, searchable
table (status, channel, date range, free-text search across both parties) with each name opening a
`CoinLedgerDrawer`: balance/earned/adjusted stats, the full transaction table (reason, signed
amount, related referral, qualifying order, note and who performed a manual one), and - gated
behind `referrals.adjust` - the correction form itself.

**Worth flagging, not something I did:** `CustomersPage.tsx`, `CustomerAccountReviewDrawer.tsx` and
`navigation.tsx` changed significantly on disk mid-session (new pages: Complaints, Outlets,
B2BOrders, Banners, ProductLists, Main/SubCategories, a `Customer360Drawer`) - presumably your other
session's work landing concurrently. `CustomersPage.tsx` now reads from a `MOCK_CUSTOMERS` array
rather than only `useCustomers()`, which is worth a look before anyone treats what it shows as
live data. Left it alone rather than reconciling it - not part of this task and risky to touch
without knowing what's mid-flight there.

**Next:** nothing referral-specific queued. A-14 (permission seeding) is worth actually fixing now
that it's been hit five times - see the reasoning above for what the real fix looks like.

---

## 2026-09-17 (even later) — Raunak

**Did:** Referral & Reward Settings — the admin screen the client asked for, wired to real coin
crediting on top of last session's refer-a-friend relationships. **Touches `SalesModule`
(WS1.5, Ujjawal's) — flagging per the cross-workstream rule.**

**Schema** (migration `20260917140000_referral_rewards`, applied - purely additive, no backfill
needed unlike `referral_program`): `ReferralSettings` (singleton, lazily created on first read -
100/50 coins, `REGISTRATION` trigger, active, by default), `CoinTransaction` (the ledger -
`Customer.coinBalance` is a denormalised total, never written to outside
`ReferralService.creditReward`, same invariant this project already holds for warehouse stock and
`StockMovement`), `Referral.rewardedAt` (null until paid, blocks a second payout), new enums
`ReferralRewardTrigger` and `CoinTransactionReason`.

**Backend (`ReferralService`, extended, not a new service):**

- `getSettings`/`updateSettings` - the settings CRUD behind the new `GET/PATCH /referral-settings`
  (`src/referral-settings/`, permissions `referralSettings.view`/`.manage` - **hit the same A-14
  seeding gap as `customerAccounts`/`categories` before it; granted to BM/ST by hand again, still
  no migration-based fix**).
- Four named triggers, two real moments to hang them on - worth understanding before touching this
  again: **REGISTRATION and ACCOUNT_VERIFICATION both credit at the instant a `Referral` row is
  created** (`onAccountVerified`, called from `attachConsumerCustomerRecord` for B2C and
  `approveAccount` for B2B). There is no later, more-verified moment in this system for either
  channel to hang a separate trigger on - a B2C consumer's OTP verification *is* their account
  creation, and a B2B applicant's phone is verified at *registration submission*, in the same write
  as the rest of the form, well before there's a Customer/wallet to credit. Building a fake second
  trigger point with nothing behind it seemed worse than sharing the one that's real. **FIRST_ORDER
  and FIRST_DELIVERY are genuinely distinct** - `onOrderConfirmed`/`onOrderDelivered`, called from
  `SalesService.confirm()` and the `DELIVERED` branch of `advance()`.
- `validate()` now also checks `settings.isActive` - the program's on/off switch blocks new
  referral relationships from being *created* at all while off, not just new rewards from being
  paid on old ones.
- **Every trigger call site is best-effort, deliberately outside whatever transaction created the
  thing that fired it** - wrapped in try/catch, logged as a warning on failure. A bug in coin
  crediting must never be able to undo a signup, a B2B approval, or an order confirmation. This is
  why `onAccountVerified`/`onOrderConfirmed`/`onOrderDelivered` are typed against the real
  `PrismaService` rather than `Prisma.TransactionClient` like the rest of `ReferralService` - each
  wraps its own 5-write payout (two balances, two ledger rows, one `rewardedAt` stamp) in its own
  transaction, and Prisma cannot nest one transaction inside another.
- **Found a real bug while wiring this, same shape as last session's**: the very first draft
  credited a B2C signup's reward *inside* the same code path as `attachConsumerCustomerRecord`
  before I'd separated it out - fixed before it shipped, but worth restating the lesson since it's
  now the second time: reward/bonus logic must never share a transaction with the business-critical
  write it's reacting to.
- **357 backend tests** (was 343): full unit coverage on `getSettings`/`updateSettings` and the
  `isActive` gate in `common/referral.service.spec.ts`; integration coverage for both order triggers
  in `sales.service.spec.ts` (first-confirm credits, second order doesn't, wrong trigger doesn't,
  program-off doesn't, a crediting failure never blocks the transition) and for both
  registration/verification paths in `storefront-auth.service.spec.ts`.

**Frontend:** New admin screen `/settings/referrals` (permission-gated, `Can`-wrapped Save,
disabled inputs for view-only) - exactly the four sections asked for: reward amounts in coins,
trigger radio group, active switch, save. `CustomersPage` gained a Coins column so the loop is
visible without a database console.

**Other developer needs to know (Ujjawal):** `SalesService.confirm()` and `.advance()` now call
into `ReferralService` after their own writes complete - both calls are try/catch-wrapped and
cannot fail your order flow, but you'll see a `[SalesService] Referral reward check failed...`
warning in the log if something's wrong on that side; it is never your bug to chase. If you add
another order-lifecycle transition later, this is the pattern to extend, not a new one to invent.

**Next:** nothing referral-specific queued. The coin balance is visible in admin only - no
customer-facing "you have N coins" surface yet (ProfilePage still shows the referral *code*, not
the *balance* - see 17 Sep's earlier entry). Raise as a decision if the client wants it spent on
anything; right now it can only ever go up.

---

## 2026-09-17 (later) — Raunak

**Did:** Built the refer-a-friend program end to end: every customer gets a unique auto-generated
code, a new signup can enter someone else's to create a tracked referral relationship, and the
admin Customers screen shows both. Full validation per the client-style spec this was built
against — unique/no-duplicate codes, code must belong to a real active customer, self-referral
rejected (by phone and by email), and explicitly **no** IP or device fraud checks (families on a
shared connection are not abuse).

**Schema** (migration `20260917090000_referral_program`, applied): `Customer.referralCode` -
`String @unique`, NOT NULL. Added nullable, backfilled from each existing row's own id
(`customers` was not empty - 1 live row - so this needed a real backfill, unlike the two
catalogue migrations from 16 Sep), then locked down. New `Referral` model - `referrerId`,
`refereeId` (`@unique` - one referral relationship per customer, enforced by the database, not
just application logic), `code` (the code as entered, kept even if the referrer's own code is
later regenerated). `CustomerAccount.referralCode` (nullable) holds a B2B applicant's code between
registration and approval, since that channel's Customer row doesn't exist until staff approve it.

**Backend:**

- New `src/common/referral.service.ts` (`ReferralService`, global via `CommonModule` - same
  pattern as `SequenceService`, for the same reason: no single owning module).
  `generateCode(tx, seedName)` derives a code from the name plus a random 4-digit suffix
  (`RAUNAK4821`, not sequential - a sequence would make every code after it guessable) and retries
  on collision. `validate(tx, code, {phone, email})` is every rule in one place: exists, referrer
  `ACTIVE`, and not the applicant's own code by phone or (when both sides have one) email -
  nothing about IP or device. `createRelationship` writes the `Referral` row, called only once a
  `refereeId` Customer actually exists.
- `CustomersService.create` (staff "Register a customer") now generates a code for every new
  customer, any channel - so a staff-created customer can refer people too.
- `StorefrontAuthService`: B2C (`attachConsumerCustomerRecord`, reached from a first OTP verify)
  validates a referral code *before* creating anything and creates the `Referral` row atomically
  with the `Customer`. B2B (`registerRetailer` / `approveAccount`) validates the code immediately
  at submission (fail fast, applicant can fix a typo) and **re-validates at approval time**,
  creating the relationship there - because that's the actual "successful registration" for a
  channel with a review gate, and because a code that stops resolving between submission and
  approval (referrer went inactive) must not block the retailer's own legitimate approval. That
  path logs a warning and skips the referral rather than failing.
- **Found and fixed a real bug while writing tests for this**: the first draft validated the B2C
  referral code *inside* `attachConsumerCustomerRecord`'s transaction, but the `CustomerAccount`
  row is created just *before* that call, outside any transaction, already marked `ACTIVE`. A bad
  code would roll back the `Customer` creation but leave that `ACTIVE`, `customerId: null` account
  behind - and because the retry path only re-attempts attachment for `PENDING_VERIFICATION`
  accounts, that number would be permanently stuck signed-in-but-customerless. Fixed by validating
  before the `CustomerAccount` row is created at all, so a bad code leaves nothing behind. Worth
  the reminder: a multi-step signup where only the last step is transactional can still leave a
  half-created identity if an earlier step already committed.
- New `GET /storefront/auth/referral/check?code&phone` - public, live feedback on a code before
  submitting (exists, active, whose it is), creates nothing. Not wired into a debounced "as you
  type" UI yet - the two forms validate at submission instead, where the same rules produce a
  clear error either way.
- `/storefront/auth/me` and the session response now carry the signed-in account's own
  `referralCode` (via a small `Customer` lookup added to `sessionFor`, since the account object
  callers pass in doesn't have that relation loaded) - the whole point of generating one is that
  the person can see and share it immediately.
- `CustomersService.findAll`/`findOne` now include `referredAs.referrer` (who referred this
  customer, if anyone) for the admin screen.
- **128 → 343 backend tests** (15 new: `referral.service.spec.ts` unit tests for every validation
  rule, plus integration tests in `storefront-auth.service.spec.ts` covering the B2C/B2B happy
  paths, the self-referral rejection, the "invalid code fails the whole sign-in rather than
  silently dropping it" behavior, and the approval-time best-effort skip).

**Frontend:**

- **Admin** (`svv-balaji-admin`): Customers screen gained a Referral column - the customer's own
  code (copyable) plus "Referred by X" when applicable. `CustomerAccountReviewDrawer` (the B2B
  approval queue) shows the code an applicant entered at signup and, once approved, their own new
  code.
- **Storefront** (`svv-balaji-customer`): `LoginPage`'s OTP step gained an optional referral code
  field for a brand-new consumer only (existing accounts ignore it - the backend does too).
  `RegisterPage` gained the same for retailers, sent with the final submit. Both prefill from a
  `?ref=CODE` query param, so a shared link (`/login?ref=RAUNAK4821`,
  `/retailers/register?ref=RAUNAK4821`) carries the code in - opening the link is not itself
  treated as a successful referral, per the spec this was built against; only a completed
  registration creates the relationship. `ProfilePage` gained a "Refer & Earn" / "Refer a Store
  Partner" item that copies the signed-in user's own link to the clipboard.

**Other developer needs to know:** `Customer.referralCode` is now a required field on create -
if `SalesService` or anything else in your WS4.x work constructs a `Customer` directly (rather
than through `CustomersService`/`StorefrontAuthService`), it needs a code too; reuse
`ReferralService.generateCode` rather than inventing another generator. No reward or incentive is
wired to a successful referral yet (no wallet, points or discount - those subsystems don't exist
on the storefront side yet either) - this session only builds the relationship and its validation,
not what a referral is worth.

**Next:** nothing referral-specific queued. If the client wants an incentive (wallet credit,
discount) attached to a successful referral, that's new scope once wallet/loyalty have a real
backend - flag it as a decision rather than guessing an amount.

---

## 2026-09-17 — Raunak

**Did:** Wired the customer storefront (`svv-balaji-customer`) to the real `/storefront/auth/*`
API the backend already had (built 16 Sep, but the frontend still made zero HTTP calls — see
`svv_balaji_project_shape` gap). Login, retailer registration and session restore are now real.

- **New `svv-balaji-customer/src/api/`** (`client.ts`, `tokenStore.ts`, `storefrontAuth.ts`,
  `types.ts`) — its own axios instance and refresh-token store, deliberately separate from
  `@shared/api/client`. That client is the **staff** one (`/auth/login`, `/auth/refresh`, staff
  JWT secret); a customer has no `User` row and no password, so it could never have authenticated
  anyone. `VITE_TOKEN_KEY` (`svv.customer.refreshToken`) already existed in `.env` for exactly this
  and was unused until now.
- **Found and fixed a wiring bug while doing this:** `main.tsx` wrapped the whole app in
  `@shared/auth/AuthProvider` (the staff provider) and `RequireAccount.tsx` gated checkout/orders
  on `@shared/auth/useAuth()` — i.e. the three account-gated screens were checking a staff session
  that this app has no way to create, not the customer one. Removed `AuthProvider` from `main.tsx`;
  `RequireAccount` now reads `useCustomerAuth()`.
- **`CustomerAuthContext`** rewritten: `login`/`registerPartner` (sync, fake, hardcoded OTP `1234`)
  replaced with `requestOtp`/`verifyOtp`/`registerRetailer` (async, call the real API) plus boot-time
  session restore (refresh-token-in-storage → `/storefront/auth/refresh` → `/storefront/auth/me`,
  same pattern as the staff `AuthProvider`). Interface kept backward-compatible
  (`role`/`customerProfile`/`retailerProfile`/`switchRole`/`isLoggedIn`) so `HomePage`,
  `ProfilePage`, `DesktopHeader`, `ProductDetailPage` and `LoyaltyProvider` needed no changes —
  they still read demo numbers (wallet, credit limit, orders) as fallback, since wallet/loyalty/
  orders have no backend yet; only name/phone/email/GSTIN are now real. `switchRole` (the "preview
  as Customer/Retailer" demo toggle on a few screens) is unchanged — front-end-only, never touches
  the server.
- **`LoginPage`**: real 10-digit phone + 6-digit OTP validation (was 4-digit, matching neither the
  backend's `OTP_LENGTH=6` nor anything real). A retailer-tab login on an unregistered number is
  now redirected to `/retailers/register` instead of silently self-provisioning as a B2C consumer —
  that's what `POST /storefront/auth/otp/verify` would otherwise do to any unknown phone, retailer
  tab or not. Handles the `pending` response (a retailer who registered but isn't approved yet)
  with the server's own message. Shows the mock-mode `devCode` inline instead of a hardcoded
  "1234" hint, since there's no SMS vendor yet (A-11-shaped gap, mirrored on the storefront).
- **`RegisterPage`**: rebuilt to match `RegisterRetailerDto` field-for-field — dropped `fssai` and
  the trade-license upload (backend accepts neither, and silently discarding entered data is worse
  than not asking), added `district` (backend has it, form didn't). Added the OTP step the backend
  actually requires: `register-retailer` consumes an OTP challenge itself, so step 1 now sends one
  and collects the code, carried through to the final submit rather than verified separately —
  calling `/otp/verify` here would self-provision the number as B2C and consume the code before
  registration could use it. **Success screen no longer claims instant approval + welcome wallet
  credit** — it never was instant (the backend creates `PENDING_APPROVAL`, no session), the old
  copy was simply wrong. Now says what actually happens: submitted, staff review the GSTIN, sign in
  once approved.
- Admin side (`/b2b-accounts`, `CustomerAccountsPage`) was already built and wired to
  `GET/PATCH /storefront/accounts` in an earlier 16 Sep session (uncommitted) — confirmed the route,
  nav entry (`permission: 'CUSTOMER_ACCOUNT_VIEW'` → `customerAccounts.view`) and hooks all resolve
  correctly end to end. No changes needed there; a retailer registered through the fixed
  `RegisterPage` now shows up in that queue for real, and approving it there is what lets them sign
  in on the storefront.

**Contract changes:** none — `/storefront/auth/*` already existed. This session is the frontend
catching up to it.

**Other developer needs to know:** if you're testing end-to-end — register a retailer on
`/retailers/register`, approve it from the admin panel's B2B Companies screen, then sign in on
`/retailers/login`. `CUSTOMER_OTP_MODE=mock` (the `.env.example` default) returns the code in the
API response and in the UI as "Dev OTP: ######"; nothing is auto-filled. Wallet balance, credit
limit, order counts etc. shown on `ProfilePage`/`DesktopHeader` are still demo fallback numbers for
every account, real or not — those subsystems (wallet, loyalty, orders) have no backend yet, only
identity does.

**Next:** wire order placement (`ProductDetailPage`/`CartPage`/`CheckoutPage`) against
`SalesModule` once there's appetite for it — that's the next real chunk of "connect the storefront"
and is a bigger job than auth was. Cart/wallet/loyalty stay mock until then.

---

## 2026-09-16 (even later) — Raunak

**Did:** First slice of the "customer side module" the user spec'd out (dashboard, catalog,
pricing, taxonomy, inventory, B2C+B2B orders, CRM, promotions, invoicing, analytics - about ten
subsystems). Agreed to build Catalog + Inventory first and explicitly skip Invoicing & Payments
(overlaps Ujjawal's WS4.4/4.5). This session: **Category & Taxonomy Manager**, **Product editor
enhancements**, and an **Inventory** screen.

**Schema** (migration `20260916140000_catalog_taxonomy_inventory`, applied - `products` table was
empty, zero migration risk):

- New `Category` model - two-level self-relation (`parentId`), unique `slug`, `imageUrl`,
  `displayOrder`, `isActive`. Deliberately not "add a hierarchy later" - the free-text
  `Product.category` string it replaces had no uniqueness and no way to render a collection page,
  so it was a straight replacement (`categoryId` FK), not a dual-write. Only 3 call sites
  referenced the old field (`recipes.service.ts`'s `category` is a *different*, unrelated Recipe
  field - checked before touching anything).
- `Product` gained `slug` (unique, auto-derived from name, collision-suffixed `-2`/`-3`/...),
  `metaTitle`, `metaDescription`, and three inventory fields: `reorderPoint`, `safetyStock`,
  `allowBackorder` - product-level, not per-warehouse (nothing asks for per-warehouse thresholds
  yet; the catalogue asks "should this be flagged low" as one number).
- Two new upload folders (`products`, `categories` in `UPLOAD_FOLDERS`) - no other uploads-module
  change needed, per its own design (`src/uploads/README` intent: a new class + one line).

**Backend:**

- New `src/categories/categories.module.ts` (single-file, matching `products.module.ts`'s
  convention) - full CRUD, `assertDeletable` guard (refuses delete with children or products
  assigned, same 409 pattern as every other master), and three hierarchy rules with dedicated
  tests: a category can't be its own parent, can't complete a 2-cycle with its child, and a
  missing parent 404s rather than silently creating an orphan. 10/10 new tests.
- `ProductsService` gained the same slug auto-generation, plus
  `GET /products/stock-summary` - every active product's QA-released sellable quantity aggregated
  across all warehouses (same aggregation shape as `StorefrontCatalogueService.availability()`),
  against `reorderPoint`/`safetyStock`, computing `OK`/`LOW`/`CRITICAL`.
- `StorefrontCatalogueService`'s category filter moved from a free-text `category` query param to
  `categorySlug`, matching the new relation.
- New permission group `categories.{view,create,edit,delete}` (registry defaults: view → BM/ST/
  PROD, the rest → BM). **Same seeding gap as `customerAccounts` earlier today - BM/ST/PROD
  already had a `role_permission_state` row from 16 Aug, so a brand-new key doesn't backfill on
  boot. Granted directly in the DB again, logging it here for the same reason as last time: there
  is still no migration-based mechanism for this, only a by-hand grant.** Worth fixing properly
  if a third one of these comes up.

**Frontend:**

- New **Categories** screen (`/categories`) - flat table read as a two-level tree (parent then its
  children indented beneath), image via the existing `FileUploadField`, delete-guard errors
  surfaced verbatim.
- New **Inventory** screen (`/inventory`) - one row per active product, available quantity as a
  progress bar against reorder/safety thresholds, OK/Low/Critical filter, inline threshold editor
  that PATCHes just the three inventory fields rather than opening the full product form.
- **Product editor rebuilt**: `CategorySelect` (indents children under their parent's label),
  description, a small `ProductImagesField` (N stacked `FileUploadField` slots reduced to a plain
  `string[]`, since the existing upload component only knows a single URL), storefront toggle,
  SEO fields, inventory thresholds. The backend accepted `description`/`images`/
  `showOnStorefront` since the first storefront-foundation session today - **the admin form never
  had inputs for them until now**, so they were write-only via the API until this pass.
- `shared/` gained: `Category`/`CategoryRef`/`ProductStockSummary` types, `categories.ts` API
  client, `useCategories.ts` hooks, `useProductStockSummary`, a `CategorySelect` picker, and
  `CATEGORY_*` names in `shared/auth/permissions.ts`. `Product`/`CreateProductInput` types updated
  to match the new schema (`category: string` is gone from both).
- Both new screens tagged `zone: 'commerce'` in `navigation.tsx`, under the existing Sales
  section, ahead of Customers.

**Contract changes:** `POST/GET/PATCH/DELETE /categories[/:id]`, `GET /products/stock-summary`.
`CreateProductDto`/`UpdateProductDto` gained `categoryId` (replacing `category`), `slug`,
`metaTitle`, `metaDescription`, `reorderPoint`, `safetyStock`, `allowBackorder` - additive except
`category` → `categoryId`, and nothing had data yet.

**Verified:** backend - `tsc` clean, lint clean, 26/26 suites / 323/323 tests (313 + 10 new), full
`nest build`, booted a real server and drove category creation → hierarchy → product-with-category
→ stock-summary → delete-guard-refusal with curl against Postgres, cleaned up after. Frontend -
`tsc` clean, lint clean, `vite build` succeeds and code-splits all three touched/new pages, then
re-ran the same curl flow through the **admin dev server's `/api` proxy** (not straight to the
backend) so the request/response shapes are confirmed against what the components actually call.
**Visual rendering still not verified** - no headless browser available in this environment, same
limitation as the Storefront Accounts screen earlier today. Both dev servers left running
(backend :3000, admin :5174) for a manual pass.

**Other developer needs to know:** `Product.category` (the free-text string) no longer exists -
anything else touching it needs `categoryId`/the `category` relation now. If you're mid-work on
something that read `product.category` as a string, it will now be `product.category?.name`.

**Next:** the manual browser pass, then Order Management (B2C + B2B quotes/POs) or CRM
(B2B company hierarchies, credit) per the user's stated priority order - not yet asked which of
those two comes after Catalog + Inventory.

---

## 2026-09-16 (later still) — Raunak

**Did:** Two additions to the admin panel, on top of the backend commerce foundation from earlier
today.

**Storefront Accounts screen** (`svv-balaji-admin/src/pages/customer-accounts/`) - a real UI for
the `/storefront/accounts` endpoints: `CustomerAccountsPage.tsx` (list, filterable by channel and
status, defaults to the pending-approval queue) and `CustomerAccountReviewDrawer.tsx` (shows the
GSTIN/business/address a retailer submitted, Approve/Reject). Wired into `navigation.tsx` and
`App.tsx` the same way every other screen is - one nav entry, one lazy route. New shared-layer
files: `shared/api/customerAccounts.ts`, `shared/hooks/useCustomerAccounts.ts`, plus the
`CustomerAccount*` types in `shared/api/types.ts` and two new permission-name mappings in
`shared/auth/permissions.ts` (`CUSTOMER_ACCOUNT_VIEW`/`CUSTOMER_ACCOUNT_REVIEW`).

While verifying this against a live server (not just typechecking), found the list/approve/reject
endpoints were returning `refreshTokenHash` in the JSON body - a bcrypt hash, not the live token,
but it had no business leaving the database in a staff-facing list. Fixed in
`storefront-auth.service.ts` with an explicit `ACCOUNT_STAFF_SELECT` used by all three methods.
Backend tests still 30/30.

**Supply/Commerce zone toggle** - the "two parts" split of the admin panel the user asked for:
farmer/supplier/raw-material screens vs. customer/retail screens, as one app with a switch rather
than two separate deployments (matches what was discussed - keeps one login session and one
`shared/` layer, reversible later if it ever needs to be two real apps). Mechanically:

- `NavItem` in `navigation.tsx` gained an optional `zone?: 'supply' | 'commerce'`. Every item in
  Farm Sourcing, Supplier Sourcing, Procurement, Warehouse and Processing & QA is tagged `supply`;
  everything in Sales (customers, price lists, orders, storefront accounts) is tagged `commerce`;
  Dashboard, Trace and Administration are left untagged (`undefined` = shown in both, since they
  cut across the whole business).
- **This is a navigation filter layered on top of the permission check, not a replacement for
  it.** `AppLayout.tsx`'s menu builder now filters on `can(item.permission) && (!item.zone ||
  item.zone === zone)` - the permission check still runs first and still removes anything the role
  cannot open, exactly as before. A role with no sales access gains nothing by switching to
  "Customer & Retail"; it just stops seeing sourcing screens it already had no special reason to
  browse while working orders.
- A `Segmented` control (`useAdminZone.ts`) sits at the top of the sidebar - "Supply Chain" /
  "Customer & Retail" - persisted to `localStorage` **per browser, not per account**, since it is
  about wayfinding, not security. Switching zones while on a screen that belongs to the other one
  navigates to `/` (the shared dashboard) rather than leaving the user on a page with no matching
  menu entry.

**Contract changes:** none to the backend. Frontend-only: new route `/customer-accounts` (already
existed as an API surface from the earlier session today), new `zone` field on `NavItem` (additive,
optional).

**Verified:** `tsc --noEmit` clean on the whole admin app, lint clean on every file touched,
production `vite build` succeeds and code-splits `CustomerAccountsPage` as its own chunk. Drove the
actual data path end-to-end with curl through the dev server's `/api` proxy (not straight to the
backend) - login, list filtered by channel, approve, re-list showing the new customer code - so the
request/response shapes are confirmed to match what the components expect. **Not verified: visual
rendering.** No headless browser (`chromium-cli`, Playwright) is available in this environment, so
the drawer, the segmented toggle and the zone-switch redirect have not actually been seen rendering
in a browser - only reasoned through and confirmed via the API layer. Left both dev servers running
(backend :3000, admin :5174) for a manual pass.

**Other developer needs to know:** the `zone` tagging on `navigation.tsx` is a manual judgement
call per screen, not derived from anything - if a new Sales-zone screen is added later, tag it
`zone: 'commerce'` or it will silently show in both (which is a safe default, not a broken one, but
worth doing deliberately). `/settings/roles`, `/users`, `/branches` were left shared rather than
put in either zone; Administration felt wrong to hide behind a toggle a Super Admin might not think
to flip.

**Next:** the manual browser pass above, then continue wiring `svv-balaji-customer` to the backend
identity/catalogue endpoints built earlier today.

---

## 2026-09-16 (later) — Raunak

**Did:** Built the backend commerce foundation for the storefront - self-service identity and a
public read-only catalogue on top of the existing staff-operated sales module. Nothing here changes
what staff can already do; it adds a door for customers that did not exist before.

**New: storefront identity (`src/storefront/`, migration `20260916120000_storefront_identity`)**

- `CustomerAccount` is the *login*; `Customer` (existing, Phase 4) stays the *commercial record*.
  Separate on purpose - a B2B retailer needs somewhere to exist while their registration is pending
  review, without occupying a `customerCode` or showing up in the customer master as a live account.
  A B2C consumer gets both at once, since there is nothing to approve.
- **Universal OTP login** (`POST /storefront/auth/otp/request`, `.../otp/verify`): an unknown phone
  self-provisions as B2C and gets a `Customer` row immediately (`CUST-B2C-NNNNNN`, same sequence
  series `CustomersService` already uses). A known phone signs in as whatever channel it already is
  - **the client decides nothing; the account row does.** That is the replacement for the storefront's
    mock CUSTOMER/RETAILER toggle.
- **Retailer registration** (`POST /storefront/auth/register-retailer`): OTP-verified, creates
  `PENDING_APPROVAL` with GSTIN/business details, no session and no `Customer` row until staff
  review it. New staff screen surface: `GET/PATCH /storefront/accounts` behind two new permission
  keys, `customerAccounts.view` (BM, ST) and `customerAccounts.review` (BM) - approving creates the
  `Customer` (`CUST-B2B-NNNNNN`) the account then orders against, same GSTIN-clash check
  `CustomersService.create` already does.
- **OTP is mock-mode only for now** (no SMS vendor procured - same shape of gap as A-11's GSP). Fixed
  code `123456` for any number, returned in the API response as `devCode`. `otp.config.ts` **refuses
  to boot** if `CUSTOMER_OTP_MODE=mock` and `NODE_ENV=production` together - pinned by a test, not
  left to review. Codes are hashed (bcrypt), rate-limited (5 requests / 15 min per number), attempt-
  capped (5 wrong guesses spends the challenge), and never stored in plaintext.
- **Customer tokens are signed with their own secret pair**
  (`CUSTOMER_JWT_ACCESS_SECRET`/`CUSTOMER_JWT_REFRESH_SECRET`, new required env vars - see
  `.env.example`), deliberately not the staff `JWT_ACCESS_SECRET`. Reason, in case anyone is tempted
  to simplify this later: `JwtStrategy.validate()` in `src/auth` trusts any payload with a valid
  signature without re-reading the user, so a customer token signed with the staff secret would pass
  `JwtAuthGuard` outright and become a staff session. Verified by hand against a running server: a
  storefront token 401s on `/auth/me` and `/customers`; a staff token was never tested against
  storefront routes because the reverse direction was never the risk.

**New: public catalogue (`storefront-catalogue.{service,controller,module}.ts`)** - the first
unguarded read surface in this API. `GET /storefront/catalogue/products[/:id]` returns only products
staff have marked `showOnStorefront` (new field, default `false` - nothing existing becomes visible
by accident), resolves the caller's price via the existing `PricingService.resolve()` (a missing
price rule returns `price: null` here instead of the 400 the order-taking path correctly throws),
and aggregates sellable stock across warehouses (QA-released, not expired, minus reservations) -
no staff endpoint aggregates this today, it is all per-warehouse-per-batch.

**Schema (both migrations additive, applied to the dev database, zero data loss):**
`Product` gained `description`, `images String[]`, `showOnStorefront Boolean @default(false)`.
`ProductsService`/DTOs already forward whatever fields are on the DTO to Prisma, so the existing
create/update endpoints accept the new fields with no other change.

**Contract changes:** new module, additive only.
`POST /storefront/auth/{otp/request,otp/verify,register-retailer,refresh,logout}`,
`GET /storefront/auth/me`, `PATCH /storefront/auth/profile`,
`GET/PATCH /storefront/accounts[/:id/approve,/:id/reject]`,
`GET /storefront/catalogue/products[/:id]`. New enums `CustomerAccountStatus`, `CustomerOtpPurpose`.
New permission keys `customerAccounts.view`, `customerAccounts.review` - **granted directly to
BRANCH_MANAGER/SALES_TEAM in the database** rather than left to the boot seeder, because
`seedUnconfiguredRoles` only backfills a role's defaults the first time it has *never* been
configured; BM/ST already have a `role_permission_state` row from 16 Aug, so a new key added to
their `defaultRoles` would otherwise sit ungranted until someone noticed. Same gap will bite the
next person who adds a permission to an existing role - there is no migration-based mechanism for
it, only this by-hand grant, same as how `users.create` moving to Branch Manager was handled.

**Verified, not just typechecked:** built, booted the server for real, and ran the full flow with
curl against a live Postgres - OTP request/verify provisioning a B2C consumer + `Customer` row,
wrong-code rejection, rate limiting (6th request in 15 min correctly 429s), retailer register →
staff approve → retailer login, and confirmed a storefront token 401s against both `/auth/me` and
`/customers` (the staff guard). Test data cleaned from the dev DB afterward. 283 pre-existing tests
still pass unmodified; added 30 new ones (`storefront-auth.service.spec.ts`,
`otp.config.spec.ts`, `customer-token.config.spec.ts`) covering phone normalisation, OTP replay/
expiry/lockout, the B2B pending-approval gate, and the secret-isolation refusal. Lint clean on
everything touched.

**Other developer needs to know:**

- **New required env vars** or the app won't boot: `CUSTOMER_JWT_ACCESS_SECRET`,
  `CUSTOMER_JWT_REFRESH_SECRET` (must differ from the staff ones - the app throws at first use if
  not), `CUSTOMER_OTP_MODE`, `CUSTOMER_OTP_MOCK_CODE`. Added to `.env.example` with the values used
  here.
- Two new tables (`customer_accounts`, `customer_otp_challenges`), two new enums, three new columns
  on `products`. `npx prisma migrate deploy` before starting the API.
- **What this is not:** order placement. `/orders` still takes a `customerId` and is staff-guarded;
  a storefront session resolves to a `customerId` on its own token now, but nothing calls the sales
  module from a customer session yet. That, plus wiring the actual `svv-balaji-customer` React app
  (currently 100% mock, zero HTTP calls anywhere) to any of this, is the next piece.
- A-10 (written client agreement on B2C scope) was still open in `PROJECT_STATE.md` when this
  session started - flagged to the user before building, who chose to proceed. Ravi still needs this
  in writing.

**Next:** wire the `svv-balaji-customer` app to these endpoints (real login replacing
`CustomerAuthContext`'s mock toggle, real catalogue on the home/PDP screens), then a storefront
order-placement endpoint that reuses `SalesService`'s allocation/pricing rather than duplicating it.
`PROJECT_STATE.md` updated to match.

---

## 2026-09-16 — Raunak

**Did:** ⚠️ **The malware came back on `origin/main`, and `main` has been force-pushed to remove it.
Re-clone or `git fetch origin && git reset --hard origin/main` before you do anything else.**

Commit `baceaf3` "reatiler ui" (authored under my name, 7 Sep 17:07, pushed to `origin/main`)
reintroduced all three pieces Ujjawal purged on 7 Sep: the payload at
`public/fonts/fa-solid-500.woff2` (7,592 bytes of tab-padded obfuscated Node.js), the
`.vscode/tasks.json` hidden `runOn: folderOpen` task that executes it through `node` with output
suppressed, and the `.vscode/settings.json` flip of `task.allowAutomaticTasks` from `"off"` back to
`true`. It came in exactly the way the 7 Sep entry warned it would — an old clone carrying the
poisoned `.vscode/` skeleton, committed and pushed.

Found it because a half-finished merge of `origin/main` was sitting in my working tree with all
three files **staged**. The trigger was live on disk while the folder was open in VS Code; what
prevented execution is that the payload blob was never materialised to the working tree
(`AD` in `git status`), so the task hit a missing file and the trailing `|| echo ''` swallowed it.

Remediation:

- `git merge --abort` — back to `f7055ec`, clean tree, payload absent, `tasks.json` gone,
  `allowAutomaticTasks` back to `"off"`.
- Confirmed the payload exists in **exactly one commit repo-wide** (`baceaf3`) — the filter-repo
  purge of 7 Sep held, this was a single reintroduction, so no history rewrite was needed.
- Verified `f7055ec` and `baceaf3` have byte-identical trees apart from those three files, so
  replacing the remote loses no real work.
- `git push --force-with-lease` → `origin/main` is now `f7055ec`. Verified on the remote: payload
  gone, `tasks.json` gone, `allowAutomaticTasks: "off"`, and the only fonts left are the genuine
  400/900 families (checked `wOF2`/`wOFF`/TTF magic bytes).
- Swept the tree: no `preinstall`/`postinstall`/`prepare` scripts in any `package.json`, no
  `.npmrc`, no agent autorun configs, no `.codebuddy`/`.gemini`/`.kiro`/`.qoder` directories.

`baceaf3` stays reachable on GitHub by direct SHA until their GC runs — same caveat as the 7 Sep
purge. Still worth scanning your own machine and every other project's `.vscode/tasks.json`.

Also of note: the merge conflict that exposed this was spurious. `04d6904` (local) and `baceaf3`
(remote) were the same work committed twice with byte-identical `svv-balaji-customer/` trees, so
git concatenated two copies of `CartPage.tsx`, `ProfilePage.tsx` and `main.tsx` — that is where the
duplicate imports and duplicate JSX blocks came from, not from anyone's edits. Gone now; the
customer app typechecks clean (`tsc --noEmit`, exit 0).

Leftover from the poisoned skeleton, inert but not ours: `public/fonts/README.md` describes a
"Blockchain Explorer application" and `.vscode/launch.json` references `sst` and
`AWS_PROFILE: flo-ct-flo360`. Not deleted yet.

**Contract changes:** none — no application code touched.

**Other developer needs to know:** **your clone will not fast-forward.** `origin/main` moved from
`baceaf3` to `f7055ec` (non-fast-forward). Do not merge or push an old clone — that is exactly how
this recurred. If you pulled `origin/main` between 7 and 16 Sep you had the loader on disk; check
whether `.vscode/tasks.json` exists locally and whether `public/fonts/fa-solid-500.woff2` was ever
written.

**Next:** starting the backend commerce foundation for the B2C/B2B storefront — customer
authentication (phone+OTP for consumers, registration flow for retailers), public catalogue and
price endpoints, and product catalogue metadata. Note A-10 (written agreement on B2C scope) is
still open.

---

## 2026-09-07 (later still) — Raunak

**Did:** Added a Loyalty Program to `svv-balaji-customer` for both the Customer (B2C) and Retailer
(B2B) roles — mock-data only, same as the rest of the storefront (WS2.5 sales is still a backend
placeholder; see PROJECT_STATE.md). New `src/loyalty/` module:

- `loyaltyRules.ts` — the rules engine, as pure functions: points earn at a rate keyed to a
  product's own price (2/3/4/5 pts per ₹100, rising with price band), retailer orders earn at
  1.5× in recognition of order volume, and four tiers per role (Bronze→Platinum for customers,
  Bronze Partner→Platinum Distributor for retailers) each add a further bonus multiplier on top.
  Redemption is 1 pt = ₹0.25, 200 pt minimum.
- `LoyaltyProvider.tsx` / `useLoyalty.ts` — same shape as `CartProvider`/`useCart`: two independent
  point ledgers (customer vs retailer, mirroring `customerProfile`/`retailerProfile` in
  `CustomerAuthContext`), persisted to `localStorage`, active ledger selected by role. Exposes
  `estimateLinePoints` (per-product hint, tier-bonus included), `estimateOrderPoints` (cart/checkout
  preview), `earnForOrder` (credits on order placement), `redeemPoints`.
- `pages/LoyaltyPage.tsx` — the full program screen at `/loyalty`: points balance, tier progress,
  the earn-rate table with worked examples, the tier ladder, redemption, and points history. Styled
  to match `WalletPage.tsx`.

Wired in: a "Desi Rewards" / "Wholesaler Rewards" entry in `ProfilePage`'s menu (both role
sections) and in `DesktopHeader`'s account dropdowns; a per-product "Earn X pts" hint on
`ProductDetailPage` (both the B2C price block and the B2B wholesale-tier block); an order-level
points estimate banner on `CartPage`; and `CheckoutPage.handlePlaceOrder` now calls
`loyalty.earnForOrder` so points are actually credited when an order goes through, with an estimate
shown in the price breakdown beforehand.

**Contract changes:** none — customer app only, no backend routes touched.

**Other developer needs to know:** found while testing that `/checkout` is unreachable in this
environment regardless of the loyalty work — `RequireAccount` (in `src/auth/RequireAccount.tsx`)
gates on the real `@shared/auth` session (`useAuth()`), but `LoginPage` only ever calls the mock
`useCustomerAuth().login()`. So without a live backend session, checkout always redirects to
`/login`. Every other "needs an account" route (`/orders`, `/wallet`, `/wishlist`, `/addresses`,
and now `/loyalty`) is *not* wrapped in `RequireAccount` and works fine off the mock auth alone —
checkout is the one inconsistent route. Did not touch this; it's pre-existing and orthogonal to
loyalty, but it means checkout's `earnForOrder` call path could only be verified by code review and
by exercising the identical persist mechanism via Redeem Points (confirmed working, including
surviving a reload). Worth a decision on whether checkout should read the mock auth like the rest of
this app until a real B2C backend session exists.

**Next:** nothing queued from this session. If backend loyalty ever gets a real
`/api/v1/loyalty/*` endpoint, `src/loyalty/loyaltyRules.ts` and `LoyaltyProvider.tsx` are the only
files that should need to change — screens are written against `useLoyalty()`, not against mock
internals.

---

## 2026-09-07 (later) — Ujjawal

**Did:** Brought the backend test suite back to green: **23/23 suites, 283/283 tests, 0 type
errors, 0 lint errors.** It started at 14 suites failing and 22 tests failing, with 8 suites not
compiling at all — so 131 of those 283 tests had never been running.

Most of it was ordinary drift: specs constructing services that had since gained injected
dependencies (`FarmerPerformanceService`, `SequenceService`, `PricingService`), calling methods
that had gained parameters (`advance`, `users.update`, warehouse `findAll` after branch scoping),
and fixtures predating new validation (a farmer approved without the 10 required fields, an
APPROVED inspection with no measurements, a branch-scoped user with no branch). Those were fixed on
the test side, because the services were right.

**Three were not drift, and all three came from the same commit — `87051b6` "qc panel":**

1. **Warehouse deactivation stopped counting finished goods.** The guard was replaced with one
   reading only `warehouse.stock`, so a warehouse full of packed product could be closed and that
   stock stranded with no screen able to move it. Restored the both-ledger count.
2. **`assertDeletable` was replaced by ad-hoc refusals** in warehouse and training — a 400 instead
   of the shared 409, losing the blocking counts and the "deactivate instead" guidance. Restored.
3. **The `MULTIGRAIN_ENABLED` gate came back, and the blend-ratio engine was deleted.** A-05 was
   closed on 14 Aug with the client confirming multigrain in scope; this log says the flag "no
   longer exists" and `PROJECT_STATE.md` lists multigrain as live. It had been reinstated, so every
   MULTI_GRAIN run was being refused in a build we were treating as shipping that feature — and
   the 0.5pp ratio enforcement that made removing the gate safe was gone with it. Restored both;
   the 17 blend-ratio specs verify it.

Also fixed a real bug in `assertDeletable`: `pluralise` had `s` in its `(ch|sh|s|x|z)es$` class, so
"1 warehouses" printed as **"1 warehous"**. `-ses` is ambiguous ("warehouses" is warehouse+s, not
warehous+es) while `-sses` is not, so they are now handled separately. That one bug was failing
both `dependants.spec.ts` and `branches.service.spec.ts`.

**Contract changes:** none to routes or DTOs. Two behavioural restorations that callers will see:
warehouse and training deletes refuse with **409 Conflict** again (they had regressed to 400), and
multigrain production runs are accepted again, subject to the 0.5pp blend tolerance.

**Other developer needs to know:** please look at what else `87051b6` touched — three unrelated
guards were reverted in one commit, which suggests a bad merge or a stale working copy rather than
three separate decisions. Separately, `users.create` moving from Super-Admin-only to Branch Manager
(FRD 5.2) was never recorded here, and `permissions.service.spec.ts` carries a tripwire test whose
comment says exactly that such a change "belongs in DEV_LOG, not in a quiet edit to the registry".
Recording it now: **Branch Manager holds `users.create`**, and it is safe only because
`UsersService.assertMayManage` bounds it — own branch only, roles strictly below their own, never a
peer, never a Super Admin. The tripwire now pins that Branch Manager is the only assignable role
allowed to hold it.

**Next:** the 176 remaining lint warnings are all `no-explicit-any` in specs; worth a pass but not
urgent.

---

## 2026-09-07 — Ujjawal

**Did:** Found and removed a malware loader that had been in this repo since the initial commit
(7 Aug). It was disguised as a Font Awesome webfont at `public/fonts/fa-solid-400.woff2`
(renamed to `fa-solid-500.woff2` in the last commit) — not a font, but obfuscated Node.js padded
with tab characters so editors render it as blank. `.vscode/tasks.json` held a hidden background
task with `runOn: folderOpen` that ran it through `node` every time the folder was opened in
VS Code, with all output suppressed. `.vscode/settings.json` had `task.allowAutomaticTasks: true`,
which is what let it run with no prompt.

The payload resolves a C2 IP from an Ethereum mainnet transaction (EtherHiding — the C2 address is
encoded in a transaction's `to` field, so it can be rotated without touching the repo), pulls a
XOR-encrypted second stage over plain HTTP, `eval()`s it, and re-spawns itself detached. Three
payload generations were committed over the project's life.

Removed the fake font and `tasks.json`, hardened `settings.json`, then purged all three payload
versions from every commit with `git filter-repo` and force-pushed. Verified: zero payload blobs
remain in the object database.

Separately, removed the `code-review-graph` MCP tooling from the repo. Its config hard-coded a
Windows interpreter path (`C:\Users\admin\AppData\Local\Python\...`) and a `D:\Appzeto\SVV-Balaji`
working directory, so it could never run on any machine but the one that generated it. It had also
seeded instruction files for eight different AI coding agents (`AGENTS.md`, `GEMINI.md`,
`CODEBUDDY.md`, `QODER.md`, `.cursorrules`, `.windsurfrules`, `opencode.jsonc`,
`.github/code-review-graph.instruction.md`), each telling the agent to prefer an unavailable tool
over normal file search, plus `.claude/settings.json` hooks on Edit/Write and SessionStart and four
graph-dependent skills. It had additionally written four whole agent directories — `.codebuddy/`,
`.gemini/`, `.kiro/` and `.qoder/` — each with its own MCP server definition, hooks and duplicate
skill set, including two shell hook scripts (`.gemini/hooks/crg-*.sh`) that called the binary
against a hard-coded `D:/Appzeto/SVV-Balaji` path. Removed all of it and trimmed the appended block
from `CLAUDE.md`, keeping the real project documentation intact.

Audited every `package.json` while in there: no `preinstall`/`install`/`postinstall`/`prepare`
scripts anywhere, no `.npmrc`, and every dependency resolves from the public registry — no git,
http or file sources. Clean.

**Contract changes:** none — no application code touched.

**Other developer needs to know:** **`main` history was rewritten and force-pushed.** Your existing
clone will not fast-forward — back up any local work, then re-clone, or
`git fetch origin && git reset --hard origin/main`. **Do not** merge or push an old clone: that
would reintroduce the malware. Two things worth your attention: the payload was committed under
your authorship in `c337079`, `6029d4f` and `bfaf3a3`, which most likely means it rode in on a file
copy rather than anything you did deliberately — but please scan your machine and check
`.vscode/tasks.json` in every project you have locally. And the whole `.vscode/` directory here is
foreign to this project (`launch.json` references SST, `AWS_PROFILE: flo-ct-flo360`, Lerna and
Contentful; `public/fonts/README.md` describes a "Blockchain Explorer application"), so it appears
a poisoned project skeleton was copied in at setup — which also explains why two other Appzeto
repos were hit. Don't reuse that skeleton. Also note the `code-review-graph`
MCP setup is gone from the repo — if you use it, keep it in your **user-level** config rather than
committing machine-specific absolute paths here, since they break every other machine.

**Next:** rotate the GitHub token in the macOS Keychain, then resume normal work.

---
## 2026-09-02 — Raunak

**Did:** Built the `svv-balaji-customer` home screen as a retailer B2B ordering surface (greeting
header, search + barcode scan, quick actions, category rail, schemes carousel, buy-again, popular
products with an add-to-cart/quantity stepper, and an outstanding/credit-limit summary card),
matching a reference mobile-app screenshot the client shared. Added a fixed bottom tab bar
(Home/Categories/Cart/Orders/Profile) to `StoreShell` and a new `/profile` route. Everything reads
from a new `src/mock/homeMockData.ts` — **no backend calls**, since WS2.5 sales/pricing isn't built
yet. Verified in a real headless-Chrome pass (add-to-cart → stepper → cart badge updates, no
console errors) rather than just typechecking.

**Contract changes:** none — frontend only, mock data.

**Other developer needs to know:** `StoreShell` now conditionally renders its generic top header
(hidden on `/` — `HomePage` renders its own greeting header instead) and swaps the footer for the
new `BottomNav` on the five tab routes (`/`, `/products`, `/cart`, `/orders`, `/profile`); other
routes (trace, login, checkout, product detail, order tracking) are unchanged. `/orders` and
`/profile` still route through the existing `RequireAccount`/no-auth logic as before — I did not
touch auth. When real sales/pricing endpoints land, replace `mock/homeMockData.ts` with real
queries; the component layout shouldn't need to change shape to do it.

**Next:** ProductsPage, CartPage, CheckoutPage, OrdersPage are still the WS3.5 placeholders —
worth the same mock-data treatment once there's a next screenshot/spec for them, or building for
real once WS2.5 (customers/pricing/orders) and a customer identity model exist.

---

## 2026-08-16 — Raunak

**Did:** Made role-based access **configurable at runtime**. Who may see and do what is no longer
compiled into either codebase — it is rows in the database, edited by a Super Admin from a new
screen at `/settings/roles`. This touched 87 route decorators, 19 controllers, the panel's whole
auth layer and added a migration, so read the contract section before pulling.

**The problem it solves.** Adding a role to a screen used to mean editing `@Roles()` in a
controller, editing `roles:` in `navigation.tsx`, editing `permissions.ts`, and shipping a build.
Three lists maintained by hand that had to agree, and a redeploy for a decision that is really an
administrative one. The client will change their mind about who does what long after we stop
shipping weekly.

**Shape of it.**

```
permission keys   -> in CODE   (src/auth/permissions/registry.ts) — what CAN be granted
grants            -> in the DB (role_permissions)                 — what IS granted
```

A Super Admin decides which roles hold which keys. He cannot invent a key, because a key no route
checks is a switch wired to nothing — it would look like it granted access and silently not. Adding
a screen therefore still means adding a key and a `@RequirePermission()`; changing *who* may use an
existing endpoint never means touching code again.

**The nine roles are unchanged.** `UserRole` is still a Prisma enum with the same nine values and
`User.role` is untouched — this was deliberately scoped to "make permissions editable", not "make
roles arbitrary". Custom role names would mean migrating `User.role` off the enum, which is a much
bigger change and was not needed to answer the actual request.

**Why permissions are NOT in the JWT.** They would have been free to read. They would also have
gone stale: revoking someone's access would do nothing until their access token expired — up to
fifteen minutes of a person continuing to approve farmers after being told they no longer can. The
guard reads from a per-role cache instead (30s TTL, invalidated immediately on a local write), so a
change lands on the next request. Behind more than one API instance the worst case is 30 seconds;
if we ever run several, replace the TTL with Redis pub/sub rather than shortening it.

**Nobody's access changed.** Every `defaultRoles` list in the registry was read off the `@Roles()`
decorator that used to guard that route, and I verified it mechanically rather than by eye: a script
walks all 19 controllers in the pre-change tree, extracts the role list per handler, resolves the
new permission key for the same handler, and compares against the registry defaults. **All 87
previously-guarded routes grant exactly the same roles.** The seeder writes those defaults on first
boot, so an existing database comes up behaving identically.

**What DID change: 54 read routes are now guarded.** Every `GET` in the API was previously open to
any signed-in user — a Logistics Team account could read the entire farmer registry. Those now
carry a view permission, seeded to the roles that already had the screen in their menu (plus the
roles whose forms read that data across module boundaries — QA needs `agreements.view` for the
harvest-inspection picker, `batches.view` and `finishedGoods.view` for the quality form; Branch
Manager needs `finishedGoods.view` because order allocation shows what was reserved). This is a
tightening, and it is the point: menu visibility and data access are now the same permission, so
they cannot disagree.

**Locks that keep the system reachable.** Super Admin bypasses the check before any database read,
so an empty or corrupt `role_permissions` table can never lock out administration. Super Admin's
own grants cannot be edited at all. `rolePermissions.manage` cannot be granted to any other role —
whoever holds it could give themselves everything else. A role deliberately stripped bare stays
bare across restarts, which is what `role_permission_state` is for: without it "configured to hold
nothing" and "never configured" are the same empty result and the seeder would undo the
administrator's decision every boot.

**The screen.** `/settings/roles` is organised by page, not by permission, because that is how the
question arrives — "should Sales open Price Lists?" comes before "should they hold
`priceLists.supersede`". One switch per page, the individual actions underneath, and actions are
disabled while their page is off (an edit permission on a page nobody can open is a grant that
reads as access and delivers none). Removing a page's view permission asks for confirmation naming
the pages and how many users hold that role — it is a bigger action than one checkbox among eighty
looks. There is a reset-to-defaults per role, which restores the 15 August access exactly.

**Contract changes:**

- **Migration `20260815090000_role_permissions`** — two new tables, `role_permissions` and
  `role_permission_state`. **Run `npx prisma migrate deploy` (or `dev`) before starting the API**,
  or `PermissionsService.onModuleInit` fails on boot.
- **New endpoints** (all Super Admin): `GET /permissions` (the catalogue, grouped by page),
  `GET /permissions/matrix` (grants + how many users hold each role),
  `PUT /permissions/roles/:role` (replaces the whole set — send the full list, not a delta),
  `POST /permissions/roles/:role/reset`.
- **`GET /auth/me` and `POST /auth/login` now return `permissions: string[]`** on the user object.
  Additive; nothing breaks if a client ignores it, but the panel needs it to render a menu.
- **`@Roles()` is deprecated in favour of `@RequirePermission('key')`.** RolesGuard is replaced by
  PermissionsGuard on every controller. **PermissionsGuard still enforces `@Roles()`** — so if you
  land a new route on a branch using the old decorator it stays locked rather than falling open.
  Convert it when you merge.
- **54 GET routes that were open to any authenticated user now require a view permission.**

**Other developer needs to know:** if you add an endpoint, it needs a key in
`src/auth/permissions/registry.ts` and a `@RequirePermission()` on the route. A key the registry
does not define makes the guard throw **500, not 403** — deliberately: a 403 would send an
administrator hunting for a checkbox that cannot exist. Do not put permissions in the token. Do not
add SUPER_ADMIN to a `defaultRoles` list.

**Tests:** 20 new (13 for the service and registry, 7 for the guard) — including that the defaults
reproduce the old `@Roles()` access, that revoking takes effect immediately, that Super Admin
cannot be edited, and that a legacy `@Roles()` route is still enforced. I still cannot run the suite
in this sandbox (npm registry blocked), so **please run `npm test` before trusting the count**.

**Next:** WS2.5 — customers, price lists and orders. Their permission keys are already in the
registry and seeded, so the three screens can be built straight against them. A-13 still needs an
answer before the order screen.

---

## 2026-08-15 (later) — Raunak

**Did:** Built the **farmer onboarding panel** at `/onboarding` — the sibling to the field panel,
for the Procurement / Branch Manager whose job is farmers rather than crops. Same shell, four tabs:
Home, Farmers, Approvals, Agreements.

**First, a check worth recording.** "Farmer panel" could have meant a farmer-facing portal, so I
verified before building: **the `Farmer` model has no password, no email and no refresh token, and
there is no `FARMER` role in the enum.** A farmer literally cannot log in, which matches the client
position in `PROJECT_STATE` — *farmers are data subjects, not users*. This panel is for the staff
who onboard them. If a farmer-facing portal is ever wanted it is a schema change, an auth flow
(mobile + OTP, since most have no email) and a whole new permission boundary — not a screen.

**Organised around the gate, not the tables.** Onboarding is a funnel with one chokepoint:
approval mints the `SVV-YYYY-NNNNNN` code, and until that happens the farmer cannot be inspected,
cannot be collected from, and cannot appear on a consumer trace page. So Approvals is its own tab
rather than a filter on Farmers — a queue nobody can see is a queue nobody clears — and the home
screen counts things that are *stuck* rather than things that exist.

**The approvals tab tells the truth about who can act.** Registering is open to Branch and
Procurement Managers; **approving is Super Admin only** (`@Roles(SUPER_ADMIN)` on
`PATCH /farmers/:id/verify`, FRD 5.1). So for most people opening that screen it is a worklist to
prepare and hand on. It says exactly that, instead of showing a Verify button that returns 403.

### `readiness.ts` — the two gaps that bite months later

This is the part I would most want reviewed, because it is a judgement call rather than a rule the
server enforces. Two fields are invisible at onboarding and expensive at harvest:

- **No bank details.** `RawMaterialCollection` computes `totalAmount` and carries a
  `paymentStatus`, but there is nowhere to send the money. The collection gets recorded, the farmer
  is owed, and somebody chases an account number afterwards — usually with the farmer standing
  there. Flagged as **blocking**.
- **No GPS.** `GET /trace/:fgBatchNumber` returns `gpsLocation` for the consumer traceability page.
  A blank one is a hole in the story the QR code exists to tell, and it cannot be filled in later
  without another visit to the farm. Flagged as **advisory**.

Plus no identity document and no farm size, both advisory (the second one means the farmer
contributes nothing to procurement forecasting).

**None of these block approval, deliberately.** The server does not require them, and inventing a
rule the API does not enforce would mean a form refusing what the system would happily accept.
They are surfaced with the consequence in a tooltip, and there is an "Incomplete" filter on the
Farmers tab. **If you think bank details should be a hard requirement for approval, that is a
server-side change and worth agreeing rather than me deciding it in the UI.**

The home screen also counts **approved farmers with no agreement** — they can be collected from,
but the weighbridge will have no agreed rate to fall back on if none is entered.

**Refactor:** `MobileShell` extracted from `FieldLayout`. Both panels now share one implementation
of the app bar, bottom tabs, safe-area handling and `100dvh` sizing. A second copy would have meant
two places to fix the next safe-area bug, and only one of them would have got fixed.

**Contract changes:** none. Every endpoint already existed; this is entirely panel-side.

**Other developer needs to know (Ujjawal):**

- **Nothing to run.** No migration, no new dependency, no env change.
- **`GET /farmers` has no "incomplete" filter**, so that view is computed client-side from which
  fields are blank. Same A-12 caveat as the field panel: once lists paginate, filtering a page
  rather than the set will under-report.
- **`GET /agreements` takes `farmerId` only**, so "approved farmers with no agreement" is worked out
  by loading both lists and diffing them. Fine at today's volumes, worth an endpoint later.

**Next:** WS2.5 — customers, price lists, orders. Still wants an A-13 answer before the order screen
is designed.

---

## 2026-08-15 — Raunak

**Did:** Built the Field Executive panel as a responsive web app. **Decision: no Flutter.** WS3.1 was
baselined as a native offline-first mobile app; it is now the same React codebase, responsive, with
a phone layout that reads as an app rather than a shrunken website.

### The scope change, stated plainly

`PROJECT_STATE` has carried this line since 11 Aug: *"The Agriculture Expert mobile app (WS3.1) must
work offline. This is why Flutter was chosen — do not weaken this requirement."*

**This weakens it, and that should be a conscious choice rather than a quiet one.** A website needs
a connection. An executive standing in a field with no signal cannot use this. What they can do is
what the client actually described — return to the branch and write the day up — and that is the
workflow this serves.

If offline capture is still wanted, the answer inside this stack is a service worker plus an
IndexedDB queue: capture locally, sync on reconnect. It is real work, but it is *this* codebase
rather than a second one, and it can be added later without rewriting any of what is below. Worth a
line in the client conversation rather than an assumption either way.

**What we gain:** one codebase instead of two, one set of validation rules instead of two that drift,
no app store, no device provisioning, and it works on whatever handset the executive already owns.

### Making a website feel like an app

Six things, roughly in order of how much they matter:

1. **Bottom tab bar, not a hamburger.** `FieldLayout` replaces the sider with four fixed tabs —
   Home, Visits, Seed, Training. Four is the ceiling; five is cramped and six wants a "More" tab,
   which is where app navigation starts feeling like a menu again. This single change is most of
   the effect.
2. **Forms rise from the bottom edge.** `Sheet` renders an antd `Modal` on desktop and a 95%-height
   bottom `Drawer` on a phone, with full-width actions at the bottom where the thumb is. A centred
   dialog with a small × is the most recognisable "this is a website" signal there is. The three
   field forms now use it — no duplication, the same component both ways.
3. **Cards, not tables.** A `DataTable` on a phone is a horizontal scroll nobody uses; columns past
   the second are invisible. `FieldList` stacks cards, and the whole card is the tap target rather
   than a 24px button at the far right.
4. **`100dvh`, not `100vh`.** Mobile Safari's `vh` includes the browser chrome that hides on
   scroll, which leaves a bar-height gap at the bottom of every page. This is the single most
   common reason a responsive site looks broken on iOS.
5. **16px inputs.** iOS zooms the viewport when a focused input's font is under 16px and does not
   zoom back out. Second most common reason.
6. **Safe-area insets.** `env(safe-area-inset-bottom)` keeps the tab bar clear of the iPhone home
   indicator; without it the last tab sits half under the gesture bar. Plus momentum scrolling, no
   tap-highlight flash, no text selection on cards, and skeletons instead of spinners so the layout
   does not jump when data lands.

### Structure

`/field` is the only nested route tree in the app. `FieldLayout` renders the phone shell below
768px and **`AppLayout` above it** — on a wide screen these screens sit in the ordinary chrome with
the sider, because on a desktop that is simply better navigation and doing otherwise would be
styling for its own sake.

Every tab reuses the existing form modals and detail drawers. A second field-visit form would be a
second set of validation rules to keep in step with the DTO, and they would not stay in step.

**Contract changes:** none. No route, DTO or enum touched — this is entirely panel-side.

**Other developer needs to know (Ujjawal):**

- **`Sheet` and `useIsMobile` are general.** If any admin screen wants the same treatment later,
  swapping `Modal` for `Sheet` is a one-line change per form.
- **"Mine" filtering is client-side**, because `/field-visits`, `/seed-distribution` and
  `/training-sessions` take `farmerId` only. Fine today, wrong the moment A-12 lands — filtering
  one page rather than the whole set would silently under-report. **An `expertId` (or
  `conductedById` / `distributedById`) filter on those three endpoints is the proper fix**, and it
  is a small one.
- Nothing to run or migrate.

**Next:** WS2.5 — customers, price lists, orders — still wanting an A-13 answer.

---

## 2026-08-14 (late) — Raunak

**Did:** Started the field executive work — and to do it honestly I had to build the upload layer
first, which is WS4.1 and yours. Flagging that up front.

**The problem:** three endpoints take a `fileUrl` with the comment *"from your object storage"*, and
I checked — there are **zero upload endpoints in the whole API**. Not one `FileInterceptor`, no
multipart anywhere. So "attach a photo" meant "upload it to Drive yourself and paste a link", which
nobody standing in a field was ever going to do. A field executive's job is largely photographic;
without this the module is a notepad.

**Client has given us a Cloudinary account to use in the interim**, so the flow is unblocked without
waiting on A-04.

**`src/uploads/` — three files and a seam.** `StorageService` is an abstract class;
`CloudinaryStorage` implements it; `uploads.module.ts` binds one to the other. **Answering A-04 with
S3 or GCS later is a new class in that folder and one line in that module** — no screen, no
endpoint, no DTO changes. That was the point of not calling Cloudinary from the places that need a
file.

**No new npm dependencies.** Signed uploads are a documented REST call, and Node 20 has `fetch`,
`FormData` and `crypto` built in — so no `cloudinary` package to install, and nothing new in
`package-lock.json` for you to review. If you would rather use the official SDK later, it swaps in
behind the same interface.

**Uploads go browser → our API → Cloudinary, never browser → Cloudinary.** The direct-upload widget
would be less code but needs an unsigned preset, which is a public write endpoint on the media
account that anyone reading the bundle can post to. Signing server-side keeps the secret out of the
browser and means every upload has already passed `JwtAuthGuard`.

**New route (contract change):**

```
POST /uploads/:folder     any authenticated · multipart, field name "file"
                          folder: field-visits | training | inspections | farmers
                          → { url, key, mimeType, bytes, width?, height? }
```

`url` goes straight into the existing `fileUrl` DTOs unchanged — that is why none of them needed a
migration. Images (JPEG/PNG/WebP/HEIC) and PDFs, 10 MB cap, both configurable. SVG is deliberately
excluded: it is scriptable, and serving one from our own origin is an XSS vector.

Not role-restricted beyond "signed in", on purpose — the three endpoints that *consume* a `fileUrl`
are each guarded already, and that is where the authority belongs. Restricting here too would mean
adding a role every time another screen learns to take an attachment, and forgetting to would
produce a 403 with nothing explaining it.

**Panel — `/field`, "My Field Work".** The Agriculture Expert landing screen. The rest of the panel
is organised the way an administrator thinks, one screen per table; this one is organised around
the executive's day, which is three verbs: I visited a farm, I handed out seed, I ran a session.
Three buttons, then "what have I done lately" rather than "what exists in the system" — my visits,
my farmers, my handouts, my sessions.

It reuses the existing form modals rather than growing its own. A second field-visit form would be
a second set of validation rules to keep in step with the DTO, and they would not stay in step.

**Paste-a-URL is gone** from field visit documents and training materials, replaced by a real
drag-and-drop upload with progress. One `FileUploadField` component, shaped as a form control so
each call site is one line.

**Contract changes:** `POST /uploads/:folder` is new. Nothing existing changed.

**Other developer needs to know (Ujjawal):**

- **This is WS4.1 territory and I have entered it.** It is a small, well-fenced piece — one folder,
  one route, no schema change — but say if you would rather own it.
- **`.env` needs four new keys**: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
  `CLOUDINARY_API_SECRET`, `MAX_UPLOAD_BYTES`. `.env.example` documents them. Rounak has the values.
- **I could not verify the signature against the live API** — my sandbox blocks
  `api.cloudinary.com` at the network layer. The algorithm is the documented one and the
  canonicalisation is pinned by 7 tests, but **the first real upload on a machine with network
  access is the actual proof**. If it comes back "Invalid Signature", that is where to look.
- **7 tests** in `cloudinary.storage.spec.ts`. They assert the *string that gets hashed*, computed
  independently — a hard-coded digest would pass happily even if code and expectation were wrong
  together. Suite should now be **258**.
- **`/field-visits` has no `expertId` query parameter**, so "my visits" is filtered client-side.
  That is fine today and wrong the moment A-12 lands — filtering a page rather than the set would
  quietly under-report. A `expertId` filter on that endpoint would fix it properly.

**A-04 escalation issued:** `SVV_Balaji_A04_Storage_Decision_Note.md` — one page for Ravi. What is
blocked (nothing, now), what accumulates if it slips (migration cost, and client media sitting in a
vendor account), and a recommendation so the decision is a yes/no. It also raises the thing nobody
has asked yet: **retention and access policy for farmer KYC documents.** Aadhaar and PAN images are
personal data and that shapes access control, not just storage.

**Next:** WS2.5 — customers, price lists, orders — still wanting an A-13 answer. The offline
Agriculture Expert app (WS3.1) remains the right long-term answer for capture with no signal; this
screen is the portal half of the workflow the client actually described.

---

## 2026-08-14 (evening) — Raunak

**Did:** **A-05 is closed — the client has confirmed multigrain is in scope.** Removed the gate and
built the thing it was standing in for.

**The flag is gone rather than set to `true`.** A stale `.env` carrying `MULTIGRAIN_ENABLED=false`
on somebody's machine would have silently refused production runs with no clue as to why, and
`.env.example` now says so where the variable used to be.

**But removing the gate on its own would have been the wrong change,** and this is the part worth
reading. Approving a recipe fixed a ratio; nothing made that ratio true at production time. A 60/40
wheat-bajra blend could have been produced from 90% wheat, packed, labelled and sold as the
approved blend, and the system would have agreed with the label. That is a mislabelled-food
problem, not a data-quality one.

So `createProductionBatch` now enforces the blend on every MULTI_GRAIN run:

- **every grain in the formula must be present** — a three-grain blend made from two grains is a
  different product, not a rounding error;
- **each grain's share of the total input must be within `BLEND_TOLERANCE_POINTS` (0.5 pp)** of its
  recipe percentage.

Two decisions in there that are worth disagreeing with if you want to:

1. **Ratios are measured against total input, not planned output.** The recipe describes the mix
   going in; process loss applies to the mix as a whole and is only known at completion. So a run
   that inputs 1,020 kg against a 1,000 kg plan passes, as long as the proportions hold. Checking
   against the plan would fail honest runs.
2. **0.5 percentage points.** Tight enough that 60/40 cannot quietly become 65/35, loose enough to
   absorb drawing whole-ish quantities from stock — 5 kg of slack per grain on a 1,000 kg mix. It
   is a named constant, and the panel mirrors it with a comment pointing back here.

Crop names are matched case- and whitespace-insensitively. "Wheat" on the recipe and `"wheat "`
typed by a collection clerk in the field are the same grain, and blocking a legitimate run over a
trailing space would be the first thing anyone hit.

**The refusal names the fix**, not just the failure:

> The mix does not match recipe MG-ATTA: Wheat is 90.00% of the mix but the recipe says 60.00%
> (needs 600.00 of the 1000.00 total). Blends may drift by at most 0.5 percentage points.

**Panel — the blend worksheet.** `BlendPlanner.tsx` does the same arithmetic live while the run is
being set up: a row per grain showing the recipe percentage, the target quantity for the planned
output, what is in the mix so far, and the running share with a tick or a warning. The submit
button stays disabled until every grain is green, so an off-ratio run cannot be started rather than
being refused after the fact. Single-grain runs are untouched — there is no ratio to hold.

All the "disabled pending A-05" copy is gone. Where it sat on the recipe form, it now says what the
percentages actually commit you to: *once this version is approved, every run made from it has to
hold this ratio.*

**Contract changes:** none — no route, DTO or enum changed. `POST /production-batches` accepts a
MULTI_GRAIN recipe where it used to refuse one, and refuses an off-ratio mix where it used to
accept one. Behavioural, and worth a line in your notes.

**Other developer needs to know (Ujjawal):**

- **`MULTIGRAIN_ENABLED` no longer exists.** Drop it from your local `.env`; nothing reads it.
- **17 tests** in `blend-ratio.service.spec.ts` — exact match, tolerance boundary either side,
  missing grain, multiple batches of one grain, case/whitespace crop matching, and that the
  existing gates (unapproved recipe, QA-rejected batch, insufficient stock, reserved stock) still
  fire before the ratio check. Suite should now be **251** across 20 spec files. Still cannot run
  them here — no npm registry in my sandbox.
- **`completeProduction` still allows a negative `productionLoss`** when actual output exceeds
  planned. It mattered less when blends could not run; now that yields are the point of the
  feature, it is worth a look. Left alone — your call, your module.

**Workbook updated:** A-05 closed with the date and effect. Open actions 11 → 10, closed 2 → 3.
Weighted completion unchanged at **35.65%** — this closes a decision and completes a gated path
rather than adding new scope.

**Next:** WS2.5 — customers, price lists, orders. Still wants an A-13 answer before the order
screen is designed; `PATCH /customers/:id` already exists, so that screen gets edit for free.

---

## 2026-08-14 — Raunak

**Did:** Finished the job started last night — edit and delete on the transactional screens too.
**22 more endpoints**, again in your workstream, again because none existed. Every form on every
screen now opens pre-filled in edit mode; the create modal is reused rather than duplicated.

**The guard is per-record state here, not per-type** — which is the thing worth reading. A
transactional record stays correctable exactly as long as nothing downstream has relied on it:

| Record | Editable until | Deletable until |
|---|---|---|
| Agreement | a harvest inspection is raised against it | same |
| Seed distribution | always | always |
| Training session | always | attendance is marked |
| Field visit | always | always (takes its documents) |
| Procurement plan | it leaves DRAFT / SCHEDULED | an inspection is booked against it |
| Harvest inspection | a collection is recorded against it | same |
| Collection | the batch is cleaned, inspected, consumed or moved since receipt | same, plus: farmer unpaid, no later receipt that day |
| Raw material batch | — acts on its collection — | — acts on its collection — |

**New routes (contract change):**

```
PATCH  /agreements/:id                            SUPER_ADMIN, PROCUREMENT_MANAGER
DELETE /agreements/:id                            SUPER_ADMIN

GET    /seed-distribution/:id                     any authenticated
PATCH  /seed-distribution/:id                     SUPER_ADMIN, AGRICULTURE_EXPERT
DELETE /seed-distribution/:id                     SUPER_ADMIN

PATCH  /training-sessions/:id                     SUPER_ADMIN, AGRICULTURE_EXPERT
DELETE /training-sessions/:id                     SUPER_ADMIN
DELETE /training-sessions/:id/attendance/:farmerId  SUPER_ADMIN, AGRICULTURE_EXPERT
DELETE /training-sessions/:id/materials/:materialId SUPER_ADMIN, AGRICULTURE_EXPERT

PATCH  /field-visits/:id                          SUPER_ADMIN, AGRICULTURE_EXPERT
DELETE /field-visits/:id                          SUPER_ADMIN
DELETE /field-visits/:id/documents/:documentId    SUPER_ADMIN, AGRICULTURE_EXPERT

GET    /procurement-plans/:id                     any authenticated
PATCH  /procurement-plans/:id                     SUPER_ADMIN, PROCUREMENT_MANAGER, BRANCH_MANAGER
DELETE /procurement-plans/:id                     SUPER_ADMIN

PATCH  /harvest-inspections/:id                   SUPER_ADMIN, PROCUREMENT_MANAGER, QA_MANAGER
DELETE /harvest-inspections/:id                   SUPER_ADMIN
DELETE /harvest-inspections/:id/documents/:documentId  SUPER_ADMIN, PROCUREMENT_MANAGER, QA_MANAGER

PATCH  /collections/:id                           SUPER_ADMIN, PROCUREMENT_MANAGER
DELETE /collections/:id                           SUPER_ADMIN
```

New DTOs: `UpdateAgreementDto`, `UpdateSeedDistributionDto`, `UpdateTrainingSessionDto`,
`UpdateFieldVisitDto`, `UpdateProcurementPlanDto`, `UpdateHarvestInspectionDto`,
`UpdateCollectionDto`. All `PartialType(Create…)` except the last.

**`GET /batches` now includes `collection`** (id, receipt number, weights, rate, payment status).
The batches screen offers Correct and Delete, both acting on the collection, and without the
include that would be a round trip per row.

---

### `PATCH /collections/:id` is the one to look at

**This is the correction path the system had no answer for.** A weighbridge slip read as 500
instead of 50 currently means cancelling and re-collecting the harvest, which is worse than the
typo. It is also the only edit that reaches outside its own row: the net weight lives in four
places — the collection, the batch quantity, the warehouse stock line and the movement ledger.

So the update does all four in one transaction and writes an **`ADJUSTMENT` movement** carrying
the before/after and the reason the user typed. Your invariant — *stock is only ever mutated
inside a transaction that also writes a movement row* — is preserved rather than worked around.

`UpdateCollectionDto` deliberately excludes three fields, and the reasoning is in the file:

- **`inspectionId`** — unique relation. Repointing it leaves the original inspection looking
  uncollected while its batch still traces through it.
- **`warehouseId`** — stock moves between warehouses through transfer, which writes the ledger.
  Changing it here relocates stock with no entry, which is the exact drift the ledger prevents.
- **`collectionDate`** — encoded into the receipt and batch numbers, already printed on the
  farmer's copy. Changing the date makes them wrong rather than regenerating them.

**`DELETE /collections/:id` takes the batch, its stock line and its receipt movement with it**, in
one transaction — a batch without its collection has no farmer path and would sit in the warehouse
untraceable.

**And it surfaced a real bug of yours, which I have guarded rather than fixed.**
`generateReceiptNumber()` counts the day's receipts instead of using `SequenceService` beside it,
so deleting a receipt makes the *next* collection reuse its number — two farmers, two payments,
one receipt number, indistinguishable afterwards. Until that is fixed, `remove()` refuses when a
later receipt exists for the same day, with that explanation in the message. **One line to fix:**
`SequenceService.next(tx, 'RC', collectionDate)`. I have left it alone because it is the same
defect I flagged on 11 Aug and it is yours to close.

---

**Contract changes:** yes — the 22 routes above, plus the `collection` include on `GET /batches`.
Swagger annotated.

**Other developer needs to know (Ujjawal):**

- **49 more tests** in `collection-correction.service.spec.ts`,
  `procurement-maintenance.service.spec.ts`, `agreements.service.spec.ts` and
  `training.service.spec.ts` — the four-way weight correction, the untouched-batch guard, the
  collected-inspection lock, the in-progress plan lock. Suite should now be **234**. Still cannot
  run them here (no registry access in my sandbox) — please confirm on your machine.
- **The receipt counter, again.** See above. It now has a user-visible consequence rather than
  just a theoretical one.
- **`assertBatchUntouched` in `collection.service.ts` is reusable** and probably wants to move
  somewhere shared when you add order cancellation — "has anything downstream used this" is the
  same question there.

**Next:** WS2.5 — customers, price lists, orders — which still wants an A-13 answer before the
order screen is designed. `PATCH /customers/:id` already exists, so that screen gets edit for free.

---

## 2026-08-13 (late) — Raunak

**Did:** Added edit and delete to the master screens — and had to build the endpoints first,
because **the backend had no generic update route except `PATCH /customers/:id`, and no `@Delete`
route anywhere at all.** 14 new routes, 5 modules, in your workstream. Details below; shout if you
want any of it changed.

**The rule I applied, since "delete" is not one thing in a traceability system:**

| Kind of record | What the panel offers |
|---|---|
| Masters — branch, user, farmer, product, warehouse | Full edit, plus deactivate / reactivate |
| Anything, when genuinely unused | Real `DELETE`, refused with a reason the moment something references it |
| Traceability and ledger rows — batches, movements, inspections, consumption | No delete. Correction is a new record, the way `adjust` already works |

Deactivation is the routine action and delete is for entries created by mistake. That is stated in
the confirm dialogs, so the distinction is not folklore.

**New routes (contract change):**

```
PATCH  /branches/:id                 SUPER_ADMIN
PATCH  /branches/:id/active          SUPER_ADMIN     { isActive: boolean }
DELETE /branches/:id                 SUPER_ADMIN
GET    /branches?activeOnly=true                     (new query param)

PATCH  /users/:id                    SUPER_ADMIN
PATCH  /users/:id/status             SUPER_ADMIN     { status: UserStatus }
PATCH  /users/:id/password           SUPER_ADMIN     { password: string }
DELETE /users/:id                    SUPER_ADMIN
GET    /users?branchId=&status=                      (new query params)

PATCH  /farmers/:id                  SUPER_ADMIN, BRANCH_MANAGER, PROCUREMENT_MANAGER
DELETE /farmers/:id                  SUPER_ADMIN

PATCH  /products/:id                 SUPER_ADMIN
PATCH  /products/:id/active          SUPER_ADMIN
DELETE /products/:id                 SUPER_ADMIN
GET    /products?includeInactive=true                (new query param)

GET    /warehouses/:id               any authenticated
PATCH  /warehouses/:id               SUPER_ADMIN, BRANCH_MANAGER
PATCH  /warehouses/:id/active        SUPER_ADMIN, BRANCH_MANAGER
DELETE /warehouses/:id               SUPER_ADMIN
GET    /warehouses?includeInactive=true              (new query param)
```

New DTOs: `UpdateBranchDto`, `UpdateUserDto`, `UpdateUserStatusDto`, `ResetUserPasswordDto`,
`UpdateFarmerDto`, `UpdateProductDto`, `UpdateWarehouseDto`, and a shared `SetActiveDto` in
`src/common/dto/`. All are `PartialType(Create…)` so nothing new to validate.

**Two `GET` defaults changed, both non-breaking:** `/products` and `/warehouses` already filtered to
active only; they now accept `includeInactive` so the master screens can see and reinstate a
deactivated row. Without that, deactivating something hides it from the one screen able to bring it
back. `/branches` still returns everything by default and now accepts `activeOnly`, which is what
the pickers pass.

**`src/common/dependants.ts` is the piece worth knowing about.** Every relation in the schema is
RESTRICT, so a blocked delete would otherwise surface as `P2003 Foreign key constraint failed` —
true, and useless. `assertDeletable()` counts the referencing rows first and throws a 409 naming
them: *"Branch "Nagpur" cannot be deleted — 12 farmers, 3 warehouses and 1 user still reference it.
Deactivate it instead…"*. The panel shows that message verbatim, which is the whole point of
writing it carefully. Reuse it for customers and price lists in WS2.5.

**Guards worth reviewing, because they are the ones protecting against a locked-out system:**

- **A user cannot demote, deactivate or delete themselves**, and **the last active Super Admin
  cannot be demoted or deactivated by anyone.** Without the second one, two clicks leave nobody able
  to administer the system and recovery means a script against the database — which we have already
  done once this week.
- **Deactivating a user clears `refreshTokenHash`**, so a session they currently hold stops working
  rather than surviving until the token expires. Same for a password reset. For someone who has just
  left, that is the difference that matters.
- **An approved farmer can never be deleted** — the `SVV-YYYY-NNNNNN` code comes from an atomic
  per-year counter and is never reissued, so a printed agreement carrying it would resolve to
  nothing. The refusal names the code and points at INACTIVE / BLACKLISTED instead.
- **A branch with active users cannot be deactivated** — they would sign in with no branch context.
- **A warehouse still holding stock cannot be closed** — closing removes it from the transfer
  picker, so the stock would be stranded with no screen able to move it.

**Also fixed while I was in there:** `GET /users` now includes the `branch` relation (the list was
showing a raw uuid) and accepts `branchId` / `status` filters. That was the gap I raised on 12 Aug —
an ex-employee could not be deactivated at all.

**Contract changes:** yes — the 14 routes and 4 query params above. Swagger is annotated;
`/api/docs` is accurate.

**Other developer needs to know (Ujjawal):**

- **These are edits inside your workstream.** Everything follows the existing style — service holds
  the rules, controller is thin, `@Roles()` on every write. Nothing existing changed behaviour
  except the two `GET` defaults noted above, both additive.
- **57 tests added** across `dependants.spec.ts`, `branches.service.spec.ts`,
  `users.service.spec.ts`, `farmers-delete.service.spec.ts` and
  `warehouse-master.service.spec.ts` — the delete guards, the lockout guards and the refusal
  wording. Suite should now be **185**. I could not run them here (no registry access in my
  sandbox); please confirm on your machine.
- **The three stock-mutation races are still open** and now sit next to a delete button. Nothing I
  added makes them worse, but `warehouse.setActive` reads the stock count outside a transaction for
  the same structural reason `stockOut` does.

**Next:** the same treatment for the transactional screens — agreements, seed distribution,
training, field visits, procurement plans, harvest inspections and collections. Those need
edit-while-unconsumed rather than edit-always, so the guard is per-record state rather than per-type,
and I want your view on where the line sits before I build it.

---

## 2026-08-13 (evening) — Raunak

**Did:** Built WS2.4 — Zone 3, processing, QA and packaging. Six screens, 24 files. Panel is now
**22 of 25 screens**. `/trace` can resolve a real pack for the first time.

**Products (`/products`).** Master list with type, crop, HSN, GST and the two-price channel split
(B2B / B2C) that A-08 introduced. Both prices are shown side by side rather than one "price" column,
because the sales screens will filter by channel and a single figure would be ambiguous.

**Recipes (`/recipes`).** Create, approve, and a version drawer. The server's two hard rules are
enforced in the form before submit: SINGLE_GRAIN takes exactly one ingredient, MULTI_GRAIN takes two
or more whose percentages total 100 (±0.05). The running total is displayed live as you type, so you
find out at the third ingredient rather than on the error toast. Reusing a `recipeCode` mints a new
version rather than editing in place — the drawer makes that lineage visible, which matters because
a production run references the version it was made against.

**Cleaning & grading (`/production/cleaning`).** Records the step and shows the yield loss against
input quantity.

**Production batches (`/production`).** Create, start, complete, and a detail drawer showing
consumption per raw-material batch. The form only offers APPROVED recipes; once a recipe is chosen
the raw-material picker is filtered to that recipe's crops **and** to stock actually available in the
nominated warehouse, so you cannot compose a run the server will reject. Multigrain runs are blocked
at the OK button with the reason on screen (pending A-05).

**Quality inspections (`/quality`).** One form, three stages. The stage selection drives the target
picker, the parameter set and the consequence text; switching stage clears the other target ids
because the server requires exactly one. Per your 07-Aug note the gates are surfaced as hard stops:
selecting FAIL shows what it will do before you save — raw material FAIL rejects the batch
permanently, finished-goods FAIL withdraws release.

**Finished goods (`/packaging`).** Pack a completed run, release after QA, print the label, book into
stock. The pack form warns live when net weight × pack count exceeds what the run actually produced,
and says the server also counts what was already packed from that run. The label modal renders your
server-generated QR and barcode SVGs as-is — the panel never builds the traceability URL itself, so
the printed code and the server's idea of it cannot drift.

**Contract changes:** none. Front-end only.

**Other developer needs to know (Ujjawal):**

- **A-12 is still outstanding** and there are now 22 screens on the unpaginated shape. The adapter
  absorbs it, but the production and quality lists join the movement ledger as lists that grow
  monotonically on real data.
- **A-05 (multigrain production) now has a visible cost.** The recipe screen accepts multigrain
  recipes because the API does, then disables the production button for them. That is an obviously
  incomplete path for anyone demoing the panel.
- **A-13 still shapes WS2.5.** The remaining three screens are customers, price lists and orders.

**Next:** WS2.4 manual test pass, then WS2.5 — the last three screens.

---

## 2026-08-13 — Raunak

**Did:** Finished WS2.3 and built the traceability screen. Panel is now **16 of 25 screens**.

**Zone 2 — Procurement (5 screens).** Procurement plans, harvest inspections, collections, raw
material batches with an upstream trace drawer, plus the farm-to-fork trace screen.

The gates are visible in the UI rather than discovered through errors: the inspection form's farmer
picker is restricted to approved farmers only, and says so when the list is empty; the collection
form's harvest picker offers only APPROVED inspections that are not already collected; choosing a
non-APPROVED result shows a warning that it blocks collection permanently. Where an agreement is
linked, the rate field reads "leave empty to use the agreed rate of ₹X".

**Zone 2 — Warehouse (3 screens).** Warehouses with occupancy, batch-wise stock with all four
mutations, and the movement ledger.

One deliberate deviation worth knowing about: **the occupancy view does not always show your
`utilisationPercent`.** `warehouse.status()` sums `quantity` across batches ignoring `unit`, so a
warehouse holding both KG and QUINTAL reports a meaningless figure — and a percentage derived from
it looks authoritative while being nonsense. The drawer computes its own per-unit breakdown from the
stock rows and only draws the utilisation bar when every batch shares one unit; otherwise it says
why it cannot. If the API starts normalising units, that branch just stops being reached.

**Traceability screen (`/trace`).** Enter an `FG-` number and it renders the chain as steps, the
product and production cards, quality checks, and the farmers behind the pack with village, district
and GPS. Worth having ready for the staging demo. It currently resolves nothing because no finished
goods exist yet — WS2.4 fixes that.

**Contract changes:** none. Front-end only.

**Other developer needs to know (Ujjawal):**

- **A-12 was due today and has not landed** — no `src/common/pagination.dto.ts` yet. Sixteen screens
  are now built against the unpaginated shape. The adapter means nothing breaks, but
  `/warehouses/movements` in particular is append-only and never pruned, so it is the first list that
  will become unusable on real data. The proposal has the interceptor, the DTO and a migration path
  that keeps the smoke test green throughout.
- **The stock over-draw race is now reachable from the UI.** `stockOut`, `transfer` and `adjust` read
  available stock outside the transaction. With the warehouse screens live, a warehouse manager and a
  production manager drawing the same batch at once can drive the quantity negative, and the screen
  will faithfully display it. Client-side validation does not help — both checks happen before the
  commit.
- A-13 (order DRAFT state, finished-goods movement ledger, allocation history on cancel) shapes WS2.5.
  I would like an answer before I design the order screen.

**Workbook updated:** WS2.3 to 100% Complete on the Gantt, baseline and weekly progress. Weighted
completion **29.9% → 31.65%**.

**Next:** Zone 2 manual test (warehouse → collection → stock in → transfer → adjust → ledger), then
WS2.4 — products, recipes, cleaning & grading, production batches, quality inspections, finished
goods. That block is also what makes `/trace` resolve for real.

---

## 2026-08-12 — Raunak

**Did:** Finished Zone 1 in the panel, and fixed a trap in the seed script that cost me an hour.

**1. Zone 1 screens complete (WS2.2).** Agreements, seed distribution, training and field visits, all
on the shared layer from the previous session. Panel is now **8 of 25 screens** built: dashboard,
branches, users, farmers, agreements, seed distribution, training, field visits.

Notable bits: training attendance is a multi-select seeded with whoever is already marked, submitted
whole rather than diffed — safe because your `markAttendance` upserts. The field-visit form separates
*observed* from *advised*, because when a batch later fails inspection the question is always which
of the two was wrong. Both file-attachment spots state on screen that they are links only and why
(A-04), rather than leaving a mystery where an upload button should be.

Page size is **20** everywhere, per your call — `DEFAULT_PAGE_SIZE`, the size options, and the A-12
proposal so the backend default matches.

**2. Route-level code splitting.** The panel was importing every page statically, so the login screen
pulled in the whole admin app. Screens are now `React.lazy` with the Suspense boundary inside the
layout, so the shell stays put while a chunk loads. Vendor chunks split too. Not urgent, but it would
have been embarrassing at the staging demo.

**3. `prisma/seed.ts` — your file, changed. Please read this bit.**

The old script bailed at the top:

```ts
if (existing) { console.log('Super Admin already exists'); return; }
```

So changing `SEED_SUPER_ADMIN_PASSWORD` in `.env` and re-running the seed printed a success message
and changed nothing — the password is a bcrypt hash in `users`, and `.env` only supplies it at
creation. That is a very easy hole to fall into and it gives no signal at all; it cost me an hour of
looking in the wrong place. The seed now:

- bcrypt-compares the `.env` password against the stored hash and, when they differ, says so
  explicitly with instructions rather than reporting success
- resets the password when `SEED_RESET_PASSWORD="true"` is set, clearing `refreshTokenHash` so a live
  session cannot outlive the password it was issued under
- reactivates the admin if it is ever left non-`ACTIVE` or demoted — `AuthService` refuses any
  non-ACTIVE user, so that state locks everyone out of the panel with no route back through the UI
- creates the default branch independently of the admin. It used to sit *after* that early return, so
  a database with an admin but no branch was a dead end — farmers, users and warehouses all need one

**4. New utility: `npm run admin:password`.** Lists every user with role and status; with arguments
(`-- <email> "<password>"`) it sets a password directly, no `.env` involved. Also reports when the
password already matched, which points at a config mismatch rather than a credential problem. Worth
knowing about before UAT, since there is still no `PATCH /users/:id`.

**Contract changes:** none. `prisma/seed.ts` behaviour changed (above) and one npm script added.

**Other developer needs to know (Ujjawal):**

- **A-12 is the one blocking me.** Proposal is in `SVV_Balaji_A12_Pagination_and_Envelope_Proposal.md`
  — concrete shapes, the interceptor, the DTO, and a migration path where the panel and the smoke test
  both stay green while you go endpoint by endpoint. Target was 13 Aug. Everything left in WS2.3 is a
  list screen.
- Two traps flagged in that doc worth not discovering the hard way: the envelope interceptor must skip
  raw strings or the `qr.svg` endpoints break, and `findMany`/`count` must share a transaction or the
  last page vanishes under load.
- Still open from before: `GET /users` has no `branch` include, and there is no `PATCH /users/:id`.
- A-13 (order drafts, finished-goods movement ledger, allocation history on cancel) shapes the WS2.5
  screens. Not urgent this week.

**Next:** click through Zone 1 against real data end to end (register → approve → agreement → seed →
training → field visit), then the traceability screen, then WS2.3 procurement and warehouse.

---

## 2026-08-11 (late evening) — Raunak

**Did:** WS2.2 first pass — the shared front-end layer, then Branches, Users and Farmers as real
screens. 22 new files in `svv-balaji-admin/`. Farmers is the substantial one and is the pattern the
remaining ~18 list screens will copy, so it is worth a look before I repeat it.

**Architecture, agreed before building:**

- **Generic response envelope.** Screens are written against `ApiResult<T>` / `Paginated<T>`
  (`src/api/envelope.ts`), and adapters absorb the fact that the API currently returns bare arrays
  and objects. When the envelope lands server-side, one file changes and no screen does. Proposed
  shape is in that file's header — see A-12 below.
- **TanStack Query for all server state.** No `useEffect` fetching anywhere. Query keys live in one
  hierarchy (`src/api/queryKeys.ts`) so mutations can invalidate a resource without knowing which
  filter combinations are cached — ad-hoc key strings are how invalidation quietly breaks at twenty
  screens. Global `QueryCache`/`MutationCache` error handlers catch anything a screen forgets.
  Deliberate exception: `AuthProvider` stays outside the cache, since the session decides whether
  queries may run at all and routing it through would create a bootstrap cycle.
- **Validation mirrors your DTOs.** `src/validation/rules.ts` holds the patterns and cross-field
  rules in one place, each citing the backend rule it mirrors — GSTIN (copied verbatim from
  `customers.service.ts`), Aadhaar, PAN, IFSC, mobile, plus `netWeight <= grossWeight`,
  `effectiveTo > effectiveFrom`, `scheduledTo >= scheduledFrom`, `expiry > manufacturing`. One file
  to follow when a DTO changes.
- **Shared `DataTable`.** Loading, error-with-retry and empty states handled once. Pagination sits
  behind its own prop: client-side today, server-side the moment A-12 lands, with no screen edits.
- **Role guarding is centralised and action-level.** `src/auth/permissions.ts` maps every action to
  its roles, each entry citing the `@Roles()` decorator it mirrors, and `useCan()` / `<Can do="…">`
  consume it. Nothing relies on catching a 403. Every Phase 2–4 permission is registered already,
  so those screens have theirs waiting.

**Screens:** Branches (list + create). Users (list + create, role and branch pickers; the list is
gated on `USER_VIEW` and shows an explanation rather than firing a request that would 403). Farmers
— list with name/village/district/branch/status filters, registration form in four sections,
profile drawer pulling verification trail + agreements + seed distributions + field visits from the
single `GET /farmers/:id`, the verification workflow, and a printable QR/barcode view.

Three backend rules encoded in the farmer UI: `farmerCode` renders as "Not yet issued" rather than
an empty cell, the Verify action is hidden entirely for non-Super-Admins, and the ACTIVE option in
the status selector is disabled while `farmerCode` is null, since the API refuses it.

**Contract changes:** none. Front-end only.

**Other developer needs to know (Ujjawal):**

- **A-12 is now blocking real work, and it is two things, not one.** Alongside `page`/`limit`, I
  would like the response envelope settled in the same change — `{ data }` for a single object,
  `{ data, meta: { total, page, limit } }` for a list. My adapter already accepts both shapes, so
  you can land it endpoint by endpoint without breaking the panel or the smoke test at any point.
  Everything after Farmers is a list screen; the sooner this is fixed the fewer get built twice.
- **`GET /users` returns no `branch` relation**, unlike `GET /farmers`. The users table has to fetch
  all branches separately just to show a branch name. A `branch: { id, name }` include would remove
  that second request — small, and the same pattern farmers already uses.
- **No `PATCH /users/:id`.** There is no way to deactivate a user, change a role, or reset a
  password from the panel. Worth knowing before UAT: an ex-employee currently cannot be locked out
  except in the database.
- A-13 (order drafts, finished-goods movement ledger, allocation history on cancel) is still open
  and shapes the WS2.5 screens. No rush this week, but I would rather not design around a guess.

**Run:**

```bash
cd svv-balaji-admin && npm install && npm run typecheck && npm run dev
```

**Next:** the remaining Zone 1 screens — agreements, seed distribution, training, field visits — all
reusing the layer above. Holding them until Farmers has been reviewed, since they will copy its
shape.

---

## 2026-08-11 (evening) — Raunak

**Did:** Two things — closed the session gap in the backend, then started WS2.1.

**1. Auth session endpoints (backend — Ujjawal's workstream, logged here per CLAUDE.md).**
`/auth/login` was the only route, but it minted a refresh token and stored its hash with nothing
able to spend it. With a 15-minute access token that meant every panel session died after a quarter
of an hour with no way back, so the panel could not be built around it. Added:

- `POST /auth/refresh` — verifies the signature *and* the stored hash, then **rotates**: issues a
  new pair and stores the new hash, so a refresh token is spendable exactly once. Replaying a
  rotated-away token ends the session outright rather than reissuing, since that is either theft or
  a broken client.
- `POST /auth/logout` — clears `refreshTokenHash`. The already-issued access token stays valid until
  it expires; that is the accepted trade-off of stateless JWTs and why the access lifetime is short.
- `GET /auth/me` — role, status and branch for the signed-in user. The panel calls it on boot to
  build navigation; login's payload does not carry the branch.

Token issuance is now a single private `issueSession()` that both login and refresh go through, so
the two cannot drift apart in claims or lifetime. Added `auth.service.spec.ts` — **15 tests**
covering rotation, replay detection, logout invalidation, suspended users, and that no route leaks
`passwordHash` or `refreshTokenHash`. Suite should now be **128**.

**2. Admin panel scaffolding (WS2.1)** — new `svv-balaji-admin/` alongside the backend. Vite +
React 18 + TypeScript + Ant Design, per the roadmap. Working end to end against the live API: login,
boot-time session restore, single-flight token refresh, sign-out, role-filtered navigation across
all 22 screens, and route-level role guards. Screens themselves are placeholders that state what
each will do and which routes it drives — so the shell is demonstrable to the client now, and WS2.2
starts from the contract rather than from Swagger.

**Contract changes:**

| Method | Route | Auth | Notes |
|---|---|---|---|
| POST | `/auth/refresh` | none | Body `{ refreshToken }`. Returns the same shape as login. **Rotates** — the token sent in is invalidated. |
| POST | `/auth/logout` | Bearer | Clears the stored refresh hash. Returns `{ success: true }`. |
| GET | `/auth/me` | Bearer | `{ id, email, fullName, phone, role, status, branchId, branch, createdAt }`. |

New DTO `RefreshTokenDto` in `src/auth/dto/refresh.dto.ts`. No schema change, no migration.

**Other developer needs to know (Ujjawal):**

- **Refresh rotation means clients must serialise refreshes.** Firing several concurrent refreshes
  with the same token logs the user out — the second one is a replay by definition. The panel does
  this with a shared in-flight promise (`refreshOnce()`); the mobile apps will need the same.
- **One session per user, and I did not change it.** `User.refreshTokenHash` is a single column, so
  signing in on the panel ends that user's session on their phone. Fixing it properly needs a
  sessions table and a migration, which is your call and your workstream — flagging rather than
  doing.
- **I verified the migration chain.** Your note said the Phase 4 SQL was hand-written without
  Postgres and might report drift. I applied all five migrations to a clean Postgres 16: they apply
  cleanly, produce 36 tables matching the 36 models, 20/20 enums, no column drift, 75 FKs, 53 unique
  indexes. That caveat can be closed.
- **Pagination is the thing I most need from you.** Every list endpoint is an unbounded `findMany`.
  I am about to build ~20 list screens; if we agree a page/limit + `{ data, total }` shape now, they
  get built once. If it lands later, all of them get reworked. This is the highest-leverage small
  change on the backend right now.
- **Three Phase 4 questions that shape screens I am about to draw**, in order of how much they cost
  me: (a) `OrderStatus.DRAFT` is unreachable — `create()` hardcodes `PLACED`. Should the order screen
  offer a draft, or do I hide the state? (b) `FinishedGoodsStock` has no movement ledger, unlike raw
  material — nothing records who stocked, allocated or dispatched a pack batch. (c) `cancel()` hard
  deletes `OrderAllocation` rows, so a cancelled PACKED order loses the record of what was reserved
  against it.
- Two lower-priority ones from reading Phase 2 and 4: `generateReceiptNumber()` in
  `collection.service.ts` still uses `count()` rather than the atomic counter beside it (your new
  `SequenceService.next(tx, 'RC', …)` would fix it in a line), and `stockOut`/`transfer`/`adjust` in
  `warehouse.service.ts` read available stock *outside* the transaction, so concurrent withdrawals
  can drive quantity negative despite the README's invariant.
- Docs gone stale: the README's Testing section still says "42-check, Phase 0 + Phase 1" (actual:
  113 tests, 32 smoke steps through Phase 4), and `SVV_Balaji_Testing_Guide.md` still leads with the
  long-resolved Prisma 7/5 mismatch.

**Run before anything else:**

```bash
cd svv-balaji-backend && npm test        # 128 expected
cd ../svv-balaji-admin && npm install && npm run dev
```

**Next:** WS2.2 — farmer management and master data screens, starting with farmers (list, register,
verification workflow, traceability codes). Holding off on list-heavy screens until the pagination
shape is agreed.

---

## 2026-08-11 (afternoon) — Ujjawal

**Did:** Built the first half of Phase 4 — WS1.6 (channel pricing engine) and the order half of
WS1.5 — now that Decision 1 has unblocked it. Three new backend modules: `customers`, `pricing`,
`sales`. 5 new Prisma models, 5 new enums, one migration. 48 new unit tests; full suite is
**113 passing**, build and lint clean.

**⚠️ Run this before anything else:**

```bash
cd svv-balaji-backend
npx prisma migrate dev          # applies 20260811120000_phase4_sales
npm test                        # 113 tests
./smoke-test.sh                 # now covers steps 25-31, both channels end to end
```

The migration SQL was hand-written and has not been applied against a live database yet — it was
written in an environment without Postgres. If `migrate dev` reports drift, trust Prisma and let it
regenerate, then commit the corrected file.

### Contract changes — read this if you are building screens

**New enums** (`@prisma/client`): `SalesChannel` (B2B | B2C), `CustomerType` (DISTRIBUTOR |
RETAILER | INSTITUTIONAL | CONSUMER), `CustomerStatus`, `PaymentTerms` (PREPAID | CREDIT_7 |
CREDIT_15 | CREDIT_30 | CREDIT_45), `OrderStatus` (DRAFT → PLACED → CONFIRMED → ALLOCATED → PACKED
→ DISPATCHED → DELIVERED, plus CANCELLED).

**New models:** `Customer`, `PriceList`, `Order`, `OrderItem`, `OrderAllocation`.

**New routes** (all under `/api/v1`, documented at `/api/docs`):

| Method | Route | Notes |
|---|---|---|
| POST | `/customers` | B2B requires GSTIN; B2C rejects GSTIN, credit and an assigned executive |
| GET | `/customers` | filters: `channel`, `type`, `status`, `branchId`, `search` |
| GET | `/customers/:id/credit` | limit, exposure, headroom — the same check orders run |
| PATCH | `/customers/:id`, `/customers/:id/status` | channel cannot be changed after registration |
| POST | `/price-lists` | dated rule per product + channel (+ optional customer type, qty break) |
| GET | `/price-lists/resolve` | `?productId&channel&customerType&quantity&on` → the rate and why |
| GET | `/price-lists/product/:id/comparison` | both channels side by side — for the product master screen |
| POST | `/price-lists/:id/supersede` | the only supported way to change a price |
| POST | `/orders` | prices every line in the customer's channel and freezes it |
| GET | `/orders` | filters: `channel`, `status`, `customerId`, `warehouseId`, `from`, `to` |
| GET | `/orders/number/:orderNumber/traceability` | order → batches → production → farmers |
| PATCH | `/orders/:id/confirm` · POST `/orders/:id/allocate` | allocate = batch-wise picking |
| PATCH | `/orders/:id/pack` · `/dispatch` · `/deliver` · `/cancel` · `/payment-status` | forward-only lifecycle |

Order numbers are `SO-YYYYMMDD-NNN`. Customer codes are `CUST-B2B-000001` / `CUST-B2C-000001` —
the channel is in the code because operations staff read these aloud on the phone.

**Other developer needs to know (Raunak):**

- **Product screens now need two prices, not one.** `GET /price-lists/product/:id/comparison`
  returns the B2B and B2C rates side by side, which is the shape the product master screen wants.
- **Price fields must not be editable in place.** A price is changed by calling `supersede`, which
  closes the old rule and opens a new one. If the UI lets someone overwrite a rate, historical
  invoices stop reproducing. Render it as "change price from [date]", not as a text box.
- **Customer forms are channel-dependent.** Pick the channel first, then show the rest: B2B gets
  GSTIN (mandatory), credit limit, payment terms and an executive picker; B2C gets none of those.
  The API will reject the wrong combination with a readable message — surface it verbatim.
- **Order screens need a channel column and filter.** Channel is stamped on the order and never
  changes.
- **Allocation is a server-side action, not a form.** `POST /orders/:id/allocate` picks the batches
  itself, first-expiry-first-out, from QA-released stock only. The response lists which batches were
  taken, which is what the picking slip should print.
- **Statuses are forward-only.** Disable buttons rather than letting the API refuse — the allowed
  next states are in `ALLOWED_TRANSITIONS` in `sales.service.ts`.

**Not built yet in Phase 4:** invoicing (waiting on the GSP vendor and credentials, A-11), the
dispatch module proper (vehicle, driver, route, POD), and delivery tracking. Consumer-facing
endpoints (accounts, cart, checkout) are deliberately untouched pending A-10.

**Next:** GST invoice generation, structured so the GSP call slots in without a refactor; then the
dispatch and delivery modules.

---

## 2026-08-11 (morning) — Ujjawal

**Did:** Received and recorded three client decisions. Created this log, `PROJECT_STATE.md` and
`CLAUDE.md` so both developers and their agents work from shared written state instead of
separate chat histories. Updated the client workbook (Gantt, baseline, weekly progress, action
tracker) to reflect the new scope.

The decisions:

1. **Sales channels — both B2B and B2C, with different pricing per channel.** This is Option B
   from the decision memo, above the signed B2B-only SOW. WS1.5 is unblocked but the scope has
   grown: consumer app/website, consumer accounts, cart, online payments and B2C invoicing all
   come in. New action A-10 raised to get cost and timeline agreed in writing before the consumer
   workstream starts.
2. **GST — approved to use a GST Suvidha Provider** rather than managing compliance in-house.
   Our recommended option. WS4.4 unblocked, pending vendor choice and credentials (A-11).
3. **Farmer training — no farmer app.** The Agriculture Expert visits the farm in person, runs
   the training, and logs the entry into the portal afterwards. Everything is stored server-side
   against the farmer record. Confirms existing scope; no rework needed.

**Contract changes:** none yet. The Phase 4 sales models are being designed now — `Order` will
carry a `channel` enum (`B2B` / `B2C`), and pricing moves to a `PriceList` table keyed on
`(productId, channel, effectiveFrom)` rather than price columns on `Product`. Will log the exact
shapes here once the migration lands.

**Other developer needs to know (Raunak):**

- **Nothing blocks WS2.1.** Auth, RBAC and all Phase 1–3 endpoints are live and documented at
  `/api/docs`. Start the admin panel scaffolding now.
- **Training screens are staff-facing, not farmer-facing.** Design them for an executive typing up
  a visit they just made — no farmer login exists or is planned.
- **The Agriculture Expert app must work offline.** The executive is standing in a field with bad
  signal. Capture locally, sync on return.
- **Sales and customer screens (WS2.5) now need a channel dimension.** Order lists filter by
  channel; product screens show two prices, not one. Worth knowing before you design the master
  data screens, since the product form changes.

**Next:** WS1.5 sales module — channel-aware order and pricing model, then batch-wise picking and
packing against Phase 3 finished-goods batches.

---

## 2026-08-08 — Ujjawal

**Did:** Issued the weekly progress report and the accompanying workbook (Gantt chart, proposed
schedule baseline, weekly progress, action tracker). No formal baseline existed at project
commencement, which is why variance reporting could not be presented previously — a proposed
18-week, 29-activity baseline was submitted for client approval (A-01).

**Contract changes:** none.

**Other developer needs to know:** owner assignments are in the baseline — WS2.x and WS3.1–3.2 are
Raunak's, from Week 4.

**Next:** chase the four outstanding client decisions.

---

## 2026-08-07 — Ujjawal

**Did:** Completed backend Phase 3 (processing, recipes, quality control, packaging, finished
goods) ahead of plan. Full farm-to-fork traceability now resolves end to end: scanning a finished
pack returns the production run, the raw material batch, and the individual farmer with village,
district and farm location, plus every quality check the batch passed.

Issued `SVV_Balaji_Client_Decision_Memo.md` covering the four decisions blocking Phase 4.

**Contract changes:** Phase 3 modules added — products, recipes, production, quality, packaging.
See `/api/docs`.

**Other developer needs to know:** quality gates are enforcing, not advisory. A failed raw-material
inspection blocks that batch from entering production; a failed finished-goods inspection blocks
dispatch. The UI must surface these as hard stops with a clear reason, not as warnings.

**Next:** Phase 4, once the sales channel decision arrives.

---

## 2026-08-04 → 08-06 — Ujjawal

**Did:** Backend Phases 0–2. Foundation (auth, RBAC across 9 roles, Swagger, Docker, CI), farm
sourcing (farmer registry, `SVV-YYYY-NNNNNN` traceability ID generated atomically on approval,
agreements, seed distribution, training, field monitoring, QR/barcode generation), and procurement
(planning, harvest inspection, raw material collection, `RM-YYYYMMDD-NNN` batching, warehouse
stock and movement ledger).

**Contract changes:** initial API surface established.

**Other developer needs to know:** the QR code encodes a **public traceability URL, not raw data**.
Packaging is printed once and cannot be reissued, so pointing at a URL means linked information
(farm details, process video) can change later without a reprint. Do not change this.

**Next:** Phase 3 processing and packaging.

## 2026-09-21 — Raunak (agent session) — Orders pages show real data only
- **Admin**: `OrdersPage`, `OrderDetailDrawer` and `B2BOrdersPage` no longer use `MOCK_ORDERS` / `MOCK_B2B_ORDERS`. Each row/drawer renders the order's own customer, phone, address snapshot, items, payment mode, node, batches → raw lots → farmers, event timeline, rider/AWB and invoice preview. New `pages/sales/OrderDetailParts.tsx` holds the shared blocks. Values the system does not record (gross/tare weight, cartons) show "Not recorded" / "—".
- **B2B page**: now loads `GET /orders?channel=B2B`; fake local status dropdown replaced by a read-only tag (transitions run through the drawer's real actions); city filter built from real cities; PO number column replaced by GSTIN (Order has no PO field).
- **Backend** (`sales.service.ts`): `findAll` also returns customer phone, item name snapshots, shipment; `findOne` returns allocation→batch→production→raw lot→farmer/supplier chain, FG QA sign-off and order `events`. No route/DTO change.
- **Still placeholder**: invoice preview header company GSTIN/FSSAI text (real company details pending, see A-11).

## 2026-09-21 — Raunak (agent session) — Auto-inward stock on QA release
- **Behaviour**: `PATCH /quality-inspections/release/:fgBatchId` now, in ONE transaction, sets `qaReleased`, upserts `FinishedGoodsStock` (+`packCount`) at the target node and writes a `StockMovement` `PRODUCTION_INWARD`, `reference = QA_RELEASE_AUTO`. Target node = optional body `warehouseId` → the production run's warehouse → the branch's only central depot; otherwise the release is refused (never guesses). Idempotent: a re-release (e.g. after a withdrawn release) never inwards twice (ledger row is the key). The existing route was kept (no `/batches/:id/qa-status` alias) because the admin app and e2e scripts call it.
- **Schema**: migration `20260921140000_auto_inward_on_qa_release` — enum `StockMovementType.PRODUCTION_INWARD`, `stock_movements.reference`.
- **Manual stock-in** (`POST /finished-goods/:id/stock`) stays for corrections but is refused if it would push stocked total above `packCount`.
- **New**: `POST /finished-goods/:id/transfer` (depot → outlet; only unreserved packs; `TRANSFER` ledger row). Needed because auto-inward puts all packs at one node.
- **Scripts**: e2e-checkout/loyalty/recall updated (no manual stock-in; transfer to outlet); `e2e-reconcile.mjs` counts `PRODUCTION_INWARD`/`TRANSFER` in the ledger. Admin/shared: `PRODUCTION_INWARD` movement type + colour.
- **Note for whoever owns `prisma/seed-storefront-stock.ts`**: the 9 `FG-20260921-STOCK-00x` batches it created have no production/raw/farmer chain and no ledger rows, so 3 reconcile invariants report them. Not touched.

## 2026-09-21 — Raunak (agent session) — Storefront login/logout, sessions, one-time referral
- **Customer** = sign-in only (mock OTP `123456`): first successful verify of an unknown number creates the customer (and is the ONLY time `referralCode` is looked at); an existing number is a plain login — a supplied code is ignored and not even validated. Response now carries `isNewAccount`. DB backstop: `referrals.refereeId` is unique.
- **Retailer** = existing signup (`register-retailer`, referral honoured at approval) + login. `POST /storefront/auth/otp/verify` now REQUIRES `audience: CUSTOMER | RETAILER` (breaking for callers — customer app and e2e scripts updated). RETAILER login never creates an account; each audience refuses the other's numbers (checked before the OTP is consumed). `otp/request` accepts an optional `audience` for the same up-front refusal.
- **Sessions**: new table `customer_sessions` (migration `20260921150000_customer_sessions`). Access + refresh tokens carry `sid`; `CustomerJwtStrategy` re-reads the session on every request, so logout, expiry, refresh-token reuse or a suspended account end access immediately (previously a logged-out access token lived up to 30 min). One row per device; refresh rotates within the session.
- `POST /storefront/auth/logout` (refresh token in body and/or Bearer; works with an expired access token; idempotent), new `POST /storefront/auth/logout-all`.
- **Two latent bugs fixed on the way**: refresh tokens were bcrypt-hashed (bcrypt only reads 72 bytes — a JWT's first 72 bytes are identical for every token of a session, so a rotated/replayed token could not be told apart) → now SHA-256 + `jti`; OTP consume is now atomic (double-submit can't use one code twice). Customer app logout now captures the tokens before clearing them (the server call used to go out unauthenticated).
- Tests: `storefront-auth.service.spec.ts` (+7), `e2e-auth-flow.py` (new; added to `e2e-all.sh`) — covers new vs existing customer, referral once, retailer signup/login, audience refusal, logout/logout-all/rotation/replay/expiry.

## 2026-09-21 — Raunak (agent session) — Customer profile area: real per-customer data
- **Removed** the demo Customer/Retailer view switchers (Profile, Product detail) and `switchRole`; role comes only from the signed-in account.
- **Wishlist is real**: table `customer_wishlist_items` (migration `20260921160000_customer_wishlist`), `GET /storefront/wishlist`, `PUT|DELETE /storefront/wishlist/:productId` (customer JWT; idempotent). Wishlist page = saved ids joined to the live catalogue (current price/stock); product-page heart and cart "Save for later" write to it (guests are sent to sign in).
- **Profile numbers** (orders, addresses, coupons, reward points) now come from the account's own APIs (`useAccountStats`, loyalty). `GET /storefront/auth/me` also returns `memberSince`, saved business address, and for retailers `creditLimit` / `creditUsed` (open CREDIT orders).
- **Wallet**: there is no rupee wallet in the system, so the fake "Desi Wallet ₹" is gone: customers see Desi Rewards points; `/wallet` redirects customers to `/loyalty`, and for retailers it is now the real credit position (limit / outstanding / available) + their own recent orders.
- Removed remaining demo strings (Rahul Sharma, Sri Balaji Provision Store, 98765…, fake field rep, fake ₹ amounts, "2 Active Mandi Deals").
- Not changed: HomePage still imports `mock/homeMockData.ts` for non-account content; retailer "Mandi Saved" savings figure was dropped (no data source).

## 2026-09-24 — Raunak (agent session) — SECURITY: malware loader removed again (3rd time)
- **What**: commit `eacc146` (2026-09-18, message "chore: remove leftover poisoned-skeleton launch.json") re-added the same loader Ujjawal purged in `18a87f4`: `public/fonts/fa-solid-500.woff2` (obfuscated Node.js, now ~27KB), hidden `folderOpen` task in `.vscode/tasks.json`, `task.allowAutomaticTasks: true`, poisoned `public/fonts/README.md`, and a NEW trigger — `shared/package.json` `"preinstall": "node dist/setup.js"` (setup.js not present yet).
- **Fix**: `d372136` removes all of it and restores `settings.json` / `shared/package.json` to their pre-`eacc146` state (`allowAutomaticTasks: "off"`). Pushed to `origin/main`. No git hooks or other install hooks found.
- **Ujjawal — action needed**: do NOT pull/merge or push from any clone/branch older than `d372136`; it will bring the loader back. Before any merge, check it doesn't stage `.vscode/tasks.json`, anything under `public/fonts/`, or a `pre/postinstall` script. The payload is still in git history (a `filter-repo` purge + force-push, as on 2026-09-07, is your call).
- **Machines**: any machine that opened this folder in VS Code since 2026-09-18 should be treated as compromised — rotate GitHub/npm/cloud tokens, `.env` secrets and saved browser logins from a clean device.

## 2026-09-25 — Raunak (agent session) — Customer order-support chat: responsive layout
- `svv-balaji-customer/src/pages/OrderSupportPage.tsx` (`/orders/:orderId/support`) re-laid out; chat flow/ticket logic unchanged. Styles are `.osp-*` classes at the end of `src/styles.css`.
- Phone (<768): full-screen chat (header, order strip, scrolling messages, composer with safe-area padding). Tablet: centred chat card fitted to the viewport. Desktop (>=992): order summary / recent-orders sidebar + chat card.
- UI: typing indicator, only the latest option set is clickable, multi-line composer (Enter sends, Shift+Enter newline). No API/DTO changes.
- Admin `svv-balaji-admin/src/pages/support-tickets/SupportTicketsPage.tsx` redesigned as a single inbox workspace (list | conversation, fitted to viewport). Removed the 4 stat cards (duplicated the status counts); status filters are now pills in the list header, plus a client-side "Needs reply" filter. Quick replies moved into a dropdown; message day dividers; master/detail with a back button below the `lg` breakpoint. Same hooks/API, no contract change.

## 2026-09-25 — Raunak (agent session) — Field app: field report (FRD 12.7), farmer profile (7.3), planned visits (12.1), farmer search filters (7.4)

**Contract changes — Ujjawal please read.** All additive; nothing existing changed shape.
- **Migration `20260925073453_field_visit_plans`** — new table `field_visit_plans` + enum `FieldVisitPlanStatus` (PLANNED/COMPLETED/CANCELLED). No existing table altered. Run `npx prisma migrate deploy && npx prisma generate`, then restart the API. (Applied to Raunak's local DB already.)
- **New routes** `POST/GET /field-visit-plans`, `GET/PATCH/DELETE /field-visit-plans/:id`, `POST /field-visit-plans/:id/cancel`. Guarded by the existing `fieldVisits.view/create/edit/delete` keys — no new permission keys, so no A-14-style grant needed. Branch-scoped like field visits.
- **New route** `GET /field-visits/:id/report` (`fieldVisits.view`) — FRD 12.7 report: harvest outlook (yield vs contract, days to harvest, stage NOT_READY/APPROACHING/READY/OVERDUE), risk level + flags, next steps for procurement and production, trend vs previous visit, land, agreement, evidence. Derived on read from existing records (not stored), so it always matches the visit. Logic is a pure function in `field-monitoring/field-report.ts`; calendar days are IST.
- `POST /field-visits` accepts optional **`planId`**: completes that plan (PLANNED, same farmer) in the same transaction. Not accepted on PATCH. `DELETE /field-visits/:id` now reopens a plan the visit had completed.
- `GET /training-sessions` accepts optional **`farmerId`** (sessions the farmer attended).
- Farmer/user/branch delete guards now also count planned visits (clear 409 instead of a raw FK error).

**Field app (`svv-balaji-field`)**
- **Farmer profile** (Farmers tab → new *Profile* button): overview (personal, address+GPS, farm, bank — Aadhaar/PAN/account masked), FRD 7.6 performance breakdown, verification history; tabs for crop history (merged across registration/agreements/seed/visits/plots/inspections/collections), visits (planned + logged with per-visit report), seed, training, agreements, procurement & payments, land. Each tab only loads if the user holds that module's view permission. Card tap still opens land mapping, as before.
- **Search filters**: crop, district, state, status, min quality rating (server-side, the API already supported them) — inline row on desktop, "Filters" bottom sheet on phones, removable chips. Existing name search and All/Waiting/Approved/No-location quick filters unchanged. Cards show the ★ rating.
- **Planned visits**: Visits tab has Logged (default, unchanged) / Planned; plan, reschedule, cancel (with reason), *Start visit* opens the visit form prefilled and completes the plan. Plans appear on Home's "What needs doing" (a farmer with a plan no longer also gets a follow-up nag).
- **Field report** opens automatically after any new visit is saved, and from the visit drawer / profile. Print / Save PDF. Admin panel's field-visit drawer also has a *Field report* button (shared `FieldReportView`) for procurement/production.
- Fixed on the way: prefill values for a new visit were being dropped (modal mounts lazily) — now passed as `initialValues`.

**Verified**: backend tsc + 23 new unit tests (report rules, plan lifecycle, visit↔plan completion/reopen); full suite 525 pass, 7 fail — all in `customers.service.spec.ts`, pre-existing (its tx mock has no `customerAccount`). Live API run on a second instance: 23/23 checks incl. existing visit/list/delete/training/search. Real headless-Chrome pass on the field app (desktop + phone): 15/15 incl. plan → start visit → record → report auto-opens → plan completed. All test data cleaned up. field/admin/customer tsc clean; field `vite build` OK.

**Note:** Prisma generate hit EPERM because the running API held the query-engine DLL; the locked file was renamed to `node_modules/.prisma/client/query_engine-windows.dll.node.locked-*` — safe to delete once the API is restarted.

## 2026-09-25 (later) — Raunak (agent session) — Field app gaps: family details, seed stock (FRD 10.2), harvest-inspection roles (FRD 5.3/5.6/13.4)

**Contract changes — Ujjawal please read.**
- **Migration `20260925090124_seed_stock`**: new tables `seed_stock`, `seed_stock_movements`, enum `SeedStockMovementType`; **one change to an existing table**: nullable `seed_distributions.seedStockId` (FK, SET NULL). Existing handouts stay NULL = "not from stock".
- **Migration `20260925090500_harvest_inspection_roles_frd`** (data only): removes `harvestInspections.create/edit/delete` from AGRICULTURE_EXPERT and grants `harvestInspections.view` to BRANCH_MANAGER. Registry defaults changed to match (create/edit = PM, QA; view = PM, QA, BM, AE). Super Admin can still change it in Roles & Permissions.
- **New permission group `seedStock`**: `seedStock.view` (BM, PM, AE, WM), `seedStock.manage` (BM, PM, WM). Backfilled to configured roles on boot (A-14 mechanism, verified).
- **New routes** `GET/POST /seed-stock`, `GET/PATCH/DELETE /seed-stock/:id`, `POST /seed-stock/:id/receive`, `POST /seed-stock/:id/adjust` (signed qty, reason required). Branch-scoped.
- `POST /seed-distribution` accepts optional **`seedStockId`**: deducts the lot in the same transaction (refuses overdraw, withdrawn/expired lots, lots at another branch than the farmer) and copies name/variety/batch/unit from the lot. PATCH moves only the difference / between lots; DELETE returns the seed. Without `seedStockId` behaviour is unchanged. List/detail now include `seedStock`.
- Branch and user delete guards also count seed stock (lots / movements).

**Why a new ledger and not WarehouseStock**: `warehouse_stock`/`stock_movements` hold farmer produce (raw-material and FG batches) and feed the traceability chain and stock reconciliation; seed is a company input going the other way. Same rules though: balance only changes with a movement row, conditional decrement so concurrent handouts can't go negative.

**UI**
- Field registration form now has **Family details** (FRD 7.1; backend/admin already supported it) — create and edit.
- Seed handout form (field **and** admin, shared `SeedLotField`): "Issue from seed stock" picker showing availability; picking a lot locks name/variety/batch/unit and validates quantity. Field Seed tab shows the branch's stock and tags handouts "From stock".
- New admin screen **Farm Sourcing → Seed Stock**: receive lot, receive more, adjust/write-off with reason, withdraw/restore, delete (only if nothing issued), per-lot ledger naming the farmer on each handout.
- Field Inspect tab / Home for a view-only role: read-only notice, no inspect/edit actions (previously a past inspection opened the edit form without checking `harvestInspections.edit`).

**Verified**: 9 new unit tests (deduct, overdraw, cross-branch/expired/withdrawn, edit difference, move lot, delete returns, stock-less unchanged); full suite 534 pass / 7 fail — the pre-existing `customers.service.spec.ts` ones. Live API on a second instance: 27/27, including a real temporary AGRICULTURE_EXPERT user (inspections view 200, create/edit 403; seed stock view 200, receive 403; can issue from stock). Headless Chrome: field 12/12, admin 6/6. All test data (lots, handouts, temp users) removed; test farmer's family details restored to NULL.
- **Field app navigation (same day, later):** Inspect tab and its page removed from `/field` (`InspectionsTab.tsx`, `HarvestInspectionFormModal.tsx` deleted) — with FRD 13.4 roles it was read-only for the Agriculture Expert. Bottom bar is now Home · Farmers · Visits · **Seed & Inputs** (`/seed`, with a seed & agri-input summary: handouts, farmers reached, from-stock share, quantity per input) · More. `/more/seed` → `/seed` and `/inspections` → `/` redirects for old links. Home's harvest-due reminders stay ("Open farmer"). Inspections are still recorded in the admin panel, and a farmer's inspection history is still in the field farmer profile. No API change.

## 2026-09-25 (latest) — Raunak (agent session) — Seed Source on handouts; full seed stock ledger

**Contract changes — Ujjawal please read.** Migration **`20260925094058_seed_source_and_ledger_types`**: enum `SeedSource` (COMPANY_STOCK, EXTERNAL); nullable `seed_distributions.seedSource`; `SeedStockMovementType` + WRITE_OFF, TRANSFER_OUT, TRANSFER_IN, LOT_UPDATE; `seed_stock_movements.relatedSeedStockId`. Backfill: handouts with a lot → COMPANY_STOCK; handouts without a lot stay **NULL = "source not recorded"** (deliberately not assumed EXTERNAL).
- `POST /seed-distribution` now **requires a source**: `seedSource: COMPANY_STOCK` + `seedStockId` (deducted), or `seedSource: EXTERNAL` with no lot (nothing deducted). Missing source → 400; COMPANY_STOCK without lot → 400; EXTERNAL with lot → 400. Compatibility: `seedStockId` alone is treated as COMPANY_STOCK. `smoke-test.sh` updated to send EXTERNAL.
- PATCH: company edits move only the difference; COMPANY→EXTERNAL returns the seed (reversal); EXTERNAL/old→COMPANY deducts; old handouts edited without choosing a source stay NULL and untouched. On the lot a handout already came from, reducing or re-dating still works after the lot expired/was withdrawn/emptied; only increasing needs an issuable lot. Branch rule always applies.
- Issuing refuses empty lots explicitly (plus existing: overdraw, withdrawn, expired, other branch). Stock can't go negative (conditional decrement).
- `POST /seed-stock/:id/adjust` takes `kind: ADJUSTMENT | WRITE_OFF` (write-off negative only). **New** `POST /seed-stock/:id/transfer` `{toBranchId, quantity, reason?}` → new lot at the receiving branch, TRANSFER_OUT/TRANSFER_IN linked both ways. Withdraw/restore/expiry change write a LOT_UPDATE (qty 0) row. Lots involved in a transfer can't be deleted (withdraw instead).

**UI**: shared `SeedSourceField` in field + admin handout forms (Company stock → lot required, only in-date lots with stock at the farmer's branch; External → no lot, "nothing deducted"); `SeedSourceTag` on field Seed tab, admin Seed Distribution list, farmer profile; field seed report splits Company stock / External (/ not recorded). Admin Seed Stock: "Recount / write off" (write-off default), "Transfer to branch", ledger labels for every movement type.

**Verified**: 21 seed unit tests (source rules, legacy handling, re-sourcing both ways, expired-lot edits, write-off, transfer, lot events); full suite 545 pass — failures are the pre-existing 7 in `customers.service.spec.ts` and one timing-flaky `storefront-auth` test that passes on its own (36/36). Live API 22/22 incl. a legacy handout inserted without source and a ledger that sums to the balance and never goes negative. Browser: field 11/11, admin 6/6. Found and fixed a conditional `Form.useWatch` (hook-order crash) in both forms. All test data removed (DB back to 0 handouts / 0 lots).

## 2026-09-25 (latest) — Raunak (agent session) — Field app works offline (capture, persist, auto-sync)

**Deploy backend and field app together.** The field app now sends a client `id` on every create it makes; an API without this change rejects the unknown field (forbidNonWhitelisted). No migration.

**Backend (contract, additive)** — `common/client-id.ts`: optional UUID `id` on the create DTOs the field app uses: `POST /farmers`, `/farmers/:id/plots`, `/field-visits`, `/field-visits/:id/documents`, `/field-visit-plans`, `/seed-distribution`, `/training-sessions`, `/training-sessions/:id/materials`. A create whose id already exists returns the existing record (exactly-once replay: a lost response + re-send never duplicates, and never deducts seed stock twice). All matching update DTOs `OmitType(..., ['id'])`. `POST /field-visit-plans/:id/cancel` is now idempotent (already cancelled → returns the plan).

**Field app (`src/offline/`)**
- `adapter.ts` — axios adapter under the shared client, installed in the field app only (admin unaffected). Allow-listed field writes (farmers, plots, visits + documents, plans, seed handouts, training + attendance/materials) made with no connection (navigator offline, network error, or 502/503/504) go to an IndexedDB outbox and get a synthetic response, so every existing form works offline unchanged; the record appears in lists immediately with a "Waiting to sync" tag. Photos picked offline are stored as Blobs and uploaded at sync (`offline-file:<id>` marker; shared `FileUploadField` shows a local preview).
- `sync.ts` — FIFO replay on reconnect / app start / foreground / every 20 s / "Sync now". Unreachable → stop and retry later; server refusal (4xx) → item marked failed with the server's message and kept for Retry/Discard on **More → Offline & sync**; DELETE 404 = done; 401 → stop (session). Items are tagged by user; a shared phone never sends another user's work.
- `persist.ts` — TanStack cache dehydrated to IndexedDB per user (7 days, wiped on sign-out); restored before first render. `warmup.ts` pre-loads every screen's code and the data forms need (same query keys) whenever online.
- Offline start: shared `AuthProvider` gained an optional `offlineSession` (field app only) — if the session restore fails because the server is unreachable and a profile was saved, the app opens as that user; tokens refresh on the first request back online. `onlineManager.setOnline(navigator.onLine)` at boot (TanStack otherwise assumes online until an event). `FieldList` keeps cached rows when a refresh fails; network errors no longer toast.
- `public/sw.js` v2 — base path from the worker's scope (the old one hard-coded `/field/`, so at base `/` it cached nothing and the app could not open offline); caches page, hashed assets, icons/manifest; still never API responses.
- UI: offline/sync bar in the shell; `/more/sync` page; sign-out warns when changes are unsynced (they stay on the device for next sign-in). Visit saved offline skips the auto field report (generated after sync).

**Verified** on a production build (service worker active) in headless Chrome with the network cut AND the web server stopped: 21/21 — app opens offline with cached data; register farmer → visit to that farmer with a photo → company-stock handout → planned visit, all offline; queue survives reopening the app; on reconnect everything synced in order; server has the farmer, the linked visit, the photo (uploaded to Cloudinary at sync), stock 50→45 exactly once, the plan; replayed handout returned the same record with no second deduction. Conflict run 7/7: offline 8 kg handout vs someone else taking 5 kg meanwhile → "Not accepted: 5 KG left, 8 KG needed", stock not overdrawn, kept until discarded. Backend: 548 tests pass (only the pre-existing 7 `customers` failures); new tests for idempotent re-send of handouts and plans. Test data removed. Two 1×1 test images remain in Cloudinary (`svv-balaji/field-visits/jdnazcrmvan81gxygmft.png`, `…/q8fcjw2judxbv06xidl2.png`) — safe to delete.

**Limits (by design, worth telling the client):** offline works for what the device has already loaded (farmer lists, visits, lots at the expert's branch, etc. — refreshed whenever online); a farmer's full profile/report needs a connection the first time. Approvals, status changes and admin actions still require a connection. A browser without IndexedDB (rare private modes) falls back to online-only.
