import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deliveryApi, type RiderStatus, type TaskStatus } from '../api/delivery';

export const DELIVERY_KEYS = {
  all: ['delivery'] as const,
  zones: ['delivery', 'zones'] as const,
  riders: (q: object) => ['delivery', 'riders', q] as const,
  live: ['delivery', 'riders-live'] as const,
  tasks: (q: object) => ['delivery', 'tasks', q] as const,
  task: (id: string) => ['delivery', 'task', id] as const,
  settings: ['delivery', 'settings'] as const,
  reasons: ['delivery', 'reasons'] as const,
  rules: ['delivery', 'rules'] as const,
  riderCash: (id: string) => ['delivery', 'rider-cash', id] as const,
  riderEarnings: (id: string, q: object = {}) => ['delivery', 'rider-earnings', id, q] as const,
  rider: (id: string) => ['delivery', 'rider', id] as const,
  earningsReport: (q: object) => ['delivery', 'earnings-report', q] as const,
  cashReport: (q: object) => ['delivery', 'cash-report', q] as const,
};

export const useZones = () => useQuery({ queryKey: DELIVERY_KEYS.zones, queryFn: deliveryApi.zones });
export const useRiders = (q: { status?: RiderStatus; warehouseId?: string; q?: string } = {}) =>
  useQuery({ queryKey: DELIVERY_KEYS.riders(q), queryFn: () => deliveryApi.riders(q), refetchInterval: 20_000 });
export const useLiveRiders = () => useQuery({ queryKey: DELIVERY_KEYS.live, queryFn: () => deliveryApi.liveRiders(), refetchInterval: 15_000 });
export const useDeliveryTasks = (q: { status?: TaskStatus; warehouseId?: string; needsAssignment?: boolean; riderId?: string } = {}) =>
  useQuery({ queryKey: DELIVERY_KEYS.tasks(q), queryFn: () => deliveryApi.tasks(q), refetchInterval: 10_000 });
export const useDeliveryTask = (id: string | null) =>
  useQuery({ queryKey: DELIVERY_KEYS.task(id ?? ''), queryFn: () => deliveryApi.task(id!), enabled: Boolean(id), refetchInterval: 10_000 });
export const useDeliverySettings = () => useQuery({ queryKey: DELIVERY_KEYS.settings, queryFn: deliveryApi.settings });
export const useFailureReasons = () => useQuery({ queryKey: DELIVERY_KEYS.reasons, queryFn: deliveryApi.reasons });
export const useEarningRules = () => useQuery({ queryKey: DELIVERY_KEYS.rules, queryFn: deliveryApi.rules });
export const useRiderCash = (id: string | null) => useQuery({ queryKey: DELIVERY_KEYS.riderCash(id ?? ''), queryFn: () => deliveryApi.riderCash(id!), enabled: Boolean(id) });
export const useRiderEarnings = (id: string | null, q: { from?: string; to?: string } = {}) =>
  useQuery({ queryKey: DELIVERY_KEYS.riderEarnings(id ?? '', q), queryFn: () => deliveryApi.riderEarnings(id!, q), enabled: Boolean(id) });
export const useRider = (id: string | undefined) =>
  useQuery({ queryKey: DELIVERY_KEYS.rider(id ?? ''), queryFn: () => deliveryApi.rider(id!), enabled: Boolean(id), refetchInterval: 20_000 });
export const useRiderEarningsReport = (q: { from?: string; to?: string; warehouseId?: string }) =>
  useQuery({ queryKey: DELIVERY_KEYS.earningsReport(q), queryFn: () => deliveryApi.earningsReport(q) });
export const useRiderCashReport = (q: { from?: string; to?: string; warehouseId?: string }) =>
  useQuery({ queryKey: DELIVERY_KEYS.cashReport(q), queryFn: () => deliveryApi.cashReport(q), refetchInterval: 30_000 });

/** Any delivery change can move the board, the riders list and the order screens. */
export function useDeliveryMutation<TArgs, TResult>(fn: (a: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: DELIVERY_KEYS.all });
      void qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
