import { api } from './client';
import { pruneEmpty } from './envelope';

/** Admin side of Quick Delivery (backend src/delivery): zones, riders, the delivery board, settings, pay rules. */

export type ZoneProductScope = 'ALL_PRODUCTS' | 'SELECTED_CATEGORIES';
export type ZoneFallback = 'STANDARD' | 'COURIER';
export interface OpeningWindow { day: number; open: string; close: string }

export interface DeliveryZone {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  quickEnabled: boolean;
  warehouseId: string;
  warehouse: { id: string; name: string; latitude: string | null; longitude: string | null; isActive: boolean };
  boundary: Array<[number, number]> | null;
  pincodes: string[];
  maxRadiusKm: string | null;
  targetMinMinutes: number;
  targetMaxMinutes: number;
  operatingHours: OpeningWindow[];
  timezone: string;
  productScope: ZoneProductScope;
  categoryIds: string[];
  fallback: ZoneFallback;
  quickFee: string;
  quickFreeAbove: string | null;
  priority: number;
  _count?: { orders: number };
}

export type ZoneInput = Partial<{
  name: string; code: string; isActive: boolean; quickEnabled: boolean; warehouseId: string;
  boundary: Array<[number, number]> | null; pincodes: string[]; maxRadiusKm: number | null;
  targetMinMinutes: number; targetMaxMinutes: number; operatingHours: OpeningWindow[]; timezone: string;
  productScope: ZoneProductScope; categoryIds: string[]; fallback: ZoneFallback;
  quickFee: number; quickFreeAbove: number | null; priority: number;
}>;

export type RiderStatus = 'PENDING_VERIFICATION' | 'PENDING_APPROVAL' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';

export interface RiderRow {
  id: string;
  code: string | null;
  fullName: string;
  phone: string;
  email: string | null;
  status: RiderStatus;
  city: string | null;
  vehicleType: string | null;
  vehicleNumber: string | null;
  licenceNumber: string | null;
  documentUrl: string | null;
  photoUrl: string | null;
  availability: 'ONLINE' | 'OFFLINE';
  lastLocationAt: string | null;
  lastLatitude: string | null;
  lastLongitude: string | null;
  maxActiveTasks: number;
  createdAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
  warehouse: { id: string; name: string } | null;
  activeTasks?: number;
  cashInHand?: number;
}

export type TaskStatus =
  | 'READY_FOR_PICKUP' | 'OFFERED' | 'ASSIGNED' | 'AT_PICKUP' | 'PICKED_UP' | 'OUT_FOR_DELIVERY' | 'AT_DROP'
  | 'DELIVERED' | 'FAILED' | 'RETURNED_TO_STORE' | 'CANCELLED';

export interface DeliveryTaskRow {
  id: string;
  taskNumber: string;
  status: TaskStatus;
  speed: 'QUICK' | 'STANDARD';
  attempt: number;
  needsManualAssignment: boolean;
  offerRound: number;
  dropName: string;
  dropAddress: string;
  distanceKm: string | null;
  codAmount: string;
  promisedBy: string | null;
  readyAt: string;
  assignedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  failureReasonCode: string | null;
  failureNote: string | null;
  failureProofUrl: string | null;
  cancelStage: string | null;
  rider: { id: string; fullName: string; phone: string; code: string | null } | null;
  warehouse: { id: string; name: string };
  zone: { id: string; name: string; code: string } | null;
  order: { id: string; orderNumber: string; status: string; paymentMode: string | null; paymentStatus: string; total: string } | null;
}

export interface DeliveryTaskDetail extends DeliveryTaskRow {
  events: Array<{ id: string; type: string; note: string | null; createdAt: string; riderId: string | null; actorUserId: string | null }>;
  offers: Array<{ id: string; status: string; round: number; offeredAt: string; respondedAt: string | null; rejectReason: string | null; rider: { fullName: string } }>;
  cod: { collectedAmount: string; method: string; reference: string | null; collectedAt: string } | null;
  earnings: Array<{ type: string; amount: string }>;
}

export interface DeliverySettings {
  autoOffer: boolean;
  offerTimeoutSeconds: number;
  maxOfferRounds: number;
  locationFreshMinutes: number;
  geofenceMeters: number;
  requireCodBeforeDelivery: boolean;
  maxCashInHand: string | null;
  reattemptDelayMinutes: number;
}

export interface FailureReason {
  id: string;
  code: string;
  label: string;
  category: 'CUSTOMER_UNAVAILABLE' | 'CUSTOMER_REFUSED' | 'ADDRESS_ISSUE' | 'RIDER_ISSUE' | 'OTHER';
  isActive: boolean;
  requiresNote: boolean;
  requiresPhoto: boolean;
  requiresArrival: boolean;
  followUp: 'RETURN_TO_STORE' | 'AUTO_REATTEMPT';
  sortOrder: number;
}

export type EarningRuleKind =
  | 'BASE_PER_DELIVERY' | 'DISTANCE_SLAB' | 'PEAK_HOUR' | 'ZONE_INCENTIVE' | 'DAILY_TARGET' | 'WEEKLY_TARGET' | 'WAITING_TIME' | 'OUTCOME_COMPENSATION';

export interface EarningRule {
  id: string;
  name: string;
  kind: EarningRuleKind;
  isActive: boolean;
  zoneId: string | null;
  zone: { id: string; name: string; code: string } | null;
  config: Record<string, unknown>;
  validFrom: string | null;
  validTo: string | null;
}

export interface RiderEarnings {
  today: number;
  thisWeek: number;
  range: { from: string; to: string; total: number; deliveries: number };
  byType: Record<string, number>;
  lines: Array<{ id: string; type: string; amount: number; earnedAt: string; note: string | null; taskNumber: string | null; orderNumber: string | null }>;
}

/** One rider as the staff rider page reads it (GET /riders/:id). */
export interface RiderDetail extends Omit<RiderRow, 'activeTasks'> {
  reviewedBy: { fullName: string } | null;
  stats: { delivered: number; failed: number };
  activeTasks: Array<{ id: string; taskNumber: string; status: TaskStatus }>;
}

export interface RiderEarningsReport {
  from: string;
  to: string;
  totals: { earned: number; deliveries: number; failed: number; riders: number };
  byType: Record<string, number>;
  rows: Array<{
    rider: { id: string; code: string | null; fullName: string; phone: string; status: RiderStatus; availability: 'ONLINE' | 'OFFLINE'; photoUrl: string | null; warehouse: { id: string; name: string } | null };
    deliveries: number;
    failed: number;
    total: number;
    byType: Record<string, number>;
  }>;
}

export interface RiderCashReport {
  totalHeld: number;
  riders: Array<{
    id: string; code: string | null; fullName: string; phone: string; status: RiderStatus; availability: 'ONLINE' | 'OFFLINE';
    warehouse: { id: string; name: string } | null; balance: number; lastCollectedAt: string | null; lastDepositAt: string | null;
  }>;
  deposits: {
    from: string;
    to: string;
    total: number;
    entries: Array<{ id: string; amount: number; reference: string | null; note: string | null; createdAt: string; rider: { id: string; code: string | null; fullName: string }; recordedBy: { fullName: string } | null }>;
  };
}

/** Earning line types as the rider app and reports name them. */
export const EARNING_TYPE_LABEL: Record<string, string> = {
  BASE: 'Base pay', DISTANCE: 'Distance', PEAK: 'Peak hour', ZONE_INCENTIVE: 'Zone incentive', DAILY_BONUS: 'Daily target',
  WEEKLY_BONUS: 'Weekly target', WAITING: 'Waiting time', OUTCOME: 'Cancel / failed compensation', ADJUSTMENT: 'Adjustment',
};

const d = <T>(p: Promise<{ data: T }>) => p.then((r) => r.data);

export const deliveryApi = {
  zones: () => d<DeliveryZone[]>(api.get('/delivery-zones')),
  createZone: (b: ZoneInput) => d<DeliveryZone>(api.post('/delivery-zones', b)),
  updateZone: (id: string, b: ZoneInput) => d<DeliveryZone>(api.patch(`/delivery-zones/${id}`, b)),
  removeZone: (id: string) => d<{ deleted: boolean; deactivated: boolean }>(api.delete(`/delivery-zones/${id}`)),
  testZone: (b: { latitude?: number; longitude?: number; pincode?: string }) =>
    d<{ zone: { id: string; name: string; code: string } | null; matchedBy: string | null; distanceKm: number | null; quickEnabled: boolean; openNow: boolean; servingOutlet?: string }>(api.post('/delivery-zones/test', b)),

  riders: (q: { status?: RiderStatus; warehouseId?: string; q?: string } = {}) => d<RiderRow[]>(api.get('/riders', { params: pruneEmpty(q) })),
  liveRiders: (warehouseId?: string) => d<Array<RiderRow & { tasks: Array<{ id: string; taskNumber: string; status: string }> }>>(api.get('/riders/live', { params: pruneEmpty({ warehouseId }) })),
  rider: (id: string) => d<RiderDetail>(api.get(`/riders/${id}`)),
  earningsReport: (q: { from?: string; to?: string; warehouseId?: string } = {}) => d<RiderEarningsReport>(api.get('/riders/earnings-report', { params: pruneEmpty(q) })),
  cashReport: (q: { from?: string; to?: string; warehouseId?: string } = {}) => d<RiderCashReport>(api.get('/riders/cash-report', { params: pruneEmpty(q) })),
  approveRider: (id: string, b: { warehouseId: string; maxActiveTasks?: number }) => d(api.post(`/riders/${id}/approve`, b)),
  rejectRider: (id: string, reason: string) => d(api.post(`/riders/${id}/reject`, { reason })),
  suspendRider: (id: string, reason: string) => d(api.post(`/riders/${id}/suspend`, { reason })),
  reactivateRider: (id: string) => d(api.post(`/riders/${id}/reactivate`)),
  updateRider: (id: string, b: { warehouseId?: string; maxActiveTasks?: number; vehicleType?: string; vehicleNumber?: string; city?: string }) => d(api.patch(`/riders/${id}`, b)),
  riderCash: (id: string) => d<{ balance: number; entries: Array<{ id: string; type: string; amount: number; reference: string | null; note: string | null; createdAt: string; recordedBy: { fullName: string } | null }> }>(api.get(`/riders/${id}/cash`)),
  deposit: (id: string, b: { amount: number; reference?: string; note?: string }) => d(api.post(`/riders/${id}/cash/deposits`, b)),
  riderEarnings: (id: string, q: { from?: string; to?: string } = {}) => d<RiderEarnings>(api.get(`/riders/${id}/earnings`, { params: pruneEmpty(q) })),
  adjustEarnings: (id: string, b: { amount: number; note: string }) => d(api.post(`/riders/${id}/earnings/adjustments`, b)),

  tasks: (q: { status?: TaskStatus; warehouseId?: string; needsAssignment?: boolean; riderId?: string } = {}) =>
    d<DeliveryTaskRow[]>(api.get('/delivery/tasks', { params: pruneEmpty({ ...q, needsAssignment: q.needsAssignment ? 'true' : undefined }) })),
  task: (id: string) => d<DeliveryTaskDetail>(api.get(`/delivery/tasks/${id}`)),
  assign: (id: string, riderId: string) => d(api.post(`/delivery/tasks/${id}/assign`, { riderId })),
  unassign: (id: string, reason: string) => d(api.post(`/delivery/tasks/${id}/unassign`, { reason })),
  redispatch: (id: string) => d(api.post(`/delivery/tasks/${id}/redispatch`)),
  reattempt: (id: string) => d(api.post(`/delivery/tasks/${id}/reattempt`)),

  settings: () => d<DeliverySettings>(api.get('/delivery/settings')),
  updateSettings: (b: Partial<Omit<DeliverySettings, 'maxCashInHand'>> & { maxCashInHand?: number | null }) => d<DeliverySettings>(api.patch('/delivery/settings', b)),
  reasons: () => d<FailureReason[]>(api.get('/delivery/failure-reasons')),
  createReason: (b: Partial<FailureReason>) => d(api.post('/delivery/failure-reasons', b)),
  updateReason: (id: string, b: Partial<FailureReason>) => d(api.patch(`/delivery/failure-reasons/${id}`, b)),
  rules: () => d<EarningRule[]>(api.get('/delivery/earning-rules')),
  createRule: (b: Partial<EarningRule>) => d(api.post('/delivery/earning-rules', b)),
  updateRule: (id: string, b: Partial<EarningRule>) => d(api.patch(`/delivery/earning-rules/${id}`, b)),
  removeRule: (id: string) => d<{ deleted: boolean; deactivated: boolean }>(api.delete(`/delivery/earning-rules/${id}`)),
};
