import { ConflictException } from '@nestjs/common';
import { Prisma, ReturnStockDisposition } from '@prisma/client';
import { assertEnough, availableByProduct, lockStockRows, startOfToday } from '../checkout/stock-holds';
import { byFirstExpiryFirstOut } from '../sales/sales.service';
import { batchesForReturn } from './returns.logic';

type Tx = Prisma.TransactionClient;

/**
 * Every stock change a return or exchange makes. Each one is written in the
 * caller's transaction together with its StockMovement row - the same "a
 * balance never moves without a ledger entry" invariant the rest of the
 * finished-goods code holds.
 */

/**
 * Reserve an exchange's replacement: lock the product's stock rows at the
 * node, re-check what is really available (QA-released, ACTIVE, unexpired,
 * net of every order's and checkout's holds), then pin specific FIFO batches
 * by raising their `reservedQuantity`. A second exchange (or a checkout) for
 * the same product blocks on the lock and then sees this reservation, so one
 * unit can never be promised twice. Throws OutOfStockException when short.
 */
export async function reserveReplacement(
  tx: Tx,
  input: { requestId: string; warehouseId: string; productId: string; quantity: number },
) {
  await lockStockRows(tx, input.warehouseId, [input.productId]);
  const available = await availableByProduct(tx, input.warehouseId, [input.productId]);
  assertEnough([{ productId: input.productId, quantity: input.quantity }], available);

  const today = startOfToday();
  const rows = await tx.finishedGoodsStock.findMany({
    where: { warehouseId: input.warehouseId, fgBatch: { productId: input.productId, qaReleased: true, holdStatus: 'ACTIVE' } },
    include: { fgBatch: { select: { id: true, fgBatchNumber: true, expiryDate: true } } },
  });
  const eligible = rows
    .filter((r) => r.quantity - r.reservedQuantity > 0)
    .filter((r) => !r.fgBatch.expiryDate || r.fgBatch.expiryDate >= today)
    .sort(byFirstExpiryFirstOut);

  let left = input.quantity;
  const picked: Array<{ fgBatchNumber: string; quantity: number }> = [];
  for (const row of eligible) {
    if (left === 0) break;
    const take = Math.min(left, row.quantity - row.reservedQuantity);
    if (take <= 0) continue;
    await tx.finishedGoodsStock.update({ where: { id: row.id }, data: { reservedQuantity: { increment: take } } });
    await tx.returnReplacementAllocation.create({
      data: { requestId: input.requestId, fgBatchId: row.fgBatchId, warehouseId: input.warehouseId, quantity: take },
    });
    picked.push({ fgBatchNumber: row.fgBatch.fgBatchNumber, quantity: take });
    left -= take;
  }
  if (left > 0) {
    // availableByProduct said yes but the batches could not cover it (a hold
    // without batches behind it) - refuse rather than half-reserve.
    assertEnough([{ productId: input.productId, quantity: input.quantity }], new Map([[input.productId, input.quantity - left]]));
  }
  return picked;
}

/** Give back an exchange's reservation on packs that have not left. Idempotent. */
export async function releaseReplacement(tx: Tx, requestId: string, reason: string) {
  const live = await tx.returnReplacementAllocation.findMany({ where: { requestId, releasedAt: null, dispatchedAt: null } });
  for (const a of live) {
    const row = await tx.finishedGoodsStock.findUnique({ where: { warehouseId_fgBatchId: { warehouseId: a.warehouseId, fgBatchId: a.fgBatchId } } });
    if (row) {
      await tx.finishedGoodsStock.update({ where: { id: row.id }, data: { reservedQuantity: { decrement: Math.min(a.quantity, row.reservedQuantity) } } });
    }
    await tx.returnReplacementAllocation.update({ where: { id: a.id }, data: { releasedAt: new Date(), releasedReason: reason } });
  }
  return live.length;
}

/** The replacement leaves the building: stock and its reservation both come down. */
export async function dispatchReplacementStock(tx: Tx, requestId: string, requestNumber: string, performedById: string) {
  const live = await tx.returnReplacementAllocation.findMany({
    where: { requestId, releasedAt: null, dispatchedAt: null },
    include: { fgBatch: { select: { fgBatchNumber: true, holdStatus: true } } },
  });
  if (live.length === 0) throw new ConflictException('No reserved replacement stock to dispatch');
  const held = live.filter((a) => a.fgBatch.holdStatus !== 'ACTIVE');
  if (held.length) {
    throw new ConflictException(`Cannot dispatch: ${held.map((a) => `${a.fgBatch.fgBatchNumber} is ${a.fgBatch.holdStatus}`).join(', ')}`);
  }
  for (const a of live) {
    const row = await tx.finishedGoodsStock.findUnique({ where: { warehouseId_fgBatchId: { warehouseId: a.warehouseId, fgBatchId: a.fgBatchId } } });
    if (!row || row.quantity < a.quantity) throw new ConflictException(`Stock for batch ${a.fgBatch.fgBatchNumber} has gone missing - investigate`);
    await tx.finishedGoodsStock.update({
      where: { id: row.id },
      data: { quantity: { decrement: a.quantity }, reservedQuantity: { decrement: Math.min(a.quantity, row.reservedQuantity) } },
    });
    await tx.stockMovement.create({
      data: {
        fgBatchId: a.fgBatchId, fromWarehouseId: a.warehouseId, movementType: 'STOCK_OUT', quantity: a.quantity, unit: 'PACK',
        reason: `Exchange replacement ${requestNumber}`, reference: `EXCHANGE_OUT:${requestNumber}`, performedById,
      },
    });
    await tx.returnReplacementAllocation.update({ where: { id: a.id }, data: { dispatchedAt: new Date() } });
  }
}

/** An undelivered replacement is back: stock returns and stays reserved for this exchange. */
export async function replacementBackInStock(tx: Tx, requestId: string, requestNumber: string, performedById: string) {
  const out = await tx.returnReplacementAllocation.findMany({ where: { requestId, releasedAt: null, dispatchedAt: { not: null } } });
  for (const a of out) {
    await tx.finishedGoodsStock.upsert({
      where: { warehouseId_fgBatchId: { warehouseId: a.warehouseId, fgBatchId: a.fgBatchId } },
      create: { warehouseId: a.warehouseId, fgBatchId: a.fgBatchId, quantity: a.quantity, reservedQuantity: a.quantity },
      update: { quantity: { increment: a.quantity }, reservedQuantity: { increment: a.quantity } },
    });
    await tx.stockMovement.create({
      data: {
        fgBatchId: a.fgBatchId, toWarehouseId: a.warehouseId, movementType: 'RETURN_INWARD', quantity: a.quantity, unit: 'PACK',
        reason: `Undelivered exchange replacement ${requestNumber} back in store`, reference: `EXCHANGE_BACK:${requestNumber}`, performedById,
      },
    });
    await tx.returnReplacementAllocation.update({ where: { id: a.id }, data: { dispatchedAt: null } });
  }
  return out.length;
}

/**
 * Returned packs arrive: work out which batches they belong to (the line's
 * allocations, oldest first, net of packs already returned) and put each into
 * sellable stock (GOOD) or the damaged bucket (DAMAGED). Returns what moved.
 */
export async function receiveReturnedStock(
  tx: Tx,
  input: {
    requestId: string; requestNumber: string; orderItemId: string; warehouseId: string;
    good: number; damaged: number; restockGood: boolean; performedById: string;
  },
) {
  const allocations = await tx.orderAllocation.findMany({
    where: { orderItemId: input.orderItemId },
    orderBy: { createdAt: 'asc' },
    select: { fgBatchId: true, quantity: true, releasedAt: true },
  });
  // Only allocations that actually shipped (released ones never left).
  const shipped = allocations.filter((a) => a.releasedAt === null);
  const prior = await tx.returnBatchLine.groupBy({
    by: ['fgBatchId'],
    where: { request: { orderItemId: input.orderItemId }, requestId: { not: input.requestId } },
    _sum: { quantity: true },
  });
  const already = new Map(prior.map((p) => [p.fgBatchId, p._sum.quantity ?? 0]));
  const total = input.good + input.damaged;
  const split = batchesForReturn(shipped, already, total);
  // Staff-placed or legacy orders without allocations cannot be traced to a batch.
  if (split.reduce((n, s) => n + s.quantity, 0) < total) {
    throw new ConflictException('Could not match every returned pack to a batch this order shipped - check the order allocations');
  }

  // Good packs fill the earliest batches, damaged ones the rest (the split itself is FIFO).
  let goodLeft = input.restockGood ? input.good : 0;
  const lines: Array<{ fgBatchId: string; quantity: number; disposition: ReturnStockDisposition }> = [];
  for (const s of split) {
    const g = Math.min(goodLeft, s.quantity);
    if (g > 0) lines.push({ fgBatchId: s.fgBatchId, quantity: g, disposition: ReturnStockDisposition.GOOD });
    if (s.quantity - g > 0) lines.push({ fgBatchId: s.fgBatchId, quantity: s.quantity - g, disposition: ReturnStockDisposition.DAMAGED });
    goodLeft -= g;
  }

  for (const l of lines) {
    const good = l.disposition === ReturnStockDisposition.GOOD;
    await tx.finishedGoodsStock.upsert({
      where: { warehouseId_fgBatchId: { warehouseId: input.warehouseId, fgBatchId: l.fgBatchId } },
      create: { warehouseId: input.warehouseId, fgBatchId: l.fgBatchId, quantity: good ? l.quantity : 0, damagedQuantity: good ? 0 : l.quantity },
      update: good ? { quantity: { increment: l.quantity } } : { damagedQuantity: { increment: l.quantity } },
    });
    await tx.stockMovement.create({
      data: {
        fgBatchId: l.fgBatchId, toWarehouseId: input.warehouseId, movementType: good ? 'RETURN_INWARD' : 'RETURN_DAMAGED',
        quantity: l.quantity, unit: 'PACK',
        reason: good ? `Returned on ${input.requestNumber}, passed QC` : `Returned on ${input.requestNumber}, damaged / failed QC`,
        reference: `${good ? 'RETURN_GOOD' : 'RETURN_DAMAGED'}:${input.requestNumber}`,
        performedById: input.performedById,
      },
    });
    await tx.returnBatchLine.create({ data: { requestId: input.requestId, fgBatchId: l.fgBatchId, quantity: l.quantity, disposition: l.disposition } });
  }
  return lines;
}
