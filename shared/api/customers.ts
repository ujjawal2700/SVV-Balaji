import { api } from './client';
import { pruneEmpty, unwrap, unwrapList, type Paginated } from './envelope';
import type {
  CreateCustomerInput,
  Customer,
  CustomerCredit,
  CustomerProductReview,
  CustomerQuery,
  CustomerStatus,
  CustomerSupportTicket,
  CustomerWallet,
  CustomerWishlistItem,
  UpdateCustomerInput,
} from './types';

export const customersApi = {
  async list(query: CustomerQuery = {}): Promise<Paginated<Customer>> {
    const response = await api.get<Customer[]>('/customers', { params: pruneEmpty(query) });
    return unwrapList<Customer>(response.data);
  },

  async get(id: string): Promise<Customer> {
    const response = await api.get<Customer>(`/customers/${id}`);
    return unwrap<Customer>(response.data);
  },

  /**
   * Credit position for a B2B customer: limit, what is outstanding, what is
   * left. Meaningless for B2C, which is always prepaid.
   */
  async credit(id: string): Promise<CustomerCredit> {
    const response = await api.get<CustomerCredit>(`/customers/${id}/credit`);
    return unwrap<CustomerCredit>(response.data);
  },

  /** Reward-coin wallet ledger: current balance, total earned, total used. */
  async wallet(id: string): Promise<CustomerWallet> {
    const response = await api.get<CustomerWallet>(`/customers/${id}/wallet`);
    return unwrap<CustomerWallet>(response.data);
  },

  /** This customer's saved-for-later products. */
  async wishlist(id: string): Promise<CustomerWishlistItem[]> {
    const response = await api.get<CustomerWishlistItem[]>(`/customers/${id}/wishlist`);
    return unwrapList<CustomerWishlistItem>(response.data).data;
  },

  /** This customer's raised support tickets. */
  async supportTickets(id: string): Promise<CustomerSupportTicket[]> {
    const response = await api.get<CustomerSupportTicket[]>(`/customers/${id}/support-tickets`);
    return unwrapList<CustomerSupportTicket>(response.data).data;
  },

  /** This customer's product reviews. */
  async reviews(id: string): Promise<CustomerProductReview[]> {
    const response = await api.get<CustomerProductReview[]>(`/customers/${id}/reviews`);
    return unwrapList<CustomerProductReview>(response.data).data;
  },

  async create(input: CreateCustomerInput): Promise<Customer> {
    const response = await api.post<Customer>('/customers', pruneEmpty(input));
    return unwrap<Customer>(response.data);
  },

  /** Channel is NOT updatable - the server rejects it. See the form. */
  async update(id: string, input: UpdateCustomerInput): Promise<Customer> {
    const response = await api.patch<Customer>(`/customers/${id}`, pruneEmpty(input));
    return unwrap<Customer>(response.data);
  },

  async setStatus(id: string, status: CustomerStatus): Promise<Customer> {
    const response = await api.patch<Customer>(`/customers/${id}/status`, { status });
    return unwrap<Customer>(response.data);
  },
};
