import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supportTicketsApi, type SupportInboxQuery } from '../api/supportTickets';
import type { SupportTicketPriority, SupportTicketStatus } from '../api/types';

const KEY = ['support-tickets'] as const;

/** The help-desk inbox. Refreshes every 30s so new customer messages appear without a reload. */
export function useSupportInbox(query: SupportInboxQuery) {
  return useQuery({
    queryKey: [...KEY, 'inbox', query],
    queryFn: () => supportTicketsApi.inbox(query),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
}

/** One conversation, refreshed every 15s while open. */
export function useSupportThread(id: string | null) {
  return useQuery({
    queryKey: [...KEY, 'thread', id],
    queryFn: () => supportTicketsApi.get(id as string),
    enabled: Boolean(id),
    refetchInterval: 15_000,
  });
}

export function useReplyToTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => supportTicketsApi.reply(id, body),
    onSuccess: (thread) => {
      qc.setQueryData([...KEY, 'thread', thread.id], thread);
      void qc.invalidateQueries({ queryKey: [...KEY, 'inbox'] });
    },
  });
}

export function useUpdateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; status?: SupportTicketStatus; priority?: SupportTicketPriority }) =>
      supportTicketsApi.update(id, input),
    onSuccess: (thread) => {
      qc.setQueryData([...KEY, 'thread', thread.id], thread);
      void qc.invalidateQueries({ queryKey: [...KEY, 'inbox'] });
    },
  });
}
