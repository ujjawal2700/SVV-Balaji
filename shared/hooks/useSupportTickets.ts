import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supportTicketsApi, type ResolveTicketInput, type SupportInboxQuery, type SupportTicketThread } from '../api/supportTickets';
import type { SupportTicketPriority, SupportTicketStatus } from '../api/types';

export const SUPPORT_TICKETS_KEY = ['support-tickets'] as const;

/** The help-desk inbox. Refreshes every 8s so new customer messages appear without delay. */
export function useSupportInbox(query: SupportInboxQuery) {
  return useQuery({
    queryKey: [...SUPPORT_TICKETS_KEY, 'inbox', query],
    queryFn: () => supportTicketsApi.inbox(query),
    placeholderData: keepPreviousData,
    refetchInterval: 8_000,
  });
}

/** One conversation, refreshed every 3s while open for near-instant message receipt. */
export function useSupportThread(id: string | null) {
  return useQuery({
    queryKey: [...SUPPORT_TICKETS_KEY, 'thread', id],
    queryFn: () => supportTicketsApi.get(id as string),
    enabled: Boolean(id),
    refetchInterval: 3_000,
  });
}

export function useReplyToTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => supportTicketsApi.reply(id, body),
    onMutate: async ({ id, body }) => {
      await qc.cancelQueries({ queryKey: [...SUPPORT_TICKETS_KEY, 'thread', id] });
      const previousThread = qc.getQueryData<SupportTicketThread>([...SUPPORT_TICKETS_KEY, 'thread', id]);
      if (previousThread) {
        const optimisticMessage = {
          id: `temp-${Date.now()}`,
          author: 'STAFF' as const,
          body,
          createdAt: new Date().toISOString(),
          staffName: 'You',
        };
        qc.setQueryData([...SUPPORT_TICKETS_KEY, 'thread', id], {
          ...previousThread,
          messages: [...previousThread.messages, optimisticMessage],
          status: previousThread.status === 'OPEN' ? 'IN_PROGRESS' : previousThread.status,
        });
      }
      return { previousThread };
    },
    onError: (_err, { id }, context) => {
      if (context?.previousThread) {
        qc.setQueryData([...SUPPORT_TICKETS_KEY, 'thread', id], context.previousThread);
      }
    },
    onSuccess: (thread) => {
      qc.setQueryData([...SUPPORT_TICKETS_KEY, 'thread', thread.id], thread);
      void qc.invalidateQueries({ queryKey: [...SUPPORT_TICKETS_KEY, 'inbox'] });
    },
  });
}

export function useUpdateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; status?: SupportTicketStatus; priority?: SupportTicketPriority }) =>
      supportTicketsApi.update(id, input),
    onSuccess: (thread) => {
      qc.setQueryData([...SUPPORT_TICKETS_KEY, 'thread', thread.id], thread);
      void qc.invalidateQueries({ queryKey: [...SUPPORT_TICKETS_KEY, 'inbox'] });
    },
  });
}

/** Process a formal resolution action: refund, replacement, reverse pickup, or reject. */
export function useResolveTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & ResolveTicketInput) =>
      supportTicketsApi.resolve(id, input),
    onSuccess: (thread) => {
      qc.setQueryData([...SUPPORT_TICKETS_KEY, 'thread', thread.id], thread);
      void qc.invalidateQueries({ queryKey: [...SUPPORT_TICKETS_KEY, 'inbox'] });
    },
  });
}
