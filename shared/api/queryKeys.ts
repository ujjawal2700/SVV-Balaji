import type { CustomerAccountQuery, CustomerQuery, FarmerQuery, OrderQuery, PriceListQuery, ReferralQuery } from './types';

/**
 * Every React Query key in the app, in one hierarchy.
 *
 * This exists because ad-hoc key strings are how cache invalidation quietly
 * stops working once there are twenty screens. Keys are built as prefixes, so a
 * mutation can invalidate a whole resource with `queryKeys.farmers.all` without
 * knowing which filter combinations happen to be cached.
 *
 * Rule: no component may write a literal query key. Add it here.
 */
export const queryKeys = {
  branches: {
    all: ['branches'] as const,
    // activeOnly is part of the key: the pickers ask for active branches only,
    // the master screen asks for all of them, and the two must not overwrite
    // each other in the cache.
    list: (activeOnly = false) => [...queryKeys.branches.all, 'list', activeOnly] as const,
    detail: (id: string) => [...queryKeys.branches.all, 'detail', id] as const,
    // FRD 6.4/6.5. The period is part of the key: two date ranges are two
    // different answers and must not overwrite each other in the cache.
    performance: (id: string, query: object = {}) =>
      [...queryKeys.branches.all, 'performance', id, query] as const,
    consolidated: (query: object = {}) =>
      [...queryKeys.branches.all, 'performance', 'all', query] as const,
  },

  users: {
    all: ['users'] as const,
    list: (filters: { branchId?: string; status?: string } = {}) =>
      [...queryKeys.users.all, 'list', filters] as const,
    detail: (id: string) => [...queryKeys.users.all, 'detail', id] as const,
  },

  farmers: {
    all: ['farmers'] as const,
    // The filter object is part of the key, so each filter combination caches
    // separately and switching back to a previous filter is instant.
    list: (query: FarmerQuery) => [...queryKeys.farmers.all, 'list', query] as const,
    detail: (id: string) => [...queryKeys.farmers.all, 'detail', id] as const,
    codes: (id: string) => [...queryKeys.farmers.all, 'codes', id] as const,
    // FRD 7.6. Under the farmer tree so any farmer mutation refreshes the
    // score too - an inspection or collection changes both.
    performance: (id: string) => [...queryKeys.farmers.all, 'performance', id] as const,
    readiness: (id: string) => [...queryKeys.farmers.all, 'readiness', id] as const,
  },

  agreements: {
    all: ['agreements'] as const,
    list: (farmerId?: string) => [...queryKeys.agreements.all, 'list', farmerId ?? null] as const,
    detail: (id: string) => [...queryKeys.agreements.all, 'detail', id] as const,
  },

  seedDistribution: {
    all: ['seed-distribution'] as const,
    list: (filters: Record<string, unknown> = {}) =>
      [...queryKeys.seedDistribution.all, 'list', filters] as const,
  },

  training: {
    all: ['training-sessions'] as const,
    list: (filters: Record<string, unknown> = {}) =>
      [...queryKeys.training.all, 'list', filters] as const,
    detail: (id: string) => [...queryKeys.training.all, 'detail', id] as const,
  },

  fieldVisits: {
    all: ['field-visits'] as const,
    list: (filters: Record<string, unknown> = {}) =>
      [...queryKeys.fieldVisits.all, 'list', filters] as const,
    detail: (id: string) => [...queryKeys.fieldVisits.all, 'detail', id] as const,
  },

  // --- Zone 2 ---------------------------------------------------------------

  warehouses: {
    all: ['warehouses'] as const,
    list: (branchId?: string, includeInactive = false) =>
      [...queryKeys.warehouses.all, 'list', branchId ?? null, includeInactive] as const,
    status: (id: string) => [...queryKeys.warehouses.all, 'status', id] as const,
    // Stock and movements live under the warehouses tree on purpose: a stock
    // mutation changes the balance, the ledger AND the occupancy figure, so one
    // invalidation of `warehouses.all` refreshes all three.
    stock: (filters: Record<string, unknown>) =>
      [...queryKeys.warehouses.all, 'stock', filters] as const,
    lowStock: (threshold: number, warehouseId?: string) =>
      [...queryKeys.warehouses.all, 'low-stock', threshold, warehouseId ?? null] as const,
    movements: (filters: Record<string, unknown>) =>
      [...queryKeys.warehouses.all, 'movements', filters] as const,
  },

  procurementPlans: {
    all: ['procurement-plans'] as const,
    list: (filters: Record<string, unknown>) =>
      [...queryKeys.procurementPlans.all, 'list', filters] as const,
  },

  inspections: {
    all: ['harvest-inspections'] as const,
    list: (filters: Record<string, unknown>) =>
      [...queryKeys.inspections.all, 'list', filters] as const,
    detail: (id: string) => [...queryKeys.inspections.all, 'detail', id] as const,
  },

  collections: {
    all: ['collections'] as const,
    list: (filters: Record<string, unknown>) =>
      [...queryKeys.collections.all, 'list', filters] as const,
    detail: (id: string) => [...queryKeys.collections.all, 'detail', id] as const,
  },

  batches: {
    all: ['batches'] as const,
    list: (filters: Record<string, unknown>) => [...queryKeys.batches.all, 'list', filters] as const,
    trace: (batchNumber: string) => [...queryKeys.batches.all, 'trace', batchNumber] as const,
  },

  recall: {
    all: ['recall'] as const,
    forward: (code: string) => [...queryKeys.recall.all, 'forward', code] as const,
    backward: (fg: string) => [...queryKeys.recall.all, 'backward', fg] as const,
  },

  trace: {
    all: ['trace'] as const,
    finishedGoods: (fgBatchNumber: string) =>
      [...queryKeys.trace.all, 'fg', fgBatchNumber] as const,
  },

  // --- Zone 3 ---------------------------------------------------------------

  products: {
    all: ['products'] as const,
    list: (includeInactive = false) =>
      [...queryKeys.products.all, 'list', includeInactive] as const,
    detail: (id: string) => [...queryKeys.products.all, 'detail', id] as const,
    stockSummary: () => [...queryKeys.products.all, 'stock-summary'] as const,
  },

  // Unauthenticated storefront catalogue. Its own root, not under `products`:
  // saving a product in the admin invalidates `products.all`, and the
  // storefront cache must not be dragged along by that (or the reverse).
  storefrontCatalogue: {
    all: ['storefront-catalogue'] as const,
    list: (query: object) => [...queryKeys.storefrontCatalogue.all, 'list', query] as const,
    detail: (idOrSlug: string, channel: string) =>
      [...queryKeys.storefrontCatalogue.all, 'detail', idOrSlug, channel] as const,
  },

  categories: {
    all: ['categories'] as const,
    list: (includeInactive = false) =>
      [...queryKeys.categories.all, 'list', includeInactive] as const,
    detail: (id: string) => [...queryKeys.categories.all, 'detail', id] as const,
    // Unauthenticated storefront tree, separate cache entry from the admin list.
    storefront: () => [...queryKeys.categories.all, 'storefront'] as const,
  },

  banners: {
    all: ['banners'] as const,
    list: (includeInactive = false) =>
      [...queryKeys.banners.all, 'list', includeInactive] as const,
    detail: (id: string) => [...queryKeys.banners.all, 'detail', id] as const,
    // Separate from the admin list above - unauthenticated, filtered by
    // placement/audience, and cached on its own so a customer session and an
    // admin session open in the same browser never share a cache entry.
    storefront: (placement: string, audience?: string) =>
      [...queryKeys.banners.all, 'storefront', placement, audience ?? null] as const,
  },

  schemes: {
    all: ['schemes'] as const,
    list: (includeInactive = false) =>
      [...queryKeys.schemes.all, 'list', includeInactive] as const,
    detail: (id: string) => [...queryKeys.schemes.all, 'detail', id] as const,
    storefront: (audience?: string) =>
      [...queryKeys.schemes.all, 'storefront', audience ?? null] as const,
  },

  recipes: {
    all: ['recipes'] as const,
    list: (filters: Record<string, unknown>) => [...queryKeys.recipes.all, 'list', filters] as const,
    detail: (id: string) => [...queryKeys.recipes.all, 'detail', id] as const,
    versions: (recipeCode: string) => [...queryKeys.recipes.all, 'versions', recipeCode] as const,
  },

  cleaning: {
    all: ['cleaning-grading'] as const,
    list: (rawMaterialBatchId?: string) =>
      [...queryKeys.cleaning.all, 'list', rawMaterialBatchId ?? null] as const,
  },

  productionBatches: {
    all: ['production-batches'] as const,
    list: (filters: Record<string, unknown>) =>
      [...queryKeys.productionBatches.all, 'list', filters] as const,
    detail: (id: string) => [...queryKeys.productionBatches.all, 'detail', id] as const,
  },

  quality: {
    all: ['quality-inspections'] as const,
    list: (filters: Record<string, unknown>) => [...queryKeys.quality.all, 'list', filters] as const,
  },

  /**
   * Plots hang off the farmer they belong to, so the key nests under the
   * farmer's id. That makes `farmPlots.all(id)` a prefix of nothing else and
   * lets a plot mutation invalidate one farmer's plots without touching
   * another's.
   */
  farmPlots: {
    all: (farmerId: string) => ['farmers', farmerId, 'plots'] as const,
    list: (farmerId: string, includeInactive: boolean) =>
      [...queryKeys.farmPlots.all(farmerId), 'list', includeInactive] as const,
    summary: (farmerId: string) => [...queryKeys.farmPlots.all(farmerId), 'summary'] as const,
  },

  permissions: {
    all: ['permissions'] as const,
    registry: () => [...queryKeys.permissions.all, 'registry'] as const,
    matrix: () => [...queryKeys.permissions.all, 'matrix'] as const,
  },

  yieldTracking: {
    all: ['yield-tracking'] as const,
    list: (filters: Record<string, unknown>) =>
      [...queryKeys.yieldTracking.all, 'list', filters] as const,
    chain: (args: { productionBatchId?: string; fgBatchNumber?: string }) =>
      [...queryKeys.yieldTracking.all, 'chain', args] as const,
    farmerQuality: () => [...queryKeys.yieldTracking.all, 'farmer-quality'] as const,
    machineHealth: () => [...queryKeys.yieldTracking.all, 'machine-health'] as const,
  },

  finishedGoods: {
    all: ['finished-goods'] as const,
    list: (filters: Record<string, unknown>) =>
      [...queryKeys.finishedGoods.all, 'list', filters] as const,
    label: (id: string) => [...queryKeys.finishedGoods.all, 'label', id] as const,
    stock: (warehouseId?: string) =>
      [...queryKeys.finishedGoods.all, 'stock', warehouseId ?? null] as const,
  },

  // --- Zone 4 ---------------------------------------------------------------

  customers: {
    all: ['customers'] as const,
    list: (query: CustomerQuery) => [...queryKeys.customers.all, 'list', query] as const,
    detail: (id: string) => [...queryKeys.customers.all, 'detail', id] as const,
    // Credit moves whenever an order is confirmed or paid, not only when the
    // customer record is edited - so it is its own key and gets invalidated by
    // order mutations too.
    credit: (id: string) => [...queryKeys.customers.all, 'credit', id] as const,
  },

  customerAccounts: {
    all: ['customer-accounts'] as const,
    list: (query: CustomerAccountQuery) =>
      [...queryKeys.customerAccounts.all, 'list', query] as const,
  },

  referralSettings: {
    all: ['referral-settings'] as const,
  },

  supportSettings: {
    all: ['support-settings'] as const,
    storefront: (channel?: string) => ['support-settings', 'storefront', channel ?? 'all'] as const,
  },

  loyalty: {
    all: ['loyalty'] as const,
    settings: ['loyalty', 'settings'] as const,
    eligibilityAll: ['loyalty', 'eligibility'] as const,
    eligibility: (productEligibility: string, categoryId: string) =>
      ['loyalty', 'eligibility', productEligibility, categoryId] as const,
    order: (orderNumber: string) => ['loyalty', 'order', orderNumber] as const,
  },

  referrals: {
    all: ['referrals'] as const,
    list: (query: ReferralQuery) => [...queryKeys.referrals.all, 'list', query] as const,
    ledger: (customerId: string) => [...queryKeys.referrals.all, 'ledger', customerId] as const,
  },

  priceLists: {
    all: ['price-lists'] as const,
    list: (query: PriceListQuery) => [...queryKeys.priceLists.all, 'list', query] as const,
    comparison: (productId: string) =>
      [...queryKeys.priceLists.all, 'comparison', productId] as const,
  },

  orders: {
    all: ['orders'] as const,
    list: (query: OrderQuery) => [...queryKeys.orders.all, 'list', query] as const,
    detail: (id: string) => [...queryKeys.orders.all, 'detail', id] as const,
    traceability: (orderNumber: string) =>
      [...queryKeys.orders.all, 'traceability', orderNumber] as const,
  },
} as const;
