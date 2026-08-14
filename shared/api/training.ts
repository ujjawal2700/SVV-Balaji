import { api } from './client';
import { pruneEmpty, unwrap, unwrapList, type Paginated } from './envelope';
import type {
  AddTrainingMaterialInput,
  CreateTrainingSessionInput,
  TrainingMaterial,
  TrainingSession,
  TrainingSessionDetail,
  UpdateTrainingSessionInput,
} from './types';

export const trainingApi = {
  async list(branchId?: string): Promise<Paginated<TrainingSession>> {
    const response = await api.get<TrainingSession[]>('/training-sessions', {
      params: pruneEmpty({ branchId }),
    });
    return unwrapList<TrainingSession>(response.data);
  },

  async get(id: string): Promise<TrainingSessionDetail> {
    const response = await api.get<TrainingSessionDetail>(`/training-sessions/${id}`);
    return unwrap<TrainingSessionDetail>(response.data);
  },

  async create(input: CreateTrainingSessionInput): Promise<TrainingSession> {
    const response = await api.post<TrainingSession>('/training-sessions', pruneEmpty(input));
    return unwrap<TrainingSession>(response.data);
  },

  /**
   * Bulk attendance. The server upserts, so re-sending a farmer who is already
   * marked is a no-op rather than a duplicate — safe to submit the full list
   * every time rather than diffing it here.
   *
   * Returns the whole session, refreshed.
   */
  async markAttendance(id: string, farmerIds: string[]): Promise<TrainingSessionDetail> {
    const response = await api.post<TrainingSessionDetail>(
      `/training-sessions/${id}/attendance`,
      { farmerIds },
    );
    return unwrap<TrainingSessionDetail>(response.data);
  },

  async addMaterial(id: string, input: AddTrainingMaterialInput): Promise<TrainingMaterial> {
    const response = await api.post<TrainingMaterial>(
      `/training-sessions/${id}/materials`,
      pruneEmpty(input),
    );
    return unwrap<TrainingMaterial>(response.data);
  },

  async update(id: string, input: UpdateTrainingSessionInput): Promise<TrainingSession> {
    const response = await api.patch<TrainingSession>(
      `/training-sessions/${id}`,
      pruneEmpty(input),
    );
    return unwrap<TrainingSession>(response.data);
  },

  /** Refused by the server once attendance has been marked. */
  async remove(id: string): Promise<void> {
    await api.delete(`/training-sessions/${id}`);
  },

  /** Removing a farmer marked present by mistake. Returns the session refreshed. */
  async removeAttendance(id: string, farmerId: string): Promise<TrainingSessionDetail> {
    const response = await api.delete<TrainingSessionDetail>(
      `/training-sessions/${id}/attendance/${farmerId}`,
    );
    return unwrap<TrainingSessionDetail>(response.data);
  },

  async removeMaterial(id: string, materialId: string): Promise<TrainingSessionDetail> {
    const response = await api.delete<TrainingSessionDetail>(
      `/training-sessions/${id}/materials/${materialId}`,
    );
    return unwrap<TrainingSessionDetail>(response.data);
  },
};
