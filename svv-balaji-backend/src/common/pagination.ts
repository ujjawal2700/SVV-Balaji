import { applyDecorators, BadRequestException } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';

/**
 * List pagination - A-12, finalised 3 Oct 2026.
 *
 * Opt-in: a list endpoint pages only when the caller sends `page` and/or
 * `limit`. Then it answers
 *
 *   { "data": [ ... ], "meta": { "total": 412, "page": 2, "limit": 20 } }
 *
 * where `total` counts every row matching the filters (it drives the page
 * numbers). Without either parameter the endpoint returns the bare array of
 * everything, exactly as before - pickers, the field app's offline sync, the
 * storefront and rider apps and the e2e scripts all read that shape, and a
 * paginated dropdown that silently drops row 21 is worse than no paging.
 *
 *   page   int >= 1, default 1 (page 0 is a 400, not an alias for page 1)
 *   limit  int 1..100, default 20 (capped: ?limit=999999 is not a back door)
 *
 * The admin list screens send page/limit (DataTable switches to server paging
 * when it receives `meta`). Single-object responses are not wrapped.
 */
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export interface PageRequest {
  page: number;
  limit: number;
}

export interface Paginated<T> {
  data: T[];
  meta: { total: number; page: number; limit: number };
}

const int = (name: string, raw: string, min: number, max: number) => {
  if (!/^\d+$/.test(raw.trim())) throw new BadRequestException(`${name} must be a whole number`);
  const n = Number(raw);
  if (n < min || n > max) throw new BadRequestException(`${name} must be between ${min} and ${max}`);
  return n;
};

/** Parse `?page=&limit=` from a controller. Null = not asked for: return the full list. */
export function pageRequest(page?: string, limit?: string): PageRequest | null {
  const hasPage = page !== undefined && page !== '';
  const hasLimit = limit !== undefined && limit !== '';
  if (!hasPage && !hasLimit) return null;
  return {
    page: hasPage ? int('page', page!, 1, 1_000_000) : 1,
    limit: hasLimit ? int('limit', limit!, 1, MAX_LIMIT) : DEFAULT_LIMIT,
  };
}

/**
 * Run a list query paged or whole. `find` receives `{ skip, take }` (empty when
 * unpaged) to spread into its findMany; `count` must use the same `where`.
 */
export async function listPage<T>(
  req: PageRequest | null,
  count: () => Promise<number>,
  find: (window: { skip?: number; take?: number }) => Promise<T[]>,
): Promise<T[] | Paginated<T>> {
  if (!req) return find({});
  const [total, data] = await Promise.all([count(), find({ skip: (req.page - 1) * req.limit, take: req.limit })]);
  return { data, meta: { total, page: req.page, limit: req.limit } };
}

/** Same shape for a list that is already in memory (computed rows, merged sources). */
export function pageArray<T>(req: PageRequest | null, rows: T[]): T[] | Paginated<T> {
  if (!req) return rows;
  const start = (req.page - 1) * req.limit;
  return { data: rows.slice(start, start + req.limit), meta: { total: rows.length, page: req.page, limit: req.limit } };
}

/** Swagger for the two paging parameters, on every paginated list route. */
export function ApiPageQuery() {
  return applyDecorators(
    ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number from 1. Sending page or limit switches the response to { data, meta }.' }),
    ApiQuery({ name: 'limit', required: false, type: Number, description: `Rows per page, 1-${MAX_LIMIT} (default ${DEFAULT_LIMIT}).` }),
  );
}
