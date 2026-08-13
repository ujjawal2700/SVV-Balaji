import { api } from './client';
import { pruneEmpty, unwrap, unwrapList, type Paginated } from './envelope';
import type {
  AddDocumentInput,
  CreateHarvestInspectionInput,
  CreateProcurementPlanInput,
  HarvestInspection,
  HarvestInspectionDocument,
  InspectionResult,
  ProcurementPlan,
  ProcurementPlanStatus,
} from './types';

export const procurementApi = {
  // --- Planning (FRD 13.1) --------------------------------------------------

  async listPlans(filters: {
    branchId?: string;
    status?: ProcurementPlanStatus;
  }): Promise<Paginated<ProcurementPlan>> {
    const response = await api.get<ProcurementPlan[]>('/procurement-plans', {
      params: pruneEmpty(filters),
    });
    return unwrapList<ProcurementPlan>(response.data);
  },

  async createPlan(input: CreateProcurementPlanInput): Promise<ProcurementPlan> {
    const response = await api.post<ProcurementPlan>('/procurement-plans', pruneEmpty(input));
    return unwrap<ProcurementPlan>(response.data);
  },

  async updatePlan(id: string, input: Partial<CreateProcurementPlanInput>): Promise<ProcurementPlan> {
    const response = await api.patch<ProcurementPlan>(
      `/procurement-plans/${id}`,
      pruneEmpty(input),
    );
    return unwrap<ProcurementPlan>(response.data);
  },

  async deletePlan(id: string): Promise<void> {
    await api.delete(`/procurement-plans/${id}`);
  },

  async setPlanStatus(id: string, status: ProcurementPlanStatus): Promise<ProcurementPlan> {
    const response = await api.patch<ProcurementPlan>(`/procurement-plans/${id}/status`, {
      status,
    });
    return unwrap<ProcurementPlan>(response.data);
  },

  // --- Harvest inspection (FRD 13.2 - 13.5) ---------------------------------

  async listInspections(filters: {
    farmerId?: string;
    result?: InspectionResult;
  }): Promise<Paginated<HarvestInspection>> {
    const response = await api.get<HarvestInspection[]>('/harvest-inspections', {
      params: pruneEmpty(filters),
    });
    return unwrapList<HarvestInspection>(response.data);
  },

  async getInspection(id: string): Promise<HarvestInspection> {
    const response = await api.get<HarvestInspection>(`/harvest-inspections/${id}`);
    return unwrap<HarvestInspection>(response.data);
  },

  /**
   * The server refuses an inspection for a farmer who is not ACTIVE and holding
   * a traceability code — without one, nothing collected from them could be
   * traced downstream. The farmer picker on this form is restricted to match.
   */
  async createInspection(input: CreateHarvestInspectionInput): Promise<HarvestInspection> {
    const response = await api.post<HarvestInspection>(
      '/harvest-inspections',
      pruneEmpty(input),
    );
    return unwrap<HarvestInspection>(response.data);
  },

  async updateInspection(id: string, input: Partial<CreateHarvestInspectionInput>): Promise<HarvestInspection> {
    const response = await api.patch<HarvestInspection>(
      `/harvest-inspections/${id}`,
      pruneEmpty(input),
    );
    return unwrap<HarvestInspection>(response.data);
  },

  async deleteInspection(id: string): Promise<void> {
    await api.delete(`/harvest-inspections/${id}`);
  },

  async addInspectionDocument(
    id: string,
    input: AddDocumentInput,
  ): Promise<HarvestInspectionDocument> {
    const response = await api.post<HarvestInspectionDocument>(
      `/harvest-inspections/${id}/documents`,
      pruneEmpty(input),
    );
    return unwrap<HarvestInspectionDocument>(response.data);
  },
};
