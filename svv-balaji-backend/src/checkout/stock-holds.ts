import { BadRequestException } from '@nestjs/common';
import { Prisma, ReservationStatus } from '@prisma/client';

/**
 * Available finished-goods stock at a fulfilment node, as the storefront must
 * see it. Three rules make the number honest:
 *
 *   1. Only QA-released, unexpired batches count, and never one that is ON_HOLD
 *      or RECALLED (the batch-health gatekeeper - a frozen batch is not stock).
 *   2. Physical allocations already made to orders (`reservedQuantity`) are out.
 *   3. So are stock reservations that have not been turned into allocations yet:
 *      firm ones (COMMITTED: an order exists, packing has not run) and live
 *      short-lived ones (HELD and not past their TTL - a customer is paying).
 *
 * Rule 3 is what lets an order be promised stock at checkout without yet
 * choosing the exact FIFO batch. Expired holds simply stop counting, so a
 * crashed or abandoned checkout can never leave stock stuck.
 */

type Client = Prisma.TransactionClient;

export class OutOfStockException extends BadRequestException {
  constructor(
    public readonly shortages: Array<{ productId: string; requested: number; available: number }>,
  ) {
    super({
      code: 'OUT_OF_STOCK',
      message: 'Some items are no longer available in the requested quantity',
      shortages,
    });
  }
}

export const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/** Reservations that still take stock away from buyers. */
export function activeHoldFilter(now: Date): Prisma.StockReservationWhereInput {
  return {
    OR: [
      { status: ReservationStatus.COMMITTED },
      { status: ReservationStatus.HELD, expiresAt: { gt: now } },
    ],
  };
}

/** Sellable units per product at a node (never negative). `excludeSessionId` skips a checkout's own holds. */
export async function availableByProduct(
  client: Client,
  warehouseId: string,
  productIds: string[],
  opts: { now?: Date; excludeSessionId?: string; excludeOrderId?: string } = {},
): Promise<Map<string, number>> {
  const now = opts.now ?? new Date();
  const out = new Map<string, number>(productIds.map((id) => [id, 0]));
  if (productIds.length === 0) return out;

  const stock = await client.finishedGoodsStock.findMany({
    where: {
      warehouseId,
      fgBatch: {
        productId: { in: productIds },
        qaReleased: true,
        holdStatus: 'ACTIVE',
        OR: [{ expiryDate: null }, { expiryDate: { gte: startOfToday() } }],
      },
    },
    select: { quantity: true, reservedQuantity: true, fgBatch: { select: { productId: true } } },
  });
  for (const row of stock) {
    const id = row.fgBatch.productId;
    out.set(id, (out.get(id) ?? 0) + Math.max(0, row.quantity - row.reservedQuantity));
  }

  const holds = await client.stockReservation.groupBy({
    by: ['productId'],
    where: {
      warehouseId,
      productId: { in: productIds },
      // Written out (not `NOT`) so rows with a NULL sessionId/orderId are kept, as SQL's <> would drop them.
      AND: [
        activeHoldFilter(now),
        ...(opts.excludeSessionId
          ? [{ OR: [{ sessionId: null }, { sessionId: { not: opts.excludeSessionId } }] }]
          : []),
        ...(opts.excludeOrderId ? [{ OR: [{ orderId: null }, { orderId: { not: opts.excludeOrderId } }] }] : []),
      ],
    },
    _sum: { quantity: true },
  });
  for (const h of holds) {
    out.set(h.productId, Math.max(0, (out.get(h.productId) ?? 0) - (h._sum.quantity ?? 0)));
  }
  return out;
}

/**
 * Serialise everyone competing for the same product at the same node.
 *
 * `SELECT ... FOR UPDATE` on the matching stock rows: a second checkout for the
 * same product blocks here until the first transaction commits, and then sees
 * its reservation in `availableByProduct`. Rows are always locked in id order,
 * so two multi-product carts can never deadlock each other.
 */
export async function lockStockRows(client: Client, warehouseId: string, productIds: string[]): Promise<void> {
  if (productIds.length === 0) return;
  await client.$queryRaw(Prisma.sql`
    SELECT s."id"
    FROM "finished_goods_stock" s
    JOIN "finished_goods_batches" b ON b."id" = s."fgBatchId"
    WHERE s."warehouseId" = ${warehouseId}
      AND b."productId" IN (${Prisma.join(productIds)})
    ORDER BY s."id"
    FOR UPDATE OF s
  `);
}

/**
 * Units of a product at a node already earmarked by reservations that are not
 * `excludeOrderId`'s own. Allocation subtracts this from what it may pick, so
 * an order being packed can never take stock another paid order was promised.
 */
export async function heldByOthers(
  client: Client,
  warehouseId: string,
  productId: string,
  excludeOrderId: string,
  now = new Date(),
): Promise<number> {
  const agg = await client.stockReservation.aggregate({
    where: {
      warehouseId,
      productId,
      AND: [activeHoldFilter(now), { OR: [{ orderId: null }, { orderId: { not: excludeOrderId } }] }],
    },
    _sum: { quantity: true },
  });
  return agg._sum.quantity ?? 0;
}

/** Throws OutOfStockException listing every short product. */
export function assertEnough(
  wanted: Array<{ productId: string; quantity: number }>,
  available: Map<string, number>,
): void {
  const shortages = wanted
    .filter((w) => (available.get(w.productId) ?? 0) < w.quantity)
    .map((w) => ({ productId: w.productId, requested: w.quantity, available: available.get(w.productId) ?? 0 }));
  if (shortages.length > 0) throw new OutOfStockException(shortages);
}
