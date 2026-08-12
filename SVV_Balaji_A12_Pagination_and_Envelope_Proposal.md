# A-12 — Pagination & Response Envelope

**From:** Raunak (WS2.x) · **To:** Ujjawal (WS1.x) · **Date:** 11 August 2026 · **Target:** 13 August

A concrete proposal, not an open question. If you agree with the shape below, it is roughly a day's
work on the backend and it unblocks about twenty admin-panel list screens from being built twice.

---

## 1. Why now

Every list endpoint is an unbounded `findMany`. That is fine today with test data and becomes a
problem in three separate ways once real volume arrives:

- `GET /orders` and `GET /batches` grow without limit. At a thousand orders the panel downloads all
  of them to show twenty.
- The SOW checklist item #31 — *"Scalable DB schema for growing batch/product/order volume"*, marked
  **High** — is the client asking about exactly this.
- I am about to build ~20 list screens. Every one written against the current shape is one that gets
  reworked later.

The panel already tolerates both shapes (`src/api/envelope.ts`), so **nothing on my side breaks
whichever order you land this in**. That is deliberate — it means you can migrate endpoint by
endpoint rather than in one commit.

---

## 2. Proposed shape

### Single object

```jsonc
// GET /farmers/:id
{ "data": { "id": "…", "fullName": "…" } }
```

### List

```jsonc
// GET /farmers?page=1&limit=20
{
  "data": [ /* … */ ],
  "meta": { "total": 412, "page": 1, "limit": 20 }
}
```

`total` is the count matching the filters, not the table count — it is what drives the page numbers.

### Request parameters

| Param | Type | Default | Notes |
|---|---|---|---|
| `page` | int ≥ 1 | `1` | 1-based. Page 0 is a 400, not an alias for page 1. |
| `limit` | int 1–100 | `20` | **Capped at 100.** Without a ceiling, `?limit=999999` is the unbounded query again wearing a hat. |

Two names I would reserve now even though we are not implementing them: **`sortBy` and `sortOrder`**.
Adding sorting later is another breaking change if the DTO rejects unknown params — and it will,
because of `forbidNonWhitelisted`. Cheaper to whitelist them now and ignore them than to renegotiate.

---

## 3. Which endpoints — and which should NOT be paginated

Worth saying explicitly, because "paginate everything" is the wrong answer.

### Paginate — transactional, grows without bound

`/farmers` · `/agreements` · `/seed-distribution` · `/field-visits` · `/training-sessions` ·
`/harvest-inspections` · `/collections` · `/batches` · `/warehouses/stock` · `/warehouses/movements` ·
`/production-batches` · `/quality-inspections` · `/cleaning-grading` · `/finished-goods` ·
`/finished-goods-stock` · `/customers` · `/orders` · `/price-lists`

`/warehouses/movements` is the one I would do first if you only did one. It is append-only and never
pruned, so it grows faster than anything else in the system.

### Leave unpaginated — master data, bounded, feeds dropdowns

`/branches` · `/warehouses` · `/products` · `/users` · `/recipes`

These populate pickers. A paginated dropdown that silently omits the branch someone is looking for is
worse than no pagination at all. They should still return the **envelope** — `{ data: [...] }` — so
the response shape is uniform; they just always return everything.

If `/products` ever passes a few hundred rows, the fix is a `?search=` param on the picker, not
pagination.

---

## 4. Implementation

### 4a. A global interceptor for the envelope

Wrapping is mechanical, so it should not be twenty copies of the same line. One interceptor, applied
globally in `main.ts`:

```ts
// src/common/response-envelope.interceptor.ts
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';

/** Marker returned by a service that has already built its own meta. */
export interface PaginatedResult<T> {
  data: T[];
  meta: { total: number; page: number; limit: number };
}

function isPaginated(value: unknown): value is PaginatedResult<unknown> {
  return (
    typeof value === 'object' && value !== null &&
    'data' in value && 'meta' in value && Array.isArray((value as PaginatedResult<unknown>).data)
  );
}

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((payload) => {
        // Already shaped by a paginated service - leave it alone.
        if (isPaginated(payload)) return payload;

        // The SVG endpoints return raw strings with an image/svg+xml
        // Content-Type. Wrapping those would produce broken images.
        if (typeof payload === 'string') return payload;

        return { data: payload };
      }),
    );
  }
}
```

**Watch the string case.** `GET /farmers/:id/qr.svg`, `/barcode.svg` and
`/finished-goods/:id/qr.svg` return raw SVG with a `@Header('Content-Type', 'image/svg+xml')`. If the
interceptor wraps those, every printed QR code breaks. The `typeof payload === 'string'` guard above
covers it, but it is worth a test.

### 4b. A shared pagination DTO

This part is not optional. The global `ValidationPipe` runs with `forbidNonWhitelisted: true`, so
`GET /farmers?page=1` is a **400 today** — the param has to be whitelisted on the DTO before it can
be sent at all.

```ts
// src/common/pagination.dto.ts
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number = 20;

  // Reserved so adding sorting later is not another breaking change.
  @ApiPropertyOptional() @IsOptional() @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional() @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
```

Then each query DTO extends it — `export class QueryFarmerDto extends PaginationQueryDto { … }` —
and the existing filter fields stay exactly as they are.

### 4c. The service pattern

`findMany` and `count` must run in one transaction, or `total` can disagree with the rows on a busy
table and the last page silently vanishes:

```ts
async findAll(query: QueryFarmerDto) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const where: Prisma.FarmerWhereInput = { /* unchanged */ };

  const [data, total] = await this.prisma.$transaction([
    this.prisma.farmer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { branch: { select: { id: true, name: true } } },
      skip: (page - 1) * limit,
      take: limit,
    }),
    this.prisma.farmer.count({ where }),
  ]);

  return { data, meta: { total, page, limit } };
}
```

**One index worth adding alongside this.** Every list orders by `createdAt: 'desc'` and most filter
by a status or a foreign key. Once `OFFSET` enters the query plan, `Farmer(status, createdAt)` and
`Order(status, orderDate)` composite indexes stop those from becoming sequential scans. Cheap now,
awkward to notice later.

---

## 5. Migration — endpoint by endpoint, nothing breaks

The panel accepts both shapes already, so the only other consumer is `smoke-test.sh`. Making it
tolerant too means you can migrate one endpoint at a time and the suite stays green throughout:

```bash
# Accepts a bare payload or an enveloped one, so the same assertion works
# before and after an endpoint is migrated.
unwrap() { jq 'if type == "object" and has("data") then .data else . end'; }
```

Then `echo "$RESPONSE" | unwrap | jq -r '.[0].farmerCode'` works either way.

Suggested order:

1. `PaginationQueryDto` + the interceptor + the smoke-test helper — one PR, no endpoint changes yet.
   Everything is wrapped, nothing is paginated, both consumers already cope.
2. `/warehouses/movements`, `/orders`, `/batches`, `/farmers` — the four that grow fastest.
3. The rest, whenever convenient.

There is no point at which the panel or the smoke test is broken, which is the property worth having.

---

## 6. Two smaller things while you are in there

Both surfaced building the Users screen and neither is urgent:

- **`GET /users` has no `branch` relation.** `GET /farmers` includes
  `branch: { select: { id, name } }`; users does not, so the panel fetches every branch separately
  just to render a branch name. Same one-line `include` would remove the round trip.
- **There is no `PATCH /users/:id`.** A user cannot be deactivated, have their role changed, or their
  password reset from the panel. Worth flagging before UAT: **an ex-employee currently cannot be
  locked out except by editing the database.** That reads as a security gap in a system holding
  farmer PII and bank details, and checklist item #32 claims role-based auth and audit logs are
  included.

---

## 7. What I need back

Just a yes, or a counter-proposal on the shape. I am building against `{ data, meta }` either way —
if you would rather it were `{ items, pagination }` or anything else, say so now and I will change
one adapter file rather than twenty screens.
