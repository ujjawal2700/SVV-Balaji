import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkFgStock() {
  const stock = await prisma.finishedGoodsStock.findMany({
    include: {
      warehouse: true,
      fgBatch: {
        include: { product: true },
      },
    },
  });

  console.log(`Total Finished Goods Stock Rows: ${stock.length}`);
  for (const s of stock) {
    console.log(`- Product: ${s.fgBatch.product.name} | Batch: ${s.fgBatch.fgBatchNumber} | WH: ${s.warehouse.name} (${s.warehouse.kind}) | Qty: ${s.quantity} (Reserved: ${s.reservedQuantity}) | QA Released: ${s.fgBatch.qaReleased} | Hold: ${s.fgBatch.holdStatus}`);
  }

  // Also check products and their stock
  const products = await prisma.product.findMany({
    where: { showOnStorefront: true },
    select: { id: true, name: true, sku: true },
  });
  console.log(`\nStorefront Products (${products.length}):`);
  for (const p of products) {
    const pStock = stock.filter(s => s.fgBatch.productId === p.id);
    const totalAvail = pStock.reduce((acc, s) => acc + (s.quantity - s.reservedQuantity), 0);
    console.log(`- ${p.name} (ID: ${p.id}) -> Total Stock Across WH: ${totalAvail}`);
  }
}

checkFgStock()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
