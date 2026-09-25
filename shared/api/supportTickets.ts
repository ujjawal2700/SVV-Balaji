import { api } from './client';
import type { SupportTicketCategory, SupportTicketPriority, SupportTicketStatus } from './types';

export type SupportMessageAuthor = 'CUSTOMER' | 'STAFF';

export type SupportResolutionAction = 'REFUND_APPROVED' | 'REPLACEMENT_DISPATCHED' | 'REVERSE_PICKUP' | 'REJECTED';

export interface SupportTicketCustomer {
  id: string;
  name: string;
  phone: string;
  customerCode: string;
  channel: 'B2B' | 'B2C';
  email?: string | null;
}

export interface SupportTicketProduct {
  id: string;
  name: string;
  sku?: string | null;
  imageUrl?: string | null;
  price?: number | null;
  quantity?: number | null;
}

export interface SupportInboxRow {
  id: string;
  ticketNumber: string;
  category: SupportTicketCategory;
  subject: string;
  orderNumber: string | null;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  customer: SupportTicketCustomer;
  createdAt: string;
  lastActivityAt: string;
  messageCount: number;
  lastMessage: { author: SupportMessageAuthor; preview: string; at: string };
  /** The customer spoke last on an open ticket - staff owe a reply. */
  awaitingReply: boolean;
  product?: SupportTicketProduct | null;
  /** Resolution action already taken, if any (for inbox badge). */
  resolutionAction?: SupportResolutionAction | null;
}

export interface SupportInbox {
  counts: Partial<Record<SupportTicketStatus, number>>;
  tickets: SupportInboxRow[];
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
  customer: SupportTicketCustomer;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: { id: string; fullName: string } | null;
  messages: Array<{ id: string; author: SupportMessageAuthor; body: string; createdAt: string; staffName: string | null }>;
  product?: SupportTicketProduct | null;

  // ---- Resolution / Complaint fields ----
  evidenceImages: string[];
  resolutionAction: SupportResolutionAction | null;
  refundAmount: number | null;
  replacementOrderNumber: string | null;
  resolutionNote: string | null;
  internalAuditNote: string | null;

  /** Enriched order data for the resolution drawer. */
  orderDetails?: {
    amount: number;
    date: string;
    items: Array<{ productName: string; quantity: number; unitPrice: number; sku: string | null; imageUrl: string | null }>;
  } | null;
}

export interface SupportInboxQuery {
  status?: SupportTicketStatus;
  channel?: 'B2B' | 'B2C';
  search?: string;
}

export interface ResolveTicketInput {
  action: SupportResolutionAction;
  refundAmount?: number;
  replacementOrderNumber?: string;
  internalAuditNote?: string;
}

/** Staff help desk over storefront tickets. See svv-balaji-backend/src/support-tickets. */
export const supportTicketsApi = {
  async inbox(query: SupportInboxQuery = {}): Promise<SupportInbox> {
    const params: Record<string, string> = {};
    if (query.status) params.status = query.status;
    if (query.channel) params.channel = query.channel;
    if (query.search?.trim()) params.search = query.search.trim();
    return (await api.get<SupportInbox>('/support-tickets', { params })).data;
  },
  async get(id: string): Promise<SupportTicketThread> {
    return (await api.get<SupportTicketThread>(`/support-tickets/${id}`)).data;
  },
  async reply(id: string, body: string): Promise<SupportTicketThread> {
    return (await api.post<SupportTicketThread>(`/support-tickets/${id}/messages`, { body })).data;
  },
  async update(id: string, input: { status?: SupportTicketStatus; priority?: SupportTicketPriority }): Promise<SupportTicketThread> {
    return (await api.patch<SupportTicketThread>(`/support-tickets/${id}`, input)).data;
  },
  async resolve(id: string, input: ResolveTicketInput): Promise<SupportTicketThread> {
    return (await api.post<SupportTicketThread>(`/support-tickets/${id}/resolve`, input)).data;
  },
};
