# SVV Balaji — Customer storefront (WS3.5)

The public shop, and the destination of the QR code printed on every pack.
Served from the domain root. FRD sections **29** (customer portal) and **30**
(product traceability).

> **Scope note.** WS3.5 is the B2C workstream, still conditional on action
> **A-10** — cost and timeline for the storefront in writing, outstanding since
> 18 Aug. This folder is the scaffold: routing, shell, cart and the app's place
> in the deployment topology. The screens themselves are not built, and each one
> says so and names what it is waiting for.

---

## The three front ends

```
svvbalaji.com          →  svv-balaji-customer   this app        base '/'       :5175
svvbalaji.com/admin    →  svv-balaji-admin      staff panel     base '/admin/' :5173
svvbalaji.com/field    →  svv-balaji-field      expert PWA      base '/field/' :5174
svvbalaji.com/api      →  svv-balaji-backend    NestJS API                     :3000
```

This is the only build with `base: '/'` and therefore the only router with no
`basename`. The three must agree with nginx or an app loads and then fetches
somebody else's `index.html` where it expected a script — a white screen with
`Unexpected token '<'` in the console.

## Development

Start all four. Then open **http://localhost:5175 and nothing else.**

```bash
cd svv-balaji-backend  && npm run start:dev   # :3000
cd svv-balaji-admin    && npm run dev         # :5173
cd svv-balaji-field    && npm run dev         # :5174
cd svv-balaji-customer && npm install && npm run dev   # :5175  ← the front door
```

This dev server proxies `/api`, `/admin` and `/field` to the other three, so the
development URL map is identical to the production one. Visiting each app on its
own port instead tests a topology that will never ship: relative `/api` calls,
same-origin storage and cross-app links all behave differently across origins.

If `/admin` or `/field` returns `ECONNREFUSED`, its own dev server is not
running. That is the usual cause, and the error is honest.

## What is shared, and what is not

```
shared/     API types, client, hooks, auth       →  imported by all three apps
src/        screens, layout, cart, theme         →  owned by this app
```

Same rule as the field app: if the backend changing would break it, it lives in
`shared/`. Screens are not shared. This one is organised around a shopper, who
has no roles, no permissions and no idea what a batch is.

Two things this app deliberately does **not** use from `shared/`:

- **the permission registry.** A customer's access is decided by ownership —
  your orders are yours — enforced on the server. `useCan` is a staff concept.
- **`RequireAuth`.** It redirects and forgets where you were going. Customers hit
  the gate mid-purchase, so `src/auth/RequireAccount.tsx` preserves the
  destination instead.

## The cart

Client-side, in `localStorage`, until checkout — see `src/cart/CartProvider.tsx`
for why. It sits *above* `AuthProvider` in `main.tsx` so signing in mid-checkout
cannot empty it.

The price held on a cart line is for display only. Checkout re-prices every line
on the server and the order is created from that number. A cart can sit in a
browser for a week, and a client-held price that is trusted is a discount anyone
can grant themselves with dev tools.

## What has to exist before the screens can be built

These are not TODOs; they are dependencies on other people's work, and each is
repeated on the screen it blocks.

| # | Blocker | Owner |
|---|---|---|
| 1 | **No `CUSTOMER` role.** `UserRole` has no such value and no customer credential exists anywhere in the schema — B2B customers are records created by staff, with no way to log in. Blocks sign-in, registration, orders, checkout. | Backend (WS1.x) |
| 2 | **Trace is auth-gated (audit finding M1).** `GET /api/v1/trace/:fgBatchNumber` sits behind the guard, so the QR *already printed on packaging* resolves to a login screen. Needs a public route returning a **public projection** — the internal response carries farmer phone numbers, bank details and supplier rates. | Backend (WS1.x) |
| 3 | **No public product listing.** Everything under `/api/v1/products` is behind the staff guard. A shop that needs a login to show prices has no shoppers. | Backend (WS1.x) |
| 4 | **No B2C order path.** `Order` assumes a B2B `Customer` with a credit limit, payment terms and a price list. A walk-up shopper has none. Reuse or separate model is a client decision. | Client + backend |
| 5 | **No reviews schema** (FRD 29.5). No review table, no aggregate, no rule on who may write one. Settle verified-purchase-only *before* the table exists. | Backend (WS1.x) |
| 6 | **No payment gateway chosen** (WS4.x). | Integrations |

## Not a PWA

Unlike the field app, there is no service worker and no install prompt. A
shopper opens this once from a QR code; an app shell cached on their phone
serves nobody and would need a cache-busting deploy story for the sake of it.
Add one when there is a reason, not by symmetry.
