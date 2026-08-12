import { api } from './client';
import { pruneEmpty, unwrap, unwrapList, type Paginated } from './envelope';
import type {
  CreateFarmerInput,
  Farmer,
  FarmerCodes,
  FarmerDetail,
  FarmerQuery,
  SettableFarmerStatus,
  VerifyFarmerInput,
} from './types';

export const farmersApi = {
  async list(query: FarmerQuery): Promise<Paginated<Farmer>> {
    // pruneEmpty matters here: the endpoint validates query params with
    // forbidNonWhitelisted, and an untouched antd filter sends "".
    const response = await api.get<Farmer[]>('/farmers', { params: pruneEmpty(query) });
    return unwrapList<Farmer>(response.data);
  },

  async get(id: string): Promise<FarmerDetail> {
    const response = await api.get<FarmerDetail>(`/farmers/${id}`);
    return unwrap<FarmerDetail>(response.data);
  },

  async create(input: CreateFarmerInput): Promise<Farmer> {
    const response = await api.post<Farmer>('/farmers', pruneEmpty(input));
    return unwrap<Farmer>(response.data);
  },

  /**
   * FRD 5.1 - Super Admin only. Approving mints the SVV-YYYY-NNNNNN
   * traceability code, so the response is worth showing back to the user.
   */
  async verify(id: string, input: VerifyFarmerInput): Promise<Farmer> {
    const response = await api.patch<Farmer>(`/farmers/${id}/verify`, pruneEmpty(input));
    return unwrap<Farmer>(response.data);
  },

  async setStatus(id: string, status: SettableFarmerStatus): Promise<Farmer> {
    const response = await api.patch<Farmer>(`/farmers/${id}/status`, { status });
    return unwrap<Farmer>(response.data);
  },

  /** Only available once approved - the endpoint 400s without a farmerCode. */
  async codes(id: string): Promise<FarmerCodes> {
    const response = await api.get<FarmerCodes>(`/farmers/${id}/codes`);
    return unwrap<FarmerCodes>(response.data);
  },
};
