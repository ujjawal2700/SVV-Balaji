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
  /** Kg the rider says they can carry at once (decimal string); null = not set. */
  maxCarryKg?: string | number | null;
  createdAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
  warehouse: { id: string; name: string } | null;
  activeTasks?: number;
  cashInHand?: number;
  /** Onboarding cleared: mandatory documents + PCC approved and in date, deposit paid if required. */
  verified?: boolean;
  verifiedUntil?: string | null;
  /** Uploads waiting for staff review. */
  documentsToReview?: number;
  depositPaid?: number;
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
  /** Staff override: never auto-offered until resumed or assigned. */
  autoDispatchPaused: boolean;
  /** Goods weight (kg) from product pack weights; null = some item has no weight. */
  weightKg: string | null;
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
  kind?: 'ORDER_DELIVERY' | 'RETURN_PICKUP' | 'REPLACEMENT_DELIVERY';
  /** Set on return pickups / exchange deliveries - these trips carry no order of their own. */
  returnRequest?: { id: string; requestNumber: string; type: 'RETURN' | 'EXCHANGE'; channel: 'B2C' | 'B2B' } | null;
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
  /** Riders offered a delivery at the same time; first to accept gets it. */
  broadcastSize: number;
  maxPickupDistanceKm: string | null;
  riderHeartbeatMinutes: number;
  /** kg per vehicle type; a type not listed has no limit. */
  vehicleMaxKg: Partial<Record<VehicleType, number>>;
  /** Riders must pay the security deposit before taking orders. */
  securityDepositRequired: boolean;
  securityDepositAmount: string;
}

export type VehicleType = 'BICYCLE' | 'MOTORCYCLE' | 'SCOOTER' | 'EV_SCOOTER' | 'OTHER';
export const VEHICLE_LABEL: Record<VehicleType, string> = {
  BICYCLE: 'Bicycle', MOTORCYCLE: 'Motorcycle', SCOOTER: 'Scooter', EV_SCOOTER: 'EV scooter', OTHER: 'Other / not recorded',
};

/** GET /delivery/tasks/:id/candidates - the outlet's riders, ranked as the dispatcher would offer the task. */
export interface TaskCandidates {
  taskId: string;
  weightKg: number | null;
  broadcastSize: number;
  autoOffer: boolean;
  autoDispatchPaused: boolean;
  riders: Array<{
    id: string; code: string | null; fullName: string; phone: string; vehicleType: VehicleType | null; vehicleNumber: string | null;
    availability: 'ONLINE' | 'OFFLINE'; lastSeenAt: string | null; heldTasks: number; maxActiveTasks: number;
    rank: number | null; eligible: boolean; km: number | null;
    reasons: Array<{ code: string; label: string }>;
  }>;
}

export type RiderState = 'AVAILABLE' | 'BUSY' | 'NOT_RESPONDING' | 'OFFLINE';
/** GET /delivery/availability - rider headcount per outlet right now. */
export interface RiderAvailability {
  totals: { available: number; busy: number; notResponding: number; offline: number };
  outlets: Array<{
    warehouseId: string; name: string; available: number; busy: number; notResponding: number; offline: number;
    riders: Array<{ id: string; fullName: string; state: RiderState; heldTasks: number; maxActiveTasks: number; lastSeenAt: string | null; reasons: string[] }>;
  }>;
  autoOffer: boolean;
  broadcastSize: number;
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
  | 'BASE_PER_DELIVERY' | 'DISTANCE_SLAB' | 'PEAK_HOUR' | 'ZONE_INCENTIVE' | 'DAILY_TARGET' | 'WEEKLY_TARGET' | 'WAITING_TIME' | 'OUTCOME_COMPENSATION'
  | 'RETURN_PICKUP_PAY' | 'PER_KG';

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
  BASE: 'Base pay', DISTANCE: 'Distance', WEIGHT: 'Weight', PEAK: 'Peak hour', ZONE_INCENTIVE: 'Zone incentive', DAILY_BONUS: 'Daily target',
  WEEKLY_BONUS: 'Weekly target', WAITING: 'Waiting time', OUTCOME: 'Cancel / failed compensation', ADJUSTMENT: 'Adjustment',
};

// ------------------------------------------------------------------ rider onboarding

export type DocState = 'NOT_UPLOADED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
export interface RiderDocumentType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isMandatory: boolean;
  isActive: boolean;
  requiresNumber: boolean;
  requiresIssuer: boolean;
  requiresIssueDate: boolean;
  requiresExpiry: boolean;
  /** Built in (the PCC): always mandatory, cannot be switched off. */
  isSystem: boolean;
  sortOrder: number;
}
export interface RiderDocUpload {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  fileUrls: string[];
  documentNumber: string | null;
  issuedBy: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
  rejectionReason: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  supersededAt: string | null;
  uploadedAt: string;
}
export interface RiderDocItem {
  type: Pick<RiderDocumentType, 'id' | 'code' | 'name' | 'description' | 'isSystem' | 'requiresNumber' | 'requiresIssuer' | 'requiresIssueDate' | 'requiresExpiry'>;
  mandatory: boolean;
  state: DocState;
  satisfied: boolean;
  validUntil: string | null;
  canUpload: boolean;
  current: RiderDocUpload | null;
  approvedInForce: RiderDocUpload | null;
}
export type DepositStatus = 'NOT_REQUIRED' | 'NOT_PAID' | 'PARTIALLY_PAID' | 'PAID';
export interface RiderDepositSummary {
  required: boolean;
  requiredAmount: number;
  paid: number;
  pending: number;
  status: DepositStatus;
  satisfied: boolean;
}
export interface RiderVerification {
  riderId: string;
  status: RiderStatus;
  eligible: boolean;
  missing: string[];
  verifiedUntil: string | null;
  documents: RiderDocItem[];
  pcc: RiderDocItem | null;
  deposit: RiderDepositSummary;
  history: Array<RiderDocUpload & { type: { code: string; name: string } }>;
}
export type DepositEntryType = 'PAYMENT' | 'REFUND' | 'FORFEIT' | 'ADJUSTMENT';
export type DepositMethod = 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'ONLINE' | 'EARNINGS_DEDUCTION' | 'OTHER';
export interface RiderDepositLedger extends RiderDepositSummary {
  entries: Array<{ id: string; type: DepositEntryType; amount: number; method: DepositMethod | null; reference: string | null; note: string | null; createdAt: string; recordedBy: string | null; online: boolean }>;
}
export interface VerificationQueueRow extends RiderDocUpload {
  type: { id: string; code: string; name: string; isSystem: boolean; requiresExpiry: boolean };
  rider: { id: string; code: string | null; fullName: string; phone: string; status: RiderStatus; photoUrl: string | null; isVerified: boolean; warehouse: { id: string; name: string } | null };
}

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
  updateRider: (id: string, b: { warehouseId?: string; maxActiveTasks?: number; maxCarryKg?: number; vehicleType?: string; vehicleNumber?: string; city?: string }) => d(api.patch(`/riders/${id}`, b)),
  riderCash: (id: string) => d<{ balance: number; entries: Array<{ id: string; type: string; amount: number; reference: string | null; note: string | null; createdAt: string; recordedBy: { fullName: string } | null }> }>(api.get(`/riders/${id}/cash`)),
  deposit: (id: string, b: { amount: number; reference?: string; note?: string }) => d(api.post(`/riders/${id}/cash/deposits`, b)),
  riderEarnings: (id: string, q: { from?: string; to?: string } = {}) => d<RiderEarnings>(api.get(`/riders/${id}/earnings`, { params: pruneEmpty(q) })),
  adjustEarnings: (id: string, b: { amount: number; note: string }) => d(api.post(`/riders/${id}/earnings/adjustments`, b)),

  riderVerification: (id: string) => d<RiderVerification>(api.get(`/riders/${id}/verification`)),
  verificationQueue: (q: { type?: string; warehouseId?: string } = {}) => d<VerificationQueueRow[]>(api.get('/riders/verification-queue', { params: pruneEmpty(q) })),
  approveDocument: (docId: string, note?: string) => d(api.post(`/riders/documents/${docId}/approve`, { note })),
  rejectDocument: (docId: string, b: { reason: string; note?: string }) => d(api.post(`/riders/documents/${docId}/reject`, b)),
  documentTypes: () => d<RiderDocumentType[]>(api.get('/riders/document-types')),
  createDocumentType: (b: Partial<RiderDocumentType>) => d<RiderDocumentType>(api.post('/riders/document-types', b)),
  updateDocumentType: (id: string, b: Partial<RiderDocumentType>) => d<RiderDocumentType>(api.patch(`/riders/document-types/${id}`, b)),
  riderDeposit: (id: string) => d<RiderDepositLedger>(api.get(`/riders/${id}/deposit`)),
  recordDeposit: (id: string, b: { type: DepositEntryType; amount: number; method?: DepositMethod; reference?: string; note?: string }) =>
    d<RiderDepositLedger>(api.post(`/riders/${id}/deposit/entries`, b)),

  tasks: (q: { status?: TaskStatus; warehouseId?: string; needsAssignment?: boolean; riderId?: string } = {}) =>
    d<DeliveryTaskRow[]>(api.get('/delivery/tasks', { params: pruneEmpty({ ...q, needsAssignment: q.needsAssignment ? 'true' : undefined }) })),
  task: (id: string) => d<DeliveryTaskDetail>(api.get(`/delivery/tasks/${id}`)),
  assign: (id: string, riderId: string) => d(api.post(`/delivery/tasks/${id}/assign`, { riderId })),
  unassign: (id: string, reason: string) => d(api.post(`/delivery/tasks/${id}/unassign`, { reason })),
  redispatch: (id: string) => d(api.post(`/delivery/tasks/${id}/redispatch`)),
  setAutoDispatch: (id: string, paused: boolean) => d(api.post(`/delivery/tasks/${id}/auto-dispatch`, { paused })),
  candidates: (id: string) => d<TaskCandidates>(api.get(`/delivery/tasks/${id}/candidates`)),
  availability: (warehouseId?: string) => d<RiderAvailability>(api.get('/delivery/availability', { params: { warehouseId } })),
  reattempt: (id: string) => d(api.post(`/delivery/tasks/${id}/reattempt`)),

  settings: () => d<DeliverySettings>(api.get('/delivery/settings')),
  updateSettings: (b: Partial<Omit<DeliverySettings, 'maxCashInHand' | 'securityDepositAmount'>> & { maxCashInHand?: number | null; securityDepositAmount?: number }) => d<DeliverySettings>(api.patch('/delivery/settings', b)),
  reasons: () => d<FailureReason[]>(api.get('/delivery/failure-reasons')),
  createReason: (b: Partial<FailureReason>) => d(api.post('/delivery/failure-reasons', b)),
  updateReason: (id: string, b: Partial<FailureReason>) => d(api.patch(`/delivery/failure-reasons/${id}`, b)),
  rules: () => d<EarningRule[]>(api.get('/delivery/earning-rules')),
  createRule: (b: Partial<EarningRule>) => d(api.post('/delivery/earning-rules', b)),
  updateRule: (id: string, b: Partial<EarningRule>) => d(api.patch(`/delivery/earning-rules/${id}`, b)),
  removeRule: (id: string) => d<{ deleted: boolean; deactivated: boolean }>(api.delete(`/delivery/earning-rules/${id}`)),
};
