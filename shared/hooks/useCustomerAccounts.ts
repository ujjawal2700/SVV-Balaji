import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { customerAccountsApi } from '../api/customerAccounts';
import { queryKeys } from '../api/queryKeys';
import type { CustomerAccountQuery, RejectCustomerAccountInput } from '../api/types';

export function useCustomerAccounts(query: CustomerAccountQuery = {}) {
  return useQuery({
    queryKey: queryKeys.customerAccounts.list(query),
    queryFn: () => customerAccountsApi.list(query),
    placeholderData: keepPreviousData,
  });
}

/**
 * Approval creates the Customer record the account then orders against, so
 * this invalidates the customer tree too — the credit/registry screens should
 * see the new customer immediately rather than on the next unrelated refetch.
 */
export function useApproveCustomerAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => customerAccountsApi.approve(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.customerAccounts.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
    },
  });
}

export function useRejectCustomerAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RejectCustomerAccountInput }) =>
      customerAccountsApi.reject(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.customerAccounts.all });
    },
  });
}
