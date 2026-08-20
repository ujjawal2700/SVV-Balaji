import { api } from './client';
import { pruneEmpty, unwrap, unwrapList, type Paginated } from './envelope';
import type {
  CreatePriceListInput,
  PriceComparison,
  PriceList,
  PriceListQuery,
  SupersedePriceInput,
} from './types';

export const pricingApi = {
  async list(query: PriceListQuery = {}): Promise<Paginated<PriceList>> {
    const response = await api.get<PriceList[]>('/price-lists', { params: pruneEmpty(query) });
    return unwrapList<PriceList>(response.data);
  },

  /**
   * Both channels' current price for one product, side by side.
   *
   * This is what the product screen shows. A product carries two prices and
   * seeing them apart is how they drift.
   */
  async comparison(productId: string): Promise<PriceComparison> {
    const response = await api.get<PriceComparison>(`/price-lists/product/${productId}/comparison`);
    return unwrap<PriceComparison>(response.data);
  },

  async create(input: CreatePriceListInput): Promise<PriceList> {
    const response = await api.post<PriceList>('/price-lists', pruneEmpty(input));
    return unwrap<PriceList>(response.data);
  },

  /**
   * The ONLY way to change a price.
   *
   * There is no update endpoint, by design: it closes the current rule with an
   * `effectiveTo` and opens a new one from the given date. Editing a rate in
   * place would silently change what historical invoices reproduce.
   */
  async supersede(id: string, input: SupersedePriceInput): Promise<PriceList> {
    const response = await api.post<PriceList>(`/price-lists/${id}/supersede`, pruneEmpty(input));
    return unwrap<PriceList>(response.data);
  },

  async setActive(id: string, isActive: boolean): Promise<PriceList> {
    const response = await api.patch<PriceList>(`/price-lists/${id}/active`, { isActive });
    return unwrap<PriceList>(response.data);
  },
};
