import { api } from './client';
import { pruneEmpty } from './envelope';
import type {
  FarmerYieldQuality,
  MachineYieldHealth,
  YieldChain,
  YieldChainListResult,
  YieldChainQuery,
} from './types';

/**
 * Loss / Yield Tracking (Supply Chain / Processing).
 *
 * Read-only: aggregates figures already recorded by Cleaning & Grading,
 * Production and Finished Goods. The backend returns its own
 * `{ data, page, pageSize, total, totalPages }` shape directly - it is not
 * the `{ data }` / bare-array envelope the rest of the API is mid-migrating
 * to, so this is read straight rather than through `unwrap`/`unwrapList`.
 */
export const yieldTrackingApi = {
  async list(query: YieldChainQuery): Promise<YieldChainListResult> {
    const response = await api.get<YieldChainListResult>('/supply-chain/yield', {
      params: pruneEmpty(query),
    });
    return response.data;
  },

  async chain(args: { productionBatchId?: string; fgBatchNumber?: string }): Promise<YieldChain> {
    const response = await api.get<YieldChain>('/supply-chain/yield/chain', {
      params: pruneEmpty(args),
    });
    return response.data;
  },

  async farmerQuality(): Promise<FarmerYieldQuality[]> {
    const response = await api.get<FarmerYieldQuality[]>('/supply-chain/yield/farmer-quality');
    return response.data;
  },

  async machineHealth(): Promise<MachineYieldHealth[]> {
    const response = await api.get<MachineYieldHealth[]>('/supply-chain/yield/machine-health');
    return response.data;
  },
};
