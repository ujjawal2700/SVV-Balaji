import { api } from './client';
import { pruneEmpty, unwrap, unwrapList, type Paginated } from './envelope';
import type {
  CreateQualityInspectionInput,
  FinishedGoodsBatch,
  InspectionStage,
  QualityInspection,
  QualityResult,
} from './types';

export const qualityApi = {
  async list(filters: {
    stage?: InspectionStage;
    result?: QualityResult;
  }): Promise<Paginated<QualityInspection>> {
    const response = await api.get<QualityInspection[]>('/quality-inspections', {
      params: pruneEmpty(filters),
    });
    return unwrapList<QualityInspection>(response.data);
  },

  async get(id: string): Promise<QualityInspection> {
    const response = await api.get<QualityInspection>(`/quality-inspections/${id}`);
    return unwrap<QualityInspection>(response.data);
  },

  /**
   * Inspections GATE the flow rather than annotating it.
   *
   * A FAIL at raw-material stage marks the batch REJECTED so it can never enter
   * production; a FAIL at finished-goods stage withdraws QA release so the batch
   * cannot be stocked or dispatched (FRD 21.5). Both are irreversible through
   * this endpoint — the only way back is a new, passing inspection.
   */
  async create(input: CreateQualityInspectionInput): Promise<QualityInspection> {
    const response = await api.post<QualityInspection>('/quality-inspections', pruneEmpty(input));
    return unwrap<QualityInspection>(response.data);
  },

  /**
   * FRD 21.5 — releases a finished-goods batch for stocking and dispatch.
   * Refused unless the most recent finished-goods inspection was a PASS.
   */
  async release(fgBatchId: string): Promise<FinishedGoodsBatch> {
    const response = await api.patch<FinishedGoodsBatch>(
      `/quality-inspections/release/${fgBatchId}`,
      {},
    );
    return unwrap<FinishedGoodsBatch>(response.data);
  },
};
