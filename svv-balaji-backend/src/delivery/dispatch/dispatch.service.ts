import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  DeliveryOffer,
  DeliveryOfferStatus,
  DeliverySettings,
  DeliveryTask,
  DeliveryTaskStatus,
  OrderStatus,
  Prisma,
  RiderAvailability,
  RiderStatus,
} from '@prisma/client';
import { SequenceService } from '../../common/sequence.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderEventsService } from '../../realtime/order-events.service';
import { SalesService } from '../../sales/sales.service';
import { DeliveryEventsService, DeliverySettingsService } from '../core/delivery-core';
import { EarningsService } from '../earnings/earnings.service';
import type { Outcome } from '../earnings/earning.logic';
import { assessRider, rankRiders, SKIP_LABEL, vehicleLimits, type RankingRules, type RiderFacts, type TaskFacts } from './rider-ranking';
import { isVerifiedNow } from '../verification/verification.logic';
import { LONG_TX } from '../../common/tx-options';

/** A task still in someone's hands (or waiting for someone). */
export const LIVE_STATUSES: DeliveryTaskStatus[] = [
  'READY_FOR_PICKUP', 'OFFERED', 'ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'AT_DROP',
];
/** Statuses where the rider is committed to the task (counts against maxActiveTasks). */
export const HELD_STATUSES: DeliveryTaskStatus[] = ['ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'AT_DROP', 'FAILED'];

const SWEEP_MS = 5_000;

/**
 * An accept tapped as the countdown ends still has to cross the network. An
 * offer stays answerable this long past its deadline (the rider app counts
 * down to the deadline itself), and the sweep closes it only after that, so a
 * tap made in time is not lost to latency.
 */
export const OFFER_GRACE_MS = 4_000;
/** Offers with a deadline after this are still open (deadline + grace not passed). */
const openSince = () => new Date(Date.now() - OFFER_GRACE_MS);

/**
 * Offers that mean the rider passed on the task (rejected, released it, or let
 * it time out) - they are not asked again. WITHDRAWN (staff took it over) and
 * TAKEN (someone else was faster) were not the rider's choice.
 */
const SAID_NO: DeliveryOfferStatus[] = ['REJECTED', 'EXPIRED'];

/** Remove a trailing ", Ph 98765..." (the order's address line carries the phone). */
export const stripPhone = (address: string) => address.replace(/,?\s*Ph\.?\s*[+\d][\d\s-]{6,}\s*$/i, '').trim();

/**
 * Turns packed local-delivery orders into delivery tasks and gets them to a
 * rider: broadcast auto-offer (the best few riders at once, first to accept
 * wins, timeout -> next round) or staff assignment, which always overrides. Listens to the existing order event bus - it never adds order
 * statuses; it only moves the order at pickup (DISPATCHED) via SalesService.
 */
@Injectable()
export class DispatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DispatchService.name);
  private timer?: NodeJS.Timeout;
  private sweeping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly settings: DeliverySettingsService,
    private readonly events: DeliveryEventsService,
    private readonly orderEvents: OrderEventsService,
    private readonly sales: SalesService,
    private readonly earnings: EarningsService,
    private readonly push: NotificationsService,
  ) {}

  onModuleInit() {
    this.orderEvents.on('updated', (orderId) => void this.onOrderChanged(orderId).catch((e) => this.logger.warn(`order sync ${orderId}: ${String(e)}`)));
    this.timer = setInterval(() => void this.sweep(), SWEEP_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ---------------------------------------------------------------- helpers

  async log(taskId: string, type: string, extra: { note?: string; riderId?: string | null; actorUserId?: string | null; lat?: number | null; lng?: number | null } = {}, client: Prisma.TransactionClient | PrismaService = this.prisma) {
    await client.deliveryTaskEvent.create({
      data: {
        taskId, type, note: extra.note, riderId: extra.riderId ?? undefined, actorUserId: extra.actorUserId ?? undefined,
        latitude: extra.lat ?? undefined, longitude: extra.lng ?? undefined,
      },
    });
  }

  /** Inbox row + socket nudge (app open) + system push (app in background / closed). */
  async notify(riderId: string, type: string, title: string, body: string, taskId?: string) {
    await this.notifyMany([riderId], type, title, body, taskId);
  }

  async notifyMany(riderIds: string[], type: string, title: string, body: string, taskId?: string, ttlSeconds?: number) {
    if (!riderIds.length) return;
    for (const riderId of riderIds) {
      const n = await this.prisma.riderNotification.create({ data: { riderId, type, title, body, taskId } });
      this.events.publish({ kind: 'notification', riderId, notificationId: n.id });
    }
    // Offers and assignments are urgent; the rest are ordinary inbox pushes.
    const urgent = type === 'OFFER' || type === 'TASK_ASSIGNED';
    void this.push.pushToRiders(riderIds, {
      title, body,
      link: type === 'OFFER' ? '/' : taskId ? `/task/${taskId}` : '/notifications',
      tag: urgent && taskId ? `${type.toLowerCase()}-${taskId}` : `rider-${type.toLowerCase()}`,
      extra: { kind: type, ...(taskId ? { taskId } : {}) },
      ttlSeconds,
    });
  }

  changed(task: Pick<DeliveryTask, 'id' | 'riderId' | 'orderId' | 'status'>) {
    this.events.publish({ kind: 'task:updated', riderId: task.riderId, taskId: task.id, orderId: task.orderId, status: task.status });
    if (task.orderId) this.orderEvents.publish('updated', task.orderId);
  }

  // ---------------------------------------------------------------- order sync

  private async onOrderChanged(orderId: string) {
    const o = await this.prisma.order.findUnique({ where: { id: orderId }, select: { status: true, fulfillmentMethod: true } });
    if (!o) return;
    if (o.status === OrderStatus.PACKED && o.fulfillmentMethod === 'LOCAL') await this.ensureTaskForOrder(orderId);
    if (o.status === OrderStatus.CANCELLED) await this.cancelTasksForOrder(orderId, 'Order cancelled');
  }

  /** Create the delivery task for a packed LOCAL order (idempotent), then dispatch it. */
  async ensureTaskForOrder(orderId: string, actorUserId?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true, orderNumber: true, status: true, fulfillmentMethod: true, warehouseId: true, deliveryZoneId: true, deliverySpeed: true,
        addressSnapshot: true, deliveryAddress: true, distanceKm: true, total: true, refundWalletPaidInr: true, paymentMode: true, paymentStatus: true, etaMax: true,
        riderName: true,
      },
    });
    if (!order || order.status !== OrderStatus.PACKED || order.fulfillmentMethod !== 'LOCAL') return null;
    // Delivered by hand through the legacy staff "assign rider" path - leave it alone.
    if (order.riderName) return null;
    const open = await this.prisma.deliveryTask.findFirst({ where: { orderId, status: { in: [...LIVE_STATUSES, 'FAILED'] } } });
    if (open) return open;

    const prior = await this.prisma.deliveryTask.count({ where: { orderId } });
    const a = (order.addressSnapshot ?? {}) as Record<string, unknown>;
    const lat = typeof a.latitude === 'number' ? a.latitude : null;
    const lng = typeof a.longitude === 'number' ? a.longitude : null;
    // Whatever the Refund Wallet already paid is not collected at the door.
    const cod = order.paymentMode === 'COD' && order.paymentStatus !== 'PAID' ? Math.max(0, Number(order.total) - Number(order.refundWalletPaidInr)) : 0;

    const task = await this.prisma.$transaction(async (tx) => {
      // Serialise per order so two events cannot create two tasks - and so a
      // hand-over to an outside driver (same lock) is seen before creating one.
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
      const again = await tx.deliveryTask.findFirst({ where: { orderId, status: { in: [...LIVE_STATUSES, 'FAILED'] } } });
      if (again) return again;
      const now = await tx.order.findUnique({ where: { id: orderId }, select: { riderName: true, status: true } });
      if (!now || now.riderName || now.status !== OrderStatus.PACKED) return null;
      const created = await tx.deliveryTask.create({
        data: {
          taskNumber: await this.sequence.next(tx, 'DT', new Date()),
          orderId,
          attempt: prior + 1,
          speed: order.deliverySpeed,
          warehouseId: order.warehouseId,
          zoneId: order.deliveryZoneId,
          dropName: String(a.fullName ?? 'Customer'),
          dropPhone: String(a.phone ?? ''),
          // Built from the address fields, never Order.deliveryAddress: that string
          // ends with the customer's phone, which riders must not see before accepting.
          dropAddress: [a.line1, a.line2, a.landmark, a.city, a.state, a.pincode].filter(Boolean).join(', ') || stripPhone(order.deliveryAddress ?? ''),
          dropLatitude: lat, dropLongitude: lng,
          distanceKm: order.distanceKm,
          codAmount: cod,
          promisedBy: order.etaMax,
        },
      });
      await this.log(created.id, 'READY', { note: `Ready for pickup (attempt ${created.attempt})`, actorUserId }, tx);
      return created;
    }, LONG_TX);
    if (!task) return null;
    await this.sales.record(orderId, 'READY_FOR_PICKUP', actorUserId, task.taskNumber);
    this.changed(task);
    await this.dispatch(task.id);
    return task;
  }

  // ---------------------------------------------------------------- ranking facts

  /** The ranking rules from the current settings. */
  rules(s: DeliverySettings): RankingRules {
    return {
      riderHeartbeatMinutes: s.riderHeartbeatMinutes,
      locationFreshMinutes: s.locationFreshMinutes,
      maxPickupDistanceKm: s.maxPickupDistanceKm === null ? null : Number(s.maxPickupDistanceKm),
      maxCashInHand: s.maxCashInHand === null ? null : Number(s.maxCashInHand),
      vehicleMaxKg: vehicleLimits(s.vehicleMaxKg),
    };
  }

  /**
   * Everything the ranking needs about a set of riders, in five queries.
   * `excludeOffersForTaskId` leaves that task's own open offers out of the
   * capacity count (the admin view of a task being offered right now).
   */
  async riderFacts(client: Prisma.TransactionClient | PrismaService, where: Prisma.RiderWhereInput, excludeOffersForTaskId?: string): Promise<Array<RiderFacts & { fullName: string; phone: string; code: string | null; vehicleNumber: string | null; warehouse: { id: string; name: string } | null }>> {
    const now = new Date();
    const riders = await client.rider.findMany({
      where,
      select: {
        id: true, code: true, fullName: true, phone: true, status: true, availability: true, availabilityChangedAt: true, warehouseId: true,
        vehicleType: true, vehicleNumber: true, maxActiveTasks: true, lastSeenAt: true, lastLatitude: true, lastLongitude: true, lastLocationAt: true,
        isVerified: true, verifiedUntil: true,
        warehouse: { select: { id: true, name: true } },
        _count: {
          select: {
            tasks: { where: { status: { in: HELD_STATUSES } } },
            offers: { where: { status: DeliveryOfferStatus.PENDING, expiresAt: { gt: now }, ...(excludeOffersForTaskId ? { taskId: { not: excludeOffersForTaskId } } : {}) } },
            sessions: { where: { revokedAt: null, expiresAt: { gt: now } } },
          },
        },
      },
    });
    const ids = riders.map((r) => r.id);
    if (!ids.length) return [];
    const [cash, lastTask] = await Promise.all([
      client.riderCashEntry.groupBy({ by: ['riderId'], where: { riderId: { in: ids } }, _sum: { amount: true } }),
      client.deliveryTask.groupBy({ by: ['riderId'], where: { riderId: { in: ids } }, _max: { assignedAt: true } }),
    ]);
    const cashBy = new Map(cash.map((g) => [g.riderId, Number(g._sum.amount ?? 0)]));
    const lastBy = new Map(lastTask.map((g) => [g.riderId!, g._max.assignedAt]));
    return riders.map(({ _count, isVerified, verifiedUntil, ...r }) => ({
      ...r,
      verified: isVerifiedNow({ isVerified, verifiedUntil }, now),
      lastLatitude: r.lastLatitude === null ? null : Number(r.lastLatitude),
      lastLongitude: r.lastLongitude === null ? null : Number(r.lastLongitude),
      heldTasks: _count.tasks,
      pendingOffers: _count.offers,
      hasLiveSession: _count.sessions > 0,
      cashInHand: cashBy.get(r.id) ?? 0,
      lastAssignedAt: lastBy.get(r.id) ?? null,
    }));
  }

  /**
   * Goods weight for a task from product pack weights (frozen once known).
   * Null when any item has no recorded weight - then no vehicle limit applies.
   */
  private async taskWeight(client: Prisma.TransactionClient | PrismaService, task: Pick<DeliveryTask, 'orderId' | 'returnRequestId' | 'kind'>): Promise<number | null> {
    if (task.orderId) {
      const items = await client.orderItem.findMany({ where: { orderId: task.orderId }, select: { quantity: true, product: { select: { packWeightKg: true } } } });
      if (!items.length || items.some((i) => i.product.packWeightKg === null)) return null;
      return items.reduce((sum, i) => sum + i.quantity * Number(i.product.packWeightKg), 0);
    }
    if (task.returnRequestId) {
      const r = await client.returnRequest.findUnique({
        where: { id: task.returnRequestId },
        select: { quantity: true, orderItem: { select: { product: { select: { packWeightKg: true } } } }, replacementProduct: { select: { packWeightKg: true } } },
      });
      if (!r) return null;
      const w = task.kind === 'REPLACEMENT_DELIVERY' && r.replacementProduct ? r.replacementProduct.packWeightKg : r.orderItem.product.packWeightKg;
      return w === null ? null : r.quantity * Number(w);
    }
    return null;
  }

  private taskFacts(task: DeliveryTask & { warehouse: { latitude: Prisma.Decimal | null; longitude: Prisma.Decimal | null } }, weightKg: number | null, tried: Iterable<string>): TaskFacts {
    // A return pickup starts at the customer's door, so "nearest rider" means
    // nearest to the customer; everything else starts at the outlet.
    const fromCustomer = task.kind === 'RETURN_PICKUP' && task.dropLatitude !== null && task.dropLongitude !== null;
    return {
      warehouseId: task.warehouseId,
      pickup: fromCustomer
        ? { lat: Number(task.dropLatitude), lng: Number(task.dropLongitude) }
        : task.warehouse.latitude !== null && task.warehouse.longitude !== null ? { lat: Number(task.warehouse.latitude), lng: Number(task.warehouse.longitude) } : null,
      weightKg,
      triedRiderIds: new Set(tried),
    };
  }

  // ---------------------------------------------------------------- offering

  /**
   * Offer a waiting task to the next round of riders, or hand it to staff.
   *
   * Broadcast: the top `broadcastSize` eligible riders (see rider-ranking.ts)
   * are offered it at the same time with one shared deadline. The first to
   * accept gets it (see respond); the rest close as TAKEN. A new round starts
   * only once every offer of the current one has been answered or has expired,
   * so a task never has two rounds running. Serialised per task by a row lock,
   * so two API instances (or the sweep and an event) cannot both start a round.
   */
  async dispatch(taskId: string, opts: { ignoreRoundLimit?: boolean } = {}) {
    const s = await this.settings.get();
    const rules = this.rules(s);
    const outcome = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM delivery_tasks WHERE id = ${taskId} FOR UPDATE`;
      if (!locked.length) return null;
      const task = await tx.deliveryTask.findUnique({ where: { id: taskId }, include: { warehouse: { select: { latitude: true, longitude: true, name: true } } } });
      if (!task || !['READY_FOR_PICKUP', 'OFFERED'].includes(task.status) || task.riderId) return null;

      // A round is still open: let it finish.
      const open = await tx.deliveryOffer.count({ where: { taskId, status: 'PENDING', expiresAt: { gt: openSince() } } });
      if (open > 0) return null;

      const toStaff = async (note: string | null) => {
        const data: Prisma.DeliveryTaskUpdateInput = { status: 'READY_FOR_PICKUP' };
        if (!task.needsManualAssignment) data.needsManualAssignment = true;
        const updated = await tx.deliveryTask.update({ where: { id: taskId }, data });
        if (!task.needsManualAssignment && note) await this.log(taskId, 'NEEDS_ASSIGNMENT', { note }, tx);
        return { manual: true as const, task: updated };
      };
      if (task.autoDispatchPaused) return toStaff(null);
      if (!s.autoOffer) return toStaff('Auto-offer is switched off');

      let weightKg = task.weightKg === null ? null : Number(task.weightKg);
      if (weightKg === null) {
        weightKg = await this.taskWeight(tx, task);
        if (weightKg !== null) await tx.deliveryTask.update({ where: { id: taskId }, data: { weightKg } });
      }

      const tried = await tx.deliveryOffer.findMany({ where: { taskId, status: { in: SAID_NO } }, select: { riderId: true, status: true } });
      const facts = await this.riderFacts(tx, { warehouseId: task.warehouseId, status: RiderStatus.ACTIVE, availability: RiderAvailability.ONLINE });
      const ranked = rankRiders(facts, rules, this.taskFacts(task, weightKg, tried.map((t) => t.riderId)));
      let eligible = ranked.filter((a) => a.eligible);
      // Riders not yet asked always come first. When none are left, a rider who
      // only MISSED the request (phone in a pocket, alert not heard) is asked
      // again in the next round - one missed 45 s window must not send the order
      // to staff while the outlet's only rider is online. A rider who REJECTED
      // it is never asked again. The round limit still applies.
      let again = false;
      if (eligible.length === 0 && tried.some((t) => t.status === 'EXPIRED')) {
        const rejected = tried.filter((t) => t.status === 'REJECTED').map((t) => t.riderId);
        eligible = rankRiders(facts, rules, this.taskFacts(task, weightKg, rejected)).filter((a) => a.eligible);
        again = eligible.length > 0;
      }

      if (eligible.length === 0) return toStaff(tried.length ? `No rider accepted (${tried.length} asked)` : 'No available rider');
      if (!opts.ignoreRoundLimit && task.offerRound >= s.maxOfferRounds) return toStaff(`No rider accepted in ${task.offerRound} round${task.offerRound === 1 ? '' : 's'}`);

      const round = task.offerRound + 1;
      const expiresAt = new Date(Date.now() + s.offerTimeoutSeconds * 1000);
      const picks = eligible.slice(0, Math.max(1, s.broadcastSize));
      const byId = new Map(facts.map((f) => [f.id, f]));
      const offers: DeliveryOffer[] = [];
      for (const p of picks) offers.push(await tx.deliveryOffer.create({ data: { taskId, riderId: p.riderId, round, expiresAt } }));
      const updated = await tx.deliveryTask.update({ where: { id: taskId }, data: { status: 'OFFERED', offerRound: round, needsManualAssignment: false } });
      const who = picks.map((p) => `${byId.get(p.riderId)?.fullName ?? 'rider'}${p.km !== null ? ` (${p.km.toFixed(1)} km)` : ''}`).join(', ');
      await this.log(taskId, 'OFFERED', { note: `Round ${round}: offered ${again ? 'again ' : ''}to ${who}` }, tx);
      return { manual: false as const, task: updated, offers, round };
    }, LONG_TX);

    if (!outcome) return null;
    if (outcome.manual) {
      this.changed(outcome.task);
      return outcome;
    }
    for (const o of outcome.offers) this.events.publish({ kind: 'offer:new', riderId: o.riderId, offerId: o.id, taskId });
    const [title, body] =
      outcome.task.kind === 'RETURN_PICKUP'
        ? ['New return pickup', `Collect a return from a customer - accept within ${s.offerTimeoutSeconds}s`]
        : outcome.task.kind === 'REPLACEMENT_DELIVERY'
          ? ['New exchange delivery', `Replacement ready at the store - accept within ${s.offerTimeoutSeconds}s`]
          : ['New delivery request', `Pickup ready - accept within ${s.offerTimeoutSeconds}s`];
    await this.notifyMany(outcome.offers.map((o) => o.riderId), 'OFFER', title, body, taskId, s.offerTimeoutSeconds);
    this.changed(outcome.task);
    return outcome;
  }

  /**
   * Rider accepts or rejects an offer made to them.
   *
   * Accept is atomic: the order, the task row and then the rider row are locked, the
   * offer must still be PENDING, the task must still have no rider, and the
   * rider must still have room. Two riders tapping Accept at the same moment
   * queue on the task lock; the second finds their offer already TAKEN and
   * gets 409 OFFER_TAKEN. The task update is also conditional on riderId being
   * null, so even a code path that skipped the lock could not double-assign.
   */
  /**
   * Lock order for every transaction that touches a delivery: orders, then
   * delivery_tasks, then riders. Accept and staff assign write the order row
   * (rider name) after locking the task; the outside-driver hand-over and task
   * creation lock the order first. Taking the order lock first here as well
   * keeps the two from deadlocking (Postgres 40P01) when they race.
   */
  private async lockOrderOf(tx: Prisma.TransactionClient, taskId: string) {
    const t = await tx.deliveryTask.findUnique({ where: { id: taskId }, select: { orderId: true } });
    if (t?.orderId) await tx.$queryRaw`SELECT id FROM orders WHERE id = ${t.orderId} FOR UPDATE`;
  }

  async respond(riderId: string, offerId: string, accept: boolean, reason?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const offer = await tx.deliveryOffer.findUnique({ where: { id: offerId } });
      if (!offer || offer.riderId !== riderId) throw new NotFoundException('Offer not found');
      await this.lockOrderOf(tx, offer.taskId);
      await tx.$queryRaw`SELECT id FROM delivery_tasks WHERE id = ${offer.taskId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM riders WHERE id = ${riderId} FOR UPDATE`;
      const fresh = await tx.deliveryOffer.findUnique({ where: { id: offerId } });
      if (fresh!.status === 'TAKEN') throw new ConflictException({ code: 'OFFER_TAKEN', message: 'Another rider accepted this order first' });
      if (fresh!.status === 'EXPIRED') throw new ConflictException({ code: 'OFFER_EXPIRED', message: 'Time ran out on this request - it has gone to another rider' });
      if (fresh!.status !== 'PENDING') throw new ConflictException({ code: 'OFFER_CLOSED', message: `This request was already ${fresh!.status.toLowerCase()}` });

      /** Close this offer; when it was the round's last open one, the task waits for the next round. */
      const close = async (status: 'EXPIRED' | 'REJECTED', rejectReason?: string) => {
        await tx.deliveryOffer.update({ where: { id: offerId }, data: { status, respondedAt: new Date(), rejectReason: rejectReason?.slice(0, 200) } });
        const others = await tx.deliveryOffer.count({ where: { taskId: offer.taskId, status: 'PENDING', id: { not: offerId }, expiresAt: { gt: openSince() } } });
        if (others === 0) await tx.deliveryTask.updateMany({ where: { id: offer.taskId, status: 'OFFERED' }, data: { status: 'READY_FOR_PICKUP' } });
      };

      if (fresh!.expiresAt <= openSince()) {
        await close('EXPIRED');
        return { kind: 'EXPIRED' as const, taskId: offer.taskId };
      }
      if (!accept) {
        await close('REJECTED', reason);
        await this.log(offer.taskId, 'OFFER_REJECTED', { riderId, note: reason }, tx);
        return { kind: 'REJECTED' as const, taskId: offer.taskId };
      }

      const rider = await tx.rider.findUnique({ where: { id: riderId } });
      if (!rider || rider.status !== 'ACTIVE') throw new BadRequestException('Your account is not active');
      if (!isVerifiedNow(rider)) throw new BadRequestException({ code: 'NOT_VERIFIED', message: 'Finish your verification (documents, PCC, deposit) before taking orders' });
      const held = await tx.deliveryTask.count({ where: { riderId, status: { in: HELD_STATUSES } } });
      if (held >= rider.maxActiveTasks) {
        await close('REJECTED', 'At order limit');
        return { kind: 'FULL' as const, taskId: offer.taskId };
      }

      const claimed = await tx.deliveryTask.updateMany({
        where: { id: offer.taskId, riderId: null, status: { in: ['READY_FOR_PICKUP', 'OFFERED'] } },
        data: { status: 'ASSIGNED', riderId, assignedAt: new Date(), needsManualAssignment: false, autoDispatchPaused: false },
      });
      if (claimed.count !== 1) {
        await tx.deliveryOffer.update({ where: { id: offerId }, data: { status: 'TAKEN', respondedAt: new Date() } });
        return { kind: 'GONE' as const, taskId: offer.taskId };
      }
      await tx.deliveryOffer.update({ where: { id: offerId }, data: { status: 'ACCEPTED', respondedAt: new Date() } });
      const losers = await tx.deliveryOffer.findMany({ where: { taskId: offer.taskId, status: 'PENDING' }, select: { id: true, riderId: true } });
      await tx.deliveryOffer.updateMany({ where: { taskId: offer.taskId, status: 'PENDING' }, data: { status: 'TAKEN', respondedAt: new Date() } });
      const task = await tx.deliveryTask.findUniqueOrThrow({ where: { id: offer.taskId } });
      await this.log(task.id, 'ASSIGNED', { riderId, note: `Accepted by ${rider.fullName}${losers.length ? ` (first of ${losers.length + 1})` : ''}` }, tx);
      if (task.orderId) await tx.order.update({ where: { id: task.orderId }, data: { riderName: rider.fullName, riderPhone: rider.phone } });
      return { kind: 'ACCEPTED' as const, task, rider, losers };
    }, LONG_TX);

    if (result.kind === 'ACCEPTED') {
      for (const l of result.losers) this.events.publish({ kind: 'offer:closed', riderId: l.riderId, offerId: l.id, taskId: result.task.id, status: 'TAKEN' });
      if (result.task.orderId) await this.sales.record(result.task.orderId, 'RIDER_ASSIGNED', undefined, `${result.rider.fullName} (${result.rider.phone})`);
      this.events.publish({ kind: 'task:assigned', riderId, taskId: result.task.id, by: 'ACCEPT' });
      this.changed(result.task);
      return { status: 'ACCEPTED', taskId: result.task.id };
    }
    if (result.kind === 'GONE') throw new ConflictException({ code: 'OFFER_TAKEN', message: 'This order was already given to another rider' });
    if (result.kind === 'EXPIRED') {
      this.events.publish({ kind: 'offer:closed', riderId, offerId, taskId: result.taskId, status: 'EXPIRED' });
      await this.dispatch(result.taskId);
      // An accept that came too late is a failure the app must show, never a 200 it could read as "assigned".
      if (accept) throw new ConflictException({ code: 'OFFER_EXPIRED', message: 'Time ran out on this request - it has gone to another rider' });
      return { status: 'EXPIRED', taskId: result.taskId };
    }
    await this.dispatch(result.taskId); // no-op while other riders of the round can still answer
    if (result.kind === 'FULL') throw new ConflictException({ code: 'AT_CAPACITY', message: 'You already hold as many orders as you are allowed - finish one first' });
    return { status: result.kind, taskId: result.taskId };
  }

  /**
   * Staff assign (or reassign before pickup) a specific rider. This is the
   * override: it withdraws any open offers, and works whether auto-offer is
   * on, off or paused for the task. Locks order, task then rider, like accept.
   */
  async assignManually(taskId: string, riderId: string, userId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockOrderOf(tx, taskId);
      await tx.$queryRaw`SELECT id FROM delivery_tasks WHERE id = ${taskId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM riders WHERE id = ${riderId} FOR UPDATE`;
      const task = await tx.deliveryTask.findUnique({ where: { id: taskId } });
      if (!task) throw new NotFoundException('Task not found');
      if (!['READY_FOR_PICKUP', 'OFFERED', 'ASSIGNED'].includes(task.status)) {
        throw new BadRequestException(`A task that is ${task.status} cannot be reassigned`);
      }
      const rider = await tx.rider.findUnique({ where: { id: riderId } });
      if (!rider || rider.status !== 'ACTIVE') throw new BadRequestException('Choose an active rider');
      if (!isVerifiedNow(rider)) throw new BadRequestException(`${rider.fullName} has not cleared verification (documents, PCC or security deposit) and cannot be given orders`);
      if (rider.warehouseId !== task.warehouseId) throw new BadRequestException("This rider belongs to a different outlet than the task's pickup");
      const withdrawn = await tx.deliveryOffer.findMany({ where: { taskId, status: 'PENDING' } });
      await tx.deliveryOffer.updateMany({ where: { taskId, status: 'PENDING' }, data: { status: 'WITHDRAWN', respondedAt: new Date() } });
      const previousRider = task.riderId && task.riderId !== riderId ? task.riderId : null;
      const updated = await tx.deliveryTask.update({
        where: { id: taskId },
        data: { status: 'ASSIGNED', riderId, assignedAt: new Date(), needsManualAssignment: false },
      });
      await this.log(taskId, 'ASSIGNED', { riderId, actorUserId: userId, note: `Assigned by staff to ${rider.fullName}` }, tx);
      if (task.orderId) await tx.order.update({ where: { id: task.orderId }, data: { riderName: rider.fullName, riderPhone: rider.phone } });
      return { updated, rider, withdrawn, previousRider };
    }, LONG_TX);
    for (const w of result.withdrawn) this.events.publish({ kind: 'offer:closed', riderId: w.riderId, offerId: w.id, taskId, status: 'WITHDRAWN' });
    if (result.previousRider) {
      await this.notify(result.previousRider, 'TASK_REASSIGNED', 'Delivery reassigned', 'A delivery you held was given to another rider.', taskId);
      this.events.publish({ kind: 'task:updated', riderId: result.previousRider, taskId, orderId: result.updated.orderId, status: 'REASSIGNED' });
    }
    if (result.updated.orderId) await this.sales.record(result.updated.orderId, 'RIDER_ASSIGNED', userId, `${result.rider.fullName} (${result.rider.phone})`);
    await this.notify(riderId, 'TASK_ASSIGNED', 'Delivery assigned to you', `Task ${result.updated.taskNumber}`, taskId);
    this.events.publish({ kind: 'task:assigned', riderId, taskId, by: 'STAFF' });
    this.changed(result.updated);
    return result.updated;
  }

  /**
   * Staff override for one task: pause = stop offering it (open offers are
   * withdrawn) and keep it for manual assignment; resume = start offering again.
   */
  async setAutoDispatch(taskId: string, paused: boolean, userId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM delivery_tasks WHERE id = ${taskId} FOR UPDATE`;
      const task = await tx.deliveryTask.findUnique({ where: { id: taskId } });
      if (!task) throw new NotFoundException('Task not found');
      if (!['READY_FOR_PICKUP', 'OFFERED'].includes(task.status) || task.riderId) throw new BadRequestException('Only a delivery still waiting for a rider can be switched between auto and manual');
      const withdrawn = paused ? await tx.deliveryOffer.findMany({ where: { taskId, status: 'PENDING' } }) : [];
      if (paused) await tx.deliveryOffer.updateMany({ where: { taskId, status: 'PENDING' }, data: { status: 'WITHDRAWN', respondedAt: new Date() } });
      const updated = await tx.deliveryTask.update({
        where: { id: taskId },
        data: paused
          ? { autoDispatchPaused: true, needsManualAssignment: true, status: 'READY_FOR_PICKUP' }
          : { autoDispatchPaused: false, needsManualAssignment: false, offerRound: 0 },
      });
      await this.log(taskId, paused ? 'AUTO_PAUSED' : 'AUTO_RESUMED', { actorUserId: userId, note: paused ? 'Staff will assign this delivery manually' : 'Offering to riders again' }, tx);
      return { updated, withdrawn };
    }, LONG_TX);
    for (const w of result.withdrawn) this.events.publish({ kind: 'offer:closed', riderId: w.riderId, offerId: w.id, taskId, status: 'WITHDRAWN' });
    this.changed(result.updated);
    if (!paused) await this.dispatch(taskId, { ignoreRoundLimit: true });
    return this.prisma.deliveryTask.findUnique({ where: { id: taskId } });
  }

  /**
   * The legacy "assign rider" on the order screen hands the order to a driver
   * outside the rider app: close the task (unless an app rider got it first)
   * and stamp the driver on the order, in ONE transaction under the order lock.
   * Task creation takes the same lock and re-checks riderName, so the sweep can
   * never slip a new task (and new offers) in between.
   * Returns false when a rider already holds it (the caller must not dispatch).
   */
  async handOverToExternalDriver(orderId: string, driver: { name: string; phone: string }, userId: string): Promise<boolean> {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
      const task = await tx.deliveryTask.findFirst({ where: { orderId, status: { in: [...LIVE_STATUSES, 'FAILED'] } }, select: { id: true } });
      let withdrawn: Array<{ id: string; riderId: string }> = [];
      if (task) {
        await tx.$queryRaw`SELECT id FROM delivery_tasks WHERE id = ${task.id} FOR UPDATE`;
        const note = `Handed to ${driver.name} outside the rider app`;
        const taken = await tx.deliveryTask.updateMany({
          where: { id: task.id, status: { in: ['READY_FOR_PICKUP', 'OFFERED'] }, riderId: null },
          data: { status: 'CANCELLED', cancelledAt: new Date(), cancelStage: 'BEFORE_ASSIGNMENT', cancelReason: note },
        });
        if (taken.count !== 1) return { ok: false as const, withdrawn, taskId: task.id };
        withdrawn = await tx.deliveryOffer.findMany({ where: { taskId: task.id, status: 'PENDING' }, select: { id: true, riderId: true } });
        await tx.deliveryOffer.updateMany({ where: { taskId: task.id, status: 'PENDING' }, data: { status: 'WITHDRAWN', respondedAt: new Date() } });
        await this.log(task.id, 'CANCELLED', { actorUserId: userId, note }, tx);
      }
      await tx.order.update({ where: { id: orderId }, data: { riderName: driver.name, riderPhone: driver.phone } });
      return { ok: true as const, withdrawn, taskId: task?.id ?? null };
    }, LONG_TX);
    if (result.taskId) {
      for (const w of result.withdrawn) this.events.publish({ kind: 'offer:closed', riderId: w.riderId, offerId: w.id, taskId: result.taskId, status: 'WITHDRAWN' });
      this.events.publish({ kind: 'task:updated', riderId: null, taskId: result.taskId, orderId, status: 'CANCELLED' });
    }
    return result.ok;
  }

  /** Staff take a task back from a rider before pickup and put it up for dispatch again. */
  async unassign(taskId: string, userId: string, reason: string) {
    const task = await this.prisma.deliveryTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Task not found');
    if (!['ASSIGNED', 'AT_PICKUP'].includes(task.status) || !task.riderId) throw new BadRequestException('Only an assigned task not yet picked up can be unassigned');
    const updated = await this.prisma.deliveryTask.update({
      where: { id: taskId }, data: { status: 'READY_FOR_PICKUP', riderId: null, assignedAt: null, arrivedPickupAt: null, arrivedPickupVerified: false },
    });
    if (task.orderId) await this.prisma.order.update({ where: { id: task.orderId }, data: { riderName: null, riderPhone: null } });
    await this.log(taskId, 'UNASSIGNED', { actorUserId: userId, riderId: task.riderId, note: reason });
    await this.notify(task.riderId, 'TASK_REMOVED', 'Delivery removed', reason, taskId);
    this.events.publish({ kind: 'task:updated', riderId: task.riderId, taskId, orderId: task.orderId, status: 'REMOVED' });
    this.changed(updated);
    await this.dispatch(taskId);
    return updated;
  }

  // ---------------------------------------------------------------- staff views

  /** Every rider of the task's outlet, ranked as the dispatcher would, with the reasons anyone is skipped. */
  async candidates(taskId: string) {
    const s = await this.settings.get();
    const task = await this.prisma.deliveryTask.findUnique({ where: { id: taskId }, include: { warehouse: { select: { latitude: true, longitude: true, name: true } } } });
    if (!task) throw new NotFoundException('Task not found');
    const weightKg = task.weightKg !== null ? Number(task.weightKg) : await this.taskWeight(this.prisma, task);
    const tried = await this.prisma.deliveryOffer.findMany({ where: { taskId, status: { in: SAID_NO } }, select: { riderId: true } });
    const facts = await this.riderFacts(this.prisma, { warehouseId: task.warehouseId, status: RiderStatus.ACTIVE }, taskId);
    const ranked = rankRiders(facts, this.rules(s), this.taskFacts(task, weightKg, tried.map((t) => t.riderId)));
    const byId = new Map(facts.map((f) => [f.id, f]));
    return {
      taskId,
      weightKg,
      broadcastSize: s.broadcastSize,
      autoOffer: s.autoOffer,
      autoDispatchPaused: task.autoDispatchPaused,
      riders: ranked.map((a) => {
        const f = byId.get(a.riderId)!;
        return {
          id: f.id, code: f.code, fullName: f.fullName, phone: f.phone, vehicleType: f.vehicleType, vehicleNumber: f.vehicleNumber,
          availability: f.availability, lastSeenAt: f.lastSeenAt, heldTasks: f.heldTasks, maxActiveTasks: f.maxActiveTasks,
          rank: a.rank, eligible: a.eligible, km: a.km === null ? null : Math.round(a.km * 100) / 100,
          reasons: a.reasons.map((r) => ({ code: r, label: SKIP_LABEL[r] })),
        };
      }),
    };
  }

  /**
   * Rider headcount per outlet for the board: available now (would be offered
   * work), busy (online but full), not responding (online, app quiet), offline.
   */
  async availability(warehouseId?: string) {
    const s = await this.settings.get();
    const rules = this.rules(s);
    const facts = await this.riderFacts(this.prisma, { status: RiderStatus.ACTIVE, warehouseId: warehouseId ?? { not: null } });
    const now = new Date();
    const outlets = new Map<string, { warehouseId: string; name: string; available: number; busy: number; notResponding: number; offline: number; riders: Array<{ id: string; fullName: string; state: 'AVAILABLE' | 'BUSY' | 'NOT_RESPONDING' | 'OFFLINE'; heldTasks: number; maxActiveTasks: number; lastSeenAt: Date | null; reasons: string[] }> }>();
    for (const f of facts) {
      if (!f.warehouse) continue;
      const a = assessRider(f, rules, null, now);
      const state = f.availability !== 'ONLINE' || !f.hasLiveSession ? 'OFFLINE'
        : a.reasons.includes('NOT_SEEN') ? 'NOT_RESPONDING'
          : a.eligible ? 'AVAILABLE' : 'BUSY';
      const o = outlets.get(f.warehouse.id) ?? { warehouseId: f.warehouse.id, name: f.warehouse.name, available: 0, busy: 0, notResponding: 0, offline: 0, riders: [] };
      if (state === 'AVAILABLE') o.available++;
      else if (state === 'BUSY') o.busy++;
      else if (state === 'NOT_RESPONDING') o.notResponding++;
      else o.offline++;
      o.riders.push({ id: f.id, fullName: f.fullName, state, heldTasks: f.heldTasks, maxActiveTasks: f.maxActiveTasks, lastSeenAt: f.lastSeenAt, reasons: a.reasons.map((r) => SKIP_LABEL[r]) });
      outlets.set(f.warehouse.id, o);
    }
    const list = [...outlets.values()].sort((a, b) => a.name.localeCompare(b.name));
    const sum = (k: 'available' | 'busy' | 'notResponding' | 'offline') => list.reduce((t, o) => t + o[k], 0);
    return {
      totals: { available: sum('available'), busy: sum('busy'), notResponding: sum('notResponding'), offline: sum('offline') },
      outlets: list,
      autoOffer: s.autoOffer,
      broadcastSize: s.broadcastSize,
    };
  }

  // ---------------------------------------------------------------- cancellation

  static cancelOutcome(status: DeliveryTaskStatus): Outcome | null {
    if (status === 'ASSIGNED') return 'CANCELLED_AFTER_ASSIGNMENT';
    if (status === 'AT_PICKUP') return 'CANCELLED_AT_PICKUP';
    if (['PICKED_UP', 'OUT_FOR_DELIVERY', 'AT_DROP'].includes(status)) return 'CANCELLED_AFTER_PICKUP';
    return null; // before any rider committed: nothing to pay
  }

  async cancelTasksForOrder(orderId: string, reason: string, userId?: string) {
    const tasks = await this.prisma.deliveryTask.findMany({ where: { orderId, status: { in: LIVE_STATUSES } } });
    for (const t of tasks) await this.cancelTask(t.id, reason, userId);
  }

  async cancelTask(taskId: string, reason: string, userId?: string) {
    const task = await this.prisma.deliveryTask.findUnique({ where: { id: taskId } });
    if (!task || !LIVE_STATUSES.includes(task.status)) return task;
    const outcome = DispatchService.cancelOutcome(task.status);
    const pending = await this.prisma.deliveryOffer.findMany({ where: { taskId, status: 'PENDING' } });
    await this.prisma.deliveryOffer.updateMany({ where: { taskId, status: 'PENDING' }, data: { status: 'WITHDRAWN', respondedAt: new Date() } });
    const updated = await this.prisma.deliveryTask.update({
      where: { id: taskId },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelStage: outcome ?? 'BEFORE_ASSIGNMENT', cancelReason: reason.slice(0, 300) },
    });
    await this.log(taskId, 'CANCELLED', { actorUserId: userId, riderId: task.riderId, note: reason });
    for (const p of pending) this.events.publish({ kind: 'offer:closed', riderId: p.riderId, offerId: p.id, taskId, status: 'WITHDRAWN' });
    if (task.riderId) {
      await this.notify(task.riderId, 'TASK_CANCELLED', 'Delivery cancelled', reason, taskId);
      if (outcome) await this.earnings.creditTask(updated, outcome).catch((e) => this.logger.warn(`cancel pay ${task.taskNumber}: ${String(e)}`));
    }
    this.changed(updated);
    return updated;
  }

  /** A new attempt after a failed one whose goods are back at the store. */
  async reattempt(taskId: string, userId?: string) {
    const task = await this.prisma.deliveryTask.findUnique({ where: { id: taskId } });
    if (!task || !task.orderId) throw new NotFoundException('Task not found');
    if (task.status !== 'RETURNED_TO_STORE') throw new BadRequestException('Only a task whose goods are back at the store can be re-attempted');
    const order = await this.prisma.order.findUnique({ where: { id: task.orderId }, select: { status: true } });
    if (order?.status !== OrderStatus.DISPATCHED) throw new BadRequestException(`The order is ${order?.status}; it cannot be re-attempted`);
    const s = await this.settings.get();
    const next = await this.prisma.$transaction(async (tx) => {
      const created = await tx.deliveryTask.create({
        data: {
          taskNumber: await this.sequence.next(tx, 'DT', new Date()),
          orderId: task.orderId, attempt: task.attempt + 1, speed: task.speed, warehouseId: task.warehouseId, zoneId: task.zoneId,
          dropName: task.dropName, dropPhone: task.dropPhone, dropAddress: task.dropAddress,
          dropLatitude: task.dropLatitude, dropLongitude: task.dropLongitude, distanceKm: task.distanceKm,
          // Cash still owed if it was never collected.
          codAmount: task.codAmount,
          promisedBy: null,
        },
      });
      await this.log(created.id, 'READY', { actorUserId: userId, note: `Re-attempt ${created.attempt} after ${task.taskNumber}` }, tx);
      return created;
    }, LONG_TX);
    // The order is still DISPATCHED (goods left once); riders pick up again from the store.
    await this.sales.record(task.orderId, 'REATTEMPT_SCHEDULED', userId, next.taskNumber);
    this.changed(next);
    if (!userId && s.reattemptDelayMinutes > 0) return next; // the sweep dispatches it after the delay
    await this.dispatch(next.id);
    return next;
  }

  // ---------------------------------------------------------------- sweep

  /** Expire offers, re-dispatch waiting tasks, catch packed orders the event missed, run auto re-attempts. */
  async sweep() {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const expired = await this.prisma.deliveryOffer.findMany({ where: { status: 'PENDING', expiresAt: { lte: openSince() } }, take: 100 });
      const roundsToCheck = new Set<string>();
      for (const o of expired) {
        const closed = await this.prisma.$transaction(async (tx) => {
          // Same lock as accept, so an accept and its expiry cannot both win.
          await tx.$queryRaw`SELECT id FROM delivery_tasks WHERE id = ${o.taskId} FOR UPDATE`;
          const c = await tx.deliveryOffer.updateMany({ where: { id: o.id, status: 'PENDING' }, data: { status: 'EXPIRED', respondedAt: new Date() } });
          if (c.count !== 1) return false;
          const others = await tx.deliveryOffer.count({ where: { taskId: o.taskId, status: 'PENDING', expiresAt: { gt: openSince() } } });
          if (others === 0) await tx.deliveryTask.updateMany({ where: { id: o.taskId, status: 'OFFERED' }, data: { status: 'READY_FOR_PICKUP' } });
          await this.log(o.taskId, 'OFFER_EXPIRED', { riderId: o.riderId }, tx);
          return true;
        }, LONG_TX);
        if (!closed) continue;
        this.events.publish({ kind: 'offer:closed', riderId: o.riderId, offerId: o.id, taskId: o.taskId, status: 'EXPIRED' });
        roundsToCheck.add(o.taskId);
      }
      // One dispatch per task, after its whole round has been closed.
      for (const taskId of roundsToCheck) await this.dispatch(taskId);

      const s = await this.settings.get();
      if (s.autoOffer) {
        const waiting = await this.prisma.deliveryTask.findMany({
          where: { status: 'READY_FOR_PICKUP', riderId: null, needsManualAssignment: false, autoDispatchPaused: false, readyAt: { lte: new Date() } },
          select: { id: true, attempt: true, readyAt: true }, take: 50,
        });
        for (const t of waiting) {
          const delayMs = t.attempt > 1 ? s.reattemptDelayMinutes * 60_000 : 0;
          if (t.readyAt.getTime() + delayMs <= Date.now()) await this.dispatch(t.id);
        }
      }

      const packed = await this.prisma.order.findMany({
        where: { status: OrderStatus.PACKED, fulfillmentMethod: 'LOCAL', riderName: null, deliveryTasks: { none: { status: { in: [...LIVE_STATUSES, 'FAILED'] } } } },
        select: { id: true }, take: 20,
      });
      for (const o of packed) await this.ensureTaskForOrder(o.id);

      // Only orders still out (not closed as undelivered or delivered) with no attempt already in progress,
      // newest first - otherwise tasks that can never be re-attempted fill the 20 slots every sweep.
      const autoBack = await this.prisma.deliveryTask.findMany({
        where: {
          status: 'RETURNED_TO_STORE', failureReasonCode: { not: null }, kind: 'ORDER_DELIVERY',
          order: { status: OrderStatus.DISPATCHED, deliveryTasks: { none: { status: { in: [...LIVE_STATUSES] } } } },
        },
        orderBy: { returnedAt: 'desc' },
        select: { id: true, orderId: true, failureReasonCode: true, returnedAt: true }, take: 20,
      });
      for (const t of autoBack) {
        const reason = await this.prisma.deliveryFailureReason.findUnique({ where: { code: t.failureReasonCode! } });
        if (reason?.followUp !== 'AUTO_REATTEMPT') continue;
        const already = await this.prisma.deliveryTask.count({ where: { orderId: t.orderId, createdAt: { gt: t.returnedAt ?? new Date(0) } } });
        if (already === 0) await this.reattempt(t.id).catch((e) => this.logger.warn(`auto re-attempt: ${String(e)}`));
      }
    } catch (e) {
      this.logger.warn(`dispatch sweep: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.sweeping = false;
    }
  }

  /** A rider just came online: try the waiting tasks at their outlet, including ones flagged for staff. */
  async riderCameOnline(riderId: string) {
    const r = await this.prisma.rider.findUnique({ where: { id: riderId }, select: { warehouseId: true } });
    if (!r?.warehouseId) return;
    const s = await this.settings.get();
    if (!s.autoOffer) return;
    const waiting = await this.prisma.deliveryTask.findMany({ where: { status: 'READY_FOR_PICKUP', riderId: null, warehouseId: r.warehouseId, autoDispatchPaused: false }, select: { id: true } });
    for (const t of waiting) {
      await this.prisma.deliveryTask.update({ where: { id: t.id }, data: { needsManualAssignment: false } });
      // A rider who was not online before has not been asked yet - one more try.
      await this.dispatch(t.id, { ignoreRoundLimit: true });
    }
  }
}
