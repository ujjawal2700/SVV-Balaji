import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CheckoutSessionStatus, Prisma, ReservationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertEnough, availableByProduct, lockStockRows, OutOfStockException } from './stock-holds';

type Client = Prisma.TransactionClient;

export interface HoldItem {
  productId: string;
  quantity: number;
}

/**
 * Short-lived stock holds for checkout, and the firm reservation an order keeps
 * until packing. See `stock-holds.ts` for what "available" means.
 *
 * Life of a hold:
 *   HELD (TTL) --pay--> COMMITTED (order exists) --pack--> RELEASED (now real batch allocations)
 *   HELD --payment fails / abandoned / TTL--> RELEASED / EXPIRED
 *   COMMITTED --order cancelled--> RELEASED
 */
@Injectable()
export class StockReservationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StockReservationService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.sweepExpired().catch((e) => this.logger.error(String(e))), 60_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Atomically check availability and hold. Call inside the caller's transaction. */
  async hold(
    tx: Client,
    input: { warehouseId: string; items: HoldItem[]; sessionId: string; ttlMinutes: number; now?: Date },
  ): Promise<void> {
    const now = input.now ?? new Date();
    const ids = input.items.map((i) => i.productId);
    await lockStockRows(tx, input.warehouseId, ids);

    // Anything this session already holds is its own - do not count it against itself.
    const available = await availableByProduct(tx, input.warehouseId, ids, { now, excludeSessionId: input.sessionId });
    assertEnough(input.items, available);

    const expiresAt = new Date(now.getTime() + input.ttlMinutes * 60_000);
    await tx.stockReservation.createMany({
      data: input.items.map((i) => ({
        warehouseId: input.warehouseId,
        productId: i.productId,
        quantity: i.quantity,
        status: ReservationStatus.HELD,
        expiresAt,
        sessionId: input.sessionId,
      })),
    });
  }

  /**
   * Turn a session's holds into the firm reservation of a placed order.
   *
   * If a hold ran out while the customer was paying (slow gateway), it is
   * re-acquired when stock still allows it; otherwise the order cannot be
   * honoured and this throws OutOfStockException so the caller can refund.
   */
  async commit(tx: Client, input: { sessionId: string; orderId: string; warehouseId: string; now?: Date }): Promise<void> {
    const now = input.now ?? new Date();
    const rows = await tx.stockReservation.findMany({ where: { sessionId: input.sessionId } });
    const ids = rows.map((r) => r.productId);
    await lockStockRows(tx, input.warehouseId, ids);

    const stale = rows.filter(
      (r) => r.status !== ReservationStatus.HELD || !r.expiresAt || r.expiresAt <= now,
    );
    if (stale.length > 0) {
      const available = await availableByProduct(tx, input.warehouseId, stale.map((r) => r.productId), {
        now,
        excludeSessionId: input.sessionId,
      });
      const shortages = stale
        .filter((r) => (available.get(r.productId) ?? 0) < r.quantity)
        .map((r) => ({ productId: r.productId, requested: r.quantity, available: available.get(r.productId) ?? 0 }));
      if (shortages.length > 0) throw new OutOfStockException(shortages);
    }

    await tx.stockReservation.updateMany({
      where: { sessionId: input.sessionId },
      data: { status: ReservationStatus.COMMITTED, orderId: input.orderId, expiresAt: null },
    });
  }

  /** Give a checkout's holds back (payment failed / customer left). Idempotent. */
  async releaseSession(client: Client | PrismaService, sessionId: string, to: ReservationStatus = ReservationStatus.RELEASED) {
    const res = await client.stockReservation.updateMany({
      where: { sessionId, status: ReservationStatus.HELD },
      data: { status: to },
    });
    return res.count;
  }

  /** Give an order's firm reservation back (cancelled). Idempotent. */
  async releaseOrder(client: Client | PrismaService, orderId: string) {
    const res = await client.stockReservation.updateMany({
      where: { orderId, status: ReservationStatus.COMMITTED },
      data: { status: ReservationStatus.RELEASED },
    });
    return res.count;
  }

  /**
   * Tidy up. Correctness never depends on this - an expired hold stops counting
   * the moment `expiresAt` passes - it only makes the statuses tell the truth
   * and closes sessions nobody finished.
   */
  async sweepExpired(now = new Date()): Promise<{ holds: number; sessions: number }> {
    const holds = await this.prisma.stockReservation.updateMany({
      where: { status: ReservationStatus.HELD, expiresAt: { lte: now } },
      data: { status: ReservationStatus.EXPIRED },
    });
    const sessions = await this.prisma.checkoutSession.updateMany({
      where: { status: CheckoutSessionStatus.OPEN, expiresAt: { lte: now } },
      data: { status: CheckoutSessionStatus.EXPIRED },
    });
    if (holds.count || sessions.count) {
      this.logger.log(`Expired ${holds.count} stock hold(s) and ${sessions.count} checkout session(s)`);
    }
    return { holds: holds.count, sessions: sessions.count };
  }
}
