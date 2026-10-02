import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DeliveryTaskStatus, ReturnRequestStatus as S } from '@prisma/client';
import { timingSafeEqual } from 'node:crypto';
import { DeliverySettingsService } from '../delivery/core/delivery-core';
import { DispatchService } from '../delivery/dispatch/dispatch.service';
import type { Outcome } from '../delivery/earnings/earning.logic';
import { EarningsService } from '../delivery/earnings/earnings.service';
import { distanceKm } from '../delivery/zones/zone.logic';
import { PrismaService } from '../prisma/prisma.service';
import type { RiderFailDto, RiderLocDto, RiderOtpDto } from './dto/returns.dto';
import { dispatchReplacementStock } from './returns-inventory';
import { ReturnsService } from './returns.service';

const MAX_OTP_ATTEMPTS = 5;
type Loc = { latitude?: number; longitude?: number };

/**
 * What a rider does on a reverse-logistics trip. Same task table, offers and
 * pay rules as an order delivery (DispatchService), different steps:
 *
 *   RETURN_PICKUP         ASSIGNED -> OUT_FOR_DELIVERY (heading to customer) -> AT_DROP
 *                         -> PICKED_UP (customer's pickup code; request PICKED_UP)
 *                         -> DELIVERED (handed in at the store; request QC)
 *                         ... or FAILED -> closed at once (nothing to bring back; request PICKUP_FAILED)
 *   REPLACEMENT_DELIVERY  ASSIGNED -> AT_PICKUP -> PICKED_UP (stock out; request SHIPPED)
 *                         -> OUT_FOR_DELIVERY -> AT_DROP -> DELIVERED (customer's code; exchange completes)
 *                         ... or FAILED (request DELIVERY_FAILED) -> RETURNED_TO_STORE (stock back in)
 */
@Injectable()
export class ReturnRiderFlowService {
  private readonly logger = new Logger(ReturnRiderFlowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly returns: ReturnsService,
    private readonly dispatch: DispatchService,
    private readonly earnings: EarningsService,
    private readonly settings: DeliverySettingsService,
  ) {}

  private async mine(riderId: string, taskId: string, allowed: DeliveryTaskStatus[]) {
    const rider = await this.prisma.rider.findUnique({ where: { id: riderId }, select: { status: true, fullName: true } });
    if (rider?.status !== 'ACTIVE') throw new ForbiddenException('Your rider account is not active');
    const task = await this.prisma.deliveryTask.findUnique({ where: { id: taskId }, include: { warehouse: { select: { latitude: true, longitude: true, name: true } } } });
    if (!task || task.riderId !== riderId || !task.returnRequestId) throw new NotFoundException('Task not found');
    if (!allowed.includes(task.status)) {
      throw new ConflictException({ code: 'WRONG_STATE', message: `This task is ${task.status.replace(/_/g, ' ').toLowerCase()}`, status: task.status });
    }
    const req = await this.returns.load(task.returnRequestId);
    return { task, rider, req };
  }

  private async within(loc: Loc, lat: unknown, lng: unknown) {
    if (loc.latitude === undefined || loc.longitude === undefined || lat === null || lng === null) return false;
    const s = await this.settings.get();
    return distanceKm({ lat: loc.latitude, lng: loc.longitude }, { lat: Number(lat), lng: Number(lng) }) * 1000 <= s.geofenceMeters;
  }

  private async step(taskId: string, data: Record<string, unknown>, event: string, riderId: string, loc: Loc, note?: string) {
    const updated = await this.prisma.deliveryTask.update({ where: { id: taskId }, data });
    await this.dispatch.log(taskId, event, { riderId, note, lat: loc.latitude ?? null, lng: loc.longitude ?? null });
    if (loc.latitude !== undefined && loc.longitude !== undefined) {
      await this.prisma.rider.update({ where: { id: riderId }, data: { lastLatitude: loc.latitude, lastLongitude: loc.longitude, lastLocationAt: new Date() } });
    }
    this.dispatch.changed(updated);
    return updated;
  }

  private checkCode(expected: string | null, given: string, attempts: number) {
    if (!expected) throw new ConflictException('This request has no customer code');
    if (attempts >= MAX_OTP_ATTEMPTS) throw new HttpException({ code: 'OTP_LOCKED', message: 'Too many wrong attempts. Ask the store to resolve this.' }, 423);
    const a = Buffer.from(expected);
    const b = Buffer.from(given.trim());
    return a.length === b.length && timingSafeEqual(a, b);
  }

  // ------------------------------------------------------------ shared steps

  async arrivedAtPickup(riderId: string, taskId: string, loc: RiderLocDto) {
    const { task } = await this.mine(riderId, taskId, ['ASSIGNED']);
    if (task.kind !== 'REPLACEMENT_DELIVERY') throw new BadRequestException('A return pickup starts at the customer - start the trip instead');
    const verified = await this.within(loc, task.warehouse.latitude, task.warehouse.longitude);
    return this.step(taskId, { status: 'AT_PICKUP', arrivedPickupAt: new Date(), arrivedPickupVerified: verified }, 'AT_PICKUP', riderId, loc, verified ? 'At the store (location verified)' : 'At the store');
  }

  /** Heading to the customer. */
  async startTrip(riderId: string, taskId: string, loc: RiderLocDto) {
    const { task } = await this.mine(riderId, taskId, ['ASSIGNED', 'PICKED_UP']);
    if (task.kind === 'RETURN_PICKUP' && task.status !== 'ASSIGNED') throw new ConflictException('Hand the item in at the store');
    if (task.kind === 'REPLACEMENT_DELIVERY' && task.status !== 'PICKED_UP') throw new ConflictException('Collect the replacement from the store first');
    return this.step(taskId, { status: 'OUT_FOR_DELIVERY', outForDeliveryAt: new Date() }, 'OUT_FOR_DELIVERY', riderId, loc,
      task.kind === 'RETURN_PICKUP' ? 'Heading to the customer to collect' : 'Replacement on the way');
  }

  async arrivedAtCustomer(riderId: string, taskId: string, loc: RiderLocDto) {
    const { task } = await this.mine(riderId, taskId, ['OUT_FOR_DELIVERY']);
    const verified = await this.within(loc, task.dropLatitude, task.dropLongitude);
    return this.step(taskId, { status: 'AT_DROP', arrivedDropAt: new Date(), arrivedDropVerified: verified }, 'AT_DROP', riderId, loc, verified ? 'At the customer (location verified)' : 'At the customer');
  }

  // ------------------------------------------------------------ return pickup

  /** The customer hands the item over and reads their pickup code. */
  async collectFromCustomer(riderId: string, taskId: string, dto: RiderOtpDto) {
    const { task, rider, req } = await this.mine(riderId, taskId, ['OUT_FOR_DELIVERY', 'AT_DROP']);
    if (task.kind !== 'RETURN_PICKUP') throw new BadRequestException('This is not a pickup');
    if (!this.checkCode(req.pickupOtp, dto.otp, req.pickupOtpAttempts)) {
      const u = await this.prisma.returnRequest.update({ where: { id: req.id }, data: { pickupOtpAttempts: { increment: 1 } } });
      const left = Math.max(0, MAX_OTP_ATTEMPTS - u.pickupOtpAttempts);
      throw new BadRequestException({ code: 'OTP_INCORRECT', message: `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.`, attemptsLeft: left });
    }
    const actor = { kind: 'RIDER' as const, id: riderId };
    await this.prisma.$transaction((tx) => this.returns.move(tx, req, S.PICKED_UP, actor, { note: `Collected by ${rider.fullName}`, data: { pickedUpAt: new Date() } }));
    await this.returns.notify(req, S.PICKED_UP, actor);
    return this.step(taskId, { status: 'PICKED_UP', pickedUpAt: new Date() }, 'PICKED_UP', riderId, dto, 'Item collected from the customer');
  }

  /** Back at the store with the item: the trip is done and the item waits for QC. */
  async handInAtStore(riderId: string, taskId: string, loc: RiderLocDto) {
    const { task, req } = await this.mine(riderId, taskId, ['PICKED_UP']);
    if (task.kind !== 'RETURN_PICKUP') throw new BadRequestException('This is not a pickup');
    const verified = await this.within(loc, task.warehouse.latitude, task.warehouse.longitude);
    const updated = await this.step(taskId, { status: 'DELIVERED', deliveredAt: new Date() }, 'DELIVERED', riderId, loc, verified ? 'Handed in at the store (location verified)' : 'Handed in at the store');
    if (req.status === S.PICKED_UP) {
      await this.returns.receive(req, { kind: 'RIDER', id: riderId }, `Handed in at ${task.warehouse.name}`).catch((e) =>
        this.logger.warn(`receive ${req.requestNumber}: ${e instanceof Error ? e.message : String(e)}`));
    }
    await this.earnings.creditTask(updated, 'DELIVERED').catch((e) => this.logger.warn(`return pickup pay ${task.taskNumber}: ${String(e)}`));
    return updated;
  }

  // ------------------------------------------------------------ replacement delivery

  /** The replacement leaves the store: stock out, request SHIPPED. */
  async collectReplacement(riderId: string, taskId: string, loc: RiderLocDto) {
    const { task, rider, req } = await this.mine(riderId, taskId, ['ASSIGNED', 'AT_PICKUP']);
    if (task.kind !== 'REPLACEMENT_DELIVERY') throw new BadRequestException('This is not a replacement delivery');
    if (req.status !== S.REPLACEMENT_PROCESSING) throw new ConflictException({ code: 'NOT_READY', message: 'The store has not released this replacement - ask them before taking it' });
    const performer = await this.returns.systemUserId();
    const actor = { kind: 'RIDER' as const, id: riderId };
    await this.prisma.$transaction(async (tx) => {
      await dispatchReplacementStock(tx, req.id, req.requestNumber, performer);
      await this.returns.move(tx, req, S.SHIPPED, actor, { note: `Picked up by ${rider.fullName}`, data: { replacementShippedAt: new Date() } });
    });
    await this.returns.notify(req, S.SHIPPED, actor);
    return this.step(taskId, { status: 'PICKED_UP', pickedUpAt: new Date() }, 'PICKED_UP', riderId, loc, 'Replacement collected from the store');
  }

  async deliverReplacement(riderId: string, taskId: string, dto: RiderOtpDto) {
    const { task, req } = await this.mine(riderId, taskId, ['OUT_FOR_DELIVERY', 'AT_DROP']);
    if (task.kind !== 'REPLACEMENT_DELIVERY') throw new BadRequestException('This is not a replacement delivery');
    if (!this.checkCode(req.replacementOtp, dto.otp, req.replacementOtpAttempts)) {
      const u = await this.prisma.returnRequest.update({ where: { id: req.id }, data: { replacementOtpAttempts: { increment: 1 } } });
      const left = Math.max(0, MAX_OTP_ATTEMPTS - u.replacementOtpAttempts);
      throw new BadRequestException({ code: 'OTP_INCORRECT', message: `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.`, attemptsLeft: left });
    }
    await this.returns.replacementDelivered(req, { kind: 'RIDER', id: riderId });
    const updated = await this.step(taskId, { status: 'DELIVERED', deliveredAt: new Date() }, 'DELIVERED', riderId, dto, 'Replacement delivered');
    await this.earnings.creditTask(updated, 'DELIVERED').catch((e) => this.logger.warn(`replacement pay ${task.taskNumber}: ${String(e)}`));
    return updated;
  }

  // ------------------------------------------------------------ failure

  async fail(riderId: string, taskId: string, dto: RiderFailDto) {
    const { task, rider, req } = await this.mine(riderId, taskId, ['OUT_FOR_DELIVERY', 'AT_DROP', 'PICKED_UP']);
    if (task.kind === 'RETURN_PICKUP' && task.status === 'PICKED_UP') throw new ConflictException('The item is already collected - hand it in at the store');
    if (task.kind === 'REPLACEMENT_DELIVERY' && task.status === 'PICKED_UP') throw new ConflictException('Start the trip before reporting a failed delivery');
    const reason = await this.prisma.deliveryFailureReason.findUnique({ where: { code: dto.reasonCode } });
    if (!reason || !reason.isActive) throw new BadRequestException('Choose one of the listed reasons');
    if (reason.requiresArrival && task.status !== 'AT_DROP') throw new BadRequestException('Mark that you have arrived at the customer first');
    if (reason.requiresNote && !dto.note?.trim()) throw new BadRequestException('Add a note explaining what happened');
    if (reason.requiresPhoto && !dto.photoUrl) throw new BadRequestException('Add a photo as proof');
    const why = `${reason.label}${dto.note ? ` - ${dto.note}` : ''}`;
    const actor = { kind: 'RIDER' as const, id: riderId };
    const pickup = task.kind === 'RETURN_PICKUP';

    // A failed pickup has nothing to bring back, so the trip closes at once (it
    // must not keep counting against the rider's task limit).
    const updated = await this.step(
      taskId,
      {
        status: pickup ? 'RETURNED_TO_STORE' : 'FAILED', failedAt: new Date(), ...(pickup ? { returnedAt: new Date() } : {}),
        failureReasonCode: reason.code, failureNote: dto.note?.trim() || null, failureProofUrl: dto.photoUrl ?? null,
      },
      'FAILED', riderId, dto, `${why} (${rider.fullName})`,
    );
    if (pickup) {
      if (req.status === S.PICKUP_SCHEDULED) {
        await this.prisma.$transaction((tx) => this.returns.move(tx, req, S.PICKUP_FAILED, actor, { note: why, data: { failureReason: why } }));
        await this.returns.notify(req, S.PICKUP_FAILED, actor, reason.label);
      }
    } else if (req.status === S.SHIPPED) {
      await this.returns.replacementFailed(req, why, actor);
    }
    await this.earnings.creditTask(updated, `FAILED_${reason.category}` as Outcome).catch((e) => this.logger.warn(`failure pay ${task.taskNumber}: ${String(e)}`));
    return { task: updated, next: pickup ? 'Nothing to bring back. The store will reschedule.' : 'Bring the replacement back to the store and mark it returned.' };
  }

  /** The undelivered replacement is back at the store: stock in, exchange ready to re-send. */
  async replacementBackAtStore(riderId: string, taskId: string, loc: RiderLocDto) {
    const { task, req } = await this.mine(riderId, taskId, ['FAILED']);
    if (task.kind !== 'REPLACEMENT_DELIVERY') throw new BadRequestException('This is not a replacement delivery');
    const updated = await this.step(taskId, { status: 'RETURNED_TO_STORE', returnedAt: new Date() }, 'RETURNED_TO_STORE', riderId, loc, `Back at ${task.warehouse.name}`);
    if (req.status === S.DELIVERY_FAILED) await this.returns.replacementReturned(req, { kind: 'RIDER', id: riderId });
    return updated;
  }
}
