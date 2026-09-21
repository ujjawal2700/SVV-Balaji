import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** The row the admin Orders table shows, and what the socket and push carry. */
export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  channel: 'B2B' | 'B2C';
  source: 'STAFF' | 'STOREFRONT';
  customerName: string;
  customerCode: string;
  total: number;
  paymentStatus: string;
  paymentMode: string | null;
  fulfillmentMethod: 'LOCAL' | 'SHIPROCKET' | null;
  nodeId: string;
  nodeName: string;
  branchId: string | null;
  createdAt: string;
  updatedAt: string;
}

export const ORDER_SUMMARY_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  channel: true,
  source: true,
  total: true,
  paymentStatus: true,
  paymentMode: true,
  fulfillmentMethod: true,
  warehouseId: true,
  branchId: true,
  createdAt: true,
  updatedAt: true,
  customer: { select: { name: true, customerCode: true } },
  warehouse: { select: { name: true } },
} satisfies Prisma.OrderSelect;

export type OrderSummaryRow = Prisma.OrderGetPayload<{ select: typeof ORDER_SUMMARY_SELECT }>;

export function toSummary(o: OrderSummaryRow): OrderSummary {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    channel: o.channel,
    source: o.source,
    customerName: o.customer.name,
    customerCode: o.customer.customerCode,
    total: Number(o.total),
    paymentStatus: o.paymentStatus,
    paymentMode: o.paymentMode,
    fulfillmentMethod: o.fulfillmentMethod,
    nodeId: o.warehouseId,
    nodeName: o.warehouse.name,
    branchId: o.branchId,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

export async function loadSummary(prisma: PrismaService, orderId: string): Promise<OrderSummary | null> {
  const row = await prisma.order.findUnique({ where: { id: orderId }, select: ORDER_SUMMARY_SELECT });
  return row ? toSummary(row) : null;
}
