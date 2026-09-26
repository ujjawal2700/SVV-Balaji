import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting Delivery App & Order Test Data Cleanup...\n');

  // Truncate all transactional tables related to delivery, riders, and test orders using CASCADE
  const tablesToTruncate = [
    'delivery_task_events',
    'delivery_offers',
    'cod_collections',
    'rider_cash_entries',
    'rider_earnings',
    'rider_notifications',
    'rider_sessions',
    'rider_otps',
    'delivery_tasks',
    'riders',
    'order_allocations',
    'loyalty_order_earn_lines',
    'order_items',
    'orders',
  ];

  for (const table of tablesToTruncate) {
    try {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE;`);
      console.log(`- Truncated table: ${table}`);
    } catch (e: any) {
      console.warn(`- Notice for ${table}: ${e?.message ?? e}`);
    }
  }

  console.log('\n✅ PRESERVED CONFIGURATIONS & MASTER DATA:');
  const zonesCount = await prisma.deliveryZone.count();
  const settingsCount = await prisma.deliverySettings.count();
  const failureReasonsCount = await prisma.deliveryFailureReason.count();
  const earningRulesCount = await prisma.riderEarningRule.count();
  const warehousesCount = await prisma.warehouse.count();
  const productsCount = await prisma.product.count();
  const usersCount = await prisma.user.count();

  console.log(`  - Delivery Zones: ${zonesCount}`);
  console.log(`  - Delivery Settings: ${settingsCount}`);
  console.log(`  - Delivery Failure Reasons: ${failureReasonsCount}`);
  console.log(`  - Rider Earning Rules: ${earningRulesCount}`);
  console.log(`  - Outlets / Warehouses: ${warehousesCount}`);
  console.log(`  - Products Catalogue: ${productsCount}`);
  console.log(`  - Admin / Staff Users: ${usersCount}`);

  console.log('\n✅ VERIFYING CLEANUP RESULT:');
  const orders = await prisma.order.count();
  const tasks = await prisma.deliveryTask.count();
  const riders = await prisma.rider.count();

  console.log(`  - Remaining Orders: ${orders}`);
  console.log(`  - Remaining Delivery Tasks: ${tasks}`);
  console.log(`  - Remaining Riders: ${riders}`);

  console.log('\n🎉 Delivery App test data successfully deleted! You can now perform end-to-end manual testing clean from scratch.');
}

main()
  .catch((e) => {
    console.error('❌ Error clearing test data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
