import { PrismaClient, WarehouseKind, BatchHoldStatus, QualityGrade } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Initializing Stock & Fulfillment Nodes for Storefront ---');

  // 1. Get or create Branch
  const branch = await prisma.branch.findFirst() || await prisma.branch.create({
    data: {
      name: 'SVV Balaji Central Branch',
      code: 'SVV-MAIN',
      city: 'Indore',
      state: 'Madhya Pradesh',
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
        code: 'WH-CENTRAL-01',
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
        code: 'OUTLET-IND-01',
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

  // 4. Update Checkout Settings to point to Central Warehouse
  await prisma.checkoutSettings.upsert({
    where: { id: 'default' },
    update: {
      centralWarehouseId: central.id,
      localRadiusKm: 20,
      localEtaMinutesPerKm: 3,
      localPrepMinutes: 20,
      localFeeBase: 0,
      courierEtaDaysMin: 2,
      courierEtaDaysMax: 4,
      courierFeeBase: 0,
      codAvailable: true,
      updatedAt: new Date(),
    },
    create: {
      id: 'default',
      centralWarehouseId: central.id,
      localRadiusKm: 20,
      localEtaMinutesPerKm: 3,
      localPrepMinutes: 20,
      localFeeBase: 0,
      courierEtaDaysMin: 2,
      courierEtaDaysMax: 4,
      courierFeeBase: 0,
      codAvailable: true,
    },
  });

  // 5. Get all Storefront Products
  const products = await prisma.product.findMany({
    where: { showOnStorefront: true },
  });
  console.log(`Found ${products.length} Storefront Products to seed stock for.`);

  // Create a default production batch header if needed
  let prodBatch = await prisma.productionBatch.findFirst();
  if (!prodBatch) {
    prodBatch = await prisma.productionBatch.create({
      data: {
        batchCode: 'PROD-STORE-2026',
        productName: 'Storefront Milling Run',
        outputQuantity: 5000,
        unit: 'KG',
        status: 'COMPLETED',
        branchId: branch.id,
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
        location: 'Aisle-01-Depot',
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
        location: 'Rack-Front-01',
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
