import { api } from './client';
import { Supplier } from './suppliers';

export type PurchaseOrderStatus =
  | 'DRAFT'
  | 'CONFIRMED'
  | 'PARTIALLY_FULFILLED'
  | 'FULFILLED'
  | 'CANCELLED';

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplier?: Supplier;
  materialName: string;
  expectedQuantity: number;
  unit: string;
  purchaseRate: number;
  totalAmount: number;
  orderDate: string;
  deliveryDate: string | null;
  qualityStandards: string | null;
  terms: string | null;
  status: PurchaseOrderStatus;
  transports?: Array<{
    id: string;
    quantity: number;
    unit: string;
    status: string;
    scheduledDate: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePurchaseOrderDto {
  supplierId: string;
  materialName: string;
  expectedQuantity: number;
  unit?: string;
  purchaseRate: number;
  totalAmount: number;
  orderDate: string;
  deliveryDate?: string;
  qualityStandards?: string;
  terms?: string;
}

export interface QueryPurchaseOrderDto {
  supplierId?: string;
  status?: PurchaseOrderStatus;
  page?: number;
  limit?: number;
}

export const purchaseOrdersApi = {
  list: (params?: QueryPurchaseOrderDto) => api.get<PurchaseOrder[]>('/purchase-orders', { params }).then((res) => res.data),
  get: (id: string) => api.get<PurchaseOrder>(`/purchase-orders/${id}`).then((res) => res.data),
  create: (data: CreatePurchaseOrderDto) => api.post<PurchaseOrder>('/purchase-orders', data).then((res) => res.data),
  update: (id: string, data: Partial<CreatePurchaseOrderDto>) => api.patch<PurchaseOrder>(`/purchase-orders/${id}`, data).then((res) => res.data),
  updateStatus: (id: string, status: PurchaseOrderStatus) => api.patch<PurchaseOrder>(`/purchase-orders/${id}/status`, { status }).then((res) => res.data),
};
