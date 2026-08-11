import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Issues per-day sequential document numbers (PB-YYYYMMDD-NNN, FG-YYYYMMDD-NNN).
 *
 * Uses the same atomic-increment pattern as the farmer and raw-material batch
 * counters: a single counter row per (prefix, day), incremented inside the
 * caller's transaction. Two concurrent production runs therefore cannot be
 * issued the same number.
 *
 * Always call this from inside a transaction - passing the transaction client
 * is what makes the increment and the row it numbers atomic together.
 */
@Injectable()
export class SequenceService {
  /** Date -> YYYYMMDD using local date parts (not UTC). */
  dateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }

  /**
   * @param prefix e.g. 'PB' or 'FG'
   * @param pad    digits in the sequence portion (default 3 -> 001)
   */
  async next(
    tx: Prisma.TransactionClient,
    prefix: string,
    date: Date,
    pad = 3,
  ): Promise<string> {
    const day = this.dateKey(date);
    const key = `${prefix}-${day}`;

    const existing = await tx.sequenceCounter.findUnique({ where: { key } });
    if (!existing) {
      await tx.sequenceCounter.create({ data: { key, lastNumber: 0 } });
    }

    const updated = await tx.sequenceCounter.update({
      where: { key },
      data: { lastNumber: { increment: 1 } },
    });

    return `${prefix}-${day}-${String(updated.lastNumber).padStart(pad, '0')}`;
  }

  /**
   * A running series that is not scoped to a day - customer codes, for example,
   * run continuously for the life of the business rather than restarting each
   * morning. Same atomic-increment guarantee as `next`.
   *
   * @param series e.g. 'CUST-B2B' -> CUST-B2B-000001
   */
  async nextInSeries(
    tx: Prisma.TransactionClient,
    series: string,
    pad = 6,
  ): Promise<string> {
    const existing = await tx.sequenceCounter.findUnique({ where: { key: series } });
    if (!existing) {
      await tx.sequenceCounter.create({ data: { key: series, lastNumber: 0 } });
    }

    const updated = await tx.sequenceCounter.update({
      where: { key: series },
      data: { lastNumber: { increment: 1 } },
    });

    return `${series}-${String(updated.lastNumber).padStart(pad, '0')}`;
  }
}
