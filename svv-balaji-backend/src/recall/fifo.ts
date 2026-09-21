export interface FifoBatch {
  fgBatchNumber: string;
  manufacturingDate: Date;
  expiryDate: Date | null;
}

/**
 * The order the allocator draws stock in (see `byFirstExpiryFirstOut` in
 * SalesService): earliest expiry first, batches with no expiry last, ties broken
 * by manufacturing date. Lives here so the audit uses the SAME definition of
 * "older" as the thing it audits.
 */
export function fifoRank(a: FifoBatch, b: FifoBatch): number {
  const ax = a.expiryDate?.getTime() ?? Number.POSITIVE_INFINITY;
  const bx = b.expiryDate?.getTime() ?? Number.POSITIVE_INFINITY;
  if (ax !== bx) return ax < bx ? -1 : 1;
  return a.manufacturingDate.getTime() - b.manufacturingDate.getTime();
}

/**
 * Batches that should have gone out BEFORE `shipped` but are still on the
 * shelf. Empty means FIFO was respected. `candidates` must already be limited
 * to sellable stock (ACTIVE, QA-released, unexpired, quantity > 0) of the same
 * product in the warehouse that shipped.
 */
export function fifoViolations<T extends FifoBatch>(shipped: FifoBatch, candidates: T[]): T[] {
  return candidates
    .filter((c) => c.fgBatchNumber !== shipped.fgBatchNumber && fifoRank(c, shipped) < 0)
    .sort(fifoRank);
}
