import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CodMethod, DeliveryTaskStatus, OrderStatus, PaymentStatus, PaymentTransactionStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { FulfillmentService } from '../../checkout/fulfillment.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SalesService } from '../../sales/sales.service';
import { DeliverySettingsService } from '../core/delivery-core';
import { EarningsService } from '../earnings/earnings.service';
import type { Outcome } from '../earnings/earning.logic';
import { distanceKm } from '../zones/zone.logic';
import { DispatchService } from './dispatch.service';

export class LocationDto {
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) longitude?: number;
}

export class DeliverDto extends LocationDto {
  @ApiProperty({ description: 'The OTP the customer reads out' }) @Matches(/^\d{4,6}$/) otp!: string;
}

export class CollectCodDto extends LocationDto {
  @ApiProperty() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) amount!: number;
  @ApiProperty({ enum: CodMethod }) @IsEnum(CodMethod) method!: CodMethod;
  @ApiPropertyOptional({ description: 'UPI reference' }) @IsOptional() @IsString() @MaxLength(80) reference?: string;
}

export class FailDto extends LocationDto {
  @ApiProperty() @IsString() @MaxLength(40) reasonCode!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) note?: string;
  @ApiPropertyOptional({ description: 'Photo URL from POST /rider/uploads/proof' }) @IsOptional() @IsString() @MaxLength(500) photoUrl?: string;
}

export class ReleaseDto {
  @ApiProperty() @IsString() @MaxLength(300) reason!: string;
}

type Loc = { latitude?: number; longitude?: number };

/**
 * What a rider does with a task they hold. Each step checks the task is theirs
 * and in the right state, records a timeline event (task + order), and only
 * touches the order through SalesService / FulfillmentService:
 *
 *   ASSIGNED -> AT_PICKUP -> PICKED_UP (order DISPATCHED) -> OUT_FOR_DELIVERY
 *   -> AT_DROP -> [COD collected] -> DELIVERED (doorstep OTP, order DELIVERED)
 *   ... or FAILED (reason) -> RETURNED_TO_STORE -> staff re-attempt / resolve.
 */
@Injectable()
export class TaskFlowService {
  private readonly logger = new Logger(TaskFlowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatch: DispatchService,
    private readonly settings: DeliverySettingsService,
    private readonly sales: SalesService,
    private readonly fulfillment: FulfillmentService,
    private readonly earnings: EarningsService,
  ) {}

  private async mine(riderId: string, taskId: string, allowed: DeliveryTaskStatus[]) {
    const rider = await this.prisma.rider.findUnique({ where: { id: riderId }, select: { status: true, fullName: true, phone: true } });
    if (rider?.status !== 'ACTIVE') throw new ForbiddenException('Your rider account is not active');
    const task = await this.prisma.deliveryTask.findUnique({
      where: { id: taskId },
      include: { warehouse: { select: { latitude: true, longitude: true, name: true } } },
    });
    if (!task || task.riderId !== riderId) throw new NotFoundException('Task not found');
    if (!allowed.includes(task.status)) {
      throw new ConflictException({ code: 'WRONG_STATE', message: `This delivery is ${task.status.replace(/_/g, ' ').toLowerCase()}`, status: task.status });
    }
    return { task, rider };
  }

  /** Within the geofence of a point? Null when either side has no coordinates. */
  private async within(loc: Loc, lat: unknown, lng: unknown): Promise<boolean> {
    if (loc.latitude === undefined || loc.longitude === undefined || lat === null || lng === null) return false;
    const s = await this.settings.get();
    return distanceKm({ lat: loc.latitude, lng: loc.longitude }, { lat: Number(lat), lng: Number(lng) }) * 1000 <= s.geofenceMeters;
  }

  private async step(taskId: string, data: Record<string, unknown>, event: string, riderId: string, loc: Loc, note?: string) {
    const updated = await this.prisma.deliveryTask.update({ where: { id: taskId }, data });
    await this.dispatch.log(taskId, event, { riderId, note, lat: loc.latitude ?? null, lng: loc.longitude ?? null });
    await this.touchLocation(riderId, loc);
    this.dispatch.changed(updated);
    return updated;
  }

  async touchLocation(riderId: string, loc: Loc) {
    if (loc.latitude === undefined || loc.longitude === undefined) return;
    await this.prisma.rider.update({ where: { id: riderId }, data: { lastLatitude: loc.latitude, lastLongitude: loc.longitude, lastLocationAt: new Date() } });
  }

  async arrivedAtPickup(riderId: string, taskId: string, loc: Loc) {
    const { task } = await this.mine(riderId, taskId, ['ASSIGNED']);
    const verified = await this.within(loc, task.warehouse.latitude, task.warehouse.longitude);
    return this.step(taskId, { status: 'AT_PICKUP', arrivedPickupAt: new Date(), arrivedPickupVerified: verified }, 'AT_PICKUP', riderId, loc, verified ? 'At the store (location verified)' : 'At the store');
  }

  /**
   * The goods leave the store: the order moves to DISPATCHED. The stock
   * movement is stamped with the staff member who packed it (who hands it
   * over) - the warehouse ledger records staff users, not riders.
   */
  async pickedUp(riderId: string, taskId: string, loc: Loc) {
    const { task, rider } = await this.mine(riderId, taskId, ['ASSIGNED', 'AT_PICKUP']);
    if (task.orderId) {
      const order = await this.prisma.order.findUnique({ where: { id: task.orderId }, select: { status: true } });
      if (order?.status !== OrderStatus.PACKED && order?.status !== OrderStatus.DISPATCHED) {
        throw new ConflictException({ code: 'ORDER_NOT_READY', message: `The order is ${order?.status?.toLowerCase()} - ask the store before picking it up` });
      }
      if (order.status === OrderStatus.PACKED) {
        await this.sales.advance(task.orderId, OrderStatus.DISPATCHED, await this.handoverUser(task.orderId, taskId));
      }
      await this.sales.record(task.orderId, 'PICKED_UP', undefined, `Picked up by ${rider.fullName}`);
    }
    return this.step(taskId, { status: 'PICKED_UP', pickedUpAt: new Date() }, 'PICKED_UP', riderId, loc);
  }

  private async handoverUser(orderId: string, taskId: string): Promise<string> {
    const packed = await this.prisma.orderEvent.findFirst({
      where: { orderId, type: { in: ['SCANNED', 'PACKED'] }, actorId: { not: null } }, orderBy: { createdAt: 'desc' }, select: { actorId: true },
    });
    if (packed?.actorId) return packed.actorId;
    const assigned = await this.prisma.deliveryTaskEvent.findFirst({ where: { taskId, actorUserId: { not: null } }, orderBy: { createdAt: 'desc' } });
    if (assigned?.actorUserId) return assigned.actorUserId;
    const admin = await this.prisma.user.findFirst({ where: { role: 'SUPER_ADMIN', status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    if (!admin) throw new ConflictException('No staff member to record the handover against');
    return admin.id;
  }

  async startTrip(riderId: string, taskId: string, loc: Loc) {
    const { task } = await this.mine(riderId, taskId, ['PICKED_UP']);
    if (task.orderId) await this.sales.record(task.orderId, 'OUT_FOR_DELIVERY', undefined, 'Rider is on the way');
    return this.step(taskId, { status: 'OUT_FOR_DELIVERY', outForDeliveryAt: new Date() }, 'OUT_FOR_DELIVERY', riderId, loc);
  }

  async arrivedAtDrop(riderId: string, taskId: string, loc: Loc) {
    const { task } = await this.mine(riderId, taskId, ['OUT_FOR_DELIVERY']);
    const verified = await this.within(loc, task.dropLatitude, task.dropLongitude);
    if (task.orderId) await this.sales.record(task.orderId, 'ARRIVED', undefined, 'Rider has arrived');
    return this.step(taskId, { status: 'AT_DROP', arrivedDropAt: new Date(), arrivedDropVerified: verified }, 'AT_DROP', riderId, loc, verified ? 'At the customer (location verified)' : 'At the customer');
  }

  /**
   * Record the COD money at the door. Cash goes into the rider's cash-in-hand
   * ledger (settled at the outlet); UPI to the company does not. The order is
   * marked paid here - never merely because it was delivered.
   */
  async collectCod(riderId: string, taskId: string, dto: CollectCodDto) {
    const { task, rider } = await this.mine(riderId, taskId, ['OUT_FOR_DELIVERY', 'AT_DROP']);
    const due = Number(task.codAmount);
    if (due <= 0) throw new BadRequestException('This order is prepaid - nothing to collect');
    if (Math.round(dto.amount * 100) !== Math.round(due * 100)) {
      throw new BadRequestException({ code: 'COD_AMOUNT_MISMATCH', message: `Collect exactly ₹${due.toFixed(2)}`, expected: due });
    }
    const existing = await this.prisma.codCollection.findUnique({ where: { taskId } });
    if (existing) return existing;
    const coll = await this.prisma.$transaction(async (tx) => {
      const c = await tx.codCollection.create({
        data: { taskId, orderId: task.orderId!, riderId, expectedAmount: due, collectedAmount: dto.amount, method: dto.method, reference: dto.reference?.trim() || null },
      });
      if (dto.method === CodMethod.CASH) {
        await tx.riderCashEntry.create({ data: { riderId, type: 'COD_COLLECTED', amount: dto.amount, taskId, codCollectionId: c.id, reference: task.taskNumber } });
      }
      if (task.orderId) {
        await tx.order.update({ where: { id: task.orderId }, data: { paymentStatus: PaymentStatus.PAID } });
        await tx.paymentTransaction.updateMany({
          where: { orderId: task.orderId, status: PaymentTransactionStatus.COD },
          data: { status: PaymentTransactionStatus.PAID, raw: { collectedBy: rider.fullName, method: dto.method, reference: dto.reference ?? null, taskId } },
        });
      }
      return c;
    });
    if (task.orderId) await this.sales.record(task.orderId, 'COD_COLLECTED', undefined, `₹${due.toFixed(2)} by ${dto.method === 'CASH' ? 'cash' : 'UPI'} to ${rider.fullName}`);
    await this.dispatch.log(taskId, 'COD_COLLECTED', { riderId, note: `${dto.method} ₹${due.toFixed(2)}`, lat: dto.latitude ?? null, lng: dto.longitude ?? null });
    this.dispatch.changed(task);
    return coll;
  }

  /** Close the delivery with the customer's OTP (the existing doorstep-OTP rule completes the order). */
  async deliver(riderId: string, taskId: string, dto: DeliverDto) {
    const { task } = await this.mine(riderId, taskId, ['OUT_FOR_DELIVERY', 'AT_DROP']);
    if (!task.orderId) throw new BadRequestException('This task has no order');
    const s = await this.settings.get();
    if (Number(task.codAmount) > 0 && s.requireCodBeforeDelivery) {
      const coll = await this.prisma.codCollection.findUnique({ where: { taskId } });
      if (!coll) throw new ConflictException({ code: 'COD_NOT_COLLECTED', message: `Collect ₹${Number(task.codAmount).toFixed(2)} before completing the delivery` });
    }
    // Wrong OTP -> 400 with attempts left; too many -> 423. The order stays out for delivery.
    await this.fulfillment.verifyOtp(task.orderId, dto.otp, 'system');
    const updated = await this.step(taskId, { status: 'DELIVERED', deliveredAt: new Date() }, 'DELIVERED', riderId, dto);
    await this.earnings.creditTask(updated, 'DELIVERED').catch((e) => this.logger.warn(`delivery pay ${task.taskNumber}: ${String(e)}`));
    return updated;
  }

  async fail(riderId: string, taskId: string, dto: FailDto) {
    const { task, rider } = await this.mine(riderId, taskId, ['PICKED_UP', 'OUT_FOR_DELIVERY', 'AT_DROP']);
    const reason = await this.prisma.deliveryFailureReason.findUnique({ where: { code: dto.reasonCode } });
    if (!reason || !reason.isActive) throw new BadRequestException('Choose one of the listed reasons');
    if (reason.requiresArrival && task.status !== 'AT_DROP') throw new BadRequestException('Mark that you have arrived at the customer first');
    if (reason.requiresNote && !dto.note?.trim()) throw new BadRequestException('Add a note explaining what happened');
    if (reason.requiresPhoto && !dto.photoUrl) throw new BadRequestException('Add a photo as proof');
    if (await this.prisma.codCollection.findUnique({ where: { taskId } })) {
      throw new ConflictException('Cash was already collected for this order - contact the store instead of failing it');
    }
    const updated = await this.step(
      taskId,
      { status: 'FAILED', failedAt: new Date(), failureReasonCode: reason.code, failureNote: dto.note?.trim() || null, failureProofUrl: dto.photoUrl ?? null },
      'FAILED', riderId, dto, `${reason.label}${dto.note ? ` - ${dto.note}` : ''}`,
    );
    // The order is NOT cancelled: it stays out for delivery until staff decide (re-attempt or resolve).
    if (task.orderId) await this.sales.record(task.orderId, 'DELIVERY_FAILED', undefined, `${reason.label} (${rider.fullName})`);
    await this.earnings.creditTask(updated, `FAILED_${reason.category}` as Outcome).catch((e) => this.logger.warn(`failure pay ${task.taskNumber}: ${String(e)}`));
    return { task: updated, next: 'Bring the order back to the store and mark it returned.' };
  }

  async returnedToStore(riderId: string, taskId: string, loc: Loc) {
    const { task } = await this.mine(riderId, taskId, ['FAILED']);
    const verified = await this.within(loc, task.warehouse.latitude, task.warehouse.longitude);
    if (task.orderId) await this.sales.record(task.orderId, 'RETURNED_TO_STORE', undefined, `Back at ${task.warehouse.name}`);
    return this.step(taskId, { status: 'RETURNED_TO_STORE', returnedAt: new Date() }, 'RETURNED_TO_STORE', riderId, loc, verified ? 'Returned (location verified)' : 'Returned');
  }

  /** Before pickup, a rider can hand a task back (it is dispatched to someone else). No pay. */
  async release(riderId: string, taskId: string, dto: ReleaseDto) {
    const { task } = await this.mine(riderId, taskId, ['ASSIGNED', 'AT_PICKUP']);
    const updated = await this.prisma.deliveryTask.update({
      where: { id: taskId }, data: { status: 'READY_FOR_PICKUP', riderId: null, assignedAt: null, arrivedPickupAt: null, arrivedPickupVerified: false },
    });
    // Recorded as a declined offer so the dispatcher does not offer it straight back.
    await this.prisma.deliveryOffer.create({ data: { taskId, riderId, round: task.offerRound, status: 'REJECTED', expiresAt: new Date(), respondedAt: new Date(), rejectReason: dto.reason.slice(0, 200) } });
    if (task.orderId) await this.prisma.order.update({ where: { id: task.orderId }, data: { riderName: null, riderPhone: null } });
    await this.dispatch.log(taskId, 'RELEASED', { riderId, note: dto.reason });
    this.dispatch.changed(updated);
    await this.dispatch.dispatch(taskId);
    return { released: true };
  }
}
