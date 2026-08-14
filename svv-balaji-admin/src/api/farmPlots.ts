import { api } from './client';
import { pruneEmpty, unwrap, unwrapList, type Paginated } from './envelope';

/** One cultivable plot. Descriptive, not transactional — nothing consumes it. */
export interface FarmPlot {
  id: string;
  farmerId: string;
  name: string;
  surveyNumber: string | null;
  /** Decimal as string, per the panel-wide rule. */
  areaAcres: string;
  soilType: string | null;
  irrigationType: string | null;
  waterSource: string | null;
  currentCrop: string | null;
  sowingDate: string | null;
  expectedHarvest: string | null;
  /** "lat,lng" — same format as Farmer.gpsLocation. */
  gpsLocation: string | null;
  notes: string | null;
  isActive: boolean;
  createdBy?: { id: string; fullName: string };
  createdAt: string;
}

/**
 * How the mapped land compares with what was entered at registration.
 *
 * `differenceAcres` is null when nothing was captured at registration — not
 * zero, which would read as "they agree".
 */
export interface FarmPlotSummary {
  plotCount: number;
  mappedAcres: string;
  registeredAcres: string | null;
  differenceAcres: string | null;
  plotsWithoutGps: number;
  plotsWithoutCrop: number;
}

export interface FarmPlotInput {
  name: string;
  surveyNumber?: string;
  areaAcres: number;
  soilType?: string;
  irrigationType?: string;
  waterSource?: string;
  currentCrop?: string;
  sowingDate?: string;
  expectedHarvest?: string;
  gpsLocation?: string;
  notes?: string;
  isActive?: boolean;
}

export const farmPlotsApi = {
  async list(farmerId: string, includeInactive = false): Promise<Paginated<FarmPlot>> {
    const response = await api.get<FarmPlot[]>(`/farmers/${farmerId}/plots`, {
      params: includeInactive ? { includeInactive: 'true' } : undefined,
    });
    return unwrapList<FarmPlot>(response.data);
  },

  async summary(farmerId: string): Promise<FarmPlotSummary> {
    const response = await api.get<FarmPlotSummary>(`/farmers/${farmerId}/plots/summary`);
    return unwrap<FarmPlotSummary>(response.data);
  },

  async create(farmerId: string, input: FarmPlotInput): Promise<FarmPlot> {
    const response = await api.post<FarmPlot>(`/farmers/${farmerId}/plots`, pruneEmpty(input));
    return unwrap<FarmPlot>(response.data);
  },

  async update(farmerId: string, plotId: string, input: FarmPlotInput): Promise<FarmPlot> {
    const response = await api.patch<FarmPlot>(
      `/farmers/${farmerId}/plots/${plotId}`,
      pruneEmpty(input),
    );
    return unwrap<FarmPlot>(response.data);
  },

  async remove(farmerId: string, plotId: string): Promise<void> {
    await api.delete(`/farmers/${farmerId}/plots/${plotId}`);
  },
};
