import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { productionApi, productsApi, recipesApi } from '../api/production';
import { queryKeys } from '../api/queryKeys';
import type {
  CreateCleaningGradingInput,
  CreateProductInput,
  CreateProductionBatchInput,
  CreateRecipeInput,
  ProductionStatus,
  RecipeStatus,
  UpdateProductInput,
} from '../api/types';

// --- Products ---------------------------------------------------------------

export function useProducts(includeInactive = false) {
  return useQuery({
    queryKey: queryKeys.products.list(includeInactive),
    queryFn: () => productsApi.list(includeInactive),
    staleTime: 5 * 60 * 1000, // master data, feeds pickers
  });
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.products.detail(id ?? ''),
    queryFn: () => productsApi.get(id as string),
    enabled: Boolean(id),
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProductInput) => productsApi.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProductInput }) =>
      productsApi.update(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      // Recipes render the product name, so a rename has to reach them too.
      void queryClient.invalidateQueries({ queryKey: queryKeys.recipes.all });
    },
  });
}

export function useSetProductActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      productsApi.setActive(id, isActive),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => productsApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
  });
}

// --- Recipes ----------------------------------------------------------------

export function useRecipes(filters: {
  status?: RecipeStatus;
  productId?: string;
  recipeCode?: string;
}) {
  return useQuery({
    queryKey: queryKeys.recipes.list(filters),
    queryFn: () => recipesApi.list(filters),
    placeholderData: keepPreviousData,
  });
}

export function useRecipeVersions(recipeCode: string | undefined) {
  return useQuery({
    queryKey: queryKeys.recipes.versions(recipeCode ?? ''),
    queryFn: () => recipesApi.versions(recipeCode as string),
    enabled: Boolean(recipeCode),
  });
}

export function useCreateRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRecipeInput) => recipesApi.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.recipes.all });
      // A product's recipe list is embedded in GET /products/:id.
      void queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
  });
}

/** Approving retires the previously approved version of the same code. */
export function useApproveRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => recipesApi.approve(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.recipes.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
  });
}

export function useSetRecipeStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: RecipeStatus }) =>
      recipesApi.setStatus(id, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.recipes.all });
    },
  });
}

// --- Cleaning & grading -----------------------------------------------------

export function useCleaningRecords(rawMaterialBatchId?: string) {
  return useQuery({
    queryKey: queryKeys.cleaning.list(rawMaterialBatchId),
    queryFn: () => productionApi.listCleaning(rawMaterialBatchId),
    placeholderData: keepPreviousData,
  });
}

export function useCreateCleaningRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCleaningGradingInput) => productionApi.createCleaning(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.cleaning.all });
    },
  });
}

// --- Production batches -----------------------------------------------------

export function useProductionBatches(filters: {
  status?: ProductionStatus;
  branchId?: string;
  productId?: string;
}) {
  return useQuery({
    queryKey: queryKeys.productionBatches.list(filters),
    queryFn: () => productionApi.listBatches(filters),
    placeholderData: keepPreviousData,
  });
}

export function useProductionBatch(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.productionBatches.detail(id ?? ''),
    queryFn: () => productionApi.getBatch(id as string),
    enabled: Boolean(id),
  });
}

/**
 * Creating a run consumes raw material: it decrements warehouse stock, writes
 * ledger rows and flips the source batches to UNDER_PRODUCTION. So it
 * invalidates the whole warehouse and batch trees too.
 */
export function useCreateProductionBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProductionBatchInput) => productionApi.createBatch(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.productionBatches.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.warehouses.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.batches.all });
    },
  });
}

export function useUpdateProductionBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CreateProductionBatchInput> }) =>
      productionApi.updateBatch(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.productionBatches.all });
    },
  });
}

export function useDeleteProductionBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => productionApi.deleteBatch(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.productionBatches.all });
      // Invalidation is required because stock movements / status on raw material might have reverted.
      void queryClient.invalidateQueries({ queryKey: queryKeys.batches.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.warehouses.all });
    },
  });
}

export function useCompleteProduction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, actualQuantity }: { id: string; actualQuantity: number }) =>
      productionApi.complete(id, actualQuantity),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.productionBatches.all });
    },
  });
}

export function useSetProductionStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ProductionStatus }) =>
      productionApi.setBatchStatus(id, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.productionBatches.all });
    },
  });
}
