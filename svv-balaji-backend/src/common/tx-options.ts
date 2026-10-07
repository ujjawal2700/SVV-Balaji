/**
 * Options for interactive transactions that make several round trips.
 *
 * Prisma's default is 5 s for the whole callback (and 2 s to get a connection).
 * Against a remote database (the hosted Render Postgres is ~200-400 ms away)
 * a dozen queries plus row locks passes that, and Prisma then fails the request
 * with "Transaction already closed" half-way through. Same values the stock /
 * dispatch transactions in SalesService already use.
 */
export const LONG_TX = { maxWait: 10_000, timeout: 30_000 } as const;
