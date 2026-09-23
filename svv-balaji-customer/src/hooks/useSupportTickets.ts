import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supportTicketsApi, type CreateSupportTicketInput } from '../api/supportTickets';
import { useCustomerAuth } from '../auth/CustomerAuthContext';

export const SUPPORT_TICKETS_KEY = ['storefront', 'support-tickets'] as const;

/** The signed-in customer/retailer's own raised tickets, newest first. Empty for guests. */
export function useSupportTickets() {
  const { isLoggedIn } = useCustomerAuth();
  return useQuery({
    queryKey: SUPPORT_TICKETS_KEY,
    queryFn: supportTicketsApi.list,
    enabled: isLoggedIn,
    retry: false,
  });
}

export function useCreateSupportTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSupportTicketInput) => supportTicketsApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: SUPPORT_TICKETS_KEY }),
  });
}
