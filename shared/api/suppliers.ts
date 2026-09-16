import { api } from './client';

export type SupplierStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'INACTIVE' | 'BLACKLISTED' | 'SUSPENDED';
export type SupplierVerificationAction = 'APPROVED' | 'REJECTED';

export interface Supplier {
  id: string;
  supplierCode: string | null;
  fullName: string;
  mobile: string;
  aadhaarNumber: string | null;
  panNumber: string | null;
  companyName: string | null;
  gstin: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;
  bankAccountName: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
  ifscCode: string | null;
  status: SupplierStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSupplierDto {
  fullName: string;
  mobile: string;
  aadhaarNumber?: string;
  panNumber?: string;
  companyName?: string;
  gstin?: string;
  address?: string;
  city?: string;
  district?: string;
  state?: string;
  pincode?: string;
  bankAccountName?: string;
  bankName?: string;
  bankAccountNo?: string;
  ifscCode?: string;
}

export interface VerifySupplierDto {
  action: SupplierVerificationAction;
  remarks?: string;
}

export interface QuerySupplierDto {
  fullName?: string;
  companyName?: string;
  city?: string;
  state?: string;
  status?: SupplierStatus;
  page?: number;
  limit?: number;
}

export const suppliersApi = {
  list: (params?: QuerySupplierDto) => api.get<Supplier[]>('/suppliers', { params }).then((res) => res.data),
  get: (id: string) => api.get<Supplier>(`/suppliers/${id}`).then((res) => res.data),
  create: (data: CreateSupplierDto) => api.post<Supplier>('/suppliers', data).then((res) => res.data),
  update: (id: string, data: Partial<CreateSupplierDto>) => api.patch<Supplier>(`/suppliers/${id}`, data).then((res) => res.data),
  verify: (id: string, data: VerifySupplierDto) => api.patch<Supplier>(`/suppliers/${id}/verify`, data).then((res) => res.data),
  updateStatus: (id: string, status: SupplierStatus) => api.patch<Supplier>(`/suppliers/${id}/status`, { status }).then((res) => res.data),
  delete: (id: string) => api.delete(`/suppliers/${id}`).then((res) => res.data),
};
