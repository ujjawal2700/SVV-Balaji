import { PrismaClient, WarehouseKind, BatchHoldStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Initializing Stock & Fulfillment Nodes for Storefront ---');

  // 1. Get or create Branch
  const branch = await prisma.branch.findFirst() || await prisma.branch.create({
    data: {
      name: 'SVV Balaji Central Branch',
      location: 'Indore, Madhya Pradesh',
      address: 'Industrial Area, Sanwer Road, Indore',
    },
  });

  // 2. Ensure Central Depot exists with kind CENTRAL
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
  console.log(`Central Warehouse: ${central.name} (${central.id})`);

  // 3. Ensure Indore Local Outlet exists with kind OUTLET and GPS coordinates
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
    // Update coordinates if missing
    outlet = await prisma.warehouse.update({
      where: { id: outlet.id },
      data: {
        latitude: outlet.latitude ?? 22.7196,
        longitude: outlet.longitude ?? 75.8577,
        serviceRadiusKm: outlet.serviceRadiusKm ?? 25,
        isActive: true,
      },
    });
  }
  console.log(`Local Outlet: ${outlet.name} (Lat: ${outlet.latitude}, Lng: ${outlet.longitude}, Radius: ${outlet.serviceRadiusKm} km)`);

  // 4. Update Checkout Settings (field names aligned with current schema)
  await prisma.checkoutSettings.upsert({
    where: { id: 'default' },
    update: {
      centralWarehouseId: central.id,
      localRadiusKm: 20,
      minutesPerKm: 3,
      prepMinutes: 20,
      localBaseFee: 0,
      shipMinDays: 2,
      shipMaxDays: 4,
      shipBaseFee: 0,
      codEnabled: true,
      updatedAt: new Date(),
    },
    create: {
      id: 'default',
      centralWarehouseId: central.id,
      localRadiusKm: 20,
      minutesPerKm: 3,
      prepMinutes: 20,
      localBaseFee: 0,
      shipMinDays: 2,
      shipMaxDays: 4,
      shipBaseFee: 0,
      codEnabled: true,
    },
  });

  // 5. Get all Storefront Products
  const products = await prisma.product.findMany({
    where: { showOnStorefront: true },
  });
  console.log(`Found ${products.length} Storefront Products to seed stock for.`);

  // Ensure a seed user exists to satisfy the required `packedById` and `createdById` fields
  let seedUser = await prisma.user.findFirst({ where: { email: 'seed@svvbalaji.com' } });
  if (!seedUser) {
    seedUser = await prisma.user.findFirst();
  }
  if (!seedUser) {
    throw new Error('No user found in the database. Please seed users first.');
  }

  // Ensure a recipe exists for the production batch (required field)
  let recipe = await prisma.recipe.findFirst();
  if (!recipe) {
    const firstProduct = products[0];
    if (!firstProduct) {
      throw new Error('No storefront products found. Please seed products first.');
    }
    recipe = await prisma.recipe.create({
      data: {
        recipeCode: 'REC-SEED-001',
        name: 'Default Milling Recipe',
        productId: firstProduct.id,
        version: 1,
        status: 'APPROVED',
        description: 'Seed recipe for storefront stock seeding',
        createdById: seedUser.id,
      },
    });
  }

  // Create a default production batch header if needed
  let prodBatch = await prisma.productionBatch.findFirst();
  if (!prodBatch) {
    const firstProduct = products[0];
    if (!firstProduct) {
      throw new Error('No storefront products found. Please seed products first.');
    }
    prodBatch = await prisma.productionBatch.create({
      data: {
        productionBatchNumber: 'PB-20260101-001',
        productId: firstProduct.id,
        recipeId: recipe.id,
        recipeVersion: recipe.version,
        productionType: 'SINGLE_GRAIN',
        plannedQuantity: 5000,
        unit: 'KG',
        productionDate: new Date(),
        status: 'COMPLETED',
        branchId: branch.id,
        createdById: seedUser.id,
      },
    });
  }

  const today = new Date();
  const nextYear = new Date(today);
  nextYear.setFullYear(today.getFullYear() + 1);

  for (const [index, p] of products.entries()) {
    const fgBatchNumber = `FG-STORE-2026-${String(index + 1).padStart(3, '0')}`;
    
    // Upsert Finished Goods Batch with QA_RELEASED and ACTIVE status
    const fgBatch = await prisma.finishedGoodsBatch.upsert({
      where: { fgBatchNumber },
      update: {
        qaReleased: true,
        holdStatus: BatchHoldStatus.ACTIVE,
        expiryDate: nextYear,
        productId: p.id,
      },
      create: {
        fgBatchNumber,
        productionBatchId: prodBatch.id,
        productId: p.id,
        packagingType: 'pouch',
        netWeight: 1,
        weightUnit: 'KG',
        mrp: p.mrp ?? 400,
        packagingDate: today,
        manufacturingDate: today,
        expiryDate: nextYear,
        shelfLifeDays: 365,
        packCount: 1000,
        qaReleased: true,
        holdStatus: BatchHoldStatus.ACTIVE,
        packedById: seedUser.id,
      },
    });

    // Stock in Central Depot (500 units)
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
        storageLocation: 'Aisle-01-Depot',
      },
    });

    // Stock in Local Outlet (100 units)
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
        storageLocation: 'Rack-Front-01',
      },
    });

    console.log(`✓ Seeded Stock for "${p.name}" (500 in Central, 100 in Local Outlet)`);
  }

  console.log('\n--- Storefront Stock & Node Routing Initialized Successfully! ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
