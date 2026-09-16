import { api } from './client';
import { Supplier } from './suppliers';

export type TransportStatus = 'SCHEDULED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';

export interface SupplierTransport {
  id: string;
  supplierId: string;
  supplier?: Supplier;
  purchaseOrderId: string | null;
  materialName: string;
  quantity: number;
  unit: string;
  vehicleNumber: string | null;
  driverName: string | null;
  driverPhone: string | null;
  scheduledDate: string;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  deliveryLocation: string | null;
  warehouseId: string | null;
  warehouse?: { id: string; name: string };
  receiptNumber: string | null;
  status: TransportStatus;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTransportDto {
  supplierId: string;
  purchaseOrderId?: string;
  materialName: string;
  quantity: number;
  unit?: string;
  vehicleNumber?: string;
  driverName?: string;
  driverPhone?: string;
  scheduledDate: string;
  deliveryLocation?: string;
  warehouseId?: string;
  remarks?: string;
}

export interface QueryTransportDto {
  supplierId?: string;
  materialName?: string;
  warehouseId?: string;
  status?: TransportStatus;
  page?: number;
  limit?: number;
}

export const transportsApi = {
  list: (params?: QueryTransportDto) => api.get<SupplierTransport[]>('/transports', { params }).then((res) => res.data),
  get: (id: string) => api.get<SupplierTransport>(`/transports/${id}`).then((res) => res.data),
  create: (data: CreateTransportDto) => api.post<SupplierTransport>('/transports', data).then((res) => res.data),
  update: (id: string, data: Partial<CreateTransportDto>) => api.patch<SupplierTransport>(`/transports/${id}`, data).then((res) => res.data),
  dispatch: (id: string) => api.patch<SupplierTransport>(`/transports/${id}/dispatch`).then((res) => res.data),
  deliver: (id: string, warehouseId: string) => api.patch<SupplierTransport>(`/transports/${id}/deliver`, { warehouseId }).then((res) => res.data),
  cancel: (id: string, remarks?: string) => api.patch<SupplierTransport>(`/transports/${id}/cancel`, { remarks }).then((res) => res.data),
};
