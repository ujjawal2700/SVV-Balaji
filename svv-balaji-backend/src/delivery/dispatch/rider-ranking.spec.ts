import { assessRider, rankRiders, vehicleLimits, type RankingRules, type RiderFacts, type TaskFacts } from './rider-ranking';

const NOW = new Date('2026-10-03T10:00:00Z');
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000);
// Pickup at a fixed point; 0.009 deg of latitude is ~1 km.
const PICKUP = { lat: 21.1458, lng: 79.0882 };
const atKm = (km: number) => ({ lastLatitude: PICKUP.lat + km * 0.009, lastLongitude: PICKUP.lng, lastLocationAt: ago(1) });

const rider = (id: string, over: Partial<RiderFacts> = {}): RiderFacts => ({
  id, status: 'ACTIVE', availability: 'ONLINE', warehouseId: 'W1', vehicleType: 'SCOOTER', maxActiveTasks: 1,
  heldTasks: 0, pendingOffers: 0, cashInHand: 0, hasLiveSession: true, lastSeenAt: ago(1),
  ...atKm(1), lastAssignedAt: null, availabilityChangedAt: ago(60), ...over,
});
const rules = (over: Partial<RankingRules> = {}): RankingRules => ({
  riderHeartbeatMinutes: 30, locationFreshMinutes: 10, maxPickupDistanceKm: null, maxCashInHand: null, vehicleMaxKg: {}, ...over,
});
const task = (over: Partial<TaskFacts> = {}): TaskFacts => ({ warehouseId: 'W1', pickup: PICKUP, weightKg: null, triedRiderIds: new Set(), ...over });
const reasons = (r: RiderFacts, ru = rules(), t: TaskFacts | null = task()) => assessRider(r, ru, t, NOW).reasons;

describe('assessRider - who may be offered', () => {
  it('an online, signed-in, recently seen rider of the outlet with room is eligible', () => {
    expect(reasons(rider('a'))).toEqual([]);
  });

  it.each([
    ['NOT_ACTIVE', { status: 'SUSPENDED' as const }],
    ['OFFLINE', { availability: 'OFFLINE' as const }],
    ['SIGNED_OUT', { hasLiveSession: false }],
    ['NOT_SEEN', { lastSeenAt: ago(31) }],
    ['NOT_SEEN', { lastSeenAt: null }],
    ['OTHER_OUTLET', { warehouseId: 'W2' }],
    ['AT_CAPACITY', { heldTasks: 1 }],
    ['AT_CAPACITY', { pendingOffers: 1 }],
  ])('skips with %s', (code, over) => {
    expect(reasons(rider('a', over as Partial<RiderFacts>))).toContain(code);
  });

  it('honours the per-rider order limit set by admin (held + open offers)', () => {
    expect(reasons(rider('a', { maxActiveTasks: 3, heldTasks: 1, pendingOffers: 1 }))).toEqual([]);
    expect(reasons(rider('a', { maxActiveTasks: 3, heldTasks: 2, pendingOffers: 1 }))).toContain('AT_CAPACITY');
  });

  it('skips a rider already asked about this task', () => {
    expect(reasons(rider('a'), rules(), task({ triedRiderIds: new Set(['a']) }))).toContain('ALREADY_ASKED');
  });

  it('applies the cash-in-hand limit', () => {
    expect(reasons(rider('a', { cashInHand: 5000 }), rules({ maxCashInHand: 5000 }))).toContain('CASH_LIMIT');
    expect(reasons(rider('a', { cashInHand: 4999 }), rules({ maxCashInHand: 5000 }))).toEqual([]);
  });

  it('matches vehicle to order weight; unknown weight and unlisted vehicles have no limit', () => {
    const r = rules({ vehicleMaxKg: { BICYCLE: 5 } });
    expect(reasons(rider('a', { vehicleType: 'BICYCLE' }), r, task({ weightKg: 6 }))).toContain('VEHICLE');
    expect(reasons(rider('a', { vehicleType: 'BICYCLE' }), r, task({ weightKg: 5 }))).toEqual([]);
    expect(reasons(rider('a', { vehicleType: 'BICYCLE' }), r, task({ weightKg: null }))).toEqual([]);
    expect(reasons(rider('a', { vehicleType: 'SCOOTER' }), r, task({ weightKg: 60 }))).toEqual([]);
  });

  it('a rider with no vehicle on file is held to the OTHER limit', () => {
    expect(reasons(rider('a', { vehicleType: null }), rules({ vehicleMaxKg: { OTHER: 2 } }), task({ weightKg: 3 }))).toContain('VEHICLE');
  });

  it('distance limit: too far, or location unknown/stale', () => {
    const r = rules({ maxPickupDistanceKm: 3 });
    expect(reasons(rider('a', atKm(2)), r)).toEqual([]);
    expect(reasons(rider('a', atKm(4)), r)).toContain('TOO_FAR');
    expect(reasons(rider('a', { lastLocationAt: ago(11) }), r)).toContain('NO_LOCATION');
    expect(reasons(rider('a', { lastLatitude: null, lastLongitude: null, lastLocationAt: null }), r)).toContain('NO_LOCATION');
  });

  it('without a task (availability view) only rider-level checks apply', () => {
    expect(reasons(rider('a', { warehouseId: 'W9' }), rules(), null)).toEqual([]);
  });
});

describe('rankRiders - offer order', () => {
  it('nearest first', () => {
    const out = rankRiders([rider('far', atKm(3)), rider('near', atKm(0.2)), rider('mid', atKm(1.2))], rules(), task(), NOW);
    expect(out.filter((a) => a.eligible).map((a) => a.riderId)).toEqual(['near', 'mid', 'far']);
    expect(out[0].rank).toBe(1);
  });

  it('within the same 0.5 km band, the rider with fewer deliveries in hand goes first', () => {
    const out = rankRiders([
      rider('busy', { ...atKm(0.1), maxActiveTasks: 2, heldTasks: 1 }),
      rider('free', { ...atKm(0.4), maxActiveTasks: 2 }),
    ], rules(), task(), NOW);
    expect(out.map((a) => a.riderId)).toEqual(['free', 'busy']);
  });

  it('then whoever has waited longest for work', () => {
    const out = rankRiders([
      rider('recent', { ...atKm(1.1), lastAssignedAt: ago(5) }),
      rider('waiting', { ...atKm(1.2), lastAssignedAt: ago(90) }),
    ], rules(), task(), NOW);
    expect(out.map((a) => a.riderId)).toEqual(['waiting', 'recent']);
  });

  it('riders with no fresh location rank after every located rider', () => {
    const out = rankRiders([rider('blind', { lastLocationAt: ago(60) }), rider('far', atKm(9))], rules(), task(), NOW);
    expect(out.map((a) => [a.riderId, a.rank])).toEqual([['far', 1], ['blind', 2]]);
  });

  it('ineligible riders are listed last with no rank and their reasons', () => {
    const out = rankRiders([rider('off', { availability: 'OFFLINE' }), rider('ok')], rules(), task(), NOW);
    expect(out[0]).toMatchObject({ riderId: 'ok', rank: 1 });
    expect(out[1]).toMatchObject({ riderId: 'off', rank: null, eligible: false, reasons: ['OFFLINE'] });
  });

  it('is deterministic for ties (two API instances pick the same riders)', () => {
    const a = rankRiders([rider('b'), rider('a')], rules(), task(), NOW).map((x) => x.riderId);
    const b = rankRiders([rider('a'), rider('b')], rules(), task(), NOW).map((x) => x.riderId);
    expect(a).toEqual(b);
  });
});

describe('vehicleLimits', () => {
  it('keeps positive numbers only', () => {
    expect(vehicleLimits({ BICYCLE: 5, SCOOTER: '20', OTHER: 0, MOTORCYCLE: 'x' })).toEqual({ BICYCLE: 5, SCOOTER: 20 });
    expect(vehicleLimits(null)).toEqual({});
    expect(vehicleLimits([1])).toEqual({});
  });
});
