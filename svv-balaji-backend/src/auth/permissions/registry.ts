import { UserRole } from '@prisma/client';

/**
 * The catalogue of everything this system can be permitted to do.
 *
 * -----------------------------------------------------------------------------
 * Read this before adding to it.
 *
 * Permissions live in CODE. Grants live in the DATABASE.
 *
 * A permission key is a promise that some route checks it. Super Admin decides
 * which roles hold which keys, from the Roles & Permissions screen, with no
 * deploy. What he cannot do is invent a key, because a key nothing checks is a
 * switch wired to nothing - it would appear to grant access and silently not.
 *
 * So: adding a screen or an endpoint means adding a key here and putting
 * `@RequirePermission(...)` on the route. Changing WHO may use an existing
 * endpoint is a database change made from the UI, and never a code change again.
 * -----------------------------------------------------------------------------
 *
 * `defaultRoles` is what a role is granted the first time the system sees it,
 * and what "Reset to defaults" restores. Every entry below was read off the
 * `@Roles()` decorator that used to guard the route, so seeding reproduces the
 * behaviour of 15 August exactly - this migration changes who CAN change access,
 * not who HAS it.
 *
 * SUPER_ADMIN never appears in a `defaultRoles` list. It bypasses the check
 * entirely in PermissionsGuard, the same way `hasRole()` has always treated it.
 * Listing it would imply it could be revoked, and locking every administrator
 * out of the administration screen is not a state worth being able to reach.
 *
 * Three keys - `dashboard.view`, `field.panel` and `onboarding.panel` - guard a
 * screen with no endpoint of its own. They are enforced by the panel's router
 * only, and are listed here so the whole of what a role can reach is described
 * in one place rather than half here and half in the frontend. Every other key
 * is checked by at least one route; a permissions test asserts that.
 */

const BM = UserRole.BRANCH_MANAGER;
const PM = UserRole.PROCUREMENT_MANAGER;
const AE = UserRole.AGRICULTURE_EXPERT;
const PROD = UserRole.PRODUCTION_MANAGER;
const QA = UserRole.QA_MANAGER;
const WM = UserRole.WAREHOUSE_MANAGER;
const ST = UserRole.SALES_TEAM;
const LT = UserRole.LOGISTICS_TEAM;

/** Every role except Super Admin, which is implicit everywhere. */
export const ASSIGNABLE_ROLES: readonly UserRole[] = [BM, PM, AE, PROD, QA, WM, ST, LT];

export interface PermissionDefinition {
  /** Stable identifier. Stored in the database - renaming one is a migration. */
  key: string;
  /** Shown on the Roles & Permissions screen. */
  label: string;
  /** Why it exists and what breaks without it. Shown as help text. */
  description: string;
  /** Roles granted this on first seed and on "reset to defaults". */
  defaultRoles: readonly UserRole[];
}

export interface PermissionGroup {
  key: string;
  label: string;
  /**
   * The panel route this group governs, if it has one. The sidebar shows the
   * entry when the user holds `viewKey`; the router refuses it otherwise.
   */
  path?: string;
  /**
   * The permission that means "may open this page". Revoking it hides the menu
   * entry AND makes the list endpoint 403 - the two move together, which is the
   * point of the exercise.
   */
  viewKey?: string;
  permissions: PermissionDefinition[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  // --- Overview -------------------------------------------------------------
  {
    key: 'dashboard',
    label: 'Dashboard',
    path: '/',
    viewKey: 'dashboard.view',
    permissions: [
      {
        key: 'dashboard.view',
        label: 'Open the dashboard',
        description:
          'The landing screen. Revoking this from a role leaves them signed in with no home ' +
          'page, so they land on the first screen they can open instead.',
        defaultRoles: ASSIGNABLE_ROLES,
      },
    ],
  },
  {
    key: 'trace',
    label: 'Trace a Pack',
    path: '/trace',
    viewKey: 'trace.view',
    permissions: [
      {
        key: 'trace.view',
        label: 'Resolve a batch back to its farmers',
        description:
          'Covers the finished-goods trace, the raw material batch trace and order ' +
          'traceability. This is the read that proves the chain, so it is open to all staff ' +
          'by default.',
        defaultRoles: ASSIGNABLE_ROLES,
      },
    ],
  },
  {
    key: 'fieldPanel',
    label: 'My Field Work (mobile panel)',
    path: '/field',
    viewKey: 'field.panel',
    permissions: [
      {
        key: 'field.panel',
        label: 'Open the field executive panel',
        description:
          'The phone-shaped shell at /field, covering the Agriculture Expert\'s six areas: the ' +
          'day\'s schedule, farmer onboarding and land profiling, seed distribution, field ' +
          'visits, training, and the harvest inspection gate. Each area also needs its own view ' +
          'permission or that tab comes up empty.',
        defaultRoles: [AE, BM],
      },
    ],
  },
  {
    key: 'onboardingPanel',
    label: 'Farmer Onboarding (mobile panel)',
    path: '/onboarding',
    viewKey: 'onboarding.panel',
    permissions: [
      {
        key: 'onboarding.panel',
        label: 'Open the farmer onboarding desk',
        description:
          'The phone-shaped shell at /onboarding. Needs farmer and agreement view permissions ' +
          'to show anything.',
        defaultRoles: [PM, BM],
      },
    ],
  },

  // --- Farm sourcing --------------------------------------------------------
  {
    key: 'farmers',
    label: 'Farmers',
    path: '/farmers',
    viewKey: 'farmers.view',
    permissions: [
      {
        key: 'farmers.view',
        label: 'View farmers',
        description:
          'The farmer registry and every farmer picker in the system. QA holds it because a ' +
          'harvest inspection has to be raised against a named farmer.',
        defaultRoles: [BM, PM, AE, QA],
      },
      {
        key: 'farmers.create',
        label: 'Register a farmer',
        description:
          'Creates the record. No traceability code is issued until approval. The Agriculture ' +
          'Expert holds it because onboarding happens at the farm, not at a desk.',
        defaultRoles: [BM, PM, AE],
      },
      {
        key: 'farmers.edit',
        label: 'Edit farmer details',
        description: 'Name, contact, bank details, land summary and KYC documents.',
        defaultRoles: [BM, PM, AE],
      },
      {
        key: 'farmers.status',
        label: 'Activate or suspend a farmer',
        description: 'Suspending stops new inspections and collections without deleting history.',
        defaultRoles: [BM],
      },
      {
        key: 'farmers.approve',
        label: 'Approve a farmer',
        description:
          'The gate that issues the SVV-YYYY-NNNNNN traceability code (FRD 5.1). The code is ' +
          'permanent and never reissued, so this is the narrowest permission in farm sourcing ' +
          '- Super Admin only by default.',
        defaultRoles: [],
      },
      {
        key: 'farmers.delete',
        label: 'Delete a farmer',
        description:
          'Only ever possible before approval. Once a code has been issued the server refuses ' +
          'regardless of who is asking.',
        defaultRoles: [],
      },
      {
        key: 'farmers.plots',
        label: 'Map a farmer\'s land',
        description:
          'Add, edit and remove the individual plots a farmer works - survey number, area, soil, ' +
          'irrigation and GPS. Separate from farmers.edit because measuring land is field work ' +
          'and updating bank details is not, and the two are done by different people.',
        defaultRoles: [BM, PM, AE],
      },
      {
        key: 'farmers.codes',
        label: 'View QR and barcode',
        description: 'The printable traceability codes for an approved farmer.',
        defaultRoles: [BM, PM, AE],
      },
    ],
  },
  {
    key: 'agreements',
    label: 'Agreements',
    path: '/agreements',
    viewKey: 'agreements.view',
    permissions: [
      {
        key: 'agreements.view',
        label: 'View agreements',
        description:
          'The agreed rate here is what a collection falls back on when the weighbridge enters ' +
          'none, so anyone recording collections needs to be able to read it. QA holds it ' +
          'because the harvest inspection form picks the agreement being inspected against.',
        defaultRoles: [PM, BM, QA, AE],
      },
      {
        key: 'agreements.create',
        label: 'Record an agreement',
        description: 'Pre-season rate, quality standard and expected quantity for one farmer.',
        defaultRoles: [PM],
      },
      {
        key: 'agreements.edit',
        label: 'Edit an agreement or change its status',
        description:
          'The server refuses once a harvest inspection has been raised against it - that rate ' +
          'has already been used as the basis of a decision.',
        defaultRoles: [PM],
      },
      {
        key: 'agreements.delete',
        label: 'Delete an agreement',
        description: 'Only while unused.',
        defaultRoles: [],
      },
    ],
  },
  {
    key: 'seedDistribution',
    label: 'Seed Distribution',
    path: '/seed-distribution',
    viewKey: 'seed.view',
    permissions: [
      {
        key: 'seed.view',
        label: 'View seed distribution',
        description: 'Certified seed and crop-input handouts, per farmer.',
        defaultRoles: [AE, BM],
      },
      {
        key: 'seed.create',
        label: 'Record a seed handout',
        description: 'Logged by the executive on return from the farm.',
        defaultRoles: [AE],
      },
      {
        key: 'seed.edit',
        label: 'Edit a seed handout',
        description: 'Correctable at any time - nothing downstream consumes it.',
        defaultRoles: [AE],
      },
      {
        key: 'seed.delete',
        label: 'Delete a seed handout',
        description: 'Correctable at any time - nothing downstream consumes it.',
        defaultRoles: [],
      },
    ],
  },
  {
    key: 'training',
    label: 'Training',
    path: '/training',
    viewKey: 'training.view',
    permissions: [
      {
        key: 'training.view',
        label: 'View training sessions',
        description: 'Sessions, attendance and materials.',
        defaultRoles: [AE, BM],
      },
      {
        key: 'training.create',
        label: 'Create a training session',
        description: 'The executive runs the session at the farm and records it here afterwards.',
        defaultRoles: [AE],
      },
      {
        key: 'training.edit',
        label: 'Edit a session, mark attendance, manage materials',
        description:
          'One permission because the server guards all four identically. Note attendance is a ' +
          'REPLACE as of 20 Aug: submitting the list removes anyone left out of it, so this is ' +
          'the authority to un-mark a farmer as present, not only to mark them.',
        defaultRoles: [AE],
      },
      {
        key: 'training.delete',
        label: 'Delete a training session',
        description: 'Refused once attendance has been marked against it.',
        defaultRoles: [],
      },
    ],
  },
  {
    key: 'fieldVisits',
    label: 'Field Visits',
    path: '/field-visits',
    viewKey: 'fieldVisits.view',
    permissions: [
      {
        key: 'fieldVisits.view',
        label: 'View field visits',
        description: 'Crop monitoring - growth stage, health, pest observations, advice.',
        defaultRoles: [AE, BM],
      },
      {
        key: 'fieldVisits.create',
        label: 'Log a field visit',
        description: 'Captured on the visit, written up on return.',
        defaultRoles: [AE],
      },
      {
        key: 'fieldVisits.edit',
        label: 'Edit a visit and its photographs',
        description: 'Covers adding and removing visit documents.',
        defaultRoles: [AE],
      },
      {
        key: 'fieldVisits.delete',
        label: 'Delete a field visit',
        description: 'Takes its photographs with it.',
        defaultRoles: [],
      },
    ],
  },

  // --- Procurement ----------------------------------------------------------
  {
    key: 'procurementPlans',
    label: 'Procurement Plans',
    path: '/procurement-plans',
    viewKey: 'procurementPlans.view',
    permissions: [
      {
        key: 'procurementPlans.view',
        label: 'View procurement plans',
        description: 'Crop, branch, quantity and schedule.',
        defaultRoles: [PM, BM],
      },
      {
        key: 'procurementPlans.create',
        label: 'Create a procurement plan',
        description: 'Opens in DRAFT.',
        defaultRoles: [PM, BM],
      },
      {
        key: 'procurementPlans.edit',
        label: 'Edit a plan or move its status',
        description: 'Editable until it leaves DRAFT or SCHEDULED.',
        defaultRoles: [PM, BM],
      },
      {
        key: 'procurementPlans.delete',
        label: 'Delete a procurement plan',
        description: 'Refused once an inspection is booked against it.',
        defaultRoles: [],
      },
    ],
  },
  {
    key: 'harvestInspections',
    label: 'Harvest Inspections',
    path: '/harvest-inspections',
    viewKey: 'harvestInspections.view',
    permissions: [
      {
        key: 'harvestInspections.view',
        label: 'View harvest inspections',
        description: 'The pre-harvest quality checklist and its result.',
        defaultRoles: [PM, QA, AE],
      },
      {
        key: 'harvestInspections.create',
        label: 'Raise a harvest inspection',
        description:
          'Only against an approved farmer holding a traceability code. This is the gate: only ' +
          'an APPROVED inspection can be collected from, so whoever holds this decides what ' +
          'enters the supply chain. The Agriculture Expert holds it because they are the one ' +
          'standing in the field.',
        defaultRoles: [PM, QA, AE],
      },
      {
        key: 'harvestInspections.edit',
        label: 'Edit an inspection and its documents',
        description: 'The server refuses once a collection has been recorded against it.',
        defaultRoles: [PM, QA, AE],
      },
      {
        key: 'harvestInspections.delete',
        label: 'Delete a harvest inspection',
        description: 'Only while no collection references it.',
        defaultRoles: [],
      },
    ],
  },
  {
    key: 'collections',
    label: 'Collections',
    path: '/collections',
    viewKey: 'collections.view',
    permissions: [
      {
        key: 'collections.view',
        label: 'View collections',
        description: 'What was received at the weighbridge and what it was worth.',
        defaultRoles: [PM],
      },
      {
        key: 'collections.create',
        label: 'Record a collection',
        description:
          'Mints the raw material batch, the warehouse stock line and the movement row in one ' +
          'transaction. This is where farm output becomes inventory.',
        defaultRoles: [PM],
      },
      {
        key: 'collections.edit',
        label: 'Correct a collection',
        description:
          'The correction path for a mis-keyed weight. It rewrites the batch quantity, the ' +
          'stock line and writes an ADJUSTMENT movement - so it is a heavier permission than ' +
          'it looks. Refused once the batch has been cleaned, inspected, consumed or moved.',
        defaultRoles: [PM],
      },
      {
        key: 'collections.payment',
        label: 'Change payment status',
        description: 'Marks what has actually been paid to the farmer.',
        defaultRoles: [PM],
      },
      {
        key: 'collections.delete',
        label: 'Delete a collection',
        description:
          'Also refused when the farmer has been paid, or when a later receipt exists the same ' +
          'day - receipt numbers are counted, not sequenced.',
        defaultRoles: [],
      },
    ],
  },
  {
    key: 'batches',
    label: 'Raw Material Batches',
    path: '/batches',
    viewKey: 'batches.view',
    permissions: [
      {
        key: 'batches.view',
        label: 'View raw material batches',
        description:
          'The batch register, and the batch picker on the cleaning and quality forms. Batches ' +
          'have no figures of their own - correcting one means correcting its collection.',
        defaultRoles: [PM, BM, WM, PROD, QA],
      },
    ],
  },

  // --- Warehouse ------------------------------------------------------------
  {
    key: 'warehouses',
    label: 'Warehouses',
    path: '/warehouses',
    viewKey: 'warehouses.view',
    permissions: [
      {
        key: 'warehouses.view',
        label: 'View warehouses',
        description: 'The warehouse master and live occupancy. Also every warehouse picker.',
        defaultRoles: [WM, BM, PROD],
      },
      {
        key: 'warehouses.create',
        label: 'Add a warehouse',
        description: 'Name, branch, capacity.',
        defaultRoles: [BM],
      },
      {
        key: 'warehouses.edit',
        label: 'Edit or close a warehouse',
        description: 'A warehouse holding stock cannot be closed.',
        defaultRoles: [BM],
      },
      {
        key: 'warehouses.delete',
        label: 'Delete a warehouse',
        description: 'Only while it has never held stock.',
        defaultRoles: [],
      },
    ],
  },
  {
    key: 'stock',
    label: 'Stock',
    path: '/warehouse-stock',
    viewKey: 'stock.view',
    permissions: [
      {
        key: 'stock.view',
        label: 'View stock and low-stock alerts',
        description: 'Batch-wise quantity on hand, per warehouse.',
        defaultRoles: [WM, BM, PROD],
      },
      {
        key: 'stock.move',
        label: 'Stock in, out, transfer and adjust',
        description:
          'The four actions that change inventory. Each writes a ledger row in the same ' +
          'transaction - stock and the ledger never move apart, so this permission covers all ' +
          'four or none.',
        defaultRoles: [WM, BM],
      },
    ],
  },
  {
    key: 'movements',
    label: 'Movement Ledger',
    path: '/stock-movements',
    viewKey: 'movements.view',
    permissions: [
      {
        key: 'movements.view',
        label: 'View the movement ledger',
        description: 'Append-only audit trail of every inventory change. Nothing may write here.',
        defaultRoles: [WM, BM],
      },
    ],
  },

  // --- Processing & QA ------------------------------------------------------
  {
    key: 'products',
    label: 'Products',
    path: '/products',
    viewKey: 'products.view',
    permissions: [
      {
        key: 'products.view',
        label: 'View products',
        description: 'The product master and every product picker.',
        defaultRoles: [BM, PROD, ST, WM, QA],
      },
      {
        key: 'products.create',
        label: 'Add a product',
        description: 'Super Admin only by default - a product is referenced by recipes and orders.',
        defaultRoles: [],
      },
      {
        key: 'products.edit',
        label: 'Edit or deactivate a product',
        description: 'Prices are NOT edited here - they are superseded on the price list.',
        defaultRoles: [],
      },
      {
        key: 'products.delete',
        label: 'Delete a product',
        description: 'Only while nothing references it.',
        defaultRoles: [],
      },
    ],
  },
  {
    key: 'recipes',
    label: 'Recipes',
    path: '/recipes',
    viewKey: 'recipes.view',
    permissions: [
      {
        key: 'recipes.view',
        label: 'View recipes and versions',
        description: 'Formulas, their versions, and which version is currently approved.',
        // BM added for FRD 5.2 "Recipe Distribution" - a branch manager who
        // cannot see the approved formula cannot distribute it.
        defaultRoles: [PROD, QA, BM],
      },
      {
        key: 'recipes.create',
        label: 'Create a recipe version',
        description:
          'Multigrain recipes need ingredient percentages totalling 100. Every production run ' +
          'made from one has to hold that ratio within 0.5 percentage points.',
        defaultRoles: [],
      },
      {
        key: 'recipes.approve',
        label: 'Approve a recipe version',
        description:
          'The formula gate. Approving a version retires the previously approved one, and only ' +
          'an approved version can be produced from. Super Admin only by default.',
        defaultRoles: [],
      },
      {
        key: 'recipes.status',
        label: 'Change recipe status',
        description: 'Retire or reinstate a version.',
        defaultRoles: [],
      },
    ],
  },
  {
    key: 'cleaning',
    label: 'Cleaning & Grading',
    path: '/cleaning-grading',
    viewKey: 'cleaning.view',
    permissions: [
      {
        key: 'cleaning.view',
        label: 'View cleaning and grading records',
        description: 'Pre-production cleaning, grading parameters and QA sign-off.',
        defaultRoles: [PROD, QA],
      },
      {
        key: 'cleaning.create',
        label: 'Record cleaning and grading',
        description: 'Marks the raw material batch as processed and no longer correctable.',
        defaultRoles: [PROD, QA],
      },
    ],
  },
  {
    key: 'production',
    label: 'Production Batches',
    path: '/production-batches',
    viewKey: 'production.view',
    permissions: [
      {
        key: 'production.view',
        label: 'View production batches',
        description: 'Runs, their consumption, and actual against planned output.',
        defaultRoles: [PROD, BM, QA],
      },
      {
        key: 'production.create',
        label: 'Start a production run',
        description:
          'Pins the recipe version, consumes raw material batches and enforces the multigrain ' +
          'blend ratio. Refused if any input batch failed inspection.',
        defaultRoles: [PROD],
      },
      {
        key: 'production.complete',
        label: 'Complete a production run',
        description: 'Records actual output and production loss.',
        defaultRoles: [PROD],
      },
      {
        key: 'production.status',
        label: 'Change production batch status',
        description: 'Move a run through its lifecycle.',
        defaultRoles: [PROD],
      },
      {
        key: 'production.edit',
        label: 'Correct a production batch',
        description:
          'A production run is a traceability record, so this is narrow by design - Super Admin ' +
          'only by default, and refused by the server once the run has produced finished goods.',
        defaultRoles: [],
      },
      {
        key: 'production.delete',
        label: 'Delete a production batch',
        description: 'Only while the run has consumed nothing and produced nothing.',
        defaultRoles: [],
      },
    ],
  },
  {
    key: 'quality',
    label: 'Quality Inspections',
    path: '/quality-inspections',
    viewKey: 'quality.view',
    permissions: [
      {
        key: 'quality.view',
        label: 'View quality inspections',
        description: 'All three stages - raw material, in-process and finished goods.',
        // BM added for FRD 5.2 "Quality Monitoring".
        defaultRoles: [QA, PROD, BM],
      },
      {
        key: 'quality.create',
        label: 'Record a quality inspection',
        description:
          'These are hard gates, not annotations. A raw-material FAIL rejects the batch; a ' +
          'finished-goods FAIL withdraws QA release and blocks dispatch.',
        defaultRoles: [QA],
      },
      {
        key: 'quality.release',
        label: 'QA-release a finished goods batch',
        description:
          'Nothing can be stocked or allocated to an order until this happens. The single most ' +
          'consequential permission in processing.',
        defaultRoles: [QA],
      },
    ],
  },
  {
    key: 'finishedGoods',
    label: 'Finished Goods',
    path: '/finished-goods',
    viewKey: 'finishedGoods.view',
    permissions: [
      {
        key: 'finishedGoods.view',
        label: 'View finished goods and labels',
        description:
          'FG batches, print-ready labels with QR, and finished goods stock. QA holds it to ' +
          'pick the batch being released; Branch Manager because order allocation shows what ' +
          'was reserved.',
        defaultRoles: [PROD, WM, ST, QA, BM],
      },
      {
        key: 'finishedGoods.create',
        label: 'Pack a finished goods batch',
        description: 'Turns a completed production run into sellable packs.',
        defaultRoles: [PROD],
      },
      {
        key: 'finishedGoods.stockIn',
        label: 'Stock in finished goods',
        description: 'Only QA-released batches can be stocked.',
        defaultRoles: [WM, PROD],
      },
    ],
  },

  // --- Sales ----------------------------------------------------------------
  {
    key: 'customers',
    label: 'Customers',
    path: '/customers',
    viewKey: 'customers.view',
    permissions: [
      {
        key: 'customers.view',
        label: 'View customers and credit',
        description: 'One registry, both channels. Includes the credit position for B2B.',
        defaultRoles: [ST, BM],
      },
      {
        key: 'customers.create',
        label: 'Register a customer',
        description: 'Channel is chosen at registration and cannot be changed afterwards.',
        defaultRoles: [BM, ST],
      },
      {
        key: 'customers.edit',
        label: 'Edit customer details',
        description: 'GSTIN, credit limit, payment terms, addresses.',
        defaultRoles: [BM, ST],
      },
      {
        key: 'customers.status',
        label: 'Activate or suspend a customer',
        description: 'A suspended customer cannot have new orders placed.',
        defaultRoles: [BM],
      },
    ],
  },
  {
    key: 'priceLists',
    label: 'Price Lists',
    path: '/price-lists',
    viewKey: 'priceLists.view',
    permissions: [
      {
        key: 'priceLists.view',
        label: 'View prices',
        description:
          'Dated per-channel rates, and the B2B/B2C comparison shown on the product screen.',
        defaultRoles: [BM, ST, PROD],
      },
      {
        key: 'priceLists.create',
        label: 'Create a price rule',
        description: 'Product, channel, customer type and effective-from date.',
        defaultRoles: [BM],
      },
      {
        key: 'priceLists.supersede',
        label: 'Change a price',
        description:
          'Closes the current rule and opens a new one from a date. A price is never edited in ' +
          'place, because historical invoices have to keep reproducing.',
        defaultRoles: [BM],
      },
      {
        key: 'priceLists.status',
        label: 'Activate or deactivate a price rule',
        description: 'Deactivating leaves the history intact.',
        defaultRoles: [BM],
      },
    ],
  },
  {
    key: 'orders',
    label: 'Orders',
    path: '/orders',
    viewKey: 'orders.view',
    permissions: [
      {
        key: 'orders.view',
        label: 'View orders',
        description: 'Order list, detail and per-order traceability.',
        defaultRoles: [ST, BM, WM, LT],
      },
      {
        key: 'orders.create',
        label: 'Place an order',
        description: 'Resolves the price once and freezes it onto the line with the rule used.',
        defaultRoles: [BM, ST],
      },
      {
        key: 'orders.confirm',
        label: 'Confirm an order',
        description: 'Moves it from placed to confirmed.',
        defaultRoles: [BM, ST],
      },
      {
        key: 'orders.allocate',
        label: 'Allocate stock to an order',
        description:
          'Picks first-expiry-first-out from QA-released stock only and reserves it. This is ' +
          'what carries traceability into the sales half of the system.',
        defaultRoles: [WM, BM],
      },
      {
        key: 'orders.pack',
        label: 'Mark an order packed',
        description: 'After picking, before dispatch.',
        defaultRoles: [WM],
      },
      {
        key: 'orders.dispatch',
        label: 'Dispatch an order',
        description: 'Decrements real stock. Refused if anything on it is not QA-released.',
        defaultRoles: [WM, LT],
      },
      {
        key: 'orders.deliver',
        label: 'Mark an order delivered',
        description: 'Closes the fulfilment lifecycle.',
        defaultRoles: [LT],
      },
      {
        key: 'orders.cancel',
        label: 'Cancel an order',
        description: 'Returns any reservations to available stock.',
        defaultRoles: [BM, ST],
      },
      {
        key: 'orders.payment',
        label: 'Change order payment status',
        description: 'Records what has actually been received.',
        defaultRoles: [BM, ST],
      },
    ],
  },

  // --- Administration -------------------------------------------------------
  {
    key: 'users',
    label: 'Users',
    path: '/users',
    viewKey: 'users.view',
    permissions: [
      {
        key: 'users.view',
        label: 'View staff accounts',
        description: 'The user list and individual accounts.',
        defaultRoles: [BM],
      },
      {
        key: 'users.create',
        label: 'Create a staff account',
        description:
          'Whoever holds this can choose the new account\'s role, so it is effectively the ' +
          'power to grant any access this system has. Granted to Branch Manager for FRD 5.2 ' +
          '"Branch Staff Management", and bounded in UsersService: anyone who is not a Super ' +
          'Admin may only create accounts at their own branch, and only in roles below their ' +
          'own - never a peer, never a Super Admin. Without that bound this key would be a ' +
          'privilege-escalation route rather than a delegation.',
        defaultRoles: [BM],
      },
      {
        key: 'users.edit',
        label: 'Edit, suspend or reset a staff account',
        description:
          'Covers details, status and password reset. Deactivating clears the refresh token, ' +
          'so a live session stops working immediately. Bounded the same way as users.create - ' +
          'a Branch Manager can edit their own branch\'s junior staff and nobody else.',
        defaultRoles: [BM],
      },
      {
        key: 'users.delete',
        label: 'Delete a staff account',
        description:
          'Only while the account has never acted on anything. Deliberately NOT granted to ' +
          'Branch Manager: FRD 5.2 asks for staff management, which deactivation already ' +
          'satisfies, and deletion is the one action here with no audit trail left behind.',
        defaultRoles: [],
      },
    ],
  },
  {
    key: 'branches',
    label: 'Branches',
    path: '/branches',
    viewKey: 'branches.view',
    permissions: [
      {
        key: 'branches.view',
        label: 'View branches',
        description:
          'The branch master, and every branch picker in the system - user forms, warehouse ' +
          'forms, training filters. Granted to all roles by default for that reason.',
        defaultRoles: ASSIGNABLE_ROLES,
      },
      {
        key: 'branches.create',
        label: 'Add a branch',
        description: 'Super Admin only by default.',
        defaultRoles: [],
      },
      {
        key: 'branches.edit',
        label: 'Edit or deactivate a branch',
        description: 'A branch with active users cannot be deactivated.',
        defaultRoles: [],
      },
      {
        key: 'branches.assignManager',
        label: 'Assign a branch manager',
        description:
          'FRD 6.2. Names who is accountable for a branch. Super Admin only: a branch manager ' +
          'appointing their own successor is not an appointment.',
        defaultRoles: [],
      },
      {
        key: 'branches.performance',
        label: 'View branch performance and reports',
        description:
          'FRD 6.4/6.5. A Branch Manager sees their own branch; a Super Admin sees every branch ' +
          'side by side. The scoping is enforced in the controller, not by this key.',
        defaultRoles: [BM],
      },
      {
        key: 'branches.delete',
        label: 'Delete a branch',
        description: 'Only while nothing references it.',
        defaultRoles: [],
      },
    ],
  },
  {
    key: 'rolePermissions',
    label: 'Roles & Permissions',
    path: '/settings/roles',
    viewKey: 'rolePermissions.view',
    permissions: [
      {
        key: 'rolePermissions.view',
        label: 'View the permission matrix',
        description: 'See what each role may do, without being able to change it.',
        defaultRoles: [],
      },
      {
        key: 'rolePermissions.manage',
        label: 'Change what roles may do',
        description:
          'The permission that grants permissions. Anyone holding it can give themselves ' +
          'anything else in this list, so it is Super Admin only and the server will not let ' +
          'it be granted to another role.',
        defaultRoles: [],
      },
    ],
  },

  // --- Cross-cutting --------------------------------------------------------
  {
    key: 'uploads',
    label: 'File uploads',
    permissions: [
      {
        key: 'uploads.create',
        label: 'Upload a photograph or document',
        description:
          'The single door files enter through. Deliberately open to all staff: the endpoints ' +
          'that ATTACH a file - visit documents, training materials, inspection documents - are ' +
          'each guarded on their own, and that is where the authority belongs. Restricting here ' +
          'as well produces a 403 with nothing on screen explaining it.',
        defaultRoles: ASSIGNABLE_ROLES,
      },
    ],
  },
];

/** Flat list of every permission definition. */
export const ALL_PERMISSIONS: PermissionDefinition[] = PERMISSION_GROUPS.flatMap(
  (group) => group.permissions,
);

/** Every valid permission key. Anything not in here is rejected on write. */
export const PERMISSION_KEYS: ReadonlySet<string> = new Set(ALL_PERMISSIONS.map((p) => p.key));

/**
 * The permission that controls permissions. Refused on every role but Super
 * Admin, which does not need it granted.
 */
export const PERMISSION_ADMIN_KEY = 'rolePermissions.manage';

/** The default grant set for one role, as stored on first seed. */
export function defaultPermissionsFor(role: UserRole): string[] {
  if (role === UserRole.SUPER_ADMIN) {
    // Never persisted - the guard short-circuits before it looks. Returned so
    // the admin screen can show a complete, read-only row for Super Admin.
    return ALL_PERMISSIONS.map((p) => p.key);
  }

  return ALL_PERMISSIONS.filter((p) => p.defaultRoles.includes(role)).map((p) => p.key);
}

/**
 * Fails the build - well, the first request - if two groups declare the same
 * key. A duplicate would mean one definition silently shadowing the other on
 * the admin screen while both routes read the same grant.
 */
export function assertRegistryIsWellFormed(): void {
  const seen = new Set<string>();
  const duplicates: string[] = [];

  for (const permission of ALL_PERMISSIONS) {
    if (seen.has(permission.key)) duplicates.push(permission.key);
    seen.add(permission.key);
  }

  if (duplicates.length > 0) {
    throw new Error(`Duplicate permission keys in the registry: ${duplicates.join(', ')}`);
  }

  const missingViewKeys = PERMISSION_GROUPS.filter(
    (group) => group.viewKey && !seen.has(group.viewKey),
  ).map((group) => `${group.key} -> ${group.viewKey}`);

  if (missingViewKeys.length > 0) {
    throw new Error(
      `Groups declare a viewKey that is not one of their permissions: ${missingViewKeys.join(', ')}`,
    );
  }
}
