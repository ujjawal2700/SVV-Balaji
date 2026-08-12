# SVV Balaji — Admin Web Panel

Ops panel for the Farm-to-Customer Supply Chain Management System. React + TypeScript (Vite) +
Ant Design, talking to `svv-balaji-backend` over its documented REST API.

**Status: WS2.1 complete, WS2.2 in progress.** The shell, session layer, role-based navigation and
the shared data/table/validation layer are all real. **Branches, Users and Farmers** are built
against the live API; the remaining menu entries open a page describing what they will do and which
API routes they drive.

## Getting started

The API must be running first (`svv-balaji-backend`, on port 3000).

```bash
cp .env.example .env      # optional - the defaults point at the dev proxy
npm install
npm run dev               # http://localhost:5173
```

Sign in with the seeded Super Admin — `admin@svvbalaji.com` / `ChangeMe@123` unless the seed
script printed something else.

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint
npm run build       # typecheck + production build to dist/
```

## How the session works

The API issues a 15-minute access token and a rotating refresh token. Three decisions follow from
that, and they are the part of this codebase most worth understanding before changing anything.

**The access token is never persisted.** It lives in a module variable in `src/api/tokenStore.ts`.
It expires in minutes and is replaced constantly, so writing it to storage buys nothing and widens
the blast radius of an XSS bug. Closing the tab discards it.

**The refresh token is in `localStorage`.** It has to survive a page reload — otherwise every hard
refresh dumps the user back at the login screen — and this API has no httpOnly cookie session to
lean on instead. That is a known trade-off, not an oversight. If refresh later moves to a cookie,
`tokenStore.ts` is the only file that changes.

**Refreshes are single-flight, and that is mandatory.** The backend *rotates* refresh tokens and
treats a replayed one as theft, ending the session outright. If three requests each fired their own
refresh with the same token, two would be replays and the user would be logged out mid-task. So
`refreshOnce()` in `src/api/client.ts` shares one in-flight promise across every caller. Do not
"simplify" that away.

Boot sequence on a page load: if a refresh token exists → `POST /auth/refresh` → `GET /auth/me` →
render. If it fails, the session is cleared and the login screen appears. `RequireAuth` waits for
that to settle before deciding, so a valid session is never bounced in the gap.

## Navigation and permissions

`src/layout/navigation.tsx` is the single source of truth for what exists in the panel and who may
see it. **Both the sidebar and the router are generated from it**, so a screen cannot appear in one
and be missing from the other. Adding a screen means adding one entry there and, when the real
component is ready, one line in the `SCREENS` map in `src/App.tsx`.

Each entry declares its `roles`. These mirror the backend's `@Roles()` decorators, widened where a
role plainly needs to *read* a screen it cannot write to — an Agriculture Expert needs the farmer
list even though only Procurement can register one. Super Admin is granted everything implicitly by
`hasRole()` and is never listed.

**This is a usability layer, not a security one.** The API enforces the real boundary and would
refuse the request anyway. The point of hiding a menu item is that a Warehouse Manager should not be
shown a screen that will only hand them a 403 when they touch it.

## Rules the UI has to respect

These come from backend behaviour, not preference. Getting them wrong produces bad data, not just a
bad screen.

| Rule | Why |
|---|---|
| **Prices are never edited in place.** Changing a rate means `POST /price-lists/:id/supersede`, which closes the old rule and opens a new one. Render it as *"change price from [date]"*, never a text box. | An order line freezes the price rule that produced it. Overwriting a rate stops historical invoices reproducing. |
| **Customer forms are channel-first.** Pick B2B or B2C, then render the rest: B2B needs a GSTIN, credit limit, payment terms and an executive; B2C gets none of those. Channel cannot be changed after registration. | The API rejects the wrong combination with a readable message — surface it verbatim rather than replacing it. |
| **Order status is forward-only.** Disable the buttons rather than letting the API refuse. The allowed transitions are in `ALLOWED_TRANSITIONS` in the backend's `sales.service.ts`. | |
| **Allocation is a server action, not a form.** `POST /orders/:id/allocate` picks batches itself, first-expiry-first-out, from QA-released stock only. The response says which batches were taken — that is what the picking slip prints. | |
| **Quality results are hard stops.** A raw-material FAIL rejects the batch; a finished-goods FAIL withdraws QA release and blocks dispatch. Show them as blocks with a reason, never as warnings. | |
| **Training and field-visit screens are staff-facing.** Design for an executive typing up a visit they just made. There is no farmer login and none is planned. | |
| **Multigrain production is flag-gated.** A `MULTI_GRAIN` recipe can be created and approved, but starting a production run from it fails with an explicit message until the client confirms scope. | The UI has to handle a recipe that exists but cannot be run. |

Error messages from the API are worth showing verbatim — *"Order of 12000.00 would take
CUST-B2B-000004 to 58000.00 against a credit limit of 50000.00"* tells the user far more than
"Request failed". `apiErrorMessage()` in `src/api/client.ts` extracts them.

## The four rules for adding a screen

1. **Add one entry to `src/layout/navigation.tsx`.** That registers it in both the menu and the
   router. Add one line to `SCREENS` in `src/App.tsx` when the component is ready.
2. **All server state goes through TanStack Query.** No `useEffect` fetching. Add the key to
   `src/api/queryKeys.ts` — never write a literal key in a component — and put the request in an
   `src/api/<resource>.ts` module that returns `ApiResult<T>` / `Paginated<T>`.
3. **Lists use `<DataTable>`.** It owns loading, error-with-retry, empty and pagination so twenty
   screens cannot each get them subtly different.
4. **Gate actions with `<Can do="…">` or `useCan()`**, and register the permission in
   `src/auth/permissions.ts` citing the backend `@Roles()` it mirrors.

## The response envelope

The API returns bare payloads today — `GET /farmers` gives a plain `Farmer[]`. Screens are
nonetheless written against a standard envelope:

```ts
ApiResult<T>   { data: T }
Paginated<T>   { data: T[]; meta: { total, page, limit } }
```

`src/api/envelope.ts` adapts whatever the server actually sends. A bare array is reported as a
single full page — which is exactly what it is. When the backend adopts the envelope and pagination
(action A-12), those adapters become pass-throughs and **no screen changes**. That is the whole
point of putting them there now.

`pruneEmpty()` in the same file matters more than it looks: the API's ValidationPipe runs with
`forbidNonWhitelisted: true`, so an untouched optional field submitted as `""` is a 400, not an
ignored value. Antd forms produce exactly those.

## Validation

`src/validation/rules.ts` mirrors the backend's class-validator DTOs field for field, and each rule
cites the server-side rule it mirrors. GSTIN is copied verbatim from `customers.service.ts`;
cross-field rules cover `netWeight <= grossWeight`, `effectiveTo > effectiveFrom`,
`scheduledTo >= scheduledFrom` and `expiry > manufacturing`.

Client validation is a courtesy — it catches a typo before a round trip and puts the error next to
the field. **The server stays the authority**, and where the two disagree the server's message is
what the user sees.

## Layout

```
src/
  api/
    client.ts        axios instance, single-flight refresh interceptor, error extraction
    tokenStore.ts    where the tokens live - the only file that knows
    envelope.ts      ApiResult / Paginated / unwrap / pruneEmpty
    queryKeys.ts     every React Query key, in one hierarchy
    types.ts         domain types mirroring the Prisma models
    auth.ts  branches.ts  users.ts  farmers.ts
  auth/
    types.ts         UserRole mirror, AuthUser, hasRole()
    permissions.ts   every guarded action -> roles, citing the backend @Roles()
    useCan.ts        useCan('FARMER_APPROVE')
    AuthProvider.tsx session state, boot-time restore, login/logout
    RequireAuth.tsx  RequireRole.tsx
  components/
    DataTable.tsx    the one table - loading, error, empty, pagination
    PageHeader.tsx   Can.tsx
  hooks/             useBranches, useUsers, useFarmers (queries + mutations)
  validation/rules.ts
  layout/
    navigation.tsx   SINGLE SOURCE OF TRUTH for screens + permissions
    AppLayout.tsx    sider, header, role-filtered menu
  pages/
    branches/  users/  farmers/
    LoginPage  DashboardPage  PlaceholderPage  ForbiddenPage  NotFoundPage
  App.tsx            routes, generated from navigation.tsx
  main.tsx           providers + global query/mutation error handling
  theme.ts           Ant Design tokens - swap colorPrimary when branding lands
```

## Known gaps

- **Pagination and the response envelope are not agreed yet (action A-12).** Every list endpoint
  returns an unbounded array. The adapter layer absorbs it, but until the backend paginates, a large
  farmer list is fetched whole and paged in the browser.
- **`GET /users` has no `branch` relation**, so the users screen fetches all branches separately to
  render a branch name. Raised with Ujjawal.
- **No `PATCH /users/:id`** — a user cannot be deactivated, have their role changed, or their
  password reset from the panel.
- **One session per user.** The backend stores a single `refreshTokenHash`, so signing in here ends
  that user's session in the mobile app. Concurrent sessions need a sessions table and a migration.
- **No tests yet.** The refresh interceptor, `hasRole`/`useCan`, and the envelope adapters are the
  three worth covering first.
- **Theme is a placeholder.** No brand palette has been supplied.
