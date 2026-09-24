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

/** One of my tickets with the full conversation, refreshed every 15s while open so staff replies appear. */
export function useSupportTicketThread(id: string | null) {
  return useQuery({
    queryKey: [...SUPPORT_TICKETS_KEY, 'thread', id],
    queryFn: () => supportTicketsApi.get(id as string),
    enabled: Boolean(id),
    refetchInterval: 15_000,
  });
}

export function useReplyToSupportTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => supportTicketsApi.reply(id, body),
    onSuccess: (thread) => {
      qc.setQueryData([...SUPPORT_TICKETS_KEY, 'thread', thread.id], thread);
      void qc.invalidateQueries({ queryKey: SUPPORT_TICKETS_KEY, exact: true });
    },
  });
}
