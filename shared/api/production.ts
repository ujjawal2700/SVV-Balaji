import { api } from './client';
import { pruneEmpty, unwrap, unwrapList, type Paginated } from './envelope';
import type {
  CleaningGradingRecord,
  CompleteProductionInput,
  CreateCleaningGradingInput,
  CreateProductInput,
  CreateProductionBatchInput,
  CreateRecipeInput,
  Product,
  ProductionBatch,
  ProductionStatus,
  ProductStockSummary,
  Recipe,
  RecipeStatus,
  UpdateProductInput,
} from './types';

/**
 * Optional columns an operator can empty out. `pruneEmpty` drops blank strings
 * and nulls in transit - right for a create, where blank means "not provided" -
 * but on an edit it silently keeps the old value, so a Super Admin blanking a
 * disclaimer or an MRP would see the field snap back on the next load.
 *
 * Deliberately a whitelist: name, SKU, unit and slug are required or
 * identity-bearing, and a stray blank must never be read as "clear this".
 */
const CLEARABLE_PRODUCT_FIELDS = [
  'categoryId',
  'description',
  'metaTitle',
  'metaDescription',
  'brand',
  'packLabel',
  'mrp',
  'badge',
  'hsnCode',
  'rating',
  'reviewCount',
  'manufacturer',
  'countryOfOrigin',
  'shelfLife',
  'disclaimer',
  'returnPolicy',
  'warranty',
  'minOrderQuantity',
  'maxOrderQuantity',
  'moqB2B',
  'maxOrderQuantityB2B',
  'packBoxSize',
  'businessSupportContact',
  'deliveryTerms',
] as const;

/** A blank or null on a clearable field becomes an explicit `null`; `undefined` still means "untouched". */
function toProductUpdateBody(input: UpdateProductInput): Record<string, unknown> {
  const body: Record<string, unknown> = { ...pruneEmpty(input) };
  const raw = input as Record<string, unknown>;
  for (const field of CLEARABLE_PRODUCT_FIELDS) {
    const value = raw[field];
    if (value === null || (typeof value === 'string' && value.trim() === '')) {
      body[field] = null;
    }
  }
  return body;
}

export const productsApi = {
  /**
   * Discontinued products are excluded server-side unless `includeInactive` is
   * passed. Recipe and order pickers rely on that; the product master screen
   * passes it so a discontinued product stays visible and can be reinstated.
   */
  async list(includeInactive?: boolean): Promise<Paginated<Product>> {
    const response = await api.get<Product[]>('/products', {
      params: includeInactive ? { includeInactive: true } : undefined,
    });
    return unwrapList<Product>(response.data);
  },

  async get(id: string): Promise<Product> {
    const response = await api.get<Product>(`/products/${id}`);
    return unwrap<Product>(response.data);
  },

  async create(input: CreateProductInput): Promise<Product> {
    const response = await api.post<Product>('/products', pruneEmpty(input));
    return unwrap<Product>(response.data);
  },

  async update(id: string, input: UpdateProductInput): Promise<Product> {
    const response = await api.patch<Product>(`/products/${id}`, toProductUpdateBody(input));
    return unwrap<Product>(response.data);
  },

  /** Discontinuing. Recipes, batches and order history are untouched. */
  async setActive(id: string, isActive: boolean): Promise<Product> {
    const response = await api.patch<Product>(`/products/${id}/active`, { isActive });
    return unwrap<Product>(response.data);
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/products/${id}`);
  },

  /** One row per active product: sellable quantity vs. its reorder/safety thresholds. */
  async stockSummary(): Promise<ProductStockSummary[]> {
    const response = await api.get<ProductStockSummary[]>('/products/stock-summary');
    return unwrapList<ProductStockSummary>(response.data).data;
  },
};

export const recipesApi = {
  async list(filters: {
    status?: RecipeStatus;
    productId?: string;
    recipeCode?: string;
  }): Promise<Paginated<Recipe>> {
    const response = await api.get<Recipe[]>('/recipes', { params: pruneEmpty(filters) });
    return unwrapList<Recipe>(response.data);
  },

  async get(id: string): Promise<Recipe> {
    const response = await api.get<Recipe>(`/recipes/${id}`);
    return unwrap<Recipe>(response.data);
  },

  /** FRD 19.6 — every version of a code, newest first. */
  async versions(recipeCode: string): Promise<Paginated<Recipe>> {
    const response = await api.get<Recipe[]>(
      `/recipes/code/${encodeURIComponent(recipeCode)}/versions`,
    );
    return unwrapList<Recipe>(response.data);
  },

  /**
   * Creating against an existing recipeCode mints a NEW VERSION rather than
   * editing — production batches pin the version they used, so mutating an
   * approved recipe would rewrite the history of everything made from it.
   */
  async create(input: CreateRecipeInput): Promise<Recipe> {
    const response = await api.post<Recipe>('/recipes', pruneEmpty(input));
    return unwrap<Recipe>(response.data);
  },

  /** FRD 19.4 — Super Admin only. Approving retires the previously approved version. */
  async approve(id: string): Promise<Recipe> {
    const response = await api.patch<Recipe>(`/recipes/${id}/approve`, {});
    return unwrap<Recipe>(response.data);
  },

  async setStatus(id: string, status: RecipeStatus): Promise<Recipe> {
    const response = await api.patch<Recipe>(`/recipes/${id}/status`, { status });
    return unwrap<Recipe>(response.data);
  },
};

export const productionApi = {
  // --- Cleaning & grading (FRD Section 18) ---------------------------------

  async listCleaning(rawMaterialBatchId?: string): Promise<Paginated<CleaningGradingRecord>> {
    const response = await api.get<CleaningGradingRecord[]>('/cleaning-grading', {
      params: pruneEmpty({ rawMaterialBatchId }),
    });
    return unwrapList<CleaningGradingRecord>(response.data);
  },

  async createCleaning(input: CreateCleaningGradingInput): Promise<CleaningGradingRecord> {
    const response = await api.post<CleaningGradingRecord>(
      '/cleaning-grading',
      pruneEmpty(input),
    );
    return unwrap<CleaningGradingRecord>(response.data);
  },

  // --- Production batches (FRD Section 20) ---------------------------------

  async listBatches(filters: {
    status?: ProductionStatus;
    branchId?: string;
    productId?: string;
  }): Promise<Paginated<ProductionBatch>> {
    const response = await api.get<ProductionBatch[]>('/production-batches', {
      params: pruneEmpty(filters),
    });
    return unwrapList<ProductionBatch>(response.data);
  },

  async getBatch(id: string): Promise<ProductionBatch> {
    const response = await api.get<ProductionBatch>(`/production-batches/${id}`);
    return unwrap<ProductionBatch>(response.data);
  },

  /**
   * Mints the batch and consumes the named raw material in one transaction.
   *
   * The server refuses an unapproved recipe, a rejected batch, a crop that is
   * not an ingredient of the recipe, insufficient stock, and — for a MULTI_GRAIN
   * recipe — a mix that drifts more than half a percentage point from the
   * approved ratio, or one missing a grain entirely.
   */
  async createBatch(input: CreateProductionBatchInput): Promise<ProductionBatch> {
    const response = await api.post<ProductionBatch>('/production-batches', pruneEmpty(input));
    return unwrap<ProductionBatch>(response.data);
  },

  async updateBatch(id: string, input: Partial<CreateProductionBatchInput>): Promise<ProductionBatch> {
    const response = await api.patch<ProductionBatch>(`/production-batches/${id}`, pruneEmpty(input));
    return unwrap<ProductionBatch>(response.data);
  },

  async deleteBatch(id: string): Promise<void> {
    await api.delete(`/production-batches/${id}`);
  },

  /** FRD 20.5 — records actual output and derives process loss. */
  async complete(id: string, input: CompleteProductionInput): Promise<ProductionBatch> {
    const response = await api.patch<ProductionBatch>(
      `/production-batches/${id}/complete`,
      pruneEmpty(input),
    );
    return unwrap<ProductionBatch>(response.data);
  },

  async setBatchStatus(id: string, status: ProductionStatus): Promise<ProductionBatch> {
    const response = await api.patch<ProductionBatch>(`/production-batches/${id}/status`, {
      status,
    });
    return unwrap<ProductionBatch>(response.data);
  },
};
