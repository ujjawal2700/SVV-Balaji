/**
 * The standard shape every screen sees, regardless of what the API sends today.
 *
 * The backend currently returns bare payloads - `GET /farmers` gives a plain
 * `Farmer[]`, `POST /orders` gives a plain `Order`. There is no envelope and no
 * pagination (tracked as action A-12).
 *
 * Rather than write twenty screens against the current shape and rewrite them
 * when that lands, screens are written against `ApiResult` / `Paginated` from
 * the start and the adapters below absorb the difference. When the API adopts
 * the envelope, these functions become pass-throughs and no screen changes.
 *
 * Proposed envelope, to put to the backend as part of A-12:
 *
 *   single:  { "data": { ... } }
 *   list:    { "data": [ ... ], "meta": { "total": 0, "page": 1, "limit": 25 } }
 */

export interface ApiResult<T> {
  data: T;
}

export interface PageMeta {
  total: number;
  page: number;
  limit: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

/** Query parameters for a paginated list, once the API supports them. */
export interface PageParams {
  page?: number;
  limit?: number;
}

/** Agreed with Ujjawal, 11 Aug — see SVV_Balaji_A12_Pagination_and_Envelope_Proposal.md. */
export const DEFAULT_PAGE_SIZE = 20;

function isWrapped<T>(payload: unknown): payload is ApiResult<T> {
  return typeof payload === 'object' && payload !== null && 'data' in payload;
}

/**
 * Normalises a single-object response.
 *
 * Note the deliberate narrowness of the wrapped check: only `{ data: ... }` with
 * no other meaningful keys is treated as an envelope. A domain object that
 * happens to carry its own `data` field would otherwise be silently unwrapped
 * into nonsense.
 */
export function unwrap<T>(payload: T | ApiResult<T>): T {
  if (isWrapped<T>(payload) && Object.keys(payload).length === 1) {
    return payload.data;
  }
  return payload as T;
}

/**
 * Normalises a list response into `Paginated<T>`.
 *
 * A bare array is reported as a single full page, which is exactly what it is -
 * the API returns every row today. Screens therefore paginate client-side now
 * and server-side later without knowing which is happening.
 */
export function unwrapList<T>(
  payload: T[] | (ApiResult<T[]> & { meta?: Partial<PageMeta> }),
  requested?: PageParams,
): Paginated<T> {
  if (Array.isArray(payload)) {
    return {
      data: payload,
      meta: {
        total: payload.length,
        page: requested?.page ?? 1,
        limit: requested?.limit ?? payload.length,
      },
    };
  }

  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return {
    data: rows,
    meta: {
      total: payload?.meta?.total ?? rows.length,
      page: payload?.meta?.page ?? requested?.page ?? 1,
      limit: payload?.meta?.limit ?? requested?.limit ?? DEFAULT_PAGE_SIZE,
    },
  };
}

/**
 * Drops empty strings, nulls and undefined from a request body or query.
 *
 * Not cosmetic: the API runs a global ValidationPipe with
 * `forbidNonWhitelisted: true`, so an empty optional field sent as `""` is
 * rejected outright rather than treated as absent. Antd forms produce exactly
 * those empty strings for untouched inputs.
 *
 * Constrained to `object` rather than `Record<string, unknown>` on purpose:
 * TypeScript only gives implicit index signatures to type aliases, not to
 * interfaces, so every DTO interface passed here would otherwise be rejected.
 */
export function pruneEmpty<T extends object>(input: T): Partial<T> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    output[key] = typeof value === 'string' ? value.trim() : value;
  }
  return output as Partial<T>;
}
