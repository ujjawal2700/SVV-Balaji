import { api } from './client';
import { pruneEmpty, unwrap, unwrapList, type Paginated } from './envelope';
import type {
  AdjustStockInput,
  CreateWarehouseInput,
  LowStockResult,
  StockInInput,
  StockMovement,
  StockOutInput,
  TransferStockInput,
  UpdateWarehouseInput,
  Warehouse,
  WarehouseStatus,
  WarehouseStock,
} from './types';

export const warehousesApi = {
  // --- Master (FRD Section 16) ----------------------------------------------

  /**
   * Closed warehouses are excluded server-side unless `includeInactive` is
   * passed. The pickers rely on that; the warehouse master screen passes it,
   * because otherwise closing a warehouse would hide it from the only screen
   * able to reopen it.
   */
  async list(branchId?: string, includeInactive?: boolean): Promise<Paginated<Warehouse>> {
    const response = await api.get<Warehouse[]>('/warehouses', {
      params: pruneEmpty({ branchId, includeInactive: includeInactive || undefined }),
    });
    return unwrapList<Warehouse>(response.data);
  },

  async get(id: string): Promise<Warehouse> {
    const response = await api.get<Warehouse>(`/warehouses/${id}`);
    return unwrap<Warehouse>(response.data);
  },

  async create(input: CreateWarehouseInput): Promise<Warehouse> {
    const response = await api.post<Warehouse>('/warehouses', pruneEmpty(input));
    return unwrap<Warehouse>(response.data);
  },

  async update(id: string, input: UpdateWarehouseInput): Promise<Warehouse> {
    const response = await api.patch<Warehouse>(`/warehouses/${id}`, pruneEmpty(input));
    return unwrap<Warehouse>(response.data);
  },

  /** Refused by the server while the warehouse still holds stock. */
  async setActive(id: string, isActive: boolean): Promise<Warehouse> {
    const response = await api.patch<Warehouse>(`/warehouses/${id}/active`, { isActive });
    return unwrap<Warehouse>(response.data);
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/warehouses/${id}`);
  },

  /** FRD 16.6 — live occupancy against capacity. See the caveat on WarehouseStatus. */
  async status(id: string): Promise<WarehouseStatus> {
    const response = await api.get<WarehouseStatus>(`/warehouses/${id}/status`);
    return unwrap<WarehouseStatus>(response.data);
  },

  // --- Stock (FRD 16.7 / 17.1) ----------------------------------------------

  async stock(filters: {
    warehouseId?: string;
    batchId?: string;
  }): Promise<Paginated<WarehouseStock>> {
    const response = await api.get<WarehouseStock[]>('/warehouses/stock', {
      params: pruneEmpty(filters),
    });
    return unwrapList<WarehouseStock>(response.data);
  },

  /** FRD 17.4 — this one returns its own shape, not a bare array. */
  async lowStock(threshold: number, warehouseId?: string): Promise<LowStockResult> {
    const response = await api.get<LowStockResult>('/warehouses/stock/low', {
      params: pruneEmpty({ threshold, warehouseId }),
    });
    return unwrap<LowStockResult>(response.data);
  },

  /** FRD 17.3 / 17.5 — the append-only audit trail. */
  async movements(filters: {
    batchId?: string;
    warehouseId?: string;
  }): Promise<Paginated<StockMovement>> {
    const response = await api.get<StockMovement[]>('/warehouses/movements', {
      params: pruneEmpty(filters),
    });
    return unwrapList<StockMovement>(response.data);
  },

  // --- Mutations ------------------------------------------------------------
  //
  // Each of these writes a StockMovement row in the same transaction as the
  // balance change, so the ledger and the on-hand figure can never drift.

  async stockIn(warehouseId: string, input: StockInInput): Promise<WarehouseStock> {
    const response = await api.post<WarehouseStock>(
      `/warehouses/${warehouseId}/stock-in`,
      pruneEmpty(input),
    );
    return unwrap<WarehouseStock>(response.data);
  },

  async stockOut(warehouseId: string, input: StockOutInput): Promise<WarehouseStock> {
    const response = await api.post<WarehouseStock>(
      `/warehouses/${warehouseId}/stock-out`,
      pruneEmpty(input),
    );
    return unwrap<WarehouseStock>(response.data);
  },

  async adjust(warehouseId: string, input: AdjustStockInput): Promise<WarehouseStock> {
    const response = await api.post<WarehouseStock>(
      `/warehouses/${warehouseId}/adjust`,
      pruneEmpty(input),
    );
    return unwrap<WarehouseStock>(response.data);
  },

  /** FRD 16.4 — batch identity is preserved across the move. */
  async transfer(input: TransferStockInput): Promise<StockMovement> {
    const response = await api.post<StockMovement>('/warehouses/transfer', pruneEmpty(input));
    return unwrap<StockMovement>(response.data);
  },
};
