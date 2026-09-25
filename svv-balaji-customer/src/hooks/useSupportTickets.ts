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

/** One of my tickets with the full conversation, refreshed every 2.5s while open so staff replies appear instantly. */
export function useSupportTicketThread(id: string | null) {
  return useQuery({
    queryKey: [...SUPPORT_TICKETS_KEY, 'thread', id],
    queryFn: () => supportTicketsApi.get(id as string),
    enabled: Boolean(id),
    refetchInterval: 2_500,
  });
}

export function useReplyToSupportTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => supportTicketsApi.reply(id, body),
    onMutate: async ({ id, body }) => {
      await qc.cancelQueries({ queryKey: [...SUPPORT_TICKETS_KEY, 'thread', id] });
      const previous = qc.getQueryData<any>([...SUPPORT_TICKETS_KEY, 'thread', id]);
      if (previous) {
        qc.setQueryData([...SUPPORT_TICKETS_KEY, 'thread', id], {
          ...previous,
          messages: [
            ...previous.messages,
            {
              id: `temp-${Date.now()}`,
              author: 'CUSTOMER',
              body,
              createdAt: new Date().toISOString(),
            },
          ],
        });
      }
      return { previous };
    },
    onError: (_err, { id }, context) => {
      if (context?.previous) {
        qc.setQueryData([...SUPPORT_TICKETS_KEY, 'thread', id], context.previous);
      }
    },
    onSuccess: (thread) => {
      qc.setQueryData([...SUPPORT_TICKETS_KEY, 'thread', thread.id], thread);
      void qc.invalidateQueries({ queryKey: SUPPORT_TICKETS_KEY, exact: true });
    },
  });
}
