import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../api/queryKeys';
import { posApi, type CreatePosSaleInput, type PosOutletInput, type PosSalesQuery, type PosShiftStatus } from '../api/pos';

export function usePosOutlets(query: { search?: string; branchId?: string; includeInactive?: boolean } = {}) {
  return useQuery({ queryKey: queryKeys.pos.outlets(query), queryFn: () => posApi.outlets(query), placeholderData: keepPreviousData });
}

export function usePosOutlet(id: string | undefined) {
  return useQuery({ queryKey: queryKeys.pos.outlet(id ?? ''), queryFn: () => posApi.outlet(id as string), enabled: Boolean(id) });
}

export function usePosCatalogue(outletId: string | undefined) {
  return useQuery({ queryKey: queryKeys.pos.catalogue(outletId ?? ''), queryFn: () => posApi.catalogue(outletId as string), enabled: Boolean(outletId) });
}

export function useMyPosShift(outletId: string | undefined) {
  return useQuery({ queryKey: queryKeys.pos.myShift(outletId ?? ''), queryFn: () => posApi.myShift(outletId as string), enabled: Boolean(outletId) });
}

export function usePosShifts(query: { outletId?: string; status?: PosShiftStatus; from?: string; to?: string } = {}) {
  return useQuery({ queryKey: queryKeys.pos.shifts(query), queryFn: () => posApi.shifts(query), placeholderData: keepPreviousData });
}

export function usePosSales(query: PosSalesQuery = {}) {
  return useQuery({ queryKey: queryKeys.pos.sales({ ...query }), queryFn: () => posApi.sales(query), placeholderData: keepPreviousData });
}

export function usePosSale(id: string | undefined) {
  return useQuery({ queryKey: queryKeys.pos.sale(id ?? ''), queryFn: () => posApi.sale(id as string), enabled: Boolean(id) });
}

export function usePosReport(query: { outletId?: string; from?: string; to?: string } = {}) {
  return useQuery({ queryKey: queryKeys.pos.report(query), queryFn: () => posApi.report(query), placeholderData: keepPreviousData });
}

/** Anything that changes money or stock refreshes every POS view, and the invoice list (sales issue invoices). */
function usePosAction<TVars, TResult>(fn: (v: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.pos.all });
      void qc.invalidateQueries({ queryKey: queryKeys.invoices.all });
    },
  });
}

export const useCreatePosSale = () => usePosAction((input: CreatePosSaleInput) => posApi.createSale(input));
export const useRefundPosSale = () => usePosAction(({ id, reason }: { id: string; reason: string }) => posApi.refund(id, reason));
export const useOpenPosShift = () => usePosAction(({ outletId, openingCash }: { outletId: string; openingCash: number }) => posApi.openShift(outletId, openingCash));
export const useClosePosShift = () =>
  usePosAction(({ id, countedCash, notes }: { id: string; countedCash: number; notes?: string }) => posApi.closeShift(id, countedCash, notes));
export const useSavePosOutlet = () =>
  usePosAction(({ id, input }: { id?: string; input: PosOutletInput }) => (id ? posApi.updateOutlet(id, input) : posApi.createOutlet(input)));
export const useSetPosOutletActive = () => usePosAction(({ id, isActive }: { id: string; isActive: boolean }) => posApi.setOutletActive(id, isActive));
export const useDeletePosOutlet = () => usePosAction((id: string) => posApi.deleteOutlet(id));
