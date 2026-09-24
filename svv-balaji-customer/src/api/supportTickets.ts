import { api } from './client';

export type SupportTicketCategory = 'ORDER_ISSUE' | 'PAYMENT_REFUND' | 'DELIVERY_DELAY' | 'ACCOUNT_GST' | 'OTHER';
export type SupportTicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type SupportTicketPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export interface SupportTicket {
  id: string;
  ticketNumber: string;
  category: SupportTicketCategory;
  subject: string;
  description: string;
  orderNumber: string | null;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  resolutionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  lastActivityAt?: string;
  messageCount?: number;
  lastMessage?: { author: 'CUSTOMER' | 'STAFF'; preview: string; at: string } | null;
  /** Support replied and the customer hasn't answered yet. */
  hasNewReply?: boolean;
}

export interface SupportTicketThread {
  id: string;
  ticketNumber: string;
  category: SupportTicketCategory;
  subject: string;
  /** The customer's opening message. */
  description: string;
  orderNumber: string | null;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  createdAt: string;
  resolvedAt: string | null;
  messages: Array<{ id: string; author: 'CUSTOMER' | 'STAFF'; body: string; createdAt: string }>;
}

export interface CreateSupportTicketInput {
  category: SupportTicketCategory;
  subject: string;
  description: string;
  orderNumber?: string;
}

export const supportTicketsApi = {
  list: () => api.get<SupportTicket[]>('/storefront/support-tickets').then((r) => r.data),
  create: (input: CreateSupportTicketInput) =>
    api.post<SupportTicket>('/storefront/support-tickets', input).then((r) => r.data),
  get: (id: string) => api.get<SupportTicketThread>(`/storefront/support-tickets/${id}`).then((r) => r.data),
  reply: (id: string, body: string) =>
    api.post<SupportTicketThread>(`/storefront/support-tickets/${id}/messages`, { body }).then((r) => r.data),
};
