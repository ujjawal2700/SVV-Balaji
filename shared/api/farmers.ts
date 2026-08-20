import { api } from './client';
import { pruneEmpty, unwrap, unwrapList, type Paginated } from './envelope';
import type {
  CreateFarmerInput,
  Farmer,
  FarmerCodes,
  FarmerDetail,
  FarmerPerformance,
  FarmerQuery,
  RegistrationReadiness,
  SettableFarmerStatus,
  UpdateFarmerInput,
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
   * Correcting registration details. Not a status change - status moves through
   * `verify` and `setStatus`, which is what writes the verification log.
   */
  async update(id: string, input: UpdateFarmerInput): Promise<Farmer> {
    const response = await api.patch<Farmer>(`/farmers/${id}`, pruneEmpty(input));
    return unwrap<Farmer>(response.data);
  },

  /**
   * Only ever succeeds on an unapproved farmer with nothing recorded against
   * them. Once a traceability code has been issued the server refuses outright,
   * because the code is drawn from an atomic counter and never reissued.
   */
  async remove(id: string): Promise<void> {
    await api.delete(`/farmers/${id}`);
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

  /**
   * FRD 7.6 performance, recomputed live from the farmer's own records.
   *
   * Live rather than reading the stored columns on purpose: the stored rating
   * exists so FRD 7.4 can filter in SQL, but the breakdown a person reads
   * should never be a cached number they cannot reconcile against the
   * inspections in front of them.
   */
  async performance(id: string): Promise<FarmerPerformance> {
    const response = await api.get<FarmerPerformance>(`/farmers/${id}/performance`);
    return unwrap<FarmerPerformance>(response.data);
  },

  /** What FRD 7.1 still wants before this farmer can be approved. */
  async readiness(id: string): Promise<RegistrationReadiness> {
    const response = await api.get<RegistrationReadiness>(`/farmers/${id}/readiness`);
    return unwrap<RegistrationReadiness>(response.data);
  },

  /** Force a recalculation. For backfilling farmers whose records predate scoring. */
  async recalculatePerformance(id: string): Promise<FarmerPerformance> {
    const response = await api.post<FarmerPerformance>(`/farmers/${id}/performance/recalculate`);
    return unwrap<FarmerPerformance>(response.data);
  },
};
