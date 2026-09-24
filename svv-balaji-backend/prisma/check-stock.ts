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

  const batches = await prisma.rawMaterialBatch.findMany({
    select: { id: true, batchNumber: true, farmerId: true, status: true, quantity: true },
    take: 10,
  });
  console.log('\nRaw Material Batches in DB:');
  for (const b of batches) {
    console.log(`- ${b.batchNumber} | Farmer: ${b.farmerId} | Status: ${b.status} | Qty: ${b.quantity}`);
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
