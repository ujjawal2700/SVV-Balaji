import { api } from './client';

export type RiderStatus = 'PENDING_VERIFICATION' | 'PENDING_APPROVAL' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';
export type TaskStatus =
  | 'READY_FOR_PICKUP' | 'OFFERED' | 'ASSIGNED' | 'AT_PICKUP' | 'PICKED_UP' | 'OUT_FOR_DELIVERY' | 'AT_DROP'
  | 'DELIVERED' | 'FAILED' | 'RETURNED_TO_STORE' | 'CANCELLED';
export type VehicleType = 'BICYCLE' | 'MOTORCYCLE' | 'SCOOTER' | 'EV_SCOOTER' | 'OTHER';

export interface Rider {
  id: string;
  code: string | null;
  fullName: string;
  phone: string;
  email: string | null;
  status: RiderStatus;
  city: string | null;
  vehicleType: VehicleType | null;
  vehicleNumber: string | null;
  photoUrl: string | null;
  availability: 'ONLINE' | 'OFFLINE';
  warehouse: { id: string; name: string } | null;
  rejectionReason: string | null;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  rider: Rider;
}

export interface OtpSent {
  sent: boolean;
  expiresInSeconds: number;
  devCode?: string;
  riderId?: string;
}

/** First few lines of an order, for the product thumbnail on order cards. */
export interface ItemPreview {
  name: string;
  quantity: number;
  image: string | null;
}

export interface Offer {
  offerId: string;
  expiresAt: string;
  taskId: string;
  taskNumber: string;
  speed: 'QUICK' | 'STANDARD';
  pickup: { name: string; location: string };
  dropArea: string;
  distanceKm: number | null;
  cod: number;
  itemCount: number;
  items: ItemPreview[];
  orderNumber: string | null;
  promisedBy: string | null;
  offeredAt: string;
}

export interface TaskSummary {
  id: string;
  taskNumber: string;
  status: TaskStatus;
  speed: 'QUICK' | 'STANDARD';
  orderNumber: string | null;
  pickupName: string;
  dropName: string;
  dropAddress: string;
  cod: number;
  distanceKm: number | null;
  promisedBy: string | null;
  assignedAt: string | null;
  deliveredAt: string | null;
  updatedAt: string;
  earned: number;
  itemCount: number;
  items: ItemPreview[];
}

export interface TaskDetail {
  id: string;
  taskNumber: string;
  status: TaskStatus;
  speed: 'QUICK' | 'STANDARD';
  attempt: number;
  orderNumber: string | null;
  promisedBy: string | null;
  pickup: { name: string; address: string; phone: string | null; latitude: number | null; longitude: number | null; navigationUrl: string };
  drop: { name: string; phone: string | null; address: string; latitude: number | null; longitude: number | null; navigationUrl: string };
  distanceKm: number | null;
  /** Digits in the customer's delivery code (the code itself is never sent to riders). */
  otpLength: number | null;
  items: Array<{ name: string; quantity: number; image: string | null }>;
  payment: { mode: string | null; codAmount: number; collected: { amount: number; method: string; at: string } | null };
  failure: { code: string; note: string | null; photoUrl: string | null } | null;
  timeline: Array<{ type: string; note: string | null; createdAt: string }>;
  earned: number;
  times: Record<string, string | null>;
}

export interface Dashboard {
  rider: { id: string; fullName: string; code: string | null; status: RiderStatus; availability: 'ONLINE' | 'OFFLINE'; outlet: { id: string; name: string } | null };
  today: { completed: number; pending: number; cancelled: number; returned: number };
  cashInHand: number;
  offers: Offer[];
  active: TaskSummary[];
}

export interface FailureReason {
  id: string;
  code: string;
  label: string;
  category: string;
  requiresNote: boolean;
  requiresPhoto: boolean;
  requiresArrival: boolean;
}

export interface Earnings {
  today: number;
  thisWeek: number;
  range: { from: string; to: string; total: number; deliveries: number };
  byType: Record<string, number>;
  lines: Array<{ id: string; type: string; amount: number; earnedAt: string; note: string | null; detail: Record<string, unknown> | null; taskNumber: string | null; orderNumber: string | null }>;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  taskId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface Loc {
  latitude?: number;
  longitude?: number;
}

const d = <T>(p: Promise<{ data: T }>) => p.then((r) => r.data);

export const riderApi = {
  signup: (body: { fullName: string; phone: string; email?: string; password: string; city?: string; vehicleType?: VehicleType; vehicleNumber?: string }) =>
    d<OtpSent>(api.post('/rider/auth/signup', body)),
  verify: (phone: string, code: string) => d<Session>(api.post('/rider/auth/verify', { phone, code })),
  resend: (phone: string) => d<OtpSent>(api.post('/rider/auth/resend', { phone })),
  login: (identifier: string, password: string) => d<Session>(api.post('/rider/auth/login', { identifier, password })),
  forgot: (phone: string) => d<OtpSent>(api.post('/rider/auth/forgot-password', { phone })),
  reset: (phone: string, code: string, newPassword: string) => d(api.post('/rider/auth/reset-password', { phone, code, newPassword })),
  logout: () => d(api.post('/rider/auth/logout')),
  me: () => d<Rider>(api.get('/rider/me')),
  uploadDocument: (file: File, kind: 'document' | 'photo') => {
    const f = new FormData();
    f.append('file', file);
    return d<{ url: string }>(api.post(`/rider/me/document?kind=${kind}`, f));
  },

  availability: (online: boolean, loc: Loc = {}) => d<{ availability: 'ONLINE' | 'OFFLINE' }>(api.post('/rider/availability', { online, ...loc })),
  location: (loc: Loc) => d(api.post('/rider/location', loc)),
  dashboard: () => d<Dashboard>(api.get('/rider/dashboard')),
  offers: () => d<Offer[]>(api.get('/rider/offers')),
  accept: (offerId: string) => d<{ status: string; taskId: string }>(api.post(`/rider/offers/${offerId}/accept`)),
  reject: (offerId: string, reason?: string) => d(api.post(`/rider/offers/${offerId}/reject`, { reason })),

  tasks: (scope: 'active' | 'history', page = 1) => d<TaskSummary[]>(api.get('/rider/tasks', { params: { scope, page } })),
  task: (id: string) => d<TaskDetail>(api.get(`/rider/tasks/${id}`)),
  step: (id: string, action: 'arrived-pickup' | 'picked-up' | 'start' | 'arrived' | 'returned', loc: Loc) => d(api.post(`/rider/tasks/${id}/${action}`, loc)),
  cod: (id: string, body: { amount: number; method: 'CASH' | 'UPI'; reference?: string } & Loc) => d(api.post(`/rider/tasks/${id}/cod`, body)),
  deliver: (id: string, otp: string, loc: Loc) => d(api.post(`/rider/tasks/${id}/deliver`, { otp, ...loc })),
  fail: (id: string, body: { reasonCode: string; note?: string; photoUrl?: string } & Loc) => d(api.post(`/rider/tasks/${id}/fail`, body)),
  release: (id: string, reason: string) => d(api.post(`/rider/tasks/${id}/release`, { reason })),
  uploadProof: (file: File) => {
    const f = new FormData();
    f.append('file', file);
    return d<{ url: string }>(api.post('/rider/uploads/proof', f));
  },
  failureReasons: () => d<FailureReason[]>(api.get('/rider/failure-reasons')),

  earnings: (from?: string, to?: string) => d<Earnings>(api.get('/rider/earnings', { params: { from, to } })),
  cash: () => d<{ balance: number; entries: Array<{ id: string; type: string; amount: number; reference: string | null; note: string | null; createdAt: string }> }>(api.get('/rider/cash')),
  notifications: () => d<Notification[]>(api.get('/rider/notifications')),
  markRead: (ids?: string[]) => d(api.patch('/rider/notifications/read', { ids })),
};
