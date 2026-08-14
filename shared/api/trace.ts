import { api } from './client';
import { unwrap } from './envelope';
import type { FinishedGoodsTrace } from './types';

export const traceApi = {
  /**
   * The consumer QR destination, read from inside the panel.
   *
   * A finished-goods batch number resolves to the production run, the recipe
   * version used, every quality inspection it passed, and the farmers whose raw
   * material went into it. This is the whole promise of the system in one
   * request.
   */
  async finishedGoods(fgBatchNumber: string): Promise<FinishedGoodsTrace> {
    const response = await api.get<FinishedGoodsTrace>(
      `/trace/${encodeURIComponent(fgBatchNumber)}`,
    );
    return unwrap<FinishedGoodsTrace>(response.data);
  },
};
