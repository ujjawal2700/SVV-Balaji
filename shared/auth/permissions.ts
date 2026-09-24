/**
 * The panel's names for the things a user can do, mapped to the permission keys
 * the server actually checks.
 *
 * -----------------------------------------------------------------------------
 * What changed on 16 August, and why this file no longer contains any roles.
 *
 * This used to be a hardcoded map of action -> roles allowed, mirroring the
 * `@Roles()` decorators by hand. Both are gone. The server now stores grants in
 * `role_permissions` and returns the signed-in user's effective set on
 * `/auth/me`, so who-may-do-what is a decision a Super Admin makes from
 * Administration -> Roles & Permissions, not something compiled into either
 * codebase.
 *
 * What is left here is a translation table. The screens keep their readable
 * names (`useCan('FARMER_APPROVE')`) and this maps each one to the key the
 * backend guards the route with (`farmers.approve`). Keeping the alias layer
 * means twenty-odd screens did not have to be rewritten, and it puts the
 * correspondence between panel vocabulary and API vocabulary in one file where
 * it can be checked.
 *
 * Still not a security boundary. It never was. The server refuses the request
 * regardless; hiding a button only spares someone a 403 they cannot act on.
 * -----------------------------------------------------------------------------
 *
 * Every value below must exist in the backend's
 * src/auth/permissions/registry.ts. A key that does not is a permission nothing
 * grants, so `useCan` would return false forever and the action would be
 * invisible to everybody including Super Admin.
 */
export const PERMISSIONS = {
  // --- Users & branches -----------------------------------------------------
  USER_VIEW: 'users.view',
  USER_CREATE: 'users.create',
  USER_MANAGE: 'users.edit',
  USER_DELETE: 'users.delete',
  BRANCH_VIEW: 'branches.view',
  BRANCH_CREATE: 'branches.create',
  BRANCH_MANAGE: 'branches.edit',
  BRANCH_ASSIGN_MANAGER: 'branches.assignManager',
  BRANCH_PERFORMANCE: 'branches.performance',
  BRANCH_DELETE: 'branches.delete',

  // --- Roles & permissions (the screen that edits all of this) --------------
  ROLES_VIEW: 'rolePermissions.view',
  ROLES_MANAGE: 'rolePermissions.manage',

  // --- Farmers --------------------------------------------------------------
  FARMER_VIEW: 'farmers.view',
  FARMER_CREATE: 'farmers.create',
  FARMER_EDIT: 'farmers.edit',
  FARMER_SET_STATUS: 'farmers.status',
  /** The gate that issues the traceability code. Narrow on purpose. */
  FARMER_APPROVE: 'farmers.approve',
  FARMER_DELETE: 'farmers.delete',
  FARMER_CODES: 'farmers.codes',
  /** Mapping a farmer's individual plots. Field work, unlike editing bank details. */
  FARMER_PLOTS: 'farmers.plots',

  // --- Suppliers ------------------------------------------------------------
  SUPPLIER_VIEW: 'suppliers.view',
  SUPPLIER_CREATE: 'suppliers.create',
  SUPPLIER_EDIT: 'suppliers.edit',
  SUPPLIER_SET_STATUS: 'suppliers.status',
  SUPPLIER_APPROVE: 'suppliers.approve',
  SUPPLIER_DELETE: 'suppliers.delete',

  // --- Transports -----------------------------------------------------------
  TRANSPORT_VIEW: 'transports.view',
  TRANSPORT_CREATE: 'transports.create',
  TRANSPORT_EDIT: 'transports.edit',

  // --- Purchase Orders ------------------------------------------------------
  PURCHASE_ORDER_VIEW: 'purchaseOrders.view',
  PURCHASE_ORDER_CREATE: 'purchaseOrders.create',
  PURCHASE_ORDER_EDIT: 'purchaseOrders.edit',
  PURCHASE_ORDER_STATUS: 'purchaseOrders.status',

  // --- Farm sourcing --------------------------------------------------------
  AGREEMENT_VIEW: 'agreements.view',
  AGREEMENT_CREATE: 'agreements.create',
  AGREEMENT_EDIT: 'agreements.edit',
  AGREEMENT_DELETE: 'agreements.delete',
  SEED_DISTRIBUTION_VIEW: 'seed.view',
  SEED_DISTRIBUTION_CREATE: 'seed.create',
  SEED_DISTRIBUTION_EDIT: 'seed.edit',
  SEED_DISTRIBUTION_DELETE: 'seed.delete',
  TRAINING_VIEW: 'training.view',
  TRAINING_CREATE: 'training.create',
  TRAINING_EDIT: 'training.edit',
  TRAINING_DELETE: 'training.delete',
  FIELD_VISIT_VIEW: 'fieldVisits.view',
  FIELD_VISIT_CREATE: 'fieldVisits.create',
  FIELD_VISIT_EDIT: 'fieldVisits.edit',
  FIELD_VISIT_DELETE: 'fieldVisits.delete',

  // --- Procurement ----------------------------------------------------------
  PROCUREMENT_PLAN_VIEW: 'procurementPlans.view',
  PROCUREMENT_PLAN_CREATE: 'procurementPlans.create',
  PROCUREMENT_PLAN_EDIT: 'procurementPlans.edit',
  PROCUREMENT_PLAN_DELETE: 'procurementPlans.delete',
  HARVEST_INSPECTION_VIEW: 'harvestInspections.view',
  HARVEST_INSPECTION_CREATE: 'harvestInspections.create',
  HARVEST_INSPECTION_EDIT: 'harvestInspections.edit',
  HARVEST_INSPECTION_DELETE: 'harvestInspections.delete',
  COLLECTION_VIEW: 'collections.view',
  COLLECTION_CREATE: 'collections.create',
  COLLECTION_EDIT: 'collections.edit',
  COLLECTION_PAYMENT: 'collections.payment',
  COLLECTION_DELETE: 'collections.delete',
  BATCH_VIEW: 'batches.view',

  // --- Warehouse ------------------------------------------------------------
  WAREHOUSE_VIEW: 'warehouses.view',
  WAREHOUSE_CREATE: 'warehouses.create',
  WAREHOUSE_MANAGE: 'warehouses.edit',
  WAREHOUSE_DELETE: 'warehouses.delete',
  STOCK_VIEW: 'stock.view',
  /** Stock in, out, transfer and adjust. One permission, because each writes a
   *  ledger row in the same transaction - they cannot be split apart. */
  STOCK_MUTATE: 'stock.move',
  MOVEMENT_VIEW: 'movements.view',

  // --- Processing & QA ------------------------------------------------------
  PRODUCT_VIEW: 'products.view',
  PRODUCT_CREATE: 'products.create',
  PRODUCT_MANAGE: 'products.edit',
  PRODUCT_DELETE: 'products.delete',
  CATEGORY_VIEW: 'categories.view',
  CATEGORY_CREATE: 'categories.create',
  CATEGORY_MANAGE: 'categories.edit',
  CATEGORY_DELETE: 'categories.delete',
  RECIPE_VIEW: 'recipes.view',
  RECIPE_CREATE: 'recipes.create',
  RECIPE_APPROVE: 'recipes.approve',
  RECIPE_STATUS: 'recipes.status',
  CLEANING_GRADING_VIEW: 'cleaning.view',
  CLEANING_GRADING_CREATE: 'cleaning.create',
  PRODUCTION_BATCH_VIEW: 'production.view',
  PRODUCTION_BATCH_CREATE: 'production.create',
  PRODUCTION_BATCH_COMPLETE: 'production.complete',
  PRODUCTION_BATCH_STATUS: 'production.status',
  PRODUCTION_BATCH_EDIT: 'production.edit',
  PRODUCTION_BATCH_DELETE: 'production.delete',
  QUALITY_VIEW: 'quality.view',
  QUALITY_INSPECT: 'quality.create',
  QUALITY_RELEASE: 'quality.release',
  PACKAGING_VIEW: 'finishedGoods.view',
  PACKAGING_CREATE: 'finishedGoods.create',
  PACKAGING_STOCK_IN: 'finishedGoods.stockIn',
  SUPPLY_CHAIN_YIELD_VIEW: 'supplyChain.yieldView',

  // --- Sales ----------------------------------------------------------------
  CUSTOMER_VIEW: 'customers.view',
  CUSTOMER_CREATE: 'customers.create',
  CUSTOMER_EDIT: 'customers.edit',
  CUSTOMER_STATUS: 'customers.status',
  PRICE_VIEW: 'priceLists.view',
  PRICE_CREATE: 'priceLists.create',
  PRICE_SUPERSEDE: 'priceLists.supersede',
  PRICE_STATUS: 'priceLists.status',
  ORDER_VIEW: 'orders.view',
  ORDER_CREATE: 'orders.create',
  ORDER_CONFIRM: 'orders.confirm',
  ORDER_ALLOCATE: 'orders.allocate',
  ORDER_PACK: 'orders.pack',
  ORDER_DISPATCH: 'orders.dispatch',
  ORDER_DELIVER: 'orders.deliver',
  ORDER_CANCEL: 'orders.cancel',
  ORDER_PAYMENT: 'orders.payment',

  // --- Storefront -------------------------------------------------------------
  CUSTOMER_ACCOUNT_VIEW: 'customerAccounts.view',
  CUSTOMER_ACCOUNT_REVIEW: 'customerAccounts.review',
  CHECKOUT_SETTINGS_VIEW: 'checkoutSettings.view',
  CHECKOUT_SETTINGS_MANAGE: 'checkoutSettings.manage',
  COUPONS_VIEW: 'coupons.view',
  COUPONS_MANAGE: 'coupons.manage',
  LOYALTY_VIEW: 'loyalty.view',
  LOYALTY_MANAGE: 'loyalty.manage',
  ORDER_RETURN: 'orders.return',
  REFERRAL_SETTINGS_VIEW: 'referralSettings.view',
  REFERRAL_SETTINGS_MANAGE: 'referralSettings.manage',
  REFERRALS_VIEW: 'referrals.view',
  REFERRALS_ADJUST: 'referrals.adjust',
  WALLET_VIEW: 'wallet.view',
  WALLET_MANAGE: 'wallet.manage',
  BANNER_VIEW: 'banners.view',
  BANNER_CREATE: 'banners.create',
  BANNER_MANAGE: 'banners.edit',
  BANNER_DELETE: 'banners.delete',
  SCHEME_VIEW: 'schemes.view',
  SCHEME_CREATE: 'schemes.create',
  SCHEME_MANAGE: 'schemes.edit',
  SCHEME_DELETE: 'schemes.delete',

  // --- Screens with no endpoint of their own --------------------------------
  DASHBOARD_VIEW: 'dashboard.view',
  TRACE_VIEW: 'trace.view',
  RECALL_VIEW: 'recall.view',
  RECALL_MANAGE: 'recall.manage',
  FIELD_PANEL: 'field.panel',
  ONBOARDING_PANEL: 'onboarding.panel',
  UPLOAD: 'uploads.create',
} as const satisfies Record<string, string>;

export type Permission = keyof typeof PERMISSIONS;

/** The server-side key a panel permission name resolves to. */
export function permissionKey(permission: Permission): string {
  return PERMISSIONS[permission];
}
