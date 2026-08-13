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
  UpdateHarvestInspectionInput,
  UpdateProcurementPlanInput,
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

  async setPlanStatus(id: string, status: ProcurementPlanStatus): Promise<ProcurementPlan> {
    const response = await api.patch<ProcurementPlan>(`/procurement-plans/${id}/status`, {
      status,
    });
    return unwrap<ProcurementPlan>(response.data);
  },

  /**
   * DRAFT and SCHEDULED only. Once a plan is IN_PROGRESS its planned quantity
   * is the number actual procurement is measured against, so editing it would
   * rewrite the variance rather than record it.
   */
  async updatePlan(id: string, input: UpdateProcurementPlanInput): Promise<ProcurementPlan> {
    const response = await api.patch<ProcurementPlan>(
      `/procurement-plans/${id}`,
      pruneEmpty(input),
    );
    return unwrap<ProcurementPlan>(response.data);
  },

  async removePlan(id: string): Promise<void> {
    await api.delete(`/procurement-plans/${id}`);
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

  /**
   * Locked server-side once a collection exists against this inspection: the
   * result is what allowed that collection, and the crop name is carried onto
   * its batch.
   */
  async updateInspection(
    id: string,
    input: UpdateHarvestInspectionInput,
  ): Promise<HarvestInspection> {
    const response = await api.patch<HarvestInspection>(
      `/harvest-inspections/${id}`,
      pruneEmpty(input),
    );
    return unwrap<HarvestInspection>(response.data);
  },

  async removeInspection(id: string): Promise<void> {
    await api.delete(`/harvest-inspections/${id}`);
  },

  async removeInspectionDocument(id: string, documentId: string): Promise<HarvestInspection> {
    const response = await api.delete<HarvestInspection>(
      `/harvest-inspections/${id}/documents/${documentId}`,
    );
    return unwrap<HarvestInspection>(response.data);
  },
};
