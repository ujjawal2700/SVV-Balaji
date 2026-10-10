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
  maxActiveTasks?: number;
  /** Heaviest load (kg) the rider can carry at once; deliveries over what is left are not offered. */
  maxCarryKg?: number | null;
  rejectionReason: string | null;
  /** Documents, PCC and security deposit cleared - may go online and get orders. */
  verified?: boolean;
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

/** ORDER_DELIVERY = normal delivery; RETURN_PICKUP = collect a returned item from the customer;
 * REPLACEMENT_DELIVERY = take an exchange's replacement to the customer. */
export type TaskKind = 'ORDER_DELIVERY' | 'RETURN_PICKUP' | 'REPLACEMENT_DELIVERY';
export interface ReturnRef {
  requestNumber: string;
  type: 'RETURN' | 'EXCHANGE';
  reason?: string;
}

export interface Offer {
  offerId: string;
  /** What completing it pays under the current pay rules (before waiting pay / target bonuses); null = no rule pays. */
  estimatedEarning?: number | null;
  kind?: TaskKind;
  returnRequest?: ReturnRef | null;
  /** Deadline on THIS phone's clock (rebased from the server's secondsLeft - see onPhoneClock). */
  expiresAt: string;
  secondsLeft?: number;
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
  kind?: TaskKind;
  returnRequest?: ReturnRef | null;
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
  kind?: TaskKind;
  returnRequest?: ReturnRef | null;
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
  rider: { id: string; fullName: string; code: string | null; status: RiderStatus; availability: 'ONLINE' | 'OFFLINE'; outlet: { id: string; name: string } | null; verified?: boolean };
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
  /** Super Admin broadcasts (type BROADCAST) may carry a picture and a page to open. */
  imageUrl?: string | null;
  link?: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface Loc {
  latitude?: number;
  longitude?: number;
}

/** Onboarding (GET /rider/verification): each required document incl. the PCC, and the security deposit. */
export type DocState = 'NOT_UPLOADED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
export interface DocUpload {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  fileUrls: string[];
  documentNumber: string | null;
  issuedBy: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
  rejectionReason: string | null;
  reviewedAt: string | null;
  uploadedAt: string;
}
export interface DocItem {
  type: {
    id: string; code: string; name: string; description: string | null; isSystem: boolean;
    requiresNumber: boolean; requiresIssuer: boolean; requiresIssueDate: boolean; requiresExpiry: boolean;
  };
  mandatory: boolean;
  state: DocState;
  satisfied: boolean;
  validUntil: string | null;
  canUpload: boolean;
  current: DocUpload | null;
  approvedInForce: DocUpload | null;
}
export type DepositStatus = 'NOT_REQUIRED' | 'NOT_PAID' | 'PARTIALLY_PAID' | 'PAID';
export interface DepositSummary {
  required: boolean;
  requiredAmount: number;
  paid: number;
  pending: number;
  status: DepositStatus;
  satisfied: boolean;
}
export interface Verification {
  status: RiderStatus;
  eligible: boolean;
  missing: string[];
  verifiedUntil: string | null;
  documents: DocItem[];
  pcc: DocItem | null;
  deposit: DepositSummary;
}
export interface DepositLedger extends DepositSummary {
  entries: Array<{ id: string; type: 'PAYMENT' | 'REFUND' | 'FORFEIT' | 'ADJUSTMENT'; amount: number; method: string | null; reference: string | null; note: string | null; createdAt: string; online: boolean }>;
}

const d = <T>(p: Promise<{ data: T }>) => p.then((r) => r.data);

/**
 * The server decides when an offer expires, by its own clock. A phone whose
 * clock is a few seconds off would otherwise show time left on a request the
 * server has already closed (or hide one that is still open). So the deadline
 * is rebuilt on this phone's clock from the server-measured seconds left.
 */
const onPhoneClock = (offers: Offer[]): Offer[] =>
  offers.map((o) => (typeof o.secondsLeft === 'number' ? { ...o, expiresAt: new Date(Date.now() + o.secondsLeft * 1000).toISOString() } : o));

export const riderApi = {
  signup: (body: { fullName: string; phone: string; email?: string; password: string; city?: string; vehicleType?: VehicleType; vehicleNumber?: string; maxCarryKg?: number }) =>
    d<OtpSent>(api.post('/rider/auth/signup', body)),
  verify: (phone: string, code: string) => d<Session>(api.post('/rider/auth/verify', { phone, code })),
  resend: (phone: string) => d<OtpSent>(api.post('/rider/auth/resend', { phone })),
  login: (identifier: string, password: string) => d<Session>(api.post('/rider/auth/login', { identifier, password })),
  forgot: (phone: string) => d<OtpSent>(api.post('/rider/auth/forgot-password', { phone })),
  reset: (phone: string, code: string, newPassword: string) => d(api.post('/rider/auth/reset-password', { phone, code, newPassword })),
  logout: () => d(api.post('/rider/auth/logout')),
  me: () => d<Rider>(api.get('/rider/me')),
  updateProfile: (body: { fullName?: string; email?: string; city?: string; vehicleType?: VehicleType; vehicleNumber?: string; maxCarryKg?: number }) =>
    d<Rider>(api.patch('/rider/me', body)),
  uploadDocument: (file: File, kind: 'document' | 'photo') => {
    const f = new FormData();
    f.append('file', file);
    return d<{ url: string }>(api.post(`/rider/me/document?kind=${kind}`, f));
  },

  verification: () => d<Verification>(api.get('/rider/verification')),
  uploadVerificationFile: (file: File) => {
    const f = new FormData();
    f.append('file', file);
    return d<{ url: string }>(api.post('/rider/verification/files', f));
  },
  submitDocument: (body: { typeId: string; fileUrls: string[]; documentNumber?: string; issuedBy?: string; issuedOn?: string; expiresOn?: string }) =>
    d<DocUpload>(api.post('/rider/verification/documents', body)),
  deposit: () => d<DepositLedger>(api.get('/rider/deposit')),
  depositOrder: (amount?: number) => d<{ gatewayOrderId: string; clientConfig: any; amount: number; pending: number }>(api.post('/rider/deposit/pay-order', { amount })),
  depositVerify: (input: { gatewayOrderId: string; paymentId: string; signature: string }) =>
    d<{ amount: number; paymentId: string; duplicate: boolean; deposit: DepositLedger }>(api.post('/rider/deposit/pay-verify', input)),

  availability: (online: boolean, loc: Loc = {}) => d<{ availability: 'ONLINE' | 'OFFLINE' }>(api.post('/rider/availability', { online, ...loc })),
  location: (loc: Loc) => d(api.post('/rider/location', loc)),
  dashboard: () => d<Dashboard>(api.get('/rider/dashboard')).then((x) => ({ ...x, offers: onPhoneClock(x.offers ?? []) })),
  offers: () => d<Offer[]>(api.get('/rider/offers')).then(onPhoneClock),
  accept: (offerId: string) => d<{ status: string; taskId: string }>(api.post(`/rider/offers/${offerId}/accept`)),
  reject: (offerId: string, reason?: string) => d(api.post(`/rider/offers/${offerId}/reject`, { reason })),

  tasks: (scope: 'active' | 'history', page = 1) => d<TaskSummary[]>(api.get('/rider/tasks', { params: { scope, page } })),
  task: (id: string) => d<TaskDetail>(api.get(`/rider/tasks/${id}`)),
  step: (id: string, action: 'arrived-pickup' | 'picked-up' | 'start' | 'arrived' | 'returned', loc: Loc) => d(api.post(`/rider/tasks/${id}/${action}`, loc)),
  cod: (id: string, body: { amount: number; method: 'CASH' | 'UPI'; reference?: string } & Loc) => d(api.post(`/rider/tasks/${id}/cod`, body)),
  deliver: (id: string, otp: string, loc: Loc) => d(api.post(`/rider/tasks/${id}/deliver`, { otp, ...loc })),
  fail: (id: string, body: { reasonCode: string; note?: string; photoUrl?: string } & Loc) => d(api.post(`/rider/tasks/${id}/fail`, body)),
  release: (id: string, reason: string) => d(api.post(`/rider/tasks/${id}/release`, { reason })),

  // Return pickups / exchange replacements have their own steps (stock, customer codes).
  returnStep: (id: string, action: 'arrived-pickup' | 'picked-up' | 'start' | 'arrived' | 'returned' | 'hand-in', loc: Loc) =>
    d(api.post(`/rider/return-tasks/${id}/${action}`, loc)),
  returnCode: (id: string, action: 'collect' | 'deliver', otp: string, loc: Loc) => d(api.post(`/rider/return-tasks/${id}/${action}`, { otp, ...loc })),
  returnFail: (id: string, body: { reasonCode: string; note?: string; photoUrl?: string } & Loc) => d(api.post(`/rider/return-tasks/${id}/fail`, body)),
  uploadProof: (file: File) => {
    const f = new FormData();
    f.append('file', file);
    return d<{ url: string }>(api.post('/rider/uploads/proof', f));
  },
  failureReasons: () => d<FailureReason[]>(api.get('/rider/failure-reasons')),

  earnings: (from?: string, to?: string) => d<Earnings>(api.get('/rider/earnings', { params: { from, to } })),
  payouts: () =>
    d<{ unpaid: number; payouts: Array<{ id: string; payoutNumber: string; paidAt: string; upTo: string; grossAmount: number; cashOffset: number; netPaid: number; method: 'BANK_TRANSFER' | 'UPI' | 'CASH'; reference: string | null; lineCount: number }> }>(api.get('/rider/payouts')),
  cash: () => d<{ balance: number; entries: Array<{ id: string; type: string; amount: number; reference: string | null; note: string | null; createdAt: string }> }>(api.get('/rider/cash')),
  createSettlementOrder: (amount?: number) => d<{ gatewayOrderId: string; clientConfig: any; amount: number; balance: number }>(api.post('/rider/cash/settle-order', { amount })),
  verifyCashSettlement: (input: { amount: number; gatewayOrderId: string; paymentId: string; signature: string }) => d<{ success: boolean; settledAmount: number; newBalance: number }>(api.post('/rider/cash/settle-verify', input)),
  notifications: () => d<Notification[]>(api.get('/rider/notifications')),
  markRead: (ids?: string[]) => d(api.patch('/rider/notifications/read', { ids })),
  registerPushDevice: (token: string) => d(api.post('/rider/push-devices', { token, app: 'RIDER' })),
  /** No auth needed - called while signing out. */
  unregisterPushDevice: (token: string) => d(api.post('/notifications/devices/unregister', { token })),
};
