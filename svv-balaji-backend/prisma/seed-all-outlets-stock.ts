import { PrismaClient, BatchHoldStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Seeding stock across ALL active warehouses & outlets ---');
  const warehouses = await prisma.warehouse.findMany({ where: { isActive: true } });
  const products = await prisma.product.findMany({ where: { showOnStorefront: true } });
  const fgBatches = await prisma.finishedGoodsBatch.findMany({ where: { qaReleased: true, holdStatus: BatchHoldStatus.ACTIVE } });

  console.log(`Found ${warehouses.length} active warehouses/outlets and ${products.length} storefront products.`);

  for (const w of warehouses) {
    for (const p of products) {
      const batch = fgBatches.find((b) => b.productId === p.id);
      if (!batch) continue;

      await prisma.finishedGoodsStock.upsert({
        where: {
          warehouseId_fgBatchId: {
            warehouseId: w.id,
            fgBatchId: batch.id,
          },
        },
        update: {
          quantity: 200,
          reservedQuantity: 0,
        },
        create: {
          warehouseId: w.id,
          fgBatchId: batch.id,
          quantity: 200,
          reservedQuantity: 0,
          storageLocation: 'Main-Shelf-01',
        },
      });
    }
    console.log(`✓ Seeded 200 stock per product for node: "${w.name}" (${w.kind})`);
  }

  console.log('--- All Outlets Stock Seeding Complete ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
