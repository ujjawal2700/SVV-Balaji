# SVV Balaji — Testing Phase 0 + Phase 1

Two ways to test: the **automated smoke script** (fastest, covers everything) and **Swagger UI** (better for poking at individual endpoints).

---

## Prerequisite — fix the Prisma version first

Nothing below will run until the Prisma 7 / Prisma 5 mismatch is resolved. From the repo root:

```bash
npm uninstall prisma @prisma/client
npm install prisma@5.19.0 @prisma/client@5.19.0 --save-exact
rm -rf node_modules/.prisma
npx prisma -v          # must show 5.19.0 for BOTH prisma and @prisma/client
```

Then:

```bash
docker compose up -d postgres redis
npx prisma generate
npx prisma migrate dev --name phase1
npm run prisma:seed
npm run start:dev
```

You should see the API on `http://localhost:3000/api/v1` and Swagger on `http://localhost:3000/api/docs`.

---

## Option A — Automated smoke test (recommended)

One command, 34 checks, covers the entire Phase 0 + Phase 1 flow:

```bash
chmod +x smoke-test.sh
./smoke-test.sh
```

**What it exercises, in order:**

| Step | What's checked |
|---|---|
| 0 | API is reachable |
| 1 | Super Admin login works; bad password rejected (401) |
| 2 | Branch create + list; unauthenticated requests rejected (401) |
| 3 | Agriculture Expert user created; `passwordHash` not leaked in response; expert can log in |
| 4 | Farmer registration; defaults to `PENDING_VERIFICATION`; **no `farmerCode` yet** (per FRD 8.1); search by village + status |
| 5 | **RBAC negative test** — Agriculture Expert blocked from approving farmers (403, per FRD 5.1) |
| 6 | Approval flips status to `ACTIVE`; **`farmerCode` generated as `SVV-YYYY-NNNNNN`**; second farmer gets a distinct code (no collision); re-approval doesn't mint a new code |
| 7 | Agreement created, defaults to `PENDING`, status lifecycle `PENDING → ACTIVE` |
| 8 | Seed distribution logged by Agriculture Expert; history retrievable per farmer |
| 9 | Training session; attendance for 2 farmers; re-marking attendance is idempotent |
| 10 | Field visit with crop observations; document attached |
| 11 | **Traceability** — farmer profile aggregates verificationLogs, agreements, seedDistributions, fieldVisits, and resolves via `farmerCode` |

Exit code is `0` if everything passes, `1` if anything fails — so you can wire it into CI later.

**Note on what this validates:** the script was verified against a mock API, including a deliberate-sabotage run where 5 bugs were injected (wrong status default, premature `farmerCode`, missing RBAC, malformed code format, code collision) — all 5 were caught. So a `FAIL` here means a real problem in the API, not a flaky assertion.

**Custom target:**

```bash
BASE_URL="http://localhost:3000/api/v1" ./smoke-test.sh
```

---

## Option B — Swagger UI (manual exploration)

Open `http://localhost:3000/api/docs`.

1. **Get a token:** expand `POST /auth/login`, "Try it out", body:
   ```json
   { "email": "admin@svvbalaji.com", "password": "ChangeMe@123" }
   ```
   Copy `accessToken` from the response.

2. **Authorize:** click the **Authorize** button (top right), paste the token, confirm. All subsequent requests now carry it.

3. **Walk the flow:**
   - `POST /branches` → copy the `id`
   - `POST /farmers` (use that `branchId`) → copy the `id`. Confirm `farmerCode` is `null` and status is `PENDING_VERIFICATION`
   - `PATCH /farmers/{id}/verify` with `{ "action": "APPROVED" }` → **confirm `farmerCode` now looks like `SVV-2026-000001`**
   - `GET /farmers/{id}` → confirm the profile includes `verificationLogs`, `agreements`, `seedDistributions`, `fieldVisits`
   - `POST /agreements`, `POST /seed-distribution`, `POST /training-sessions`, `POST /field-visits` as needed

---

## The things most worth verifying by hand

These are the bits where a bug is expensive to find later:

1. **`farmerCode` is only issued on approval, never at registration.** This is the traceability anchor for the entire QR chain — if it gets assigned to unapproved farmers, the whole farm-to-fork promise has holes in it.
2. **Codes are sequential and never collide.** Register and approve 3–4 farmers in a row and confirm you get `...000001`, `...000002`, `...000003`. The atomic counter is what makes this safe under concurrent approvals.
3. **Farmer approval is Super-Admin-only.** Log in as the Agriculture Expert and try to approve — you must get a 403. This is FRD 5.1 and it's an audit/compliance boundary, not a nicety.
4. **The verification audit trail is written.** Every approve/reject/request-docs action should append a `FarmerVerificationLog` row with who did it and when.

---

## Known gaps (not bugs — deliberately deferred)

- **File uploads** — training materials and field visit documents accept a `fileUrl` string; actual S3/R2 upload handling isn't wired in yet (that's the storage decision flagged in the meeting prep notes).
- **`npm test` has no Jest config** — the `test` script exists in `package.json` but no config block, so it won't run. Automated unit/integration tests are worth adding before Phase 2 grows the surface area.
- **Farmer search** doesn't yet filter by crop or quality rating (FRD 7.4) — those depend on procurement/quality data that lands in Phase 2–3.
