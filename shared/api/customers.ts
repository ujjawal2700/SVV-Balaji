import { api } from './client';
import { pruneEmpty, unwrap, unwrapList, type Paginated } from './envelope';
import type {
  CreateCustomerInput,
  Customer,
  CustomerCredit,
  CustomerQuery,
  CustomerStatus,
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
