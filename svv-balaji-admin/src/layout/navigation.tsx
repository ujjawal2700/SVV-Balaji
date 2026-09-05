import {
  DashboardOutlined,
  ExperimentOutlined,
  GoldOutlined,
  InboxOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';
import type { Permission } from '../auth/permissions';

/**
 * The single source of truth for what exists in the panel.
 *
 * Both the sidebar menu and the router are generated from this list, so a
 * screen can never appear in one and be missing from the other.
 *
 * Each entry names the PERMISSION that opens it, not the roles. That changed on
 * 16 August: who holds a permission is a row in the database that a Super Admin
 * edits from Administration -> Roles & Permissions, so widening access to a
 * screen no longer means editing this file and shipping a build.
 *
 * The keys here must match src/auth/permissions/registry.ts in the backend, and
 * they are the same key the endpoints behind the screen are guarded with - so a
 * role that can see the menu entry can also load the data, and one that cannot
 * gets neither. That agreement is the point; the previous arrangement had the
 * menu and the API guarded by two lists maintained by hand.
 *
 * Still a usability layer. The API enforces the real boundary - hiding a menu
 * item is a courtesy, not a control.
 */
export interface NavItem {
  key: string;
  path: string;
  label: string;
  /**
   * The permission that opens this screen. Held by whichever roles a Super
   * Admin has granted it to; Super Admin holds everything implicitly.
   */
  permission: Permission;
  /** Shown on the placeholder until the real screen lands. */
  description: string;
  /** Backend routes this screen will drive - handy while wiring WS2.2+. */
  endpoints: string[];
  /** Workstream that delivers it, per the schedule baseline. */
  workstream: string;
}

export interface NavSection {
  key: string;
  label: string;
  icon: ReactNode;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    key: 'overview',
    label: 'Overview',
    icon: <DashboardOutlined />,
    items: [
      {
        key: 'dashboard',
        path: '/',
        label: 'Dashboard',
        permission: 'DASHBOARD_VIEW',
        description: 'Operational summary across sourcing, procurement, production and sales.',
        endpoints: [],
        workstream: 'WS2.6',
      },
      {
        key: 'onboarding',
        path: '/onboarding',
        label: 'Farmer / Supplier Onboarding',
        // Default: the roles that register and approve farmers. An Agriculture
        // Expert has their own panel at /field.
        permission: 'ONBOARDING_PANEL',
        description:
          'The onboarding desk — register a farmer, complete their details, get them approved, ' +
          'sign the agreement. Organised around the gate: approval is what issues the ' +
          'traceability code, and until it happens a farmer cannot be inspected or collected from.',
        endpoints: ['GET /farmers', 'POST /farmers', 'PATCH /farmers/:id/verify', 'GET /agreements'],
        workstream: 'WS2.2',
      },
      {
        key: 'trace',
        path: '/trace',
        label: 'Trace a Pack',
        permission: 'TRACE_VIEW',
        description:
          'Enter a finished-goods batch number (FG-YYYYMMDD-NNN) to resolve it back through ' +
          'the production run and raw material batches to the farmers who grew it.',
        endpoints: ['GET /trace/:fgBatchNumber'],
        workstream: 'WS2.6',
      },
    ],
  },
  {
    key: 'farm-sourcing',
    label: 'Farm Sourcing',
    icon: <TeamOutlined />,
    items: [
      {
        key: 'farmers',
        path: '/farmers',
        label: 'Farmers / Suppliers',
        permission: 'FARMER_VIEW',
        description:
          'Farmer registry, verification workflow and traceability IDs. Approval is Super ' +
          'Admin only ; the SVV-YYYY-NNNNNN code is issued on approval, never at ' +
          'registration.',
        endpoints: [
          'GET /farmers',
          'POST /farmers',
          'PATCH /farmers/:id/verify',
          'GET /farmers/:id/codes',
        ],
        workstream: 'WS2.2',
      },
      {
        key: 'agreements',
        path: '/agreements',
        label: 'Agreements',
        permission: 'AGREEMENT_VIEW',
        description: 'Pre-season rate, quality and quantity agreements per farmer.',
        endpoints: ['GET /agreements', 'POST /agreements', 'PATCH /agreements/:id/status'],
        workstream: 'WS2.2',
      },
      {
        key: 'seed-distribution',
        path: '/seed-distribution',
        label: 'Seed Distribution',
        permission: 'SEED_DISTRIBUTION_VIEW',
        description: 'Certified seed and crop-input distribution log.',
        endpoints: ['GET /seed-distribution', 'POST /seed-distribution'],
        workstream: 'WS2.2',
      },
      {
        key: 'training',
        path: '/training',
        label: 'Training',
        permission: 'TRAINING_VIEW',
        description:
          'Training sessions, bulk attendance and materials. Staff-facing: the executive runs ' +
          'the session at the farm and records it here afterwards. There is no farmer login.',
        endpoints: [
          'GET /training-sessions',
          'POST /training-sessions',
          'POST /training-sessions/:id/attendance',
        ],
        workstream: 'WS2.2',
      },
      {
        key: 'field-visits',
        path: '/field-visits',
        label: 'Field Visits',
        permission: 'FIELD_VISIT_VIEW',
        description:
          'Crop monitoring visits — growth stage, health, pest and disease observations, ' +
          'agronomic advice and yield prediction. Also captured offline in the field app (WS3.1).',
        endpoints: ['GET /field-visits', 'POST /field-visits'],
        workstream: 'WS2.2',
      },
    ],
  },
  {
    key: 'procurement',
    label: 'Procurement',
    icon: <InboxOutlined />,
    items: [
      {
        key: 'procurement-plans',
        path: '/procurement-plans',
        label: 'Procurement Plans',
        permission: 'PROCUREMENT_PLAN_VIEW',
        description: 'Crop, branch, quantity and schedule planning.',
        endpoints: ['GET /procurement-plans', 'POST /procurement-plans'],
        workstream: 'WS2.3',
      },
      {
        key: 'harvest-inspections',
        path: '/harvest-inspections',
        label: 'Harvest Inspections',
        permission: 'HARVEST_INSPECTION_VIEW',
        description:
          'Pre-harvest quality checklist. Only farmers who are approved and hold a ' +
          'traceability code can be inspected, and only an APPROVED inspection can be collected.',
        endpoints: ['GET /harvest-inspections', 'POST /harvest-inspections'],
        workstream: 'WS2.3',
      },
      {
        key: 'collections',
        path: '/collections',
        label: 'Collections',
        permission: 'COLLECTION_VIEW',
        description:
          'Records collection of an approved harvest and mints its raw material batch ' +
          '(RM-YYYYMMDD-NNN) in one transaction. Rate falls back to the agreement rate.',
        endpoints: ['GET /collections', 'POST /collections'],
        workstream: 'WS2.3',
      },
      {
        key: 'batches',
        path: '/batches',
        label: 'Raw Material Batches',
        permission: 'BATCH_VIEW',
        description: 'Batch register with status, warehouse and upstream trace.',
        endpoints: ['GET /batches', 'GET /batches/:batchNumber/trace'],
        workstream: 'WS2.3',
      },
    ],
  },
  {
    key: 'warehouse',
    label: 'Warehouse',
    icon: <GoldOutlined />,
    items: [
      {
        key: 'warehouses',
        path: '/warehouses',
        label: 'Warehouses',
        permission: 'WAREHOUSE_VIEW',
        description: 'Warehouse master with live occupancy against capacity.',
        endpoints: ['GET /warehouses', 'POST /warehouses', 'GET /warehouses/:id/status'],
        workstream: 'WS2.3',
      },
      {
        key: 'warehouse-stock',
        path: '/warehouse-stock',
        label: 'Stock',
        permission: 'STOCK_VIEW',
        description:
          'Batch-wise stock, low-stock alerts, and the stock in / out / transfer / adjust ' +
          'actions. Every movement writes a ledger row — the two never move apart.',
        endpoints: [
          'GET /warehouses/stock',
          'GET /warehouses/stock/low',
          'POST /warehouses/:id/stock-in',
          'POST /warehouses/transfer',
        ],
        workstream: 'WS2.3',
      },
      {
        key: 'stock-movements',
        path: '/stock-movements',
        label: 'Movement Ledger',
        permission: 'MOVEMENT_VIEW',
        description: 'Append-only audit trail of every inventory change.',
        endpoints: ['GET /warehouses/movements'],
        workstream: 'WS2.3',
      },
    ],
  },
  {
    key: 'processing',
    label: 'Processing & QA',
    icon: <ExperimentOutlined />,
    items: [
      {
        key: 'products',
        path: '/products',
        label: 'Products',
        permission: 'PRODUCT_VIEW',
        description:
          'Product master. Note: products carry TWO prices, B2B and B2C. Rates are shown from ' +
          'the price list and are changed by superseding, never by editing in place.',
        endpoints: ['GET /products', 'POST /products', 'GET /price-lists/product/:id/comparison'],
        workstream: 'WS2.2',
      },
      {
        key: 'recipes',
        path: '/recipes',
        label: 'Recipes',
        permission: 'RECIPE_VIEW',
        description:
          'Versioned formulas with an approval gate — Super Admin only. Approving a version ' +
          'retires the previously approved one. Multigrain recipes need percentages totalling ' +
          '100, and every production run made from one has to hold that ratio.',
        endpoints: [
          'GET /recipes',
          'POST /recipes',
          'PATCH /recipes/:id/approve',
          'GET /recipes/code/:recipeCode/versions',
        ],
        workstream: 'WS2.4',
      },
      {
        key: 'cleaning-grading',
        path: '/cleaning-grading',
        label: 'Cleaning & Grading',
        permission: 'CLEANING_GRADING_VIEW',
        description: 'Pre-production cleaning activities, grading parameters and QA sign-off.',
        endpoints: ['GET /cleaning-grading', 'POST /cleaning-grading'],
        workstream: 'WS2.4',
      },
      {
        key: 'production-batches',
        path: '/production-batches',
        label: 'Production Batches',
        permission: 'PRODUCTION_BATCH_VIEW',
        description:
          'Production runs (PB-YYYYMMDD-NNN) with raw material consumption, machine ' +
          'allocation and actual-vs-planned output. Recipe version is pinned at creation.',
        endpoints: [
          'GET /production-batches',
          'POST /production-batches',
          'PATCH /production-batches/:id/complete',
        ],
        workstream: 'WS2.4',
      },
      {
        key: 'quality-inspections',
        path: '/quality-inspections',
        label: 'Quality Inspections',
        permission: 'QUALITY_VIEW',
        description:
          'Raw-material, in-process and finished-goods inspections. These are HARD GATES, not ' +
          'annotations: a raw-material FAIL rejects the batch, a finished-goods FAIL withdraws ' +
          'QA release. Show them as blocks with a reason, never as warnings.',
        endpoints: [
          'GET /quality-inspections',
          'POST /quality-inspections',
          'PATCH /quality-inspections/release/:fgBatchId',
        ],
        workstream: 'WS2.4',
      },
      {
        key: 'finished-goods',
        path: '/finished-goods',
        label: 'Finished Goods',
        permission: 'PACKAGING_VIEW',
        description:
          'Packaging into FG batches, print-ready labels with QR and barcode, and finished ' +
          'goods stock. Only QA-released batches can be stocked.',
        endpoints: [
          'GET /finished-goods',
          'POST /finished-goods',
          'GET /finished-goods/:id/label',
          'GET /finished-goods-stock',
        ],
        workstream: 'WS2.4',
      },
    ],
  },
  {
    key: 'sales',
    label: 'Sales',
    icon: <ShoppingCartOutlined />,
    items: [
      {
        key: 'customers',
        path: '/customers',
        label: 'Customers',
        permission: 'CUSTOMER_VIEW',
        description:
          'One registry, two channels. Pick the channel FIRST — B2B needs a GSTIN, credit ' +
          'limit, payment terms and an executive; B2C gets none of those. Channel cannot be ' +
          'changed after registration.',
        endpoints: ['GET /customers', 'POST /customers', 'GET /customers/:id/credit'],
        workstream: 'WS2.5',
      },
      {
        key: 'price-lists',
        path: '/price-lists',
        label: 'Price Lists',
        permission: 'PRICE_VIEW',
        description:
          'Dated per-channel rates. A price is NEVER edited in place — use supersede, which ' +
          'closes the old rule and opens a new one. Render it as "change price from [date]".',
        endpoints: [
          'GET /price-lists',
          'POST /price-lists',
          'POST /price-lists/:id/supersede',
          'GET /price-lists/resolve',
        ],
        workstream: 'WS2.5',
      },
      {
        key: 'orders',
        path: '/orders',
        label: 'Orders',
        permission: 'ORDER_VIEW',
        description:
          'Channel-aware orders with a forward-only lifecycle. Allocation is a server action, ' +
          'not a form: it picks batches first-expiry-first-out from QA-released stock and ' +
          'returns exactly what to put on the picking slip.',
        endpoints: [
          'GET /orders',
          'POST /orders',
          'POST /orders/:id/allocate',
          'GET /orders/number/:orderNumber/traceability',
        ],
        workstream: 'WS2.5',
      },
    ],
  },
  {
    key: 'administration',
    label: 'Administration',
    icon: <SettingOutlined />,
    items: [
      {
        key: 'users',
        path: '/users',
        label: 'Users',
        permission: 'USER_VIEW',
        description: 'Staff accounts and roles. Creating a user is Super Admin only.',
        endpoints: ['GET /users', 'POST /users'],
        workstream: 'WS2.2',
      },
      {
        key: 'branches',
        path: '/branches',
        label: 'Branches',
        permission: 'BRANCH_VIEW',
        description: 'Branch master (FRD Section 6).',
        endpoints: ['GET /branches', 'POST /branches'],
        workstream: 'WS2.2',
      },
      {
        key: 'roles',
        path: '/settings/roles',
        label: 'Roles & Permissions',
        permission: 'ROLES_VIEW',
        description:
          'What each role may see and do. Every screen and action in this panel appears here ' +
          'as a switch. Changes take effect on the next request the affected users make - ' +
          'nobody has to sign out and back in.',
        endpoints: [
          'GET /permissions',
          'GET /permissions/matrix',
          'PUT /permissions/roles/:role',
          'POST /permissions/roles/:role/reset',
        ],
        workstream: 'WS2.2',
      },
    ],
  },
];

/** Flat list of every screen, for route generation. */
export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items);

/** Look up a screen by its path — used by the placeholder to describe itself. */
export function findNavItem(path: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => item.path === path);
}
