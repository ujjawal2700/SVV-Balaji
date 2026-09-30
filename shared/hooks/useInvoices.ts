import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../api/queryKeys';
import { invoicesApi, type InvoiceQuery, type IrnCancelReason, type UpdateGstSettingsInput } from '../api/invoices';

export function useInvoices(query: InvoiceQuery = {}) {
  return useQuery({
    queryKey: queryKeys.invoices.list({ ...query }),
    queryFn: () => invoicesApi.list(query),
    placeholderData: keepPreviousData,
  });
}

export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.invoices.detail(id ?? ''),
    queryFn: () => invoicesApi.get(id as string),
    enabled: Boolean(id),
  });
}

export function useOrderInvoices(orderId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.invoices.forOrder(orderId ?? ''),
    queryFn: () => invoicesApi.forOrder(orderId as string),
    enabled: Boolean(orderId) && enabled,
  });
}

export function useGstSettings(enabled = true) {
  return useQuery({ queryKey: queryKeys.invoices.settings(), queryFn: () => invoicesApi.settings(), enabled });
}

export function useUpdateGstSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateGstSettingsInput) => invoicesApi.updateSettings(input),
    onSuccess: (s) => qc.setQueryData(queryKeys.invoices.settings(), s),
  });
}

/** Issuing, retrying or cancelling changes the list, the order's invoices and the invoice itself. */
function useInvoiceAction<TVars, TResult>(fn: (v: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.invoices.all }),
  });
}

export const useIssueInvoice = () => useInvoiceAction((orderId: string) => invoicesApi.issue(orderId));
export const useRetryEInvoice = () => useInvoiceAction((id: string) => invoicesApi.retryEInvoice(id));
export const useCancelInvoice = () =>
  useInvoiceAction(({ id, reasonCode, remark }: { id: string; reasonCode: IrnCancelReason; remark: string }) =>
    invoicesApi.cancel(id, { reasonCode, remark }));
