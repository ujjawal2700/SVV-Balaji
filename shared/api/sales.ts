import { api } from './client';
import { pruneEmpty, unwrap, unwrapList, type Paginated } from './envelope';
import type {
  AllocationResult,
  CreateOrderInput,
  Order,
  OrderDetail,
  OrderQuery,
  PaymentStatus,
  PlaceOrderResult,
} from './types';

export const salesApi = {
  async list(query: OrderQuery = {}): Promise<Paginated<Order>> {
    const response = await api.get<Order[]>('/orders', { params: pruneEmpty(query) });
    return unwrapList<Order>(response.data);
  },

  async get(id: string): Promise<OrderDetail> {
    const response = await api.get<OrderDetail>(`/orders/${id}`);
    return unwrap<OrderDetail>(response.data);
  },

  async create(input: CreateOrderInput): Promise<OrderDetail> {
    const response = await api.post<OrderDetail>('/orders', pruneEmpty(input));
    return unwrap<OrderDetail>(response.data);
  },

  /**
   * Place a draft.
   *
   * Re-prices every line against today's list first, so a draft saved before a
   * price change is placed at the new rate. `repriced` names any line that
   * moved — the screen shows that back rather than quietly charging a
   * different total.
   */
  async place(id: string): Promise<PlaceOrderResult> {
    const response = await api.patch<PlaceOrderResult>(`/orders/${id}/place`);
    return unwrap<PlaceOrderResult>(response.data);
  },

  async confirm(id: string): Promise<Order> {
    const response = await api.patch<Order>(`/orders/${id}/confirm`);
    return unwrap<Order>(response.data);
  },

  /**
   * A server action, not a form.
   *
   * Picks first-expiry-first-out from QA-released stock in the order's
   * warehouse, reserves it, and returns exactly what goes on the picking slip.
   * The panel does not choose batches — it could not do so correctly.
   */
  async allocate(id: string): Promise<AllocationResult> {
    const response = await api.post<AllocationResult>(`/orders/${id}/allocate`);
    return unwrap<AllocationResult>(response.data);
  },

  async pack(id: string): Promise<Order> {
    const response = await api.patch<Order>(`/orders/${id}/pack`);
    return unwrap<Order>(response.data);
  },

  async dispatch(id: string): Promise<Order> {
    const response = await api.patch<Order>(`/orders/${id}/dispatch`);
    return unwrap<Order>(response.data);
  },

  async deliver(id: string): Promise<Order> {
    const response = await api.patch<Order>(`/orders/${id}/deliver`);
    return unwrap<Order>(response.data);
  },

  /** Returns every live reservation to stock. Allocations are kept, marked released. */
  async cancel(id: string, reason: string): Promise<Order> {
    const response = await api.patch<Order>(`/orders/${id}/cancel`, { reason });
    return unwrap<Order>(response.data);
  },

  async setPaymentStatus(id: string, paymentStatus: PaymentStatus): Promise<Order> {
    const response = await api.patch<Order>(`/orders/${id}/payment-status`, { paymentStatus });
    return unwrap<Order>(response.data);
  },

  async traceability(orderNumber: string): Promise<unknown> {
    const response = await api.get(`/orders/number/${orderNumber}/traceability`);
    return unwrap(response.data);
  },
};
