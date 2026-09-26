import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../api/queryKeys';
import { receivablesApi, type RecordReceiptInput, type StatementRange } from '../api/receivables';

export function useReceivables(query: { branchId?: string; overdueOnly?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.receivables.list(query),
    queryFn: () => receivablesApi.list(query),
    placeholderData: keepPreviousData,
  });
}

export function useCreditAccount(customerId: string | undefined, range: StatementRange = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.receivables.account(customerId ?? '', range),
    queryFn: () => receivablesApi.account(customerId as string, range),
    enabled: Boolean(customerId) && enabled,
    placeholderData: keepPreviousData,
  });
}

/** A receipt changes what is owed everywhere: receivables, the customer's credit tile, and order payment status. */
function invalidateMoney(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.receivables.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
}

export function useRecordReceipt(customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordReceiptInput) => receivablesApi.record(customerId, input),
    onSuccess: () => invalidateMoney(queryClient),
  });
}

export function useVoidReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => receivablesApi.void(id, reason),
    onSuccess: () => invalidateMoney(queryClient),
  });
}
