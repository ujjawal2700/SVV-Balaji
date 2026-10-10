import { DeliveryTask, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Goods weight for a task from product pack weights (frozen once known).
 * Null when any item has no recorded weight - then no vehicle limit applies.
 */
export async function taskWeight(client: Prisma.TransactionClient | PrismaService, task: Pick<DeliveryTask, 'orderId' | 'returnRequestId' | 'kind'>): Promise<number | null> {
  if (task.orderId) {
    const items = await client.orderItem.findMany({ where: { orderId: task.orderId }, select: { quantity: true, product: { select: { packWeightKg: true } } } });
    if (!items.length || items.some((i) => i.product.packWeightKg === null)) return null;
    return items.reduce((sum, i) => sum + i.quantity * Number(i.product.packWeightKg), 0);
  }
  if (task.returnRequestId) {
    const r = await client.returnRequest.findUnique({
      where: { id: task.returnRequestId },
      select: { quantity: true, orderItem: { select: { product: { select: { packWeightKg: true } } } }, replacementProduct: { select: { packWeightKg: true } } },
    });
    if (!r) return null;
    const w = task.kind === 'REPLACEMENT_DELIVERY' && r.replacementProduct ? r.replacementProduct.packWeightKg : r.orderItem.product.packWeightKg;
    return w === null ? null : r.quantity * Number(w);
  }
  return null;
}
