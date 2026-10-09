import { Logger } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

/**
 * Opt-in request profiler: `PRISMA_QUERY_STATS=1` logs every API request with
 * its time and how many database queries it ran. Each query is a network round
 * trip to Postgres, so the count is what makes an endpoint slow when the API
 * and the database are far apart (e.g. a dev PC in India and a DB in Singapore).
 * Off by default - zero cost when unset.
 */
export const QUERY_STATS = process.env.PRISMA_QUERY_STATS === '1';

interface Stats {
  queries: number;
}

export const requestStats = new AsyncLocalStorage<Stats>();
const logger = new Logger('RequestStats');

export function countQuery() {
  const s = requestStats.getStore();
  if (s) s.queries += 1;
}

export function requestStatsMiddleware(req: Request, res: Response, next: NextFunction) {
  const stats: Stats = { queries: 0 };
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    logger.log(`${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${ms.toFixed(0)}ms ${stats.queries}q`);
  });
  requestStats.run(stats, () => next());
}
