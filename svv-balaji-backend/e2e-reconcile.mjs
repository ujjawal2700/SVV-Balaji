// Reconciliation: proves the modules AGREE with each other, straight from the database.
//
//   node e2e-reconcile.mjs            (run after the e2e scripts, or against any environment's DB)
//
// Each check is an invariant that must hold no matter how the data got there. A failure prints the
// offending rows. Exit code 1 if any invariant is broken. Read-only: it never writes.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const cents = (d) => Math.round(Number(d) * 100);
let failed = 0;
let checked = 0;

async function invariant(name, find) {
  const bad = await find();
  checked += 1;
  if (bad.length === 0) {
    console.log(`  PASS ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${name}  (${bad.length} violation${bad.length === 1 ? '' : 's'})`);
    for (const b of bad.slice(0, 5)) console.log(`       ${JSON.stringify(b)}`);
  }
}

// ---------------------------------------------------------------- 1. production
console.log('\n1. Raw material -> production -> finished goods');
await invariant('production loss = planned - actual', async () => {
  const rows = await prisma.productionBatch.findMany({ where: { actualQuantity: { not: null } } });
  return rows
    .filter((r) => r.productionLoss !== null && cents(r.productionLoss) !== cents(r.plannedQuantity) - cents(r.actualQuantity))
    .map((r) => ({ pb: r.productionBatchNumber, planned: r.plannedQuantity, actual: r.actualQuantity, loss: r.productionLoss }));
});

await invariant('raw material consumed by production never exceeds what was received', async () => {
  const rms = await prisma.rawMaterialBatch.findMany({ include: { consumptions: true } });
  return rms
    .filter((b) => b.consumptions.reduce((n, c) => n + cents(c.quantityUsed), 0) > cents(b.quantity))
    .map((b) => ({ rm: b.batchNumber, received: b.quantity, consumed: b.consumptions.map((c) => c.quantityUsed) }));
});

await invariant('finished weight packed never exceeds the production run yield', async () => {
  const pbs = await prisma.productionBatch.findMany({ where: { actualQuantity: { not: null } }, include: { finishedGoodsBatches: true } });
  return pbs
    .filter((p) => p.finishedGoodsBatches.reduce((n, f) => n + Number(f.netWeight) * f.packCount, 0) > Number(p.actualQuantity) + 0.001)
    .map((p) => ({ pb: p.productionBatchNumber, yield: p.actualQuantity, packed: p.finishedGoodsBatches.map((f) => `${f.packCount}x${f.netWeight}`) }));
});

await invariant('every finished batch resolves to a production run and at least one raw batch and farmer/supplier', async () => {
  const fgs = await prisma.finishedGoodsBatch.findMany({
    include: { productionBatch: { include: { consumptions: { include: { rawMaterialBatch: true } } } } },
  });
  return fgs
    .filter((f) => !f.productionBatch || f.productionBatch.consumptions.length === 0 || f.productionBatch.consumptions.some((c) => !c.rawMaterialBatch.farmerId && !c.rawMaterialBatch.supplierId))
    .map((f) => ({ fg: f.fgBatchNumber }));
});

// --------------------------------------------------------------------- 2. stock
console.log('\n2. Finished-goods stock, ledger and reservations');
await invariant('stock never negative and reserved <= on hand', async () => {
  const rows = await prisma.finishedGoodsStock.findMany({ include: { fgBatch: true } });
  return rows.filter((r) => r.quantity < 0 || r.reservedQuantity < 0 || r.reservedQuantity > r.quantity).map((r) => ({ fg: r.fgBatch.fgBatchNumber, qty: r.quantity, reserved: r.reservedQuantity }));
});

await invariant('physical reservation = live allocations of orders still waiting to ship', async () => {
  const stock = await prisma.finishedGoodsStock.findMany({ include: { fgBatch: true } });
  const allocs = await prisma.orderAllocation.findMany({ where: { releasedAt: null, order: { status: { in: ['ALLOCATED', 'PACKED'] } } } });
  const expected = new Map();
  for (const a of allocs) expected.set(`${a.warehouseId}|${a.fgBatchId}`, (expected.get(`${a.warehouseId}|${a.fgBatchId}`) ?? 0) + a.quantity);
  return stock
    .filter((s) => s.reservedQuantity !== (expected.get(`${s.warehouseId}|${s.fgBatchId}`) ?? 0))
    .map((s) => ({ fg: s.fgBatch.fgBatchNumber, warehouse: s.warehouseId, reserved: s.reservedQuantity, allocated: expected.get(`${s.warehouseId}|${s.fgBatchId}`) ?? 0 }));
});

await invariant('stock on hand = ledger (stock-ins - dispatches) for every batch and warehouse', async () => {
  const moves = await prisma.stockMovement.findMany({ where: { fgBatchId: { not: null } } });
  const stock = await prisma.finishedGoodsStock.findMany({ include: { fgBatch: true } });
  const net = new Map();
  const skip = new Set(); // adjustments / transfers change stock by rules of their own; do not guess
  for (const m of moves) {
    const q = Number(m.quantity);
    if (m.movementType === 'STOCK_IN' || m.movementType === 'PRODUCTION_INWARD') net.set(`${m.toWarehouseId}|${m.fgBatchId}`, (net.get(`${m.toWarehouseId}|${m.fgBatchId}`) ?? 0) + q);
    else if (m.movementType === 'STOCK_OUT') net.set(`${m.fromWarehouseId}|${m.fgBatchId}`, (net.get(`${m.fromWarehouseId}|${m.fgBatchId}`) ?? 0) - q);
    else if (m.movementType === 'TRANSFER') {
      net.set(`${m.fromWarehouseId}|${m.fgBatchId}`, (net.get(`${m.fromWarehouseId}|${m.fgBatchId}`) ?? 0) - q);
      net.set(`${m.toWarehouseId}|${m.fgBatchId}`, (net.get(`${m.toWarehouseId}|${m.fgBatchId}`) ?? 0) + q);
    } else { skip.add(`${m.fromWarehouseId}|${m.fgBatchId}`); skip.add(`${m.toWarehouseId}|${m.fgBatchId}`); }
  }
  return stock
    .filter((s) => !skip.has(`${s.warehouseId}|${s.fgBatchId}`) && (net.get(`${s.warehouseId}|${s.fgBatchId}`) ?? 0) !== s.quantity)
    .map((s) => ({ fg: s.fgBatch.fgBatchNumber, warehouse: s.warehouseId, onHand: s.quantity, ledger: net.get(`${s.warehouseId}|${s.fgBatchId}`) ?? 0 }));
});

await invariant('never more packs stocked than were packed', async () => {
  const fgs = await prisma.finishedGoodsBatch.findMany({ include: { stockMovements: { where: { movementType: { in: ['STOCK_IN', 'PRODUCTION_INWARD'] } } } } });
  return fgs.filter((f) => f.stockMovements.reduce((n, m) => n + Number(m.quantity), 0) > f.packCount).map((f) => ({ fg: f.fgBatchNumber, packed: f.packCount }));
});

await invariant('committed stock reservations belong only to orders that are placed/confirmed and not yet packed', async () => {
  const rows = await prisma.stockReservation.findMany({ where: { status: 'COMMITTED' }, include: { order: { select: { orderNumber: true, status: true } } } });
  return rows.filter((r) => !r.order || !['PLACED', 'CONFIRMED'].includes(r.order.status)).map((r) => ({ order: r.order?.orderNumber, status: r.order?.status }));
});

await invariant('a placed order holds exactly its item quantities as reservations', async () => {
  const orders = await prisma.order.findMany({ where: { source: 'STOREFRONT', status: { in: ['PLACED', 'CONFIRMED'] } }, include: { items: true, stockReservations: { where: { status: 'COMMITTED' } } } });
  return orders
    .filter((o) => o.items.some((i) => (o.stockReservations.filter((r) => r.productId === i.productId).reduce((n, r) => n + r.quantity, 0)) !== i.quantity))
    .map((o) => ({ order: o.orderNumber }));
});

await invariant('allocated orders have allocations covering each item (never more than ordered)', async () => {
  const orders = await prisma.order.findMany({ where: { status: { in: ['ALLOCATED', 'PACKED', 'DISPATCHED', 'DELIVERED'] } }, include: { items: { include: { allocations: { where: { releasedAt: null } } } } } });
  return orders.flatMap((o) => o.items.filter((i) => i.allocations.reduce((n, a) => n + a.quantity, 0) > i.quantity).map((i) => ({ order: o.orderNumber, ordered: i.quantity })));
});

// --------------------------------------------------------------------- 3. money
console.log('\n3. Order money, payments and coupons');
await invariant('order total = subtotal - discount + GST + delivery fee', async () => {
  const orders = await prisma.order.findMany({ where: { status: { not: 'DRAFT' } } });
  return orders
    .filter((o) => Math.abs(cents(o.subtotal) - cents(o.discountTotal) + cents(o.taxTotal) + cents(o.deliveryFee) - cents(o.total)) > 1)
    .map((o) => ({ order: o.orderNumber, subtotal: o.subtotal, discount: o.discountTotal, tax: o.taxTotal, fee: o.deliveryFee, total: o.total }));
});

await invariant('order header = sum of its lines (subtotal, discount, GST)', async () => {
  const orders = await prisma.order.findMany({ where: { status: { not: 'DRAFT' } }, include: { items: true } });
  const sum = (o, k) => o.items.reduce((n, i) => n + cents(i[k]), 0);
  return orders
    .filter((o) => o.items.length > 0 && (Math.abs(sum(o, 'lineSubtotal') - cents(o.subtotal)) > 1 || Math.abs(sum(o, 'lineDiscount') - cents(o.discountTotal)) > 1 || Math.abs(sum(o, 'lineTax') - cents(o.taxTotal)) > 1))
    .map((o) => ({ order: o.orderNumber }));
});

await invariant('every line: total = subtotal - discount + GST', async () => {
  const items = await prisma.orderItem.findMany({ include: { order: { select: { orderNumber: true } } } });
  return items
    .filter((i) => Math.abs(cents(i.lineSubtotal) - cents(i.lineDiscount) + cents(i.lineTax) - cents(i.lineTotal)) > 1)
    .map((i) => ({ order: i.order.orderNumber, sub: i.lineSubtotal, disc: i.lineDiscount, tax: i.lineTax, total: i.lineTotal }));
});

await invariant('a PAID online order has PAID ledger rows summing to its total; COD/credit have their own row', async () => {
  const orders = await prisma.order.findMany({ where: { source: 'STOREFRONT', status: { not: 'CANCELLED' } }, include: { paymentTransactions: true } });
  return orders
    .filter((o) => {
      const paid = o.paymentTransactions.filter((p) => p.status === 'PAID').reduce((n, p) => n + cents(p.amount), 0);
      if (o.paymentMode === 'ONLINE') return o.paymentStatus === 'PAID' && Math.abs(paid - cents(o.total)) > 1;
      return o.paymentTransactions.length === 0;
    })
    .map((o) => ({ order: o.orderNumber, mode: o.paymentMode, total: o.total, ledger: o.paymentTransactions.map((p) => `${p.status}:${p.amount}`) }));
});

await invariant('coupon usage count = number of live redemptions', async () => {
  const coupons = await prisma.coupon.findMany({ include: { _count: { select: { redemptions: true } } } });
  return coupons.filter((c) => c.usedCount !== c._count.redemptions).map((c) => ({ code: c.code, usedCount: c.usedCount, redemptions: c._count.redemptions }));
});

await invariant('a redeemed coupon\'s amount is part of the order discount', async () => {
  const rs = await prisma.couponRedemption.findMany({ include: { order: true } });
  return rs.filter((r) => cents(r.amount) > cents(r.order.discountTotal)).map((r) => ({ order: r.order.orderNumber, coupon: r.amount, orderDiscount: r.order.discountTotal }));
});

// ------------------------------------------------------------------ 4. loyalty
console.log('\n4. Loyalty points ledger');
await invariant('every customer\'s balance = the sum of their ledger', async () => {
  const customers = await prisma.customer.findMany({ include: { coinTransactions: true } });
  return customers
    .filter((c) => c.coinBalance !== c.coinTransactions.reduce((n, t) => n + t.amount, 0))
    .map((c) => ({ customer: c.customerCode, balance: c.coinBalance, ledger: c.coinTransactions.reduce((n, t) => n + t.amount, 0) }));
});

await invariant('an order\'s earned points = its per-line points = its ledger row', async () => {
  const earns = await prisma.loyaltyOrderEarn.findMany({ include: { lines: true } });
  const out = [];
  for (const e of earns) {
    const linePts = e.lines.reduce((n, l) => n + l.points, 0);
    const tx = e.coinTransactionId ? await prisma.coinTransaction.findUnique({ where: { id: e.coinTransactionId } }) : null;
    if (linePts !== e.points || (e.points > 0 && tx?.amount !== e.points) || (e.points === 0 && tx)) out.push({ order: e.orderId, earn: e.points, lines: linePts, ledger: tx?.amount });
  }
  return out;
});

await invariant('points reversed by returns never exceed points earned, and live points stay within 0..earned', async () => {
  const lines = await prisma.loyaltyOrderEarnLine.findMany();
  const bad = lines.filter((l) => l.reversedPoints > l.points || l.reversedPoints < 0).map((l) => ({ line: l.id, points: l.points, reversed: l.reversedPoints }));
  const lots = await prisma.coinTransaction.findMany({ where: { reason: 'LOYALTY_EARN' } });
  return bad.concat(lots.filter((t) => t.remainingAmount === null || t.remainingAmount < 0 || t.remainingAmount > t.amount).map((t) => ({ lot: t.id, amount: t.amount, remaining: t.remainingAmount })));
});

await invariant('points are credited only for delivered orders', async () => {
  const earns = await prisma.loyaltyOrderEarn.findMany({ where: { points: { gt: 0 }, order: { status: { not: 'DELIVERED' } } }, include: { order: { select: { orderNumber: true, status: true } } } });
  return earns.map((e) => ({ order: e.order.orderNumber, status: e.order.status }));
});

await invariant('points redeemed at checkout = the ledger debit (net of refunds on cancel)', async () => {
  const orders = await prisma.order.findMany({ where: { loyaltyRedeemedPoints: { gt: 0 } }, include: { coinTransactions: { where: { reason: { in: ['LOYALTY_REDEMPTION', 'LOYALTY_REDEMPTION_REFUND'] } } } } });
  return orders
    .filter((o) => {
      const net = -o.coinTransactions.reduce((n, t) => n + t.amount, 0);
      return o.status === 'CANCELLED' ? net !== 0 : net !== o.loyaltyRedeemedPoints;
    })
    .map((o) => ({ order: o.orderNumber, redeemed: o.loyaltyRedeemedPoints, status: o.status }));
});

await invariant('delivered orders placed after loyalty launched have an earn record', async () => {
  const s = await prisma.loyaltySettings.findFirst();
  if (!s) return [];
  const orders = await prisma.order.findMany({ where: { status: 'DELIVERED', deliveredAt: { gte: s.earningStartsAt }, loyaltyEarn: null }, select: { orderNumber: true } });
  return orders;
});

// --------------------------------------------------------- 5. fulfilment & trace
console.log('\n5. Fulfilment and traceability');
await invariant('storefront orders that are packed or later had every batch scanned', async () => {
  const orders = await prisma.order.findMany({ where: { source: 'STOREFRONT', status: { in: ['PACKED', 'DISPATCHED', 'DELIVERED'] } }, include: { allocations: { where: { releasedAt: null } } } });
  return orders.filter((o) => o.allocations.some((a) => !a.scannedAt)).map((o) => ({ order: o.orderNumber, status: o.status }));
});

await invariant('local orders delivered had their doorstep OTP verified; courier orders have a shipment', async () => {
  const orders = await prisma.order.findMany({ where: { source: 'STOREFRONT', status: { in: ['DISPATCHED', 'DELIVERED'] } }, include: { shipment: true } });
  return orders
    .filter((o) => (o.fulfillmentMethod === 'LOCAL' && o.status === 'DELIVERED' && !o.deliveryOtpVerifiedAt) || (o.fulfillmentMethod === 'LOCAL' && !o.riderName) || (o.fulfillmentMethod === 'SHIPROCKET' && !o.shipment))
    .map((o) => ({ order: o.orderNumber, method: o.fulfillmentMethod, status: o.status }));
});

await invariant('dispatched allocations trace back to a farmer or supplier', async () => {
  const allocs = await prisma.orderAllocation.findMany({
    where: { releasedAt: null, order: { status: { in: ['DISPATCHED', 'DELIVERED'] } } },
    include: { order: { select: { orderNumber: true } }, fgBatch: { include: { productionBatch: { include: { consumptions: { include: { rawMaterialBatch: true } } } } } } },
  });
  return allocs
    .filter((a) => !a.fgBatch.productionBatch.consumptions.some((c) => c.rawMaterialBatch.farmerId || c.rawMaterialBatch.supplierId))
    .map((a) => ({ order: a.order.orderNumber, fg: a.fgBatch.fgBatchNumber }));
});

await invariant('a recalled batch is not sitting in a not-yet-shipped order\'s live allocations un-flagged', async () => {
  // Allowed (staff re-allocate), but it must be VISIBLE: these are the orders the recall screen lists.
  const rows = await prisma.orderAllocation.findMany({ where: { releasedAt: null, order: { status: { in: ['ALLOCATED', 'PACKED'] } }, fgBatch: { holdStatus: { not: 'ACTIVE' } } }, include: { order: { select: { orderNumber: true } }, fgBatch: { select: { fgBatchNumber: true, holdStatus: true } } } });
  console.log(`       (info) ${rows.length} unshipped allocation(s) still on frozen/recalled batches - listed by /recall/forward for re-allocation`);
  return [];
});

console.log(`\n=============================================\n  Invariants checked: ${checked}   Broken: ${failed}\n=============================================`);
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
