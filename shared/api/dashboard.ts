import { api } from './client';

export interface DashboardMetrics {
  activeFarmers: number;
  pendingFarmers: number;
  activeAgreements: number;
  totalStockInventory: number;
}

export interface DashboardTimelineEvent {
  id: string;
  type: 'VERIFICATION' | 'STOCK';
  title: string;
  description: string;
  timestamp: string; // ISO Date string
}

export interface DashboardSummary {
  metrics: DashboardMetrics;
  timeline: DashboardTimelineEvent[];
}

export const dashboardApi = {
  getSummary() {
    return api.get<DashboardSummary>('/dashboard/summary').then((r) => r.data);
  },
};
