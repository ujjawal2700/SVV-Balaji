import { api } from './client';
import { pruneEmpty, unwrap, unwrapList, type Paginated } from './envelope';
import type {
  BatchStatus,
  BatchTrace,
  CreateCollectionInput,
  PaymentStatus,
  RawMaterialBatch,
  RawMaterialCollection,
  UpdateCollectionInput,
} from './types';

export const collectionsApi = {
  async list(filters: {
    farmerId?: string;
    branchId?: string;
  }): Promise<Paginated<RawMaterialCollection>> {
    const response = await api.get<RawMaterialCollection[]>('/collections', {
      params: pruneEmpty(filters),
    });
    return unwrapList<RawMaterialCollection>(response.data);
  },

  async get(id: string): Promise<RawMaterialCollection> {
    const response = await api.get<RawMaterialCollection>(`/collections/${id}`);
    return unwrap<RawMaterialCollection>(response.data);
  },

  /**
   * Records the collection AND mints its raw material batch in one server-side
   * transaction — this is the single point where the chain extends
   * Farmer → Collection → Batch, so the response carries the new batch number.
   */
  async create(input: CreateCollectionInput): Promise<RawMaterialCollection> {
    const response = await api.post<RawMaterialCollection>('/collections', pruneEmpty(input));
    return unwrap<RawMaterialCollection>(response.data);
  },

  async setPaymentStatus(
    id: string,
    paymentStatus: PaymentStatus,
  ): Promise<RawMaterialCollection> {
    const response = await api.patch<RawMaterialCollection>(
      `/collections/${id}/payment-status`,
      { paymentStatus },
    );
    return unwrap<RawMaterialCollection>(response.data);
  },

  /**
   * Weights and rate only, and only while the batch is untouched. A net weight
   * change reaches the batch quantity, the warehouse stock line and the
   * movement ledger in one server-side transaction — which is why this is a
   * single call rather than the screen doing three.
   */
  async update(id: string, input: UpdateCollectionInput): Promise<RawMaterialCollection> {
    const response = await api.patch<RawMaterialCollection>(
      `/collections/${id}`,
      pruneEmpty(input),
    );
    return unwrap<RawMaterialCollection>(response.data);
  },

  /** Deletes the batch, its stock line and its receipt movement with it. */
  async remove(id: string): Promise<void> {
    await api.delete(`/collections/${id}`);
  },
};

export const batchesApi = {
  async list(filters: {
    farmerId?: string;
    status?: BatchStatus;
    warehouseId?: string;
  }): Promise<Paginated<RawMaterialBatch>> {
    const response = await api.get<RawMaterialBatch[]>('/batches', {
      params: pruneEmpty(filters),
    });
    return unwrapList<RawMaterialBatch>(response.data);
  },

  /** FRD 15.3 — walks a batch back to the farmer, the inspection and its stock history. */
  async trace(batchNumber: string): Promise<BatchTrace> {
    const response = await api.get<BatchTrace>(
      `/batches/${encodeURIComponent(batchNumber)}/trace`,
    );
    return unwrap<BatchTrace>(response.data);
  },
};
