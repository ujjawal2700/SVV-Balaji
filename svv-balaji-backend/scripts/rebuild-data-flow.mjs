// Rebuilds the traceability + inventory chain for the REAL catalogue and removes test/scratch data.
//
//   node scripts/rebuild-data-flow.mjs            dry run: does everything in a transaction, prints the report, rolls back
//   node scripts/rebuild-data-flow.mjs --apply    same, then commits
//
// Take a backup first (pg_dump -Fc). What it does, in order:
//   1. Decides what is TEST/SCRATCH data (see the rules below) and what is real.
//   2. Computes the full foreign-key closure of the test rows (everything that depends on them),
//      REFUSES to continue if that closure would touch a protected (real) row, then deletes it.
//   3. Rebuilds farmer/supplier -> raw batch -> production -> FG batch -> stock -> ledger for every
//      real product, and re-syncs the real orders' reservations with the rebuilt stock.
// It never edits the reconciliation rules; run e2e-reconcile.mjs afterwards as the judge.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

// ---------------------------------------------------------------------------------------------
// Rules for "test/scratch". Everything not matched here is treated as real and kept.
// ---------------------------------------------------------------------------------------------
const TEST_SKU = /-\d{10}$/; // e2e scripts stamp SKUs with a 10-digit epoch: CHECKOUT-ATTA-1789975496
const TEST_CATEGORY = /^(No Loyalty|Follows Default) \d+$/;
const TEST_FARMER_NAME = /^(E2E|Loyalty|Checkout) Farmer/;
const TEST_FARMER_VILLAGE = 'Testpur'; // smoke-test.sh
const TEST_USER_EMAIL = /(@example\.com$)|(^expert\.\d+@)/;
const REAL_CUSTOMER_BEFORE = new Date('2026-09-21T05:00:00Z'); // scripted runs started after this
const KEEP_WAREHOUSE_NAME = /^(Main|Secondary) Store /; // host the real stock and the real order

const report = { removed: {}, kept: {}, rebuilt: [], notes: [] };
const log = (...a) => console.log(...a);
const q = (tx, sql, ...a) => tx.$queryRawUnsafe(sql, ...a);
const chunks = (arr, n = 800) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

class DryRun extends Error {}

async function main() {
  await prisma.$transaction(
    async (tx) => {
      const scope = await decideScope(tx);
      await removeTestData(tx, scope);
      await rebuildChain(tx, scope);
      if (!APPLY) throw new DryRun('dry run - rolled back');
    },
    { timeout: 10 * 60 * 1000, maxWait: 60 * 1000 },
  ).catch((e) => {
    if (!(e instanceof DryRun)) throw e;
    log('\nDRY RUN - nothing was committed. Re-run with --apply to commit.');
  });

  fs.mkdirSync('reports', { recursive: true });
  const file = `reports/data-rebuild-${new Date().toISOString().slice(0, 10)}${APPLY ? '' : '-dryrun'}.json`;
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  log(`\nReport written to ${file}`);
}

// ---------------------------------------------------------------------------------------------
// 1. Scope
// ---------------------------------------------------------------------------------------------
async function decideScope(tx) {
  const products = await tx.product.findMany({ select: { id: true, sku: true, name: true } });
  const testProducts = products.filter((x) => TEST_SKU.test(x.sku));
  const realProducts = products.filter((x) => !TEST_SKU.test(x.sku));
  const realProductIds = new Set(realProducts.map((x) => x.id));

  // A genuine order = every line is a real product AND the customer is a real customer.
  const orders = await tx.order.findMany({
    select: { id: true, orderNumber: true, customerId: true, customer: { select: { createdAt: true, name: true } }, items: { select: { productId: true } } },
  });
  const genuine = orders.filter((o) => o.items.length > 0 && o.items.every((i) => realProductIds.has(i.productId)));
  const genuineIds = new Set(genuine.map((o) => o.id));
  const genuineCustomerIds = new Set(genuine.map((o) => o.customerId));

  const customers = await tx.customer.findMany({ select: { id: true, name: true, phone: true, createdAt: true } });
  const realCustomers = customers.filter((c) => genuineCustomerIds.has(c.id) || c.createdAt < REAL_CUSTOMER_BEFORE);
  const realCustomerIds = new Set(realCustomers.map((c) => c.id));
  const testCustomers = customers.filter((c) => !realCustomerIds.has(c.id));
  // a genuine order must belong to a real customer
  const genuineFinal = genuine.filter((o) => realCustomerIds.has(o.customerId));
  const genuineFinalIds = new Set(genuineFinal.map((o) => o.id));

  const farmers = await tx.farmer.findMany({ select: { id: true, fullName: true, village: true, farmerCode: true } });
  const testFarmers = farmers.filter((f) => TEST_FARMER_NAME.test(f.fullName) || f.village === TEST_FARMER_VILLAGE || f.fullName === 'Unapproved Farmer');
  const realFarmers = farmers.filter((f) => !testFarmers.includes(f));

  const users = await tx.user.findMany({ select: { id: true, email: true, role: true } });
  const testUsers = users.filter((u) => TEST_USER_EMAIL.test(u.email) && u.role !== 'SUPER_ADMIN');
  const realUsers = users.filter((u) => !testUsers.includes(u));

  const warehouses = await tx.warehouse.findMany({ select: { id: true, name: true } });
  const realWarehouses = warehouses.filter((w) => KEEP_WAREHOUSE_NAME.test(w.name));
  const testWarehouses = warehouses.filter((w) => !realWarehouses.includes(w));

  const categories = await tx.category.findMany({ select: { id: true, name: true } });
  const testCategories = categories.filter((c) => TEST_CATEGORY.test(c.name));
  const realCategories = categories.filter((c) => !testCategories.includes(c));

  const coupons = await tx.coupon.findMany({ select: { id: true, code: true } });
  const testOrders = orders.filter((o) => !genuineFinalIds.has(o.id));

  const realBatches = await tx.finishedGoodsBatch.findMany({ where: { productId: { in: [...realProductIds] } }, select: { id: true, productionBatchId: true } });
  const realRecipes = await tx.recipe.findMany({ where: { productId: { in: [...realProductIds] } }, select: { id: true } });

  Object.assign(report.kept, {
    products: realProducts.map((x) => `${x.sku} ${x.name.slice(0, 40)}`),
    categories: realCategories.map((c) => c.name),
    customers: realCustomers.map((c) => `${c.name} ${c.phone}`),
    farmers: realFarmers.map((f) => `${f.fullName} ${f.farmerCode ?? '(pending)'}`),
    users: realUsers.map((u) => u.email),
    warehouses: realWarehouses.map((w) => w.name),
    genuineOrders: genuineFinal.map((o) => o.orderNumber),
  });
  log('KEEP  products', realProducts.length, '| categories', realCategories.length, '| customers', realCustomers.length, '| farmers', realFarmers.length, '| users', realUsers.length, '| warehouses', realWarehouses.length, '| genuine orders', genuineFinal.length);
  log('TEST  products', testProducts.length, '| categories', testCategories.length, '| customers', testCustomers.length, '| farmers', testFarmers.length, '| users', testUsers.length, '| warehouses', testWarehouses.length, '| coupons', coupons.length, '| orders', testOrders.length);

  return {
    roots: {
      products: testProducts.map((x) => x.id),
      categories: testCategories.map((x) => x.id),
      customers: testCustomers.map((x) => x.id),
      farmers: testFarmers.map((x) => x.id),
      users: testUsers.map((x) => x.id),
      warehouses: testWarehouses.map((x) => x.id),
      coupons: coupons.map((x) => x.id),
      orders: testOrders.map((x) => x.id),
    },
    protectedIds: {
      products: new Set(realProducts.map((x) => x.id)),
      categories: new Set(realCategories.map((x) => x.id)),
      customers: realCustomerIds,
      farmers: new Set(realFarmers.map((x) => x.id)),
      users: new Set(realUsers.map((x) => x.id)),
      warehouses: new Set(realWarehouses.map((x) => x.id)),
      orders: genuineFinalIds,
      finished_goods_batches: new Set(realBatches.map((b) => b.id)),
      production_batches: new Set(realBatches.map((b) => b.productionBatchId)),
      recipes: new Set(realRecipes.map((r) => r.id)),
    },
    realProductIds,
    realWarehouses,
    genuineFinalIds,
  };
}

// ---------------------------------------------------------------------------------------------
// 2. Removal by foreign-key closure
// ---------------------------------------------------------------------------------------------
async function tableOf(tx, model) {
  const rows = await q(tx, `SELECT to_regclass('public."${model}"')::text AS t`);
  if (!rows[0].t) throw new Error(`table ${model} not found`);
  return model;
}

async function removeTestData(tx, scope) {
  const fks = await q(
    tx,
    `SELECT cl.relname AS child, a.attname AS col, a.attnotnull AS notnull, pl.relname AS parent, pa.attname AS refcol
       FROM pg_constraint c
       JOIN pg_class cl ON cl.oid = c.conrelid
       JOIN pg_class pl ON pl.oid = c.confrelid
       JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
       JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = c.confkey[1]
      WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 1`,
  );
  const cols = await q(tx, `SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema='public' AND column_name='id'`);
  const hasId = new Set(cols.map((r) => r.t));
  const keyExpr = (t) => (hasId.has(t) ? '"id"::text' : 'ctid::text');

  // root tables (DB names)
  const rootTables = {
    products: 'products', categories: 'categories', customers: 'customers', farmers: 'farmers',
    users: 'users', warehouses: 'warehouses', coupons: 'coupons', orders: 'orders',
  };
  for (const t of Object.values(rootTables)) await tableOf(tx, t);

  const closure = new Map(); // table -> Set(key)
  const via = new Map(); // `${table}|${key}` -> "parentTable.col"
  const queue = [];
  const addRows = (table, keys, from) => {
    const set = closure.get(table) ?? closure.set(table, new Set()).get(table);
    const fresh = keys.filter((k) => !set.has(k));
    fresh.forEach((k) => { set.add(k); if (from) via.set(`${table}|${k}`, from); });
    if (fresh.length) queue.push([table, fresh]);
  };
  for (const [k, t] of Object.entries(rootTables)) if (scope.roots[k].length) addRows(t, scope.roots[k], 'ROOT');

  while (queue.length) {
    const [table, keys] = queue.shift();
    for (const fk of fks.filter((f) => f.parent === table)) {
      let refVals = keys;
      if (fk.refcol !== 'id') {
        if (!hasId.has(table)) throw new Error(`cannot walk ${table}.${fk.refcol}: no id column`);
        const r = [];
        for (const c of chunks(keys)) r.push(...(await q(tx, `SELECT "${fk.refcol}"::text AS v FROM "${table}" WHERE "id"::text = ANY($1::text[])`, c)));
        refVals = r.map((x) => x.v).filter((v) => v != null);
      }
      for (const c of chunks(refVals)) {
        const rows = await q(tx, `SELECT ${keyExpr(fk.child)} AS k FROM "${fk.child}" WHERE "${fk.col}"::text = ANY($1::text[])`, c);
        addRows(fk.child, rows.map((x) => x.k), `${table}.${fk.col}`);
      }
    }
  }

  // Guard: the closure must not contain any protected row.
  const conflicts = [];
  for (const [prot, ids] of Object.entries(scope.protectedIds)) {
    const table = prot;
    const inClosure = closure.get(table);
    if (!inClosure) continue;
    for (const id of ids) if (inClosure.has(id)) conflicts.push(`${table}:${id} <- ${via.get(`${table}|${id}`)}`);
  }
  // ...nor a child of a genuine order (items, allocations, events...) - walk them once.
  const genuineKids = new Map();
  {
    const stack = [['orders', [...scope.genuineFinalIds]]];
    while (stack.length) {
      const [table, keys] = stack.pop();
      for (const fk of fks.filter((f) => f.parent === table && f.refcol === 'id')) {
        const rows = await q(tx, `SELECT ${keyExpr(fk.child)} AS k FROM "${fk.child}" WHERE "${fk.col}"::text = ANY($1::text[])`, keys);
        const set = genuineKids.get(fk.child) ?? genuineKids.set(fk.child, new Set()).get(fk.child);
        const fresh = rows.map((x) => x.k).filter((k) => !set.has(k));
        fresh.forEach((k) => set.add(k));
        if (fresh.length && hasId.has(fk.child)) stack.push([fk.child, fresh]);
      }
    }
  }
  for (const [table, set] of genuineKids) {
    const inClosure = closure.get(table);
    if (!inClosure) continue;
    for (const k of set) if (inClosure.has(k)) conflicts.push(`${table}:${k} (child of a genuine order) <- ${via.get(`${table}|${k}`)}`);
  }
  if (conflicts.length) {
    log('\nABORT - the removal would touch protected rows:');
    conflicts.slice(0, 40).forEach((c) => log('  ' + c));
    throw new Error(`${conflicts.length} protected row(s) reachable from test data; nothing was changed`);
  }

  // Delete children before parents. Nullable references are only cleared when tables form a cycle
  // (nulling them blindly would violate check constraints such as stock_movements_one_batch_kind).
  const inScope = new Set(closure.keys());
  const remaining = new Set(inScope);
  const order = [];
  while (remaining.size) {
    const next = [...remaining].filter((t) => !fks.some((f) => f.parent === t && f.child !== t && remaining.has(f.child)));
    if (!next.length) {
      const cyc = fks.filter((f) => !f.notnull && f.child !== f.parent && remaining.has(f.child) && remaining.has(f.parent));
      if (!cyc.length) throw new Error('foreign-key cycle among: ' + [...remaining].join(', '));
      for (const fk of cyc)
        for (const c of chunks([...closure.get(fk.child)])) await q(tx, `UPDATE "${fk.child}" SET "${fk.col}" = NULL WHERE ${keyExpr(fk.child)} = ANY($1::text[]) AND "${fk.col}" IS NOT NULL`, c);
      report.notes.push('cycle broken by nulling: ' + cyc.map((f) => `${f.child}.${f.col}`).join(', '));
      for (const fk of cyc) fks.splice(fks.indexOf(fk), 1);
      continue;
    }
    next.forEach((t) => { order.push(t); remaining.delete(t); });
  }
  for (const t of order) {
    const keys = [...closure.get(t)];
    let n = 0;
    for (const c of chunks(keys)) n += await tx.$executeRawUnsafe(`DELETE FROM "${t}" WHERE ${keyExpr(t)} = ANY($1::text[])`, c);
    report.removed[t] = n;
  }
  log('\nRemoved rows by table:');
  Object.entries(report.removed).sort((a, b) => b[1] - a[1]).forEach(([t, n]) => log(`  ${String(n).padStart(6)}  ${t}`));
}

// ---------------------------------------------------------------------------------------------
// 3. Rebuild the chain for the real products
// ---------------------------------------------------------------------------------------------
const RAW_NAME = 'Unspecified raw material';

async function rebuildChain(tx, scope) {
  const main = scope.realWarehouses.find((w) => /^Main Store/.test(w.name)) ?? scope.realWarehouses[0];
  if (!main) throw new Error('no real warehouse to host stock');
  const products = await tx.product.findMany({
    where: { id: { in: [...scope.realProductIds] } },
    include: {
      recipes: { include: { ingredients: true } },
      finishedGoodsBatches: {
        include: { productionBatch: { include: { consumptions: true } }, stock: true, stockMovements: true, allocations: { include: { order: { select: { status: true } } } } },
      },
    },
  });
  const chainBatches = products.flatMap((pr) => pr.finishedGoodsBatches.map((fg) => ({ pr, fg })));
  if (!chainBatches.length) { report.notes.push('no finished-goods batches to rebuild'); return; }

  // One clearly-labelled supplier for opening balances whose real origin is not recorded anywhere.
  const admin = await tx.user.findFirst({ where: { role: 'SUPER_ADMIN' }, select: { id: true } });
  let supplier = await tx.supplier.findFirst({ where: { companyName: 'Opening balance - origin not recorded' } });
  const year = new Date().getFullYear();
  if (!supplier) {
    const counter = await tx.supplierCodeCounter.upsert({ where: { year }, update: { lastNumber: { increment: 1 } }, create: { year, lastNumber: 1 } });
    supplier = await tx.supplier.create({
      data: {
        supplierCode: `SUP-${year}-${String(counter.lastNumber).padStart(6, '0')}`,
        fullName: 'Opening balance (origin not recorded)',
        companyName: 'Opening balance - origin not recorded',
        mobile: '0000000000',
        status: 'ACTIVE',
        createdById: admin.id,
      },
    });
    report.rebuilt.push(`Created placeholder supplier ${supplier.supplierCode} - stands in for raw material whose real farmer/supplier was never recorded`);
  }

  for (const { pr, fg } of chainBatches) {
    const pb = fg.productionBatch;
    const planned = Number(pb.plannedQuantity);
    const actual = Number(pb.actualQuantity ?? planned);
    const label = `${pr.sku} / ${fg.fgBatchNumber} / ${pb.productionBatchNumber}`;

    // -- raw material in, then consumed (only when the run has no consumption yet)
    if (pb.consumptions.length === 0) {
      const recipe = pr.recipes.find((r) => r.id === pb.recipeId) ?? pr.recipes[0];
      if (!recipe.ingredients.some((i) => i.cropName === RAW_NAME)) {
        await tx.recipeIngredient.create({ data: { recipeId: recipe.id, cropName: RAW_NAME, quantity: planned, unit: 'KG', percentage: 100 } });
      }
      const dateKey = Number(pb.productionDate.toISOString().slice(0, 10).replace(/-/g, ''));
      await tx.batchNumberCounter.upsert({ where: { dateKey }, update: {}, create: { dateKey, lastNumber: 0 } });
      const bn = await tx.batchNumberCounter.update({ where: { dateKey }, data: { lastNumber: { increment: 1 } } });
      const transport = await tx.supplierTransport.create({
        data: {
          supplierId: supplier.id, materialName: RAW_NAME, quantity: planned, unit: 'KG', scheduledDate: pb.productionDate,
          dispatchedAt: pb.productionDate, deliveredAt: pb.productionDate, warehouseId: main.id, status: 'DELIVERED',
          remarks: 'Opening balance rebuilt by rebuild-data-flow.mjs', createdById: admin.id,
        },
      });
      const rm = await tx.rawMaterialBatch.create({
        data: {
          batchNumber: `RM-${dateKey}-${String(bn.lastNumber).padStart(3, '0')}`,
          supplierTransportId: transport.id, supplierId: supplier.id, branchId: pb.branchId,
          cropName: RAW_NAME, quantity: planned, unit: 'KG', status: 'UNDER_PRODUCTION', warehouseId: main.id,
        },
      });
      await tx.warehouseStock.create({ data: { warehouseId: main.id, batchId: rm.id, quantity: 0, reservedQuantity: 0 } });
      await tx.stockMovement.createMany({
        data: [
          { batchId: rm.id, toWarehouseId: main.id, movementType: 'STOCK_IN', quantity: planned, unit: 'KG', reference: 'DATA_REBUILD', reason: `Opening balance for ${pb.productionBatchNumber}`, performedById: admin.id },
          { batchId: rm.id, fromWarehouseId: main.id, movementType: 'STOCK_OUT', quantity: planned, unit: 'KG', reference: 'DATA_REBUILD', reason: `Consumed by production batch ${pb.productionBatchNumber}`, performedById: admin.id },
        ],
      });
      await tx.productionConsumption.create({ data: { productionBatchId: pb.id, rawMaterialBatchId: rm.id, quantityUsed: planned, unit: 'KG' } });
      report.rebuilt.push(`${label}: raw batch ${rm.batchNumber} (${planned} KG, placeholder supplier) -> consumed by ${pb.productionBatchNumber}`);
    }

    // -- production run: where it ran and the loss it implies
    await tx.productionBatch.update({ where: { id: pb.id }, data: { warehouseId: pb.warehouseId ?? main.id, productionLoss: planned - actual } });

    // -- FG batch: packs = what is on hand + what already left; ledger and stock agree with that
    const onHand = fg.stock.reduce((n, s) => n + s.quantity, 0);
    const left = fg.allocations.filter((a) => !a.releasedAt && ['DISPATCHED', 'DELIVERED'].includes(a.order.status)).reduce((n, a) => n + a.quantity, 0);
    const packCount = onHand + left;
    if (packCount < 1) { report.notes.push(`${label}: no stock on hand, batch left as is`); continue; }
    if (Number(fg.netWeight) * packCount > actual + 0.001) throw new Error(`${label}: ${packCount} x ${fg.netWeight} exceeds yield ${actual}`);
    if (packCount !== fg.packCount) report.rebuilt.push(`${label}: packCount ${fg.packCount} -> ${packCount} (stock on hand ${onHand} + already shipped ${left}; the rest never existed)`);
    await tx.finishedGoodsBatch.update({ where: { id: fg.id }, data: { packCount } });

    // ledger: wipe any partial history of this batch and restate it from the physical facts
    await tx.stockMovement.deleteMany({ where: { fgBatchId: fg.id } });
    for (const s of fg.stock) {
      const shippedFromHere = fg.allocations.filter((a) => a.warehouseId === s.warehouseId && !a.releasedAt && ['DISPATCHED', 'DELIVERED'].includes(a.order.status)).reduce((n, a) => n + a.quantity, 0);
      await tx.stockMovement.create({
        data: { fgBatchId: fg.id, toWarehouseId: s.warehouseId, movementType: 'PRODUCTION_INWARD', quantity: s.quantity + shippedFromHere, unit: 'PACK', reference: 'DATA_REBUILD', reason: `Rebuilt opening ledger for ${fg.fgBatchNumber}`, performedById: admin.id },
      });
      if (shippedFromHere)
        await tx.stockMovement.create({ data: { fgBatchId: fg.id, fromWarehouseId: s.warehouseId, movementType: 'STOCK_OUT', quantity: shippedFromHere, unit: 'PACK', reference: 'DATA_REBUILD', reason: 'Dispatched to customer orders', performedById: admin.id } });
    }

    // reservations = live allocations of orders still waiting to ship
    for (const s of fg.stock) {
      const live = fg.allocations.filter((a) => a.warehouseId === s.warehouseId && !a.releasedAt && ['ALLOCATED', 'PACKED'].includes(a.order.status)).reduce((n, a) => n + a.quantity, 0);
      if (live !== s.reservedQuantity) {
        await tx.finishedGoodsStock.update({ where: { id: s.id }, data: { reservedQuantity: live } });
        report.rebuilt.push(`${label}: reservedQuantity ${s.reservedQuantity} -> ${live} to match live allocations`);
      }
    }
    report.rebuilt.push(`${label}: FG stock ${onHand} on hand, ledger restated`);
  }
}

main()
  .catch((e) => { console.error('\nFAILED:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
