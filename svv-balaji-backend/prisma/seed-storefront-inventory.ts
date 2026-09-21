import { PrismaClient, WarehouseKind, BatchHoldStatus, ProductionType, ProductionStatus, RecipeStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Initializing Storefront Inventory & Fulfillment ---');

  // 1. Get Super Admin User
  const admin = await prisma.user.findFirst({
    where: { role: 'SUPER_ADMIN' },
  });
  if (!admin) {
    throw new Error('Super Admin user not found.');
  }

  // 2. Get or create Branch
  let branch = await prisma.branch.findFirst();
  if (!branch) {
    branch = await prisma.branch.create({
      data: {
        name: 'SVV Balaji Central Branch',
        location: 'Indore',
        address: 'Industrial Area, Sanwer Road, Indore',
      },
    });
  }

  // 3. Ensure Central Depot exists
  let central = await prisma.warehouse.findFirst({
    where: { kind: WarehouseKind.CENTRAL, isActive: true },
  });
  if (!central) {
    central = await prisma.warehouse.create({
      data: {
        name: 'Bhopal Central Depot',
        kind: WarehouseKind.CENTRAL,
        location: 'Govindpura Industrial Area, Bhopal',
        city: 'Bhopal',
        state: 'Madhya Pradesh',
        capacity: 50000,
        branchId: branch.id,
        isActive: true,
      },
    });
  }
  console.log(`✓ Central Depot: ${central.name} (${central.id})`);

  // 4. Ensure Local Outlet exists with GPS coordinates
  let outlet = await prisma.warehouse.findFirst({
    where: { kind: WarehouseKind.OUTLET, isActive: true },
  });
  if (!outlet) {
    outlet = await prisma.warehouse.create({
      data: {
        name: 'Indore City Express Outlet',
        kind: WarehouseKind.OUTLET,
        location: '509, Corporate House, RNT Marg, Indore',
        city: 'Indore',
        state: 'Madhya Pradesh',
        latitude: 22.7196,
        longitude: 75.8577,
        serviceRadiusKm: 25,
        capacity: 10000,
        branchId: branch.id,
        isActive: true,
      },
    });
  } else {
    outlet = await prisma.warehouse.update({
      where: { id: outlet.id },
      data: {
        latitude: 22.7196,
        longitude: 75.8577,
        serviceRadiusKm: 25,
        isActive: true,
      },
    });
  }
  console.log(`✓ Local Outlet: ${outlet.name} (Lat: ${outlet.latitude}, Lng: ${outlet.longitude}, Radius: ${outlet.serviceRadiusKm} km)`);

  // 5. Update Checkout Settings
  const existingSettings = await prisma.checkoutSettings.findFirst();
  if (existingSettings) {
    await prisma.checkoutSettings.update({
      where: { id: existingSettings.id },
      data: {
        centralWarehouseId: central.id,
        localRadiusKm: 25,
        prepMinutes: 20,
        minutesPerKm: 3,
        localBaseFee: 0,
        localFreeAbove: 0,
        shipBaseFee: 0,
        shipFreeAbove: 0,
        codEnabled: true,
      },
    });
  } else {
    await prisma.checkoutSettings.create({
      data: {
        centralWarehouseId: central.id,
        localRadiusKm: 25,
        prepMinutes: 20,
        minutesPerKm: 3,
        localBaseFee: 0,
        localFreeAbove: 0,
        shipBaseFee: 0,
        shipFreeAbove: 0,
        codEnabled: true,
      },
    });
  }
  console.log('✓ Checkout Routing Settings configured.');

  // 6. Get Storefront Products
  const products = await prisma.product.findMany({
    where: { showOnStorefront: true },
  });
  console.log(`\nFound ${products.length} Storefront Products. Seeding Batches and Stock...`);

  const today = new Date();
  const nextYear = new Date(today);
  nextYear.setFullYear(today.getFullYear() + 1);

  for (const [index, p] of products.entries()) {
    // 6a. Recipe for product
    let recipe = await prisma.recipe.findFirst({ where: { productId: p.id } });
    if (!recipe) {
      recipe = await prisma.recipe.create({
        data: {
          recipeCode: `REC-${p.sku}-${index + 1}`,
          name: `${p.name} Standard Recipe`,
          productId: p.id,
          productionType: ProductionType.SINGLE_GRAIN,
          batchYieldQuantity: 1000,
          unit: p.unit || 'KG',
          status: RecipeStatus.APPROVED,
          createdById: admin.id,
          approvedById: admin.id,
        },
      });
    }

    // 6b. Production Batch
    const pbCode = `PB-2026-${String(index + 1).padStart(3, '0')}`;
    let pb = await prisma.productionBatch.findUnique({ where: { productionBatchNumber: pbCode } });
    if (!pb) {
      pb = await prisma.productionBatch.create({
        data: {
          productionBatchNumber: pbCode,
          productId: p.id,
          recipeId: recipe.id,
          recipeVersion: 1,
          productionType: ProductionType.SINGLE_GRAIN,
          plannedQuantity: 1000,
          actualQuantity: 990,
          unit: p.unit || 'KG',
          productionDate: today,
          status: ProductionStatus.COMPLETED,
          branchId: branch.id,
          createdById: admin.id,
        },
      });
    }

    // 6c. Finished Goods Batch
    const fgCode = `FG-20260921-STOCK-${String(index + 1).padStart(3, '0')}`;
    const fgBatch = await prisma.finishedGoodsBatch.upsert({
      where: { fgBatchNumber: fgCode },
      update: {
        qaReleased: true,
        holdStatus: BatchHoldStatus.ACTIVE,
        expiryDate: nextYear,
        productId: p.id,
        packCount: 1000,
      },
      create: {
        fgBatchNumber: fgCode,
        productionBatchId: pb.id,
        productId: p.id,
        packagingType: 'pouch',
        netWeight: 1,
        weightUnit: 'KG',
        mrp: p.mrp ?? 450,
        packagingDate: today,
        manufacturingDate: today,
        expiryDate: nextYear,
        shelfLifeDays: 365,
        packCount: 1000,
        qaReleased: true,
        holdStatus: BatchHoldStatus.ACTIVE,
        packedById: admin.id,
      },
    });

    // 6d. Stock in Central Depot (500 units)
    await prisma.finishedGoodsStock.upsert({
      where: {
        warehouseId_fgBatchId: {
          warehouseId: central.id,
          fgBatchId: fgBatch.id,
        },
      },
      update: {
        quantity: 500,
        reservedQuantity: 0,
      },
      create: {
        warehouseId: central.id,
        fgBatchId: fgBatch.id,
        quantity: 500,
        reservedQuantity: 0,
        storageLocation: 'Central-Rack-01',
      },
    });

    // 6e. Stock in Local Outlet (100 units)
    await prisma.finishedGoodsStock.upsert({
      where: {
        warehouseId_fgBatchId: {
          warehouseId: outlet.id,
          fgBatchId: fgBatch.id,
        },
      },
      update: {
        quantity: 100,
        reservedQuantity: 0,
      },
      create: {
        warehouseId: outlet.id,
        fgBatchId: fgBatch.id,
        quantity: 100,
        reservedQuantity: 0,
        storageLocation: 'Front-Outlet-01',
      },
    });

    console.log(`✓ ${p.name}: Batch "${fgCode}" (500 in Central Depot, 100 in Local Outlet)`);
  }

  console.log('\n--- Storefront Inventory Seeding Completed Successfully! ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
