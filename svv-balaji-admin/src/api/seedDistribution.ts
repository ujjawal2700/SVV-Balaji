import { api } from './client';
import { pruneEmpty, unwrap, unwrapList, type Paginated } from './envelope';
import type { CreateSeedDistributionInput, SeedDistribution } from './types';

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
};
