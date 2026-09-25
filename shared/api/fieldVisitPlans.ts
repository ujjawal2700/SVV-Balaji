import { api } from './client';
import { pruneEmpty, unwrap, unwrapList, type Paginated } from './envelope';
import type {
  CreateFieldVisitPlanInput,
  FieldVisitPlan,
  FieldVisitPlanQuery,
  UpdateFieldVisitPlanInput,
} from './types';

/**
 * FRD 12.1 planned visits. Completing one is not a call here: record the visit
 * with `planId` (fieldVisitsApi.create) and the server completes the plan.
 */
export const fieldVisitPlansApi = {
  async list(query: FieldVisitPlanQuery = {}): Promise<Paginated<FieldVisitPlan>> {
    const response = await api.get<FieldVisitPlan[]>('/field-visit-plans', {
      params: pruneEmpty(query),
    });
    return unwrapList<FieldVisitPlan>(response.data);
  },

  async get(id: string): Promise<FieldVisitPlan> {
    const response = await api.get<FieldVisitPlan>(`/field-visit-plans/${id}`);
    return unwrap<FieldVisitPlan>(response.data);
  },

  async create(input: CreateFieldVisitPlanInput): Promise<FieldVisitPlan> {
    const response = await api.post<FieldVisitPlan>('/field-visit-plans', pruneEmpty(input));
    return unwrap<FieldVisitPlan>(response.data);
  },

  /** PLANNED only - the server refuses a completed or cancelled plan. */
  async update(id: string, input: UpdateFieldVisitPlanInput): Promise<FieldVisitPlan> {
    const response = await api.patch<FieldVisitPlan>(`/field-visit-plans/${id}`, pruneEmpty(input));
    return unwrap<FieldVisitPlan>(response.data);
  },

  async cancel(id: string, reason?: string): Promise<FieldVisitPlan> {
    const response = await api.post<FieldVisitPlan>(
      `/field-visit-plans/${id}/cancel`,
      pruneEmpty({ reason }),
    );
    return unwrap<FieldVisitPlan>(response.data);
  },

  /** Refused for a completed plan, which is history linked to its visit. */
  async remove(id: string): Promise<void> {
    await api.delete(`/field-visit-plans/${id}`);
  },
};
