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
};
