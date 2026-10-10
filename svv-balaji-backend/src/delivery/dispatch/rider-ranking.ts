import type { RiderAvailability, RiderStatus, VehicleType } from '@prisma/client';
import { distanceKm } from '../zones/zone.logic';

/**
 * Who may be offered a delivery, and in what order. Pure: the dispatcher loads
 * the facts, this decides. The same function feeds the admin "who would get
 * this" view, so staff see exactly the reasons the dispatcher used.
 */

export type SkipReason =
  | 'NOT_ACTIVE' // suspended / not approved
  | 'NOT_VERIFIED' // documents / PCC / security deposit not cleared (or an approval expired)
  | 'OFFLINE' // switched themselves off
  | 'SIGNED_OUT' // no live login session
  | 'NOT_SEEN' // ONLINE but the app has gone quiet (killed, no signal)
  | 'OTHER_OUTLET' // serves a different pickup outlet
  | 'ALREADY_ASKED' // was offered this task before (rejected / expired / released)
  | 'AT_CAPACITY' // tasks in hand + open offers already at their limit
  | 'CASH_LIMIT' // holding too much COD cash
  | 'VEHICLE' // vehicle cannot carry the order weight
  | 'CARRY_LIMIT' // this task + what they already hold exceeds the kg they said they can carry
  | 'NO_LOCATION' // a distance limit is set and their position is unknown/stale
  | 'TOO_FAR'; // beyond the distance limit from the pickup

export const SKIP_LABEL: Record<SkipReason, string> = {
  NOT_ACTIVE: 'Account not active',
  NOT_VERIFIED: 'Verification incomplete',
  OFFLINE: 'Offline',
  SIGNED_OUT: 'Signed out',
  NOT_SEEN: 'App not responding',
  OTHER_OUTLET: 'Different outlet',
  ALREADY_ASKED: 'Already offered this delivery',
  AT_CAPACITY: 'At order limit',
  CASH_LIMIT: 'Cash limit reached',
  VEHICLE: 'Vehicle cannot carry this weight',
  CARRY_LIMIT: 'Over their carry limit (kg)',
  NO_LOCATION: 'Location unknown',
  TOO_FAR: 'Too far from pickup',
};

export interface RiderFacts {
  id: string;
  status: RiderStatus;
  /** Onboarding cleared: mandatory documents + PCC approved and in date, deposit paid if required. */
  verified: boolean;
  availability: RiderAvailability;
  warehouseId: string | null;
  vehicleType: VehicleType | null;
  maxActiveTasks: number;
  /** Tasks the rider is committed to (ASSIGNED .. AT_DROP, FAILED). */
  heldTasks: number;
  /** Open offers for OTHER tasks - each could become a held task. */
  pendingOffers: number;
  cashInHand: number;
  /** Kg the rider says they can carry at once; null/undefined = not set. */
  maxCarryKg?: number | null;
  /** Kg of the tasks they already hold (tasks of unknown weight count 0). */
  heldWeightKg?: number;
  hasLiveSession: boolean;
  lastSeenAt: Date | null;
  lastLatitude: number | null;
  lastLongitude: number | null;
  lastLocationAt: Date | null;
  /** When they last got a task (fairness tie-break: longest waiting first). */
  lastAssignedAt: Date | null;
  availabilityChangedAt: Date | null;
}

export interface TaskFacts {
  warehouseId: string;
  pickup: { lat: number; lng: number } | null;
  weightKg: number | null;
  /** Riders already offered this task. */
  triedRiderIds: ReadonlySet<string>;
}

export interface RankingRules {
  riderHeartbeatMinutes: number;
  locationFreshMinutes: number;
  maxPickupDistanceKm: number | null;
  maxCashInHand: number | null;
  /** kg per vehicle type; a type not listed has no limit. */
  vehicleMaxKg: Partial<Record<VehicleType, number>>;
}

export interface Assessed {
  riderId: string;
  eligible: boolean;
  reasons: SkipReason[];
  /** Straight-line km to the pickup, from a fresh location; null if unknown. */
  km: number | null;
  /** Spare slots = maxActiveTasks - held - pending offers. */
  spare: number;
  /** 1-based position among eligible riders; null when not eligible. */
  rank: number | null;
}

/** Distances within this band count as equally near, so a free rider beats a busy one 200 m closer. */
export const DISTANCE_BAND_KM = 0.5;

export function vehicleLimits(raw: unknown): Partial<Record<VehicleType, number>> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Partial<Record<VehicleType, number>> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    if (Number.isFinite(n) && n > 0) out[k as VehicleType] = n;
  }
  return out;
}

/**
 * Why this rider may not be offered this task (empty = eligible), plus their
 * distance. `task` may be omitted for a general "who is available" view, which
 * skips the task-specific checks (outlet, already asked, weight, distance).
 */
export function assessRider(r: RiderFacts, rules: RankingRules, task: TaskFacts | null, now: Date): Omit<Assessed, 'rank'> {
  const reasons: SkipReason[] = [];
  const spare = r.maxActiveTasks - r.heldTasks - r.pendingOffers;
  if (r.status !== 'ACTIVE') reasons.push('NOT_ACTIVE');
  if (!r.verified) reasons.push('NOT_VERIFIED');
  if (r.availability !== 'ONLINE') reasons.push('OFFLINE');
  if (!r.hasLiveSession) reasons.push('SIGNED_OUT');
  if (r.availability === 'ONLINE' && (!r.lastSeenAt || now.getTime() - r.lastSeenAt.getTime() > rules.riderHeartbeatMinutes * 60_000)) reasons.push('NOT_SEEN');
  if (spare <= 0) reasons.push('AT_CAPACITY');
  if (rules.maxCashInHand !== null && r.cashInHand >= rules.maxCashInHand) reasons.push('CASH_LIMIT');

  const fresh = r.lastLatitude !== null && r.lastLongitude !== null && r.lastLocationAt !== null
    && now.getTime() - r.lastLocationAt.getTime() <= rules.locationFreshMinutes * 60_000;
  let km: number | null = null;

  if (task) {
    if (r.warehouseId !== task.warehouseId) reasons.push('OTHER_OUTLET');
    if (task.triedRiderIds.has(r.id)) reasons.push('ALREADY_ASKED');
    const limit = rules.vehicleMaxKg[r.vehicleType ?? 'OTHER'];
    if (task.weightKg !== null && limit !== undefined && task.weightKg > limit) reasons.push('VEHICLE');
    if (task.weightKg !== null && r.maxCarryKg !== null && r.maxCarryKg !== undefined && (r.heldWeightKg ?? 0) + task.weightKg > r.maxCarryKg + 1e-9) {
      reasons.push('CARRY_LIMIT');
    }
    if (fresh && task.pickup) km = distanceKm({ lat: r.lastLatitude!, lng: r.lastLongitude! }, task.pickup);
    if (rules.maxPickupDistanceKm !== null && task.pickup) {
      if (km === null) reasons.push('NO_LOCATION');
      else if (km > rules.maxPickupDistanceKm) reasons.push('TOO_FAR');
    }
  }
  return { riderId: r.id, eligible: reasons.length === 0, reasons, km, spare };
}

/**
 * Best first: located riders by distance band, then fewer deliveries in hand,
 * then whoever has waited longest for work. Riders with no fresh location go
 * after every located rider (only possible when no distance limit is set).
 */
export function compareCandidates(a: { km: number | null; r: RiderFacts }, b: { km: number | null; r: RiderFacts }): number {
  if ((a.km === null) !== (b.km === null)) return a.km === null ? 1 : -1;
  if (a.km !== null && b.km !== null) {
    const band = Math.floor(a.km / DISTANCE_BAND_KM) - Math.floor(b.km / DISTANCE_BAND_KM);
    if (band !== 0) return band;
  }
  if (a.r.heldTasks !== b.r.heldTasks) return a.r.heldTasks - b.r.heldTasks;
  const waited = (x: RiderFacts) => (x.lastAssignedAt ?? x.availabilityChangedAt ?? new Date(0)).getTime();
  const w = waited(a.r) - waited(b.r);
  if (w !== 0) return w;
  if (a.km !== null && b.km !== null && a.km !== b.km) return a.km - b.km;
  return a.r.id.localeCompare(b.r.id); // stable, so two dispatchers agree
}

/** Assess every rider and number the eligible ones in offer order. */
export function rankRiders(riders: RiderFacts[], rules: RankingRules, task: TaskFacts | null, now = new Date()): Assessed[] {
  const assessed = riders.map((r) => ({ r, a: assessRider(r, rules, task, now) }));
  const eligible = assessed.filter((x) => x.a.eligible).sort((x, y) => compareCandidates({ km: x.a.km, r: x.r }, { km: y.a.km, r: y.r }));
  const rank = new Map(eligible.map((x, i) => [x.r.id, i + 1]));
  return assessed
    .map((x) => ({ ...x.a, rank: rank.get(x.r.id) ?? null }))
    .sort((x, y) => (x.rank ?? Infinity) - (y.rank ?? Infinity) || (x.km ?? Infinity) - (y.km ?? Infinity));
}
