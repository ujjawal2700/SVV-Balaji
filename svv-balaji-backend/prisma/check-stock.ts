import { PrismaClient, WarehouseKind } from '@prisma/client';

const prisma = new PrismaClient();

async function checkStock() {
  const warehouses = await prisma.warehouse.findMany({
    select: { id: true, name: true, kind: true, isActive: true, city: true, latitude: true, longitude: true },
  });
  console.log('Warehouses in DB:');
  for (const w of warehouses) {
    console.log(`- [${w.kind}] ${w.name} (${w.id}) | Active: ${w.isActive} | City: ${w.city}`);
  }

  const products = await prisma.product.findMany({
    select: { id: true, name: true, sku: true, showOnStorefront: true },
    take: 10,
  });
  console.log('\nProducts in DB:');
  for (const p of products) {
    console.log(`- ${p.name} (SKU: ${p.sku}, ID: ${p.id}) | Storefront: ${p.showOnStorefront}`);
  }

  const batches = await prisma.batch.findMany({
    select: { id: true, batchCode: true, productId: true, qualityGrade: true, holdStatus: true, currentQuantity: true },
    take: 10,
  });
  console.log('\nBatches in DB:');
  for (const b of batches) {
    console.log(`- ${b.batchCode} | Product: ${b.productId} | Grade: ${b.qualityGrade} | Hold: ${b.holdStatus} | Qty: ${b.currentQuantity}`);
  }

  const stock = await prisma.warehouseStock.findMany({
    select: { id: true, warehouseId: true, batchId: true, quantity: true, reservedQuantity: true },
    take: 10,
  });
  console.log('\nWarehouseStock in DB:');
  for (const s of stock) {
    console.log(`- Warehouse: ${s.warehouseId} | Batch: ${s.batchId} | Qty: ${s.quantity} | Reserved: ${s.reservedQuantity}`);
  }
}

checkStock()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
