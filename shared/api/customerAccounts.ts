import { api } from './client';
import { pruneEmpty, unwrapList, type Paginated } from './envelope';
import type {
  CustomerAccount,
  CustomerAccountQuery,
  RejectCustomerAccountInput,
} from './types';

/**
 * The staff-side review queue for storefront signups — served from
 * `/storefront/accounts`, distinct from `/customers` (the commercial
 * registry). See shared/api/types.ts for why the two are separate.
 */
export const customerAccountsApi = {
  async list(query: CustomerAccountQuery = {}): Promise<Paginated<CustomerAccount>> {
    const response = await api.get<CustomerAccount[]>('/storefront/accounts', {
      params: pruneEmpty(query),
    });
    return unwrapList<CustomerAccount>(response.data);
  },

  async approve(id: string): Promise<CustomerAccount> {
    const response = await api.patch<CustomerAccount>(`/storefront/accounts/${id}/approve`);
    return response.data;
  },

  async reject(id: string, input: RejectCustomerAccountInput): Promise<CustomerAccount> {
    const response = await api.patch<CustomerAccount>(`/storefront/accounts/${id}/reject`, input);
    return response.data;
  },
};
