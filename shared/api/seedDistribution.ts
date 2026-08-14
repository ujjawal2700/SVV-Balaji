import { api } from './client';
import { pruneEmpty, unwrap, unwrapList, type Paginated } from './envelope';
import type {
  CreateSeedDistributionInput,
  SeedDistribution,
  UpdateSeedDistributionInput,
} from './types';

export const seedDistributionApi = {
  async list(farmerId?: string): Promise<Paginated<SeedDistribution>> {
    const response = await api.get<SeedDistribution[]>('/seed-distribution', {
      params: pruneEmpty({ farmerId }),
    });
    return unwrapList<SeedDistribution>(response.data);
  },

  async create(input: CreateSeedDistributionInput): Promise<SeedDistribution> {
    const response = await api.post<SeedDistribution>('/seed-distribution', pruneEmpty(input));
    return unwrap<SeedDistribution>(response.data);
  },

  /**
   * Freely editable and deletable — nothing downstream derives from a handout
   * record, so its value is in being accurate rather than immutable.
   */
  async update(id: string, input: UpdateSeedDistributionInput): Promise<SeedDistribution> {
    const response = await api.patch<SeedDistribution>(
      `/seed-distribution/${id}`,
      pruneEmpty(input),
    );
    return unwrap<SeedDistribution>(response.data);
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/seed-distribution/${id}`);
  },
};
