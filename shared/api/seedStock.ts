import { api } from './client';
import { pruneEmpty, unwrap, unwrapList, type Paginated } from './envelope';
import type {
  ReceiveSeedStockInput,
  SeedStockLot,
  SeedStockLotDetail,
  SeedStockQuery,
  UpdateSeedStockInput,
} from './types';

/** FRD 10.2 seed & input stock. Handouts deduct from it via seedDistributionApi. */
export const seedStockApi = {
  async list(query: SeedStockQuery = {}): Promise<Paginated<SeedStockLot>> {
    const response = await api.get<SeedStockLot[]>('/seed-stock', {
      params: pruneEmpty({
        branchId: query.branchId,
        includeInactive: query.includeInactive ? 'true' : undefined,
        availableOnly: query.availableOnly ? 'true' : undefined,
      }),
    });
    return unwrapList<SeedStockLot>(response.data);
  },

  async get(id: string): Promise<SeedStockLotDetail> {
    const response = await api.get<SeedStockLotDetail>(`/seed-stock/${id}`);
    return unwrap<SeedStockLotDetail>(response.data);
  },

  async receive(input: ReceiveSeedStockInput): Promise<SeedStockLot> {
    const response = await api.post<SeedStockLot>('/seed-stock', pruneEmpty(input));
    return unwrap<SeedStockLot>(response.data);
  },

  async topUp(id: string, quantity: number, reason?: string): Promise<SeedStockLot> {
    const response = await api.post<SeedStockLot>(`/seed-stock/${id}/receive`, pruneEmpty({ quantity, reason }));
    return unwrap<SeedStockLot>(response.data);
  },

  /**
   * Signed quantity; reason required. `kind` WRITE_OFF records destroyed stock
   * (negative only); ADJUSTMENT is a recount either way.
   */
  async adjust(
    id: string,
    quantity: number,
    reason: string,
    kind: 'ADJUSTMENT' | 'WRITE_OFF' = 'ADJUSTMENT',
  ): Promise<SeedStockLot> {
    const response = await api.post<SeedStockLot>(`/seed-stock/${id}/adjust`, { quantity, reason, kind });
    return unwrap<SeedStockLot>(response.data);
  },

  /** Move stock to another branch; a lot is created there. Both sides are in the ledger. */
  async transfer(
    id: string,
    input: { toBranchId: string; quantity: number; reason?: string },
  ): Promise<{ from: SeedStockLot; to: SeedStockLot }> {
    const response = await api.post<{ from: SeedStockLot; to: SeedStockLot }>(
      `/seed-stock/${id}/transfer`,
      pruneEmpty(input),
    );
    return unwrap<{ from: SeedStockLot; to: SeedStockLot }>(response.data);
  },

  async update(id: string, input: UpdateSeedStockInput): Promise<SeedStockLot> {
    const response = await api.patch<SeedStockLot>(`/seed-stock/${id}`, input);
    return unwrap<SeedStockLot>(response.data);
  },

  /** Refused once anything was issued from the lot - withdraw it instead. */
  async remove(id: string): Promise<void> {
    await api.delete(`/seed-stock/${id}`);
  },
};
