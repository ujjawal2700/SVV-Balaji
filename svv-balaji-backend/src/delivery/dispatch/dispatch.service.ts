import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  DeliveryOfferStatus,
  DeliveryTask,
  DeliveryTaskStatus,
  OrderStatus,
  Prisma,
  RiderAvailability,
  RiderStatus,
} from '@prisma/client';
import { SequenceService } from '../../common/sequence.service';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderEventsService } from '../../realtime/order-events.service';
import { SalesService } from '../../sales/sales.service';
import { DeliveryEventsService, DeliverySettingsService } from '../core/delivery-core';
import { EarningsService } from '../earnings/earnings.service';
import type { Outcome } from '../earnings/earning.logic';
import { distanceKm } from '../zones/zone.logic';

/** A task still in someone's hands (or waiting for someone). */
export const LIVE_STATUSES: DeliveryTaskStatus[] = [
  'READY_FOR_PICKUP', 'OFFERED', 'ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'AT_DROP',
];
/** Statuses where the rider is committed to the task (counts against maxActiveTasks). */
export const HELD_STATUSES: DeliveryTaskStatus[] = ['ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'AT_DROP', 'FAILED'];

const SWEEP_MS = 5_000;

/** Remove a trailing ", Ph 98765..." (the order's address line carries the phone). */
export const stripPhone = (address: string) => address.replace(/,?\s*Ph\.?\s*[+\d][\d\s-]{6,}\s*$/i, '').trim();

/**
 * Turns packed local-delivery orders into delivery tasks and gets them to a
 * rider: auto-offer (one rider at a time, timeout, next rider) or staff
 * assignment. Listens to the existing order event bus - it never adds order
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

  async notify(riderId: string, type: string, title: string, body: string, taskId?: string) {
    const n = await this.prisma.riderNotification.create({ data: { riderId, type, title, body, taskId } });
    this.events.publish({ kind: 'notification', riderId, notificationId: n.id });
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
        addressSnapshot: true, deliveryAddress: true, distanceKm: true, total: true, paymentMode: true, paymentStatus: true, etaMax: true,
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
    const cod = order.paymentMode === 'COD' && order.paymentStatus !== 'PAID' ? Number(order.total) : 0;

    const task = await this.prisma.$transaction(async (tx) => {
      // Serialise per order so two events cannot create two tasks.
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
      const again = await tx.deliveryTask.findFirst({ where: { orderId, status: { in: [...LIVE_STATUSES, 'FAILED'] } } });
      if (again) return again;
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
    });
    await this.sales.record(orderId, 'READY_FOR_PICKUP', actorUserId, task.taskNumber);
    this.changed(task);
    await this.dispatch(task.id);
    return task;
  }

  // ---------------------------------------------------------------- offering

  /**
   * Offer a READY task to the next best rider, or flag it for staff.
   * Candidates: ACTIVE + ONLINE riders of the pickup outlet, under their
   * task limit and cash limit, with no other pending offer, who have not
   * already turned this task down. Nearest by fresh location, else longest idle.
   */
  async dispatch(taskId: string, opts: { ignoreRoundLimit?: boolean } = {}) {
    const s = await this.settings.get();
    const outcome = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM delivery_tasks WHERE id = ${taskId} FOR UPDATE`;
      if (!locked.length) return null;
      const task = await tx.deliveryTask.findUnique({ where: { id: taskId }, include: { warehouse: { select: { latitude: true, longitude: true, name: true } } } });
      if (!task || task.status !== 'READY_FOR_PICKUP' || task.riderId) return null;
      if (!s.autoOffer) {
        if (!task.needsManualAssignment) await tx.deliveryTask.update({ where: { id: taskId }, data: { needsManualAssignment: true } });
        return { manual: true as const, task };
      }

      const tried = await tx.deliveryOffer.findMany({ where: { taskId }, select: { riderId: true } });
      const riders = await tx.rider.findMany({
        where: {
          status: RiderStatus.ACTIVE,
          availability: RiderAvailability.ONLINE,
          warehouseId: task.warehouseId,
          id: { notIn: tried.map((t) => t.riderId) },
          offers: { none: { status: DeliveryOfferStatus.PENDING } },
        },
        select: {
          id: true, fullName: true, maxActiveTasks: true, lastLatitude: true, lastLongitude: true, lastLocationAt: true, availabilityChangedAt: true,
          _count: { select: { tasks: { where: { status: { in: HELD_STATUSES } } } } },
        },
      });
      const cashLimit = s.maxCashInHand === null ? null : Number(s.maxCashInHand);
      const cash = cashLimit === null ? new Map<string, number>() : new Map(
        (await tx.riderCashEntry.groupBy({ by: ['riderId'], where: { riderId: { in: riders.map((r) => r.id) } }, _sum: { amount: true } }))
          .map((g) => [g.riderId, Number(g._sum.amount ?? 0)]),
      );
      const fresh = Date.now() - s.locationFreshMinutes * 60_000;
      const outlet = task.warehouse.latitude !== null && task.warehouse.longitude !== null
        ? { lat: Number(task.warehouse.latitude), lng: Number(task.warehouse.longitude) } : null;
      const eligible = riders
        .filter((r) => r._count.tasks < r.maxActiveTasks)
        .filter((r) => cashLimit === null || (cash.get(r.id) ?? 0) < cashLimit)
        .map((r) => ({
          r,
          km: outlet && r.lastLatitude !== null && r.lastLongitude !== null && r.lastLocationAt && r.lastLocationAt.getTime() >= fresh
            ? distanceKm({ lat: Number(r.lastLatitude), lng: Number(r.lastLongitude) }, outlet) : null,
        }))
        .sort((a, b) => {
          if (a.km !== null && b.km !== null) return a.km - b.km;
          if (a.km !== null) return -1;
          if (b.km !== null) return 1;
          return (a.r.availabilityChangedAt?.getTime() ?? 0) - (b.r.availabilityChangedAt?.getTime() ?? 0);
        });

      if (eligible.length === 0 || (!opts.ignoreRoundLimit && task.offerRound >= s.maxOfferRounds)) {
        if (!task.needsManualAssignment) {
          await tx.deliveryTask.update({ where: { id: taskId }, data: { needsManualAssignment: true } });
          await this.log(taskId, 'NEEDS_ASSIGNMENT', { note: eligible.length === 0 ? 'No available rider' : `No rider accepted in ${task.offerRound} offers` }, tx);
        }
        return { manual: true as const, task };
      }

      const pick = eligible[0];
      const offer = await tx.deliveryOffer.create({
        data: { taskId, riderId: pick.r.id, round: task.offerRound + 1, expiresAt: new Date(Date.now() + s.offerTimeoutSeconds * 1000) },
      });
      const updated = await tx.deliveryTask.update({ where: { id: taskId }, data: { status: 'OFFERED', offerRound: { increment: 1 } } });
      await this.log(taskId, 'OFFERED', { riderId: pick.r.id, note: `Offered to ${pick.r.fullName}${pick.km !== null ? ` (${pick.km.toFixed(1)} km away)` : ''}` }, tx);
      return { manual: false as const, task: updated, offer, rider: pick.r };
    });

    if (!outcome) return null;
    if (outcome.manual) {
      this.changed(outcome.task);
      return outcome;
    }
    this.events.publish({ kind: 'offer:new', riderId: outcome.rider.id, offerId: outcome.offer.id, taskId });
    await this.notify(outcome.rider.id, 'OFFER', 'New delivery request', `Pickup from outlet - accept within ${s.offerTimeoutSeconds}s`, taskId);
    this.changed(outcome.task);
    return outcome;
  }

  /** Rider accepts or rejects an offer made to them. */
  async respond(riderId: string, offerId: string, accept: boolean, reason?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const offer = await tx.deliveryOffer.findUnique({ where: { id: offerId } });
      if (!offer || offer.riderId !== riderId) throw new NotFoundException('Offer not found');
      await tx.$queryRaw`SELECT id FROM delivery_tasks WHERE id = ${offer.taskId} FOR UPDATE`;
      const fresh = await tx.deliveryOffer.findUnique({ where: { id: offerId } });
      if (fresh!.status !== 'PENDING') throw new ConflictException({ code: 'OFFER_CLOSED', message: `This request was already ${fresh!.status.toLowerCase()}` });
      if (fresh!.expiresAt <= new Date()) {
        await tx.deliveryOffer.update({ where: { id: offerId }, data: { status: 'EXPIRED', respondedAt: new Date() } });
        await tx.deliveryTask.update({ where: { id: offer.taskId }, data: { status: 'READY_FOR_PICKUP' } });
        return { kind: 'EXPIRED' as const, taskId: offer.taskId };
      }
      if (!accept) {
        await tx.deliveryOffer.update({ where: { id: offerId }, data: { status: 'REJECTED', respondedAt: new Date(), rejectReason: reason?.slice(0, 200) } });
        await tx.deliveryTask.update({ where: { id: offer.taskId }, data: { status: 'READY_FOR_PICKUP' } });
        await this.log(offer.taskId, 'OFFER_REJECTED', { riderId, note: reason }, tx);
        return { kind: 'REJECTED' as const, taskId: offer.taskId };
      }
      const rider = await tx.rider.findUnique({ where: { id: riderId } });
      if (!rider || rider.status !== 'ACTIVE') throw new BadRequestException('Your account is not active');
      await tx.deliveryOffer.update({ where: { id: offerId }, data: { status: 'ACCEPTED', respondedAt: new Date() } });
      const task = await tx.deliveryTask.update({
        where: { id: offer.taskId },
        data: { status: 'ASSIGNED', riderId, assignedAt: new Date(), needsManualAssignment: false },
      });
      await this.log(task.id, 'ASSIGNED', { riderId, note: `Accepted by ${rider.fullName}` }, tx);
      if (task.orderId) await tx.order.update({ where: { id: task.orderId }, data: { riderName: rider.fullName, riderPhone: rider.phone } });
      return { kind: 'ACCEPTED' as const, task, rider };
    });

    if (result.kind === 'ACCEPTED') {
      if (result.task.orderId) await this.sales.record(result.task.orderId, 'RIDER_ASSIGNED', undefined, `${result.rider.fullName} (${result.rider.phone})`);
      this.changed(result.task);
      return { status: 'ACCEPTED', taskId: result.task.id };
    }
    await this.dispatch(result.taskId);
    return { status: result.kind, taskId: result.taskId };
  }

  /** Staff assign (or reassign before pickup) a specific rider. Withdraws any pending offer. */
  async assignManually(taskId: string, riderId: string, userId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM delivery_tasks WHERE id = ${taskId} FOR UPDATE`;
      const task = await tx.deliveryTask.findUnique({ where: { id: taskId } });
      if (!task) throw new NotFoundException('Task not found');
      if (!['READY_FOR_PICKUP', 'OFFERED', 'ASSIGNED'].includes(task.status)) {
        throw new BadRequestException(`A task that is ${task.status} cannot be reassigned`);
      }
      const rider = await tx.rider.findUnique({ where: { id: riderId } });
      if (!rider || rider.status !== 'ACTIVE') throw new BadRequestException('Choose an active rider');
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
    });
    for (const w of result.withdrawn) this.events.publish({ kind: 'offer:closed', riderId: w.riderId, offerId: w.id, taskId, status: 'WITHDRAWN' });
    if (result.previousRider) {
      await this.notify(result.previousRider, 'TASK_REASSIGNED', 'Delivery reassigned', 'A delivery you held was given to another rider.', taskId);
      this.events.publish({ kind: 'task:updated', riderId: result.previousRider, taskId, orderId: result.updated.orderId, status: 'REASSIGNED' });
    }
    if (result.updated.orderId) await this.sales.record(result.updated.orderId, 'RIDER_ASSIGNED', userId, `${result.rider.fullName} (${result.rider.phone})`);
    await this.notify(riderId, 'TASK_ASSIGNED', 'Delivery assigned to you', `Task ${result.updated.taskNumber}`, taskId);
    this.changed(result.updated);
    return result.updated;
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
    });
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
      const expired = await this.prisma.deliveryOffer.findMany({ where: { status: 'PENDING', expiresAt: { lte: new Date() } }, take: 100 });
      for (const o of expired) {
        const closed = await this.prisma.deliveryOffer.updateMany({ where: { id: o.id, status: 'PENDING' }, data: { status: 'EXPIRED', respondedAt: new Date() } });
        if (closed.count !== 1) continue;
        await this.prisma.deliveryTask.updateMany({ where: { id: o.taskId, status: 'OFFERED' }, data: { status: 'READY_FOR_PICKUP' } });
        await this.log(o.taskId, 'OFFER_EXPIRED', { riderId: o.riderId });
        this.events.publish({ kind: 'offer:closed', riderId: o.riderId, offerId: o.id, taskId: o.taskId, status: 'EXPIRED' });
        await this.dispatch(o.taskId);
      }

      const s = await this.settings.get();
      if (s.autoOffer) {
        const waiting = await this.prisma.deliveryTask.findMany({
          where: { status: 'READY_FOR_PICKUP', riderId: null, needsManualAssignment: false, readyAt: { lte: new Date() } },
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

      const autoBack = await this.prisma.deliveryTask.findMany({
        where: { status: 'RETURNED_TO_STORE', failureReasonCode: { not: null } },
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
    const waiting = await this.prisma.deliveryTask.findMany({ where: { status: 'READY_FOR_PICKUP', riderId: null, warehouseId: r.warehouseId }, select: { id: true } });
    for (const t of waiting) {
      await this.prisma.deliveryTask.update({ where: { id: t.id }, data: { needsManualAssignment: false } });
      // A rider who was not online before has not been asked yet - one more try.
      await this.dispatch(t.id, { ignoreRoundLimit: true });
    }
  }
}
