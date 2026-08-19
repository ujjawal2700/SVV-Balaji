# Verification pass — 16 August 2026

Everything built on 15–16 August has been syntax-checked and never executed.
This is the order to prove it in, arranged so the cheapest checks fail first.

**Stop at the first failure and fix it.** Later stages sit on top of earlier
ones, and a broken `shared/` migration will produce confusing symptoms in every
stage after it.

Three migrations, one new application, a rewritten permission system and 58
re-export shims are in this batch. That is a lot to land at once; the compressed
answer to "did it work" is stages 0–3.

---

## Stage 0 — It compiles (2 minutes)

Fastest, and catches the highest-risk change of the lot.

```
cd svv-balaji-backend
npx prisma generate
npm run build
```

```
cd ../svv-balaji-field
npm install
npm run build

cd ../svv-balaji-admin
npm run build
```

| Expected | If it fails |
|---|---|
| All three build clean | See the table below |

**`Property 'x' does not exist on type 'PrismaService'`** — `prisma generate`
did not run or `tsc` cached the old types. Re-run it, then restart the watcher.

**`Failed to resolve import "@shared/..."` in the ADMIN app** — the `shared/`
migration. Check `vite.config.ts` has the `@shared` alias *and*
`server.fs.allow: ['..']`, and that `tsconfig.json` has both the `paths` entry
and `"../shared"` in `include`. The error names the file; every one of the 58
shims is a single `export *` line, so the fix is small and local.

**`Cannot find module '../../../shared/...'`** — a shim's relative path is
wrong. It should be `../../../shared/...` for anything in `src/api`,
`src/hooks`, `src/auth`, `src/components`, `src/utils`, `src/validation`, and
`../../shared/config` for `src/config.ts`.

> The admin build is the real proof of the migration. It type-checks `../shared`
> as well as `src`, so a mismatch anywhere in the contract layer surfaces here
> rather than in front of a user.

---

## Stage 1 — The database catches up (2 minutes)

```
cd svv-balaji-backend
npx prisma migrate deploy
```

Three migrations should apply, in this order:

| Migration | Adds |
|---|---|
| `20260815090000_role_permissions` | `role_permissions`, `role_permission_state` |
| `20260816090000_farm_plots` | `farm_plots` |
| `20260816120000_plot_provenance` | `plotId` on `harvest_inspections` and `raw_material_collections` |

Then start the API:

```
npm run start:dev
```

Watch for **`Seeded default permissions for: BRANCH_MANAGER, ...`** on the first
boot after the RBAC migration. That line is the seeder writing the 15 August
access rules into the database. No line on a later boot is correct — it only
seeds a role it has never seen.

**If the API will not start**, the usual cause is a migration that has not been
applied: `PermissionsService.onModuleInit` queries `role_permission_state`
before anything else, so a missing table stops the whole bootstrap and the
symptom is `ECONNREFUSED` from whichever front end you try next.

---

## Stage 2 — Permissions (3 minutes)

Sign in to the admin panel as Super Admin.

1. **Administration → Roles & Permissions loads**, showing eight roles.
   Failure here means `GET /permissions` is refusing — check the account really
   is `SUPER_ADMIN`.
2. **Select Agriculture Expert → Reset to defaults.** Required: the AE gained
   `farmers.create`, `farmers.edit`, `farmers.plots`, `agreements.view` and the
   whole `harvestInspections` group on 16 August, and the seeder only writes
   defaults for a role it has never configured. Without this the field app's
   tabs will 403.
3. **Revoke a page from a spare role and save.** It should warn you by name
   before applying, and the change should take effect on that user's next
   request — not on their next login. That property is the entire reason
   permissions are not carried in the JWT.
4. **Reset that role afterwards.**

---

## Stage 3 — Both apps open (5 minutes)

```
cd svv-balaji-admin && npm run dev     # :5173
cd svv-balaji-field  && npm run dev    # :5174, fronted at :5173/field/
```

| Check | Proves |
|---|---|
| Admin panel loads, sidebar populated | `shared/` migration works at runtime |
| Any list screen loads rows | The api + hooks shims resolve |
| `localhost:5173/field/` opens the field app | The single-port proxy |
| Field app shows its OWN green login | Separate session key, separate build |
| Sign in as an Agriculture Expert | The strict split |
| All five tabs open without 403 | Stage 2 was done |

Signing into the field app must **not** end your admin session in the other
tab. If it does, `VITE_TOKEN_KEY` is missing from `svv-balaji-field/.env` —
both apps are then sharing one localStorage key and the API only stores one
refresh hash per user.

---

## Stage 4 — The field executive's day (15 minutes)

In the field app, as an Agriculture Expert. Use Chrome DevTools device mode
(Ctrl+Shift+M) for the phone layout.

1. **Register a farmer** — Farmers tab → Register. Appears as pending.
2. **Map a plot** — open that farmer → Map land → Add a plot. Name, area, soil,
   irrigation, expected harvest.
   - The **Here** button asks for location permission on `localhost`. On
     `http://192.168.x.x` from a phone it will refuse silently — that is the
     browser's HTTPS rule, not a bug. Type coordinates instead.
   - Accuracy above 50 m is reported as a warning. That is deliberate: a
     wifi-derived fix can be a kilometre out and looks identical to a real one.
3. **Check the mapped-vs-registered figures.** Enter a holding size at
   registration that disagrees with the plots by more than half an acre and
   confirm it says so rather than silently overwriting either.
4. **Log a field visit with a photo** — the upload should show **Take a photo**
   on mobile, not a drag-and-drop box, and should report the resize
   (`4.2 MB → 380 KB`) before uploading. First real upload also proves the
   Cloudinary signature, which has never run.
5. **Home screen reflects all of it** — the new farmer appears in the schedule
   as incomplete or awaiting approval.
6. **Mine / Everyone toggle** — switch it and confirm the counts change. This
   now filters on the server; the label shows "3 of 12".

---

## Stage 5 — The chain, end to end (20 minutes)

The one that proves the system rather than the screens. Each step feeds the
next, so order matters.

1. Super Admin **approves** the farmer → a `SVV-YYYY-NNNNNN` code is issued.
2. Record an **agreement** with a rate and a harvest date.
3. In the field app, raise a **harvest inspection** — pick the plot in the
   *Which field* dropdown, result **APPROVED**.
   - Confirm a plot belonging to a *different* farmer cannot be selected. The
     server refuses it, and that guard is what stops the trace page making a
     false claim to a consumer.
4. Record a **collection** against that inspection. The plot should carry
   forward on its own — there is no plot field on this form, by design.
5. Cleaning & grading → **production batch** → complete. Try a multigrain
   recipe: the blend worksheet must go green before submit is enabled.
6. **Quality inspection** (in-process) → **pack** into a finished-goods batch →
   **FG inspection** → **release** → **stock in**.
7. Open **/trace** and enter the `FG-` number.

The trace must resolve back through production and the raw material batch to
the farmer **and now the field** — a new *Field* column showing plot name,
survey number, area, soil, sowing date, and the GPS as a clickable map link.

If the Field column says **Not recorded**, the plot did not carry from
inspection to collection. That is the one link in this chain built today and
never run.

---

## What to report back

For anything that fails: the stage, the exact error text, and which app. The
error text matters more than the description — a resolve failure names the file,
and that is usually the whole diagnosis.

Worth noting separately if you see it:

- A screen that loads but shows no rows where you expect some (a permission
  gap, not a crash)
- Any 403 as **Super Admin** — that should be impossible, since it bypasses the
  permission check before any database read
- The field app logging you out of the admin panel, or the reverse

---

## Known and deliberate, not bugs

- **No offline.** The field app needs a connection and says so. The service
  worker caches the app shell only; API calls are never queued.
- **Camera and GPS need HTTPS or localhost.** Over a plain IP address from a
  phone, both fail silently. That is a browser rule.
- **`svv-balaji-admin/src/pages/field/`** is dead code — twelve unrouted files
  left behind when the field app moved out. Safe to delete by hand.
- **`DEV_LOG.md` and `PROJECT_STATE.md` are not yet updated** for this batch,
  by agreement. Ujjawal has no written record of the RBAC change, the three
  migrations, `shared/`, or the new app until they are.
