import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { customersApi } from '../api/customers';
import { queryKeys } from '../api/queryKeys';
import type {
  CreateCustomerInput,
  CustomerQuery,
  CustomerStatus,
  UpdateCustomerInput,
} from '../api/types';

export function useCustomers(query: CustomerQuery = {}) {
  return useQuery({
    queryKey: queryKeys.customers.list(query),
    queryFn: () => customersApi.list(query),
    placeholderData: keepPreviousData,
  });
}

export function useCustomer(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.customers.detail(id ?? ''),
    queryFn: () => customersApi.get(id as string),
    enabled: Boolean(id),
  });
}

/**
 * Credit headroom for a B2B customer.
 *
 * `enabled` is deliberately caller-controlled rather than derived here: the
 * endpoint is meaningless for B2C and the screen already knows the channel, so
 * asking is cheaper than a wasted round trip that returns nulls.
 */
export function useCustomerCredit(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.customers.credit(id ?? ''),
    queryFn: () => customersApi.credit(id as string),
    enabled: Boolean(id) && enabled,
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCustomerInput) => customersApi.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
    },
  });
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCustomerInput }) =>
      customersApi.update(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
    },
  });
}

/**
 * Activate, deactivate or blacklist.
 *
 * Blacklisting does not touch orders already in flight - the server refuses new
 * ones and leaves existing ones alone - so this invalidates the customer tree
 * only, not orders.
 */
export function useSetCustomerStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: CustomerStatus }) =>
      customersApi.setStatus(id, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
    },
  });
}
