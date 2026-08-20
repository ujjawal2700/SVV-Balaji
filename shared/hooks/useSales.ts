import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../api/queryKeys';
import { salesApi } from '../api/sales';
import type { CreateOrderInput, OrderQuery, PaymentStatus } from '../api/types';

export function useOrders(query: OrderQuery = {}) {
  return useQuery({
    queryKey: queryKeys.orders.list(query),
    queryFn: () => salesApi.list(query),
    placeholderData: keepPreviousData,
  });
}

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.orders.detail(id ?? ''),
    queryFn: () => salesApi.get(id as string),
    enabled: Boolean(id),
  });
}

export function useOrderTraceability(orderNumber: string | undefined) {
  return useQuery({
    queryKey: queryKeys.orders.traceability(orderNumber ?? ''),
    queryFn: () => salesApi.traceability(orderNumber as string),
    enabled: Boolean(orderNumber),
  });
}

/**
 * Everything an order transition touches.
 *
 * Orders reach further than most resources: confirming moves the customer's
 * outstanding balance, allocating reserves finished-goods stock, dispatch
 * writes a stock movement. Rather than have every mutation below reason about
 * which of those it happens to hit, they all invalidate the same set. These are
 * small, cached, rarely-more-than-a-page queries; being precise here would buy
 * nothing and would eventually be wrong.
 */
function invalidateOrderWorld(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
  // Outstanding and available credit both move with order status.
  void queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
  // Reserved and available quantities on the FG stock lines.
  void queryClient.invalidateQueries({ queryKey: queryKeys.finishedGoods.all });
  // Occupancy and the movement ledger.
  void queryClient.invalidateQueries({ queryKey: queryKeys.warehouses.all });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateOrderInput) => salesApi.create(input),
    onSuccess: () => invalidateOrderWorld(queryClient),
  });
}

/**
 * Draft to placed.
 *
 * Returns `repriced` — the lines whose rate moved since the draft was saved.
 * The caller must show that; the total the user saw on the draft may not be
 * the total they just committed to.
 */
export function usePlaceOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => salesApi.place(id),
    onSuccess: () => invalidateOrderWorld(queryClient),
  });
}

export function useConfirmOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => salesApi.confirm(id),
    onSuccess: () => invalidateOrderWorld(queryClient),
  });
}

/** Server-side FEFO pick against QA-released stock. Returns the picking slip. */
export function useAllocateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => salesApi.allocate(id),
    onSuccess: () => invalidateOrderWorld(queryClient),
  });
}

export function usePackOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => salesApi.pack(id),
    onSuccess: () => invalidateOrderWorld(queryClient),
  });
}

/** The point stock actually leaves the building — a STOCK_OUT movement per allocation. */
export function useDispatchOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => salesApi.dispatch(id),
    onSuccess: () => invalidateOrderWorld(queryClient),
  });
}

export function useDeliverOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => salesApi.deliver(id),
    onSuccess: () => invalidateOrderWorld(queryClient),
  });
}

/** Releases every live reservation back to stock. The allocation rows survive. */
export function useCancelOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => salesApi.cancel(id, reason),
    onSuccess: () => invalidateOrderWorld(queryClient),
  });
}

export function useSetOrderPaymentStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, paymentStatus }: { id: string; paymentStatus: PaymentStatus }) =>
      salesApi.setPaymentStatus(id, paymentStatus),
    onSuccess: () => invalidateOrderWorld(queryClient),
  });
}
