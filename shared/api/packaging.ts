import { api } from './client';
import { pruneEmpty, unwrap, unwrapList, type Paginated } from './envelope';
import type {
  CreateFinishedGoodsBatchInput,
  FinishedGoodsBatch,
  FinishedGoodsStockRow,
  ProductLabel,
  StockFinishedGoodsInput,
} from './types';

export const packagingApi = {
  async list(filters: {
    productionBatchId?: string;
    qaReleased?: boolean;
  }): Promise<Paginated<FinishedGoodsBatch>> {
    const response = await api.get<FinishedGoodsBatch[]>('/finished-goods', {
      params: pruneEmpty(filters),
    });
    return unwrapList<FinishedGoodsBatch>(response.data);
  },

  /**
   * Packages a completed run. The server refuses to pack more than the run
   * actually yielded, counting what has already been packed from it.
   */
  async create(input: CreateFinishedGoodsBatchInput): Promise<FinishedGoodsBatch> {
    const response = await api.post<FinishedGoodsBatch>('/finished-goods', pruneEmpty(input));
    return unwrap<FinishedGoodsBatch>(response.data);
  },

  /** FRD 22.2 — print-ready label with QR and barcode, generated server-side. */
  async label(id: string): Promise<ProductLabel> {
    const response = await api.get<ProductLabel>(`/finished-goods/${id}/label`);
    return unwrap<ProductLabel>(response.data);
  },

  /** Only QA-released batches may be stocked (FRD 21.5). */
  async stockIn(id: string, input: StockFinishedGoodsInput): Promise<FinishedGoodsStockRow> {
    const response = await api.post<FinishedGoodsStockRow>(
      `/finished-goods/${id}/stock`,
      pruneEmpty(input),
    );
    return unwrap<FinishedGoodsStockRow>(response.data);
  },

  async stock(warehouseId?: string): Promise<Paginated<FinishedGoodsStockRow>> {
    const response = await api.get<FinishedGoodsStockRow[]>('/finished-goods-stock', {
      params: pruneEmpty({ warehouseId }),
    });
    return unwrapList<FinishedGoodsStockRow>(response.data);
  },
};
