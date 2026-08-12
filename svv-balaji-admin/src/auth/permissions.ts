import type { UserRole } from './types';

/**
 * Every guarded action in the panel, mapped to the roles that may perform it.
 *
 * Each entry mirrors a `@Roles()` decorator in the backend and cites it, so the
 * two can be diffed by eye when a controller changes. Super Admin is granted
 * everything implicitly by `hasRole()` and is only listed where the backend
 * restricts an action to Super Admin ALONE - in those cases the narrowness is
 * the point.
 *
 * ---------------------------------------------------------------------------
 * This is a usability layer, NOT a security boundary.
 *
 * The API enforces the real thing and would refuse the request regardless. The
 * value of guarding here is that a Warehouse Manager never sees an Approve
 * button that would only hand them a 403. If we ever start treating this file
 * as the control, someone will eventually ship an endpoint without `@Roles()`
 * and nothing on the server will catch it.
 * ---------------------------------------------------------------------------
 */
export const PERMISSIONS = {
  // --- Users & branches (Phase 0) -------------------------------------------
  /** POST /users - @Roles(SUPER_ADMIN) */
  USER_CREATE: ['SUPER_ADMIN'],
  /** GET /users - @Roles(SUPER_ADMIN, BRANCH_MANAGER) */
  USER_VIEW: ['BRANCH_MANAGER'],
  /** POST /branches - @Roles(SUPER_ADMIN) */
  BRANCH_CREATE: ['SUPER_ADMIN'],

  // --- Farmers (FRD 7-8) ----------------------------------------------------
  /** POST /farmers - @Roles(SUPER_ADMIN, BRANCH_MANAGER, PROCUREMENT_MANAGER), FRD 7.1 */
  FARMER_CREATE: ['BRANCH_MANAGER', 'PROCUREMENT_MANAGER'],
  /** PATCH /farmers/:id/verify - @Roles(SUPER_ADMIN) only, FRD 5.1 */
  FARMER_APPROVE: ['SUPER_ADMIN'],
  /** PATCH /farmers/:id/status - @Roles(SUPER_ADMIN, BRANCH_MANAGER) */
  FARMER_SET_STATUS: ['BRANCH_MANAGER'],

  // --- Phase 1 (registered now so WS2.2 screens have them ready) ------------
  /** POST /agreements - @Roles(SUPER_ADMIN, PROCUREMENT_MANAGER) */
  AGREEMENT_CREATE: ['PROCUREMENT_MANAGER'],
  /** POST /seed-distribution - @Roles(SUPER_ADMIN, AGRICULTURE_EXPERT), FRD 5.4 */
  SEED_DISTRIBUTION_CREATE: ['AGRICULTURE_EXPERT'],
  /** POST /training-sessions - @Roles(SUPER_ADMIN, AGRICULTURE_EXPERT) */
  TRAINING_CREATE: ['AGRICULTURE_EXPERT'],
  /** POST /field-visits - @Roles(SUPER_ADMIN, AGRICULTURE_EXPERT) */
  FIELD_VISIT_CREATE: ['AGRICULTURE_EXPERT'],

  // --- Phase 2 --------------------------------------------------------------
  /** POST /procurement-plans - @Roles(SUPER_ADMIN, PROCUREMENT_MANAGER, BRANCH_MANAGER) */
  PROCUREMENT_PLAN_CREATE: ['PROCUREMENT_MANAGER', 'BRANCH_MANAGER'],
  /** POST /harvest-inspections - @Roles(SUPER_ADMIN, PROCUREMENT_MANAGER, QA_MANAGER) */
  HARVEST_INSPECTION_CREATE: ['PROCUREMENT_MANAGER', 'QA_MANAGER'],
  /** POST /collections - @Roles(SUPER_ADMIN, PROCUREMENT_MANAGER) */
  COLLECTION_CREATE: ['PROCUREMENT_MANAGER'],
  /** POST /warehouses - @Roles(SUPER_ADMIN, BRANCH_MANAGER) */
  WAREHOUSE_CREATE: ['BRANCH_MANAGER'],
  /** stock-in / stock-out / adjust / transfer - STOCK_ROLES in warehouse.controller.ts */
  STOCK_MUTATE: ['BRANCH_MANAGER', 'WAREHOUSE_MANAGER'],

  // --- Phase 3 --------------------------------------------------------------
  /** POST /products - @Roles(SUPER_ADMIN) */
  PRODUCT_CREATE: ['SUPER_ADMIN'],
  /** POST /recipes and PATCH /recipes/:id/approve - @Roles(SUPER_ADMIN) only, FRD 19.1/19.4 */
  RECIPE_CREATE: ['SUPER_ADMIN'],
  RECIPE_APPROVE: ['SUPER_ADMIN'],
  /** POST /cleaning-grading - @Roles(SUPER_ADMIN, PRODUCTION_MANAGER, QA_MANAGER) */
  CLEANING_GRADING_CREATE: ['PRODUCTION_MANAGER', 'QA_MANAGER'],
  /** POST /production-batches - @Roles(SUPER_ADMIN, PRODUCTION_MANAGER) */
  PRODUCTION_BATCH_CREATE: ['PRODUCTION_MANAGER'],
  /** POST /quality-inspections and the release gate - @Roles(SUPER_ADMIN, QA_MANAGER), FRD 21.5 */
  QUALITY_INSPECT: ['QA_MANAGER'],
  QUALITY_RELEASE: ['QA_MANAGER'],
  /** POST /finished-goods - @Roles(SUPER_ADMIN, PRODUCTION_MANAGER) */
  PACKAGING_CREATE: ['PRODUCTION_MANAGER'],

  // --- Phase 4 --------------------------------------------------------------
  /** POST /customers - @Roles(SUPER_ADMIN, BRANCH_MANAGER, SALES_TEAM) */
  CUSTOMER_CREATE: ['BRANCH_MANAGER', 'SALES_TEAM'],
  /** POST /price-lists and /supersede - @Roles(SUPER_ADMIN, BRANCH_MANAGER) */
  PRICE_CREATE: ['BRANCH_MANAGER'],
  PRICE_SUPERSEDE: ['BRANCH_MANAGER'],
  /** POST /orders - @Roles(SUPER_ADMIN, BRANCH_MANAGER, SALES_TEAM) */
  ORDER_CREATE: ['BRANCH_MANAGER', 'SALES_TEAM'],
  /** POST /orders/:id/allocate - @Roles(SUPER_ADMIN, WAREHOUSE_MANAGER, BRANCH_MANAGER) */
  ORDER_ALLOCATE: ['WAREHOUSE_MANAGER', 'BRANCH_MANAGER'],
  /** PATCH /orders/:id/dispatch - @Roles(SUPER_ADMIN, WAREHOUSE_MANAGER, LOGISTICS_TEAM) */
  ORDER_DISPATCH: ['WAREHOUSE_MANAGER', 'LOGISTICS_TEAM'],
  /** PATCH /orders/:id/deliver - @Roles(SUPER_ADMIN, LOGISTICS_TEAM) */
  ORDER_DELIVER: ['LOGISTICS_TEAM'],
} as const satisfies Record<string, readonly UserRole[]>;

export type Permission = keyof typeof PERMISSIONS;
