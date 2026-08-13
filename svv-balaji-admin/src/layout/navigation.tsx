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
import { USER_ROLES, type UserRole } from '../auth/types';

/**
 * The single source of truth for what exists in the panel and who may see it.
 *
 * Both the sidebar menu and the router are generated from this list, so a
 * screen can never appear in one and be missing from the other.
 *
 * `roles` mirrors the backend's `@Roles()` decorators, widened where a role
 * plainly needs to *read* a screen it cannot write to (an Agriculture Expert
 * needs the farmer list even though only Procurement can register one). Super
 * Admin is granted everything implicitly by `hasRole` and is never listed.
 *
 * This is a usability layer. The API enforces the real boundary - hiding a menu
 * item is a courtesy, not a control.
 */
export interface NavItem {
  key: string;
  path: string;
  label: string;
  /** Who sees it. Super Admin is implicit. */
  roles: readonly UserRole[];
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

const ALL_ROLES = USER_ROLES;

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
        roles: ALL_ROLES,
        description: 'Operational summary across sourcing, procurement, production and sales.',
        endpoints: [],
        workstream: 'WS2.6',
      },
      {
        key: 'trace',
        path: '/trace',
        label: 'Trace a Pack',
        roles: ALL_ROLES,
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
        label: 'Farmers',
        roles: ['BRANCH_MANAGER', 'PROCUREMENT_MANAGER', 'AGRICULTURE_EXPERT'],
        description:
          'Farmer registry, verification workflow and traceability IDs. Approval is Super ' +
          'Admin only (FRD 5.1); the SVV-YYYY-NNNNNN code is issued on approval, never at ' +
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
        roles: ['PROCUREMENT_MANAGER', 'BRANCH_MANAGER'],
        description: 'Pre-season rate, quality and quantity agreements per farmer.',
        endpoints: ['GET /agreements', 'POST /agreements', 'PATCH /agreements/:id/status'],
        workstream: 'WS2.2',
      },
      {
        key: 'seed-distribution',
        path: '/seed-distribution',
        label: 'Seed Distribution',
        roles: ['AGRICULTURE_EXPERT', 'BRANCH_MANAGER'],
        description: 'Certified seed and crop-input distribution log.',
        endpoints: ['GET /seed-distribution', 'POST /seed-distribution'],
        workstream: 'WS2.2',
      },
      {
        key: 'training',
        path: '/training',
        label: 'Training',
        roles: ['AGRICULTURE_EXPERT', 'BRANCH_MANAGER'],
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
        roles: ['AGRICULTURE_EXPERT', 'BRANCH_MANAGER'],
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
        roles: ['PROCUREMENT_MANAGER', 'BRANCH_MANAGER'],
        description: 'Crop, branch, quantity and schedule planning.',
        endpoints: ['GET /procurement-plans', 'POST /procurement-plans'],
        workstream: 'WS2.3',
      },
      {
        key: 'harvest-inspections',
        path: '/harvest-inspections',
        label: 'Harvest Inspections',
        roles: ['PROCUREMENT_MANAGER', 'QA_MANAGER'],
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
        roles: ['PROCUREMENT_MANAGER'],
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
        roles: ['PROCUREMENT_MANAGER', 'BRANCH_MANAGER', 'WAREHOUSE_MANAGER', 'PRODUCTION_MANAGER'],
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
        roles: ['WAREHOUSE_MANAGER', 'BRANCH_MANAGER'],
        description: 'Warehouse master with live occupancy against capacity.',
        endpoints: ['GET /warehouses', 'POST /warehouses', 'GET /warehouses/:id/status'],
        workstream: 'WS2.3',
      },
      {
        key: 'warehouse-stock',
        path: '/warehouse-stock',
        label: 'Stock',
        roles: ['WAREHOUSE_MANAGER', 'BRANCH_MANAGER', 'PRODUCTION_MANAGER'],
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
        roles: ['WAREHOUSE_MANAGER', 'BRANCH_MANAGER'],
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
        roles: ['BRANCH_MANAGER', 'PRODUCTION_MANAGER', 'SALES_TEAM'],
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
        roles: ['PRODUCTION_MANAGER', 'QA_MANAGER'],
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
        roles: ['PRODUCTION_MANAGER', 'QA_MANAGER'],
        description: 'Pre-production cleaning activities, grading parameters and QA sign-off.',
        endpoints: ['GET /cleaning-grading', 'POST /cleaning-grading'],
        workstream: 'WS2.4',
      },
      {
        key: 'production-batches',
        path: '/production-batches',
        label: 'Production Batches',
        roles: ['PRODUCTION_MANAGER', 'BRANCH_MANAGER'],
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
        roles: ['QA_MANAGER', 'PRODUCTION_MANAGER'],
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
        roles: ['PRODUCTION_MANAGER', 'WAREHOUSE_MANAGER'],
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
        roles: ['SALES_TEAM', 'BRANCH_MANAGER'],
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
        roles: ['BRANCH_MANAGER'],
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
        roles: ['SALES_TEAM', 'BRANCH_MANAGER', 'WAREHOUSE_MANAGER', 'LOGISTICS_TEAM'],
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
        roles: ['BRANCH_MANAGER'],
        description: 'Staff accounts and roles. Creating a user is Super Admin only.',
        endpoints: ['GET /users', 'POST /users'],
        workstream: 'WS2.2',
      },
      {
        key: 'branches',
        path: '/branches',
        label: 'Branches',
        roles: ['BRANCH_MANAGER'],
        description: 'Branch master (FRD Section 6).',
        endpoints: ['GET /branches', 'POST /branches'],
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
