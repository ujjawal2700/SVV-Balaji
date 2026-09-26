import {
  ThunderboltOutlined,
  DashboardOutlined,
  ExperimentOutlined,
  GoldOutlined,
  InboxOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
  TeamOutlined,
  AppstoreOutlined,
  TagsOutlined,
  CreditCardOutlined,
  LineChartOutlined,
  UsergroupAddOutlined,
  FolderOutlined,
  PictureOutlined,
  CustomerServiceOutlined,
  ShopOutlined,
  GiftOutlined,
  TrophyOutlined,
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
/**
 * Which half of the business a screen belongs to, for the Supply/Commerce
 * toggle in the sidebar (AdminZoneToggle). `undefined` means shared — visible
 * regardless of which zone is selected (the dashboard, trace, and
 * administration screens all cut across both sides of the business).
 *
 * This is a navigation filter only, layered on top of the permission check,
 * never a replacement for it — a role with no sales access sees nothing extra
 * by switching to "Customer & Retail", because `can(item.permission)` still
 * runs first.
 */
export type AdminZone = 'supply' | 'commerce';

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
  /** Which zone this belongs to. Omit for a screen that is relevant to both. */
  zone?: AdminZone;
  /**
   * Nests the entry one level deeper under a sub-menu of its section (e.g.
   * Quick Delivery -> Manage Riders -> Pending Approval). Entries sharing a
   * group key are gathered under one sub-menu at the first one's position.
   */
  group?: { key: string; label: string };
  /** A live count shown next to the label (e.g. riders awaiting approval). */
  count?: 'pendingRiders';
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
        label: 'Farmer Onboarding',
        // Default: the roles that register and approve farmers. An Agriculture
        // Expert has their own panel at /field.
        permission: 'ONBOARDING_PANEL',
        description:
          'The onboarding desk — register a farmer, complete their details, get them approved, ' +
          'sign the agreement. Organised around the gate: approval is what issues the ' +
          'traceability code, and until it happens a farmer cannot be inspected or collected from.',
        endpoints: ['GET /farmers', 'POST /farmers', 'PATCH /farmers/:id/verify', 'GET /agreements'],
        workstream: 'WS2.2',
        zone: 'supply',
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
      {
        key: 'recall',
        path: '/recall',
        label: 'Recall & Batch Audit',
        permission: 'RECALL_VIEW',
        description:
          'Forward trace (which customers received a batch or raw lot), backward trace (machine, ' +
          'milling loss, raw lots, weighing slips, payouts, FIFO) and freeze / recall of a batch.',
        endpoints: ['GET /recall/forward', 'GET /recall/backward/:fgBatchNumber', 'POST /recall/hold'],
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
        zone: 'supply',
      },
      {
        key: 'agreements',
        path: '/agreements',
        label: 'Agreements',
        permission: 'AGREEMENT_VIEW',
        description: 'Pre-season rate, quality and quantity agreements per farmer.',
        endpoints: ['GET /agreements', 'POST /agreements', 'PATCH /agreements/:id/status'],
        workstream: 'WS2.2',
        zone: 'supply',
      },
      {
        key: 'seed-distribution',
        path: '/seed-distribution',
        label: 'Seed Distribution',
        permission: 'SEED_DISTRIBUTION_VIEW',
        description: 'Certified seed and crop-input distribution log.',
        endpoints: ['GET /seed-distribution', 'POST /seed-distribution'],
        workstream: 'WS2.2',
        zone: 'supply',
      },
      {
        key: 'seed-stock',
        path: '/seed-stock',
        label: 'Seed Stock',
        permission: 'SEED_STOCK_VIEW',
        description: 'Seed and agri-input lots per branch; handouts deduct from them (FRD 10.2).',
        endpoints: ['GET /seed-stock', 'POST /seed-stock', 'POST /seed-stock/:id/adjust'],
        workstream: 'WS2.2',
        zone: 'supply',
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
        zone: 'supply',
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
        zone: 'supply',
      },
    ],
  },
  {
    key: 'supplier-sourcing',
    label: 'Supplier Sourcing',
    icon: <TeamOutlined />,
    items: [
      {
        key: 'suppliers',
        path: '/suppliers',
        label: 'Suppliers',
        permission: 'SUPPLIER_VIEW',
        description: 'Supplier registry and verification workflow.',
        endpoints: ['GET /suppliers', 'POST /suppliers'],
        workstream: 'WS2.2',
        zone: 'supply',
      },
      {
        key: 'transports',
        path: '/transports',
        label: 'Transports',
        permission: 'TRANSPORT_VIEW',
        description: 'Manage inbound material transports from suppliers.',
        endpoints: ['GET /transports'],
        workstream: 'WS2.3',
        zone: 'supply',
      },
      {
        key: 'purchase-orders',
        path: '/purchase-orders',
        label: 'Purchase Orders',
        permission: 'PURCHASE_ORDER_VIEW',
        description: 'Manage supplier purchase orders.',
        endpoints: ['GET /purchase-orders'],
        workstream: 'WS2.3',
        zone: 'supply',
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
        zone: 'supply',
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
        zone: 'supply',
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
        zone: 'supply',
      },
      {
        key: 'batches',
        path: '/batches',
        label: 'Raw Material Batches',
        permission: 'BATCH_VIEW',
        description: 'Batch register with status, warehouse and upstream trace.',
        endpoints: ['GET /batches', 'GET /batches/:batchNumber/trace'],
        workstream: 'WS2.3',
        zone: 'supply',
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
        zone: 'supply',
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
        zone: 'supply',
      },
      {
        key: 'stock-movements',
        path: '/stock-movements',
        label: 'Movement Ledger',
        permission: 'MOVEMENT_VIEW',
        description: 'Append-only audit trail of every inventory change.',
        endpoints: ['GET /warehouses/movements'],
        workstream: 'WS2.3',
        zone: 'supply',
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
        zone: 'supply',
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
        zone: 'supply',
      },
      {
        key: 'cleaning-grading',
        path: '/cleaning-grading',
        label: 'Cleaning & Grading',
        permission: 'CLEANING_GRADING_VIEW',
        description: 'Pre-production cleaning activities, grading parameters and QA sign-off.',
        endpoints: ['GET /cleaning-grading', 'POST /cleaning-grading'],
        workstream: 'WS2.4',
        zone: 'supply',
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
        zone: 'supply',
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
        zone: 'supply',
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
        zone: 'supply',
      },
      {
        key: 'yield-tracking',
        path: '/yield-tracking',
        label: 'Loss & Yield Tracking',
        permission: 'SUPPLY_CHAIN_YIELD_VIEW',
        description:
          'Stage-wise loss across Cleaning & Grading, Production and Finished Goods, chain ' +
          'totals and yield %, an alert when total loss exceeds the 4-8% normal band, plus ' +
          'farmer/supplier and machine health flags. Read-only - built on the existing phases, ' +
          'no new processing step.',
        endpoints: [
          'GET /supply-chain/yield',
          'GET /supply-chain/yield/chain',
          'GET /supply-chain/yield/farmer-quality',
          'GET /supply-chain/yield/machine-health',
        ],
        workstream: 'WS2.6',
        zone: 'supply',
      },
    ],
  },
  {
    key: 'catalog',
    label: 'Product & Catalog',
    icon: <AppstoreOutlined />,
    items: [
      {
        key: 'productlists',
        path: '/productlists',
        label: 'Product List & Editor',
        permission: 'PRODUCT_VIEW',
        description: 'SKU management, variants, imagery, and SEO metadata.',
        endpoints: [],
        workstream: 'WS2.5',
        zone: 'commerce',
      },
      {
        key: 'price-lists',
        path: '/price-lists',
        label: 'Tiered Pricing',
        permission: 'PRICE_VIEW',
        description: 'Separate MSRP for B2C and volume-based/negotiated rate cards for B2B accounts.',
        endpoints: [],
        workstream: 'WS2.5',
        zone: 'commerce',
      },
      {
        key: 'inventory',
        path: '/inventory',
        label: 'Inventory & Warehouse',
        permission: 'STOCK_VIEW',
        description: 'Stock counts, automated replenishment thresholds, safety stock rules, and backorder controls.',
        endpoints: [],
        workstream: 'WS2.5',
        zone: 'commerce',
      },
    ],
  },
  {
    key: 'banner-management',
    label: 'Banner & Homepage',
    icon: <PictureOutlined />,
    items: [
      {
        key: 'banners',
        path: '/banners',
        label: 'Banner Management',
        permission: 'BANNER_VIEW',
        description: 'Manage storefront homepage hero banners, promotional carousels, and target channels.',
        endpoints: [],
        workstream: 'WS2.5',
        zone: 'commerce',
      },
      {
        key: 'home-sections',
        path: '/home-sections',
        label: 'Homepage Sections',
        permission: 'HOME_SECTION_VIEW',
        description: 'Organize dynamic product sections displayed on customer homepage.',
        endpoints: [],
        workstream: 'WS2.5',
        zone: 'commerce',
      },
    ],
  },
  {
    key: 'category-management',
    label: 'Manage Category',
    icon: <FolderOutlined />,
    items: [
      {
        key: 'main-categories',
        path: '/categories',
        label: 'Main Categories',
        permission: 'CATEGORY_VIEW',
        description: 'Manage main top-level storefront product categories.',
        endpoints: [],
        workstream: 'WS2.5',
        zone: 'commerce',
      },
      {
        key: 'sub-categories',
        path: '/subcategories',
        label: 'Sub-Categories',
        permission: 'CATEGORY_VIEW',
        description: 'Manage child sub-categories and their parent assignments.',
        endpoints: [],
        workstream: 'WS2.5',
        zone: 'commerce',
      },
    ],
  },
  {
    key: 'pos-management',
    label: 'POS Counter & Store Sales',
    icon: <ShopOutlined />,
    items: [
      {
        key: 'pos-sale',
        path: '/pos-sale',
        label: 'New Sale (Billing Terminal)',
        permission: 'ORDER_VIEW',
        description: 'Interactive billing terminal for offline walk-in store customers with manual customer details, product scanning & tax receipt printing.',
        endpoints: [],
        workstream: 'WS2.5',
        zone: 'commerce',
      },
      {
        key: 'pos-orders',
        path: '/pos-orders',
        label: 'POS Counter Orders',
        permission: 'ORDER_VIEW',
        description: 'Complete list of offline/counter orders created at physical outlet terminals with payment mode tags and receipt re-printing.',
        endpoints: [],
        workstream: 'WS2.5',
        zone: 'commerce',
      },
      {
        key: 'pos-reports',
        path: '/pos-reports',
        label: 'Sale Reports & Shift Reconciliation',
        permission: 'ORDER_VIEW',
        description: 'Daily counter sales performance, cashier shift logs, digital/cash collection reports, and cash drawer reconciliations.',
        endpoints: [],
        workstream: 'WS2.5',
        zone: 'commerce',
      },
      {
        key: 'outlets',
        path: '/outlets',
        label: 'Physical Outlets & POS Terminals',
        permission: 'STOCK_VIEW',
        description: 'Manage company-owned physical stores, POS machine terminals, cashier assignments, local stock balances & counter reconciliations.',
        endpoints: [],
        workstream: 'WS2.5',
        zone: 'commerce',
      },
    ],
  },
  {
    key: 'oms',
    label: 'Order Management',
    icon: <ShoppingCartOutlined />,
    items: [
      {
        key: 'b2c-orders',
        path: '/b2c-orders',
        label: 'B2C Orders',
        permission: 'ORDER_VIEW',
        description: 'Standard checkout orders, immediate payment captures, and returns (RMA).',
        endpoints: [],
        workstream: 'WS2.5',
        zone: 'commerce',
      },
      {
        key: 'b2b-orders',
        path: '/b2b-orders',
        label: 'B2B Orders & Quotes',
        permission: 'ORDER_VIEW',
        description: 'Purchase Orders (PO), draft quotes, net payment terms, and bulk fulfillments.',
        endpoints: [],
        workstream: 'WS2.5',
        zone: 'commerce',
      },
      {
        key: 'franchise-orders',
        path: '/franchise-orders',
        label: 'Franchise Supply Orders',
        permission: 'ORDER_VIEW',
        description: 'Franchise store stock fulfillment logs, bulk supplies, transit trucks, and credit ledger.',
        endpoints: [],
        workstream: 'WS2.5',
        zone: 'commerce',
      },
    ],
  },
  {
    key: 'support-resolution',
    label: 'Support & Resolution',
    icon: <CustomerServiceOutlined />,
    items: [
      {
        key: 'support-tickets',
        path: '/support-tickets',
        label: 'Support & Complaints Hub',
        permission: 'SUPPORT_TICKETS_VIEW',
        description: 'Unified support desk & dispute resolution hub for customer/retailer messages, evidence inspection, batch traceability, and refunds.',
        endpoints: ['GET /support-tickets', 'GET /support-tickets/:id', 'POST /support-tickets/:id/messages', 'PATCH /support-tickets/:id'],
        workstream: 'WS2.5',
        zone: 'commerce',
      },
      {
        key: 'supportSettings',
        path: '/settings/support',
        label: 'Helpdesk & Support Settings',
        permission: 'ORDER_VIEW',
        description: 'Toll-free helpline, WhatsApp desk, operating hours, and dynamic FAQs for Customer & Retailer apps.',
        endpoints: ['GET /support-settings', 'PATCH /support-settings'],
        workstream: 'WS2.5',
        zone: 'commerce',
      },
    ],
  },
  {
    key: 'quick-delivery',
    label: 'Quick Delivery',
    icon: <ThunderboltOutlined />,
    items: [
      {
        key: 'delivery-board', path: '/delivery-board', label: 'Delivery Board', permission: 'DELIVERY_TASKS_VIEW',
        description: 'Every local / Quick delivery: auto-offered to riders, waiting on staff, failed and re-attempted.',
        endpoints: ['GET /delivery/tasks', 'POST /delivery/tasks/:id/assign'], workstream: 'WS3.4', zone: 'commerce',
      },
      {
        key: 'riders-pending', path: '/riders/pending', label: 'Pending Approval', permission: 'RIDERS_VIEW', group: { key: 'manage-riders', label: 'Manage Riders' }, count: 'pendingRiders',
        description: 'Rider sign-ups waiting for review: licence photo, vehicle, approve with a home outlet or reject with a reason.',
        endpoints: ['GET /riders?status=PENDING_APPROVAL', 'POST /riders/:id/approve', 'POST /riders/:id/reject'], workstream: 'WS3.4', zone: 'commerce',
      },
      {
        key: 'riders', path: '/riders', label: 'All Riders', permission: 'RIDERS_VIEW', group: { key: 'manage-riders', label: 'Manage Riders' },
        description: 'Every rider by status: active, suspended, rejected, unverified. Open one for deliveries, earnings, cash and settings.',
        endpoints: ['GET /riders', 'GET /riders/:id'], workstream: 'WS3.4', zone: 'commerce',
      },
      {
        key: 'riders-live', path: '/riders/live', label: 'Live Riders', permission: 'RIDERS_VIEW', group: { key: 'manage-riders', label: 'Manage Riders' },
        description: 'Riders online right now on a map, with the deliveries each one is carrying.',
        endpoints: ['GET /riders/live'], workstream: 'WS3.4', zone: 'commerce',
      },
      {
        key: 'riders-earnings', path: '/riders/earnings', label: 'Rider Earnings', permission: 'RIDERS_VIEW', group: { key: 'manage-riders', label: 'Manage Riders' },
        description: 'What every rider earned in a period, split by base, distance, incentives and bonuses; adjustments.',
        endpoints: ['GET /riders/earnings-report', 'POST /riders/:id/earnings/adjustments'], workstream: 'WS3.4', zone: 'commerce',
      },
      {
        key: 'riders-cash', path: '/riders/cash', label: 'Cash & Deposits', permission: 'RIDERS_VIEW', group: { key: 'manage-riders', label: 'Manage Riders' },
        description: 'COD cash each rider is holding and the deposits handed over at the outlet.',
        endpoints: ['GET /riders/cash-report', 'POST /riders/:id/cash/deposits'], workstream: 'WS3.4', zone: 'commerce',
      },
      {
        key: 'riders-pay-rules', path: '/riders/pay-rules', label: 'Pay Rules', permission: 'DELIVERY_TASKS_VIEW', group: { key: 'manage-riders', label: 'Manage Riders' },
        description: 'How riders are paid: base, distance slabs, peak hour, zone incentive, daily / weekly targets, waiting time, cancel / fail compensation.',
        endpoints: ['GET /delivery/earning-rules', 'POST /delivery/earning-rules'], workstream: 'WS3.4', zone: 'commerce',
      },
      {
        key: 'delivery-zones', path: '/delivery-zones', label: 'Delivery Zones', permission: 'DELIVERY_ZONES_VIEW',
        description: 'Where Quick Delivery runs: boundaries, pincodes, radius, outlet, promised time, hours, fee and fallback.',
        endpoints: ['GET /delivery-zones', 'POST /delivery-zones'], workstream: 'WS3.4', zone: 'commerce',
      },
      {
        key: 'delivery-settings', path: '/delivery-settings', label: 'Delivery Settings', permission: 'DELIVERY_TASKS_VIEW',
        description: 'Auto-offer timing, geofence, COD rules and failed-delivery reasons. Rider pay is under Manage Riders.',
        endpoints: ['GET /delivery/settings', 'GET /delivery/earning-rules'], workstream: 'WS3.4', zone: 'commerce',
      },
    ],
  },
  {
    key: 'crm',
    label: 'CRM & Accounts',
    icon: <UsergroupAddOutlined />,
    items: [
      {
        key: 'b2c-customers',
        path: '/b2c-customers',
        label: 'B2C Customers',
        permission: 'CUSTOMER_VIEW',
        description: 'Individual profiles, order history, lifetime value (LTV), and shipping addresses.',
        endpoints: [],
        workstream: 'WS2.5',
        zone: 'commerce',
      },
      {
        key: 'b2b-accounts',
        path: '/b2b-accounts',
        label: 'Retailer Approvals & B2B Accounts',
        permission: 'CUSTOMER_ACCOUNT_VIEW',
        description: 'Self-service Kirana/Retailer registrations awaiting Super Admin approval, GSTIN compliance audit, and address verification.',
        endpoints: [],
        workstream: 'WS2.5',
        zone: 'commerce',
      },
      {
        key: 'receivables',
        path: '/receivables',
        label: 'Receivables & Credit',
        permission: 'RECEIVABLES_VIEW',
        description: 'What B2B customers owe on credit, due dates, overdue ageing, payments received and statements of account.',
        endpoints: ['GET /receivables', 'GET /receivables/customers/:id', 'POST /receivables/customers/:id/receipts', 'POST /receivables/receipts/:id/void'],
        workstream: 'WS2.5',
        zone: 'commerce',
      },
    ],
  },
  {
    key: 'billing',
    label: 'Promotions & Billing',
    icon: <TagsOutlined />,
    items: [
      {
        key: 'schemes',
        path: '/schemes',
        label: 'Schemes & Offers',
        permission: 'SCHEME_VIEW',
        description: 'Manage the "Today\'s Schemes & Offers" tiles on the customer homepage - copy, display order, and target channel.',
        endpoints: [],
        workstream: 'WS2.5',
        zone: 'commerce',
      },
      {
        key: 'earnings',
        path: '/earnings',
        label: 'Earnings & Financial MIS',
        permission: 'DASHBOARD_VIEW',
        description: 'Multi-stream realized income, B2B credit ledger, payment gateway settlements, and statutory GST liability.',
        endpoints: [],
        workstream: 'WS2.5',
        zone: 'commerce',
      },
      {
        key: 'invoices',
        path: '/invoices',
        label: 'Invoicing & Payments',
        permission: 'ORDER_VIEW',
        description: 'Gateway logs, offline payment reconciliations, and GST/tax invoicing.',
        endpoints: [],
        workstream: 'WS2.5',
        zone: 'commerce',
      },
    ],
  },
  {
    key: 'analytics',
    label: 'Reports & Analytics',
    icon: <LineChartOutlined />,
    items: [
      {
        key: 'reports',
        path: '/reports',
        label: 'Sales Analytics',
        permission: 'DASHBOARD_VIEW',
        description: 'Cohort analysis, B2B reorder cycles, channel-specific sales velocity, and gross margin reporting.',
        endpoints: [],
        workstream: 'WS2.5',
        zone: 'commerce',
      },
    ],
  },
  {
    key: 'loyalty-referrals',
    label: 'Referrals & Loyalty Program',
    icon: <GiftOutlined />,
    items: [
      {
        key: 'referrals',
        path: '/referrals',
        label: 'Referral Management',
        permission: 'REFERRALS_VIEW',
        description:
          'Who referred whom, whether it qualified, what each side earned, and every customer\'s ' +
          'complete coin history — including manual refunds, reversals and adjustments.',
        endpoints: [
          'GET /referrals',
          'GET /referrals/ledger/:customerId',
          'POST /referrals/ledger/:customerId/adjust',
        ],
        workstream: 'WS2.5',
        zone: 'commerce',
      },
      {
        key: 'referralSettings',
        path: '/settings/referrals',
        label: 'Referral & Reward Settings',
        permission: 'REFERRAL_SETTINGS_VIEW',
        description:
          'Coin amounts, trigger, on/off switch and dynamic FAQs for the refer-a-friend program. Applies live ' +
          'to referrals already in flight, not only ones created after a change.',
        endpoints: ['GET /referral-settings', 'PATCH /referral-settings'],
        workstream: 'WS2.5',
        zone: 'commerce',
      },
      {
        key: 'loyaltySettings',
        path: '/settings/loyalty',
        label: 'Loyalty Rewards',
        permission: 'LOYALTY_VIEW',
        description:
          'Percentage-based rewards: earn percentage per channel, point value, eligibility, ' +
          'minimums, per-order cap and expiry. Points are credited when an order is delivered.',
        endpoints: ['GET /loyalty/settings', 'PATCH /loyalty/settings'],
        workstream: 'WS2.5',
        zone: 'commerce',
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
      {
        key: 'checkoutSettings',
        path: '/settings/checkout',
        label: 'Checkout & Delivery',
        permission: 'CHECKOUT_SETTINGS_VIEW',
        description: 'Local delivery radius, fees, ETAs, COD limit and stock-hold time. Outlets are set on Warehouses.',
        endpoints: ['GET /checkout-settings', 'PATCH /checkout-settings'],
        workstream: 'WS2.5',
      },
      {
        key: 'coupons',
        path: '/coupons',
        label: 'Coupons',
        permission: 'COUPONS_VIEW',
        description: 'Coupon codes validated by the server at checkout.',
        endpoints: ['GET /coupons', 'POST /coupons', 'PATCH /coupons/:id'],
        workstream: 'WS2.5',
        zone: 'commerce',
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
