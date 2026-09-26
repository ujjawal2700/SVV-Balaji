import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryTaskStatus, Prisma, RiderAvailability, RiderStatus, VehicleType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { SequenceService } from '../../common/sequence.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DispatchService, HELD_STATUSES, stripPhone } from '../dispatch/dispatch.service';
import { TaskFlowService } from '../dispatch/task-flow.service';

export class ApproveRiderDto {
  @ApiProperty({ description: 'Home outlet: the rider is offered tasks picked up here' }) @IsString() warehouseId!: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) maxActiveTasks?: number;
}

export class UpdateRiderDto {
  @ApiPropertyOptional() @IsOptional() @IsString() warehouseId?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) maxActiveTasks?: number;
  @ApiPropertyOptional({ enum: VehicleType }) @IsOptional() @IsEnum(VehicleType) vehicleType?: VehicleType;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) vehicleNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) city?: string;
}

export class ReasonDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(300) reason!: string;
}

export class CashDepositDto {
  @ApiProperty() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) reference?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class AvailabilityDto {
  @ApiProperty() @IsBoolean() online!: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() latitude?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() longitude?: number;
}

const RIDER_LIST_SELECT = {
  id: true, code: true, fullName: true, phone: true, email: true, status: true, city: true, vehicleType: true, vehicleNumber: true,
  licenceNumber: true, documentUrl: true, photoUrl: true, availability: true, availabilityChangedAt: true, lastLocationAt: true,
  lastLatitude: true, lastLongitude: true, maxActiveTasks: true, createdAt: true, reviewedAt: true, rejectionReason: true,
  warehouse: { select: { id: true, name: true } },
} satisfies Prisma.RiderSelect;

/** What an order card shows of the goods: product name, photo and quantity (first three lines). */
const ITEM_PREVIEW_SELECT = { quantity: true, product: { select: { name: true, images: true } } } satisfies Prisma.OrderItemSelect;
const itemPreview = (items?: Array<{ quantity: number; product: { name: string; images: string[] } | null }>) =>
  (items ?? []).slice(0, 3).map((i) => ({ name: i.product?.name ?? 'Item', quantity: i.quantity, image: i.product?.images?.[0] ?? null }));

const mapsLink = (lat: unknown, lng: unknown, fallback: string) =>
  lat !== null && lng !== null && lat !== undefined && lng !== undefined
    ? `https://www.google.com/maps/dir/?api=1&destination=${Number(lat)},${Number(lng)}&travelmode=driving`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fallback)}`;

/** Staff management of riders + everything the rider app reads. */
@Injectable()
export class RidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly dispatch: DispatchService,
    private readonly flow: TaskFlowService,
  ) {}

  // ================================================================ staff

  async list(filters: { status?: RiderStatus; warehouseId?: string; q?: string }) {
    const riders = await this.prisma.rider.findMany({
      where: {
        status: filters.status,
        warehouseId: filters.warehouseId,
        ...(filters.q ? { OR: [{ fullName: { contains: filters.q, mode: 'insensitive' } }, { phone: { contains: filters.q } }, { code: { contains: filters.q, mode: 'insensitive' } }] } : {}),
      },
      select: { ...RIDER_LIST_SELECT, _count: { select: { tasks: { where: { status: { in: HELD_STATUSES } } } } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    const cash = await this.cashBalances(riders.map((r) => r.id));
    return riders.map(({ _count, ...r }) => ({ ...r, activeTasks: _count.tasks, cashInHand: cash.get(r.id) ?? 0 }));
  }

  private async cashBalances(ids: string[]) {
    const g = await this.prisma.riderCashEntry.groupBy({ by: ['riderId'], where: { riderId: { in: ids } }, _sum: { amount: true } });
    return new Map(g.map((x) => [x.riderId, Number(x._sum.amount ?? 0)]));
  }

  async get(id: string) {
    const r = await this.prisma.rider.findUnique({ where: { id }, select: { ...RIDER_LIST_SELECT, reviewedBy: { select: { fullName: true } } } });
    if (!r) throw new NotFoundException('Rider not found');
    const [cash, delivered, failed, active] = await Promise.all([
      this.cashBalances([id]),
      this.prisma.deliveryTask.count({ where: { riderId: id, status: 'DELIVERED' } }),
      this.prisma.deliveryTask.count({ where: { riderId: id, status: { in: ['FAILED', 'RETURNED_TO_STORE'] } } }),
      this.prisma.deliveryTask.findMany({ where: { riderId: id, status: { in: HELD_STATUSES } }, select: { id: true, taskNumber: true, status: true } }),
    ]);
    return { ...r, cashInHand: cash.get(id) ?? 0, stats: { delivered, failed }, activeTasks: active };
  }

  async approve(id: string, dto: ApproveRiderDto, userId: string) {
    const r = await this.prisma.rider.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Rider not found');
    if (r.status !== RiderStatus.PENDING_APPROVAL) throw new BadRequestException(`A ${r.status.toLowerCase().replace(/_/g, ' ')} rider cannot be approved`);
    await this.assertHomeOutlet(dto.warehouseId);
    return this.prisma.$transaction(async (tx) =>
      tx.rider.update({
        where: { id },
        data: {
          status: RiderStatus.ACTIVE, warehouseId: dto.warehouseId, maxActiveTasks: dto.maxActiveTasks ?? 1,
          code: r.code ?? (await this.sequence.nextInSeries(tx, 'RDR')), reviewedById: userId, reviewedAt: new Date(), rejectionReason: null,
        },
        select: RIDER_LIST_SELECT,
      }),
    );
  }

  async reject(id: string, dto: ReasonDto, userId: string) {
    const r = await this.prisma.rider.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Rider not found');
    if (r.status !== RiderStatus.PENDING_APPROVAL) throw new BadRequestException('Only an application awaiting approval can be rejected');
    await this.prisma.riderSession.updateMany({ where: { riderId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    return this.prisma.rider.update({ where: { id }, data: { status: RiderStatus.REJECTED, rejectionReason: dto.reason.trim(), reviewedById: userId, reviewedAt: new Date() }, select: RIDER_LIST_SELECT });
  }

  async suspend(id: string, dto: ReasonDto, userId: string) {
    const r = await this.prisma.rider.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Rider not found');
    if (r.status !== RiderStatus.ACTIVE) throw new BadRequestException('Only an active rider can be suspended');
    const held = await this.prisma.deliveryTask.count({ where: { riderId: id, status: { in: ['PICKED_UP', 'OUT_FOR_DELIVERY', 'AT_DROP', 'FAILED'] } } });
    if (held) throw new ConflictException(`The rider is carrying ${held} order(s). Let them finish or return them to the store first.`);
    // Tasks accepted but not yet picked up go back to dispatch.
    const notPicked = await this.prisma.deliveryTask.findMany({ where: { riderId: id, status: { in: ['ASSIGNED', 'AT_PICKUP'] } }, select: { id: true } });
    for (const t of notPicked) await this.dispatch.unassign(t.id, userId, 'Rider suspended');
    await this.prisma.deliveryOffer.updateMany({ where: { riderId: id, status: 'PENDING' }, data: { status: 'WITHDRAWN', respondedAt: new Date() } });
    await this.prisma.riderSession.updateMany({ where: { riderId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    return this.prisma.rider.update({
      where: { id }, data: { status: RiderStatus.SUSPENDED, availability: RiderAvailability.OFFLINE, rejectionReason: dto.reason.trim(), reviewedById: userId, reviewedAt: new Date() },
      select: RIDER_LIST_SELECT,
    });
  }

  async reactivate(id: string, userId: string) {
    const r = await this.prisma.rider.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Rider not found');
    if (r.status !== RiderStatus.SUSPENDED) throw new BadRequestException('Only a suspended rider can be reactivated');
    if (!r.warehouseId) throw new BadRequestException('Assign an outlet first');
    return this.prisma.rider.update({ where: { id }, data: { status: RiderStatus.ACTIVE, rejectionReason: null, reviewedById: userId, reviewedAt: new Date() }, select: RIDER_LIST_SELECT });
  }

  /**
   * A rider's home must be somewhere orders are delivered from by rider: an
   * active OUTLET with map coordinates. The router only sends LOCAL (rider)
   * orders from such outlets; a central warehouse ships by courier, so a rider
   * homed there would sit online and never be offered anything.
   */
  private async assertHomeOutlet(warehouseId: string) {
    const w = await this.prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { isActive: true, kind: true, latitude: true, longitude: true, name: true } });
    if (!w || !w.isActive) throw new BadRequestException('Choose an active outlet');
    if (w.kind !== 'OUTLET') throw new BadRequestException(`${w.name} is not an outlet - riders only deliver orders sent from outlets`);
    if (w.latitude === null || w.longitude === null) throw new BadRequestException(`${w.name} has no map location - set it on the warehouse first, or no order will ever be routed to it`);
  }

  async update(id: string, dto: UpdateRiderDto) {
    const r = await this.prisma.rider.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Rider not found');
    if (dto.warehouseId && dto.warehouseId !== r.warehouseId) {
      await this.assertHomeOutlet(dto.warehouseId);
      const held = await this.prisma.deliveryTask.count({ where: { riderId: id, status: { in: HELD_STATUSES } } });
      if (held) throw new ConflictException('Move the rider to another outlet once they have no active deliveries');
    }
    return this.prisma.rider.update({
      where: { id },
      data: { ...dto, vehicleNumber: dto.vehicleNumber?.trim().toUpperCase() },
      select: RIDER_LIST_SELECT,
    });
  }

  async cashLedger(id: string) {
    const [entries, balance] = await Promise.all([
      this.prisma.riderCashEntry.findMany({ where: { riderId: id }, orderBy: { createdAt: 'desc' }, take: 300, include: { recordedBy: { select: { fullName: true } } } }),
      this.cashBalances([id]),
    ]);
    return { balance: balance.get(id) ?? 0, entries: entries.map((e) => ({ ...e, amount: Number(e.amount) })) };
  }

  /** The rider hands cash to the outlet. Cannot exceed what they hold. */
  async deposit(id: string, dto: CashDepositDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM riders WHERE id = ${id} FOR UPDATE`;
      const bal = Number((await tx.riderCashEntry.aggregate({ where: { riderId: id }, _sum: { amount: true } }))._sum.amount ?? 0);
      if (Math.round(dto.amount * 100) > Math.round(bal * 100)) throw new BadRequestException(`The rider holds only ₹${bal.toFixed(2)}`);
      return tx.riderCashEntry.create({
        data: { riderId: id, type: 'DEPOSITED', amount: -dto.amount, reference: dto.reference?.trim() || null, note: dto.note?.trim() || null, recordedById: userId },
      });
    });
  }

  /**
   * Cash across all riders, for the staff Cash & Deposits screen: who holds how
   * much (and since when), and the deposits recorded in a period (default last 30 days).
   */
  async cashReport(q: { warehouseId?: string; from?: string; to?: string } = {}) {
    const riderWhere = q.warehouseId ? { warehouseId: q.warehouseId } : {};
    const from = q.from ? new Date(`${q.from.slice(0, 10)}T00:00:00+05:30`) : new Date(Date.now() - 30 * 864e5);
    const to = q.to ? new Date(new Date(`${q.to.slice(0, 10)}T00:00:00+05:30`).getTime() + 864e5) : new Date(Date.now() + 60_000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || !(from < to)) throw new BadRequestException('Give a valid date range, "from" before "to"');
    const [balances, lastCollected, lastDeposit, deposits] = await Promise.all([
      this.prisma.riderCashEntry.groupBy({ by: ['riderId'], where: { rider: riderWhere }, _sum: { amount: true } }),
      this.prisma.riderCashEntry.groupBy({ by: ['riderId'], where: { type: 'COD_COLLECTED', rider: riderWhere }, _max: { createdAt: true } }),
      this.prisma.riderCashEntry.groupBy({ by: ['riderId'], where: { type: 'DEPOSITED', rider: riderWhere }, _max: { createdAt: true } }),
      this.prisma.riderCashEntry.findMany({
        where: { type: 'DEPOSITED', createdAt: { gte: from, lt: to }, rider: riderWhere },
        orderBy: { createdAt: 'desc' },
        take: 300,
        include: { rider: { select: { id: true, code: true, fullName: true } }, recordedBy: { select: { fullName: true } } },
      }),
    ]);
    const held = balances.filter((b) => Number(b._sum.amount ?? 0) !== 0);
    const riders = await this.prisma.rider.findMany({
      where: { id: { in: held.map((b) => b.riderId) } },
      select: { id: true, code: true, fullName: true, phone: true, status: true, availability: true, warehouse: { select: { id: true, name: true } } },
    });
    const at = (g: Array<{ riderId: string; _max: { createdAt: Date | null } }>) => new Map(g.map((x) => [x.riderId, x._max.createdAt]));
    const collectedAt = at(lastCollected);
    const depositAt = at(lastDeposit);
    const bal = new Map(held.map((b) => [b.riderId, Number(b._sum.amount ?? 0)]));
    const round = (n: number) => Math.round(n * 100) / 100;
    const rows = riders
      .map((r) => ({ ...r, balance: bal.get(r.id) ?? 0, lastCollectedAt: collectedAt.get(r.id) ?? null, lastDepositAt: depositAt.get(r.id) ?? null }))
      .sort((a, b) => b.balance - a.balance);
    return {
      totalHeld: round(rows.reduce((a, r) => a + r.balance, 0)),
      riders: rows,
      deposits: {
        from: from.toISOString(),
        to: to.toISOString(),
        total: round(deposits.reduce((a, d) => a - Number(d.amount), 0)),
        entries: deposits.map((d) => ({ id: d.id, amount: -Number(d.amount), reference: d.reference, note: d.note, createdAt: d.createdAt, rider: d.rider, recordedBy: d.recordedBy })),
      },
    };
  }

  /** Online riders with a position, for the staff live map. */
  live(warehouseId?: string) {
    return this.prisma.rider.findMany({
      where: { status: 'ACTIVE', availability: 'ONLINE', ...(warehouseId ? { warehouseId } : {}) },
      select: {
        id: true, code: true, fullName: true, phone: true, lastLatitude: true, lastLongitude: true, lastLocationAt: true, warehouse: { select: { id: true, name: true } },
        tasks: { where: { status: { in: HELD_STATUSES } }, select: { id: true, taskNumber: true, status: true } },
      },
    });
  }

  // ---------------------------------------------------------------- tasks (staff)

  tasks(filters: { status?: DeliveryTaskStatus; warehouseId?: string; needsAssignment?: boolean; riderId?: string; orderId?: string }) {
    return this.prisma.deliveryTask.findMany({
      where: {
        status: filters.status, warehouseId: filters.warehouseId, riderId: filters.riderId, orderId: filters.orderId,
        ...(filters.needsAssignment ? { needsManualAssignment: true, status: { in: ['READY_FOR_PICKUP', 'OFFERED'] } } : {}),
      },
      include: {
        rider: { select: { id: true, fullName: true, phone: true, code: true } },
        warehouse: { select: { id: true, name: true } },
        zone: { select: { id: true, name: true, code: true } },
        order: { select: { id: true, orderNumber: true, status: true, paymentMode: true, paymentStatus: true, total: true } },
      },
      orderBy: [{ needsManualAssignment: 'desc' }, { readyAt: 'desc' }],
      take: 300,
    });
  }

  async task(id: string) {
    const t = await this.prisma.deliveryTask.findUnique({
      where: { id },
      include: {
        rider: { select: { id: true, fullName: true, phone: true, code: true } },
        warehouse: { select: { id: true, name: true, location: true } },
        zone: { select: { id: true, name: true, code: true } },
        order: { select: { id: true, orderNumber: true, status: true, paymentMode: true, paymentStatus: true, total: true } },
        events: { orderBy: { createdAt: 'asc' } },
        offers: { orderBy: { offeredAt: 'asc' }, include: { rider: { select: { fullName: true } } } },
        cod: true,
        earnings: true,
      },
    });
    if (!t) throw new NotFoundException('Task not found');
    return t;
  }

  // ================================================================ rider app

  private async activeRider(riderId: string) {
    const r = await this.prisma.rider.findUnique({ where: { id: riderId }, include: { warehouse: { select: { id: true, name: true, location: true } } } });
    if (!r) throw new NotFoundException('Rider not found');
    return r;
  }

  async setAvailability(riderId: string, dto: AvailabilityDto) {
    const r = await this.activeRider(riderId);
    if (dto.online) {
      if (r.status !== 'ACTIVE') throw new ForbiddenException(r.status === 'PENDING_APPROVAL' ? 'Your account is waiting for approval' : 'Your account is not active');
      if (!r.warehouseId) throw new ForbiddenException('You have not been assigned an outlet yet');
    }
    const updated = await this.prisma.rider.update({
      where: { id: riderId },
      data: {
        availability: dto.online ? 'ONLINE' : 'OFFLINE',
        availabilityChangedAt: new Date(),
        ...(dto.latitude !== undefined && dto.longitude !== undefined ? { lastLatitude: dto.latitude, lastLongitude: dto.longitude, lastLocationAt: new Date() } : {}),
      },
    });
    if (!dto.online) {
      // Nothing new comes to an offline rider; a request already showing is withdrawn.
      const pending = await this.prisma.deliveryOffer.findMany({ where: { riderId, status: 'PENDING' } });
      for (const p of pending) await this.dispatch.respond(riderId, p.id, false, 'Went offline').catch(() => undefined);
    } else {
      await this.dispatch.riderCameOnline(riderId);
    }
    return { availability: updated.availability };
  }

  async location(riderId: string, loc: { latitude?: number; longitude?: number }) {
    await this.flow.touchLocation(riderId, loc);
    return { ok: true };
  }

  /** Home screen: the four counters, what is in hand, and requests waiting. */
  async dashboard(riderId: string) {
    const r = await this.activeRider(riderId);
    const since = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) + 'T00:00:00+05:30');
    const count = (where: Prisma.DeliveryTaskWhereInput) => this.prisma.deliveryTask.count({ where: { riderId, ...where } });
    const [completed, pending, cancelled, returned, offers, active, cash] = await Promise.all([
      count({ status: 'DELIVERED', deliveredAt: { gte: since } }),
      count({ status: { in: HELD_STATUSES.filter((s) => s !== 'FAILED') } }),
      count({ status: 'CANCELLED', cancelledAt: { gte: since } }),
      count({ status: { in: ['FAILED', 'RETURNED_TO_STORE'] }, failedAt: { gte: since } }),
      this.offers(riderId),
      this.tasksForRider(riderId, 'active'),
      this.cashBalances([riderId]),
    ]);
    return {
      rider: { id: r.id, fullName: r.fullName, code: r.code, status: r.status, availability: r.availability, outlet: r.warehouse },
      today: { completed, pending, cancelled, returned },
      cashInHand: cash.get(riderId) ?? 0,
      offers,
      active,
    };
  }

  /** Requests offered to this rider, still open. The customer's phone is not shown until accepted. */
  async offers(riderId: string) {
    const offers = await this.prisma.deliveryOffer.findMany({
      where: { riderId, status: 'PENDING', expiresAt: { gt: new Date() } },
      include: {
        task: {
          select: {
            id: true, taskNumber: true, speed: true, dropAddress: true, distanceKm: true, codAmount: true, promisedBy: true,
            warehouse: { select: { name: true, location: true } },
            order: { select: { orderNumber: true, items: { select: ITEM_PREVIEW_SELECT } } },
          },
        },
      },
      orderBy: { offeredAt: 'desc' },
    });
    return offers.map((o) => ({
      offerId: o.id,
      expiresAt: o.expiresAt,
      taskId: o.task.id,
      taskNumber: o.task.taskNumber,
      speed: o.task.speed,
      pickup: o.task.warehouse,
      // Defence in depth: tasks created before 26 Sep may still carry the phone.
      dropArea: stripPhone(o.task.dropAddress),
      distanceKm: o.task.distanceKm === null ? null : Number(o.task.distanceKm),
      cod: Number(o.task.codAmount),
      itemCount: o.task.order?.items.reduce((s, i) => s + i.quantity, 0) ?? 0,
      items: itemPreview(o.task.order?.items),
      orderNumber: o.task.order?.orderNumber ?? null,
      promisedBy: o.task.promisedBy,
      offeredAt: o.offeredAt,
    }));
  }

  async tasksForRider(riderId: string, scope: 'active' | 'history', page = 1) {
    const rows = await this.prisma.deliveryTask.findMany({
      where: { riderId, status: scope === 'active' ? { in: HELD_STATUSES } : { in: ['DELIVERED', 'RETURNED_TO_STORE', 'CANCELLED'] } },
      include: { warehouse: { select: { name: true } }, order: { select: { orderNumber: true, items: { select: ITEM_PREVIEW_SELECT } } } },
      orderBy: scope === 'active' ? { assignedAt: 'asc' } : { updatedAt: 'desc' },
      take: 30,
      skip: (Math.max(page, 1) - 1) * 30,
    });
    const pay = await this.prisma.riderEarning.groupBy({ by: ['taskId'], where: { taskId: { in: rows.map((r) => r.id) } }, _sum: { amount: true } });
    const payBy = new Map(pay.map((p) => [p.taskId, Number(p._sum.amount ?? 0)]));
    return rows.map((t) => ({
      id: t.id, taskNumber: t.taskNumber, status: t.status, speed: t.speed, orderNumber: t.order?.orderNumber ?? null,
      pickupName: t.warehouse.name, dropName: t.dropName, dropAddress: t.dropAddress, cod: Number(t.codAmount),
      distanceKm: t.distanceKm === null ? null : Number(t.distanceKm), promisedBy: t.promisedBy,
      assignedAt: t.assignedAt, deliveredAt: t.deliveredAt, updatedAt: t.updatedAt, earned: payBy.get(t.id) ?? 0,
      itemCount: t.order?.items.reduce((s, i) => s + i.quantity, 0) ?? 0,
      items: itemPreview(t.order?.items),
    }));
  }

  /** Full detail of a task the rider holds (or held). */
  async taskForRider(riderId: string, id: string) {
    const t = await this.prisma.deliveryTask.findUnique({
      where: { id },
      include: {
        warehouse: { select: { name: true, location: true, latitude: true, longitude: true, contactPhone: true } },
        order: { select: { orderNumber: true, paymentMode: true, deliveryOtp: true, items: { select: { quantity: true, product: { select: { name: true, images: true } } } } } },
        events: { orderBy: { createdAt: 'asc' }, select: { type: true, note: true, createdAt: true } },
        cod: true,
        earnings: { select: { type: true, amount: true } },
      },
    });
    if (!t || t.riderId !== riderId) throw new NotFoundException('Task not found');
    const live = HELD_STATUSES.includes(t.status);
    return {
      id: t.id,
      taskNumber: t.taskNumber,
      status: t.status,
      speed: t.speed,
      attempt: t.attempt,
      orderNumber: t.order?.orderNumber ?? null,
      promisedBy: t.promisedBy,
      pickup: {
        name: t.warehouse.name, address: t.warehouse.location, phone: t.warehouse.contactPhone,
        latitude: t.warehouse.latitude === null ? null : Number(t.warehouse.latitude),
        longitude: t.warehouse.longitude === null ? null : Number(t.warehouse.longitude),
        navigationUrl: mapsLink(t.warehouse.latitude, t.warehouse.longitude, t.warehouse.location),
      },
      drop: {
        name: t.dropName,
        // Contact details only while the rider is working the task.
        phone: live ? t.dropPhone : null,
        address: t.dropAddress,
        latitude: t.dropLatitude === null ? null : Number(t.dropLatitude),
        longitude: t.dropLongitude === null ? null : Number(t.dropLongitude),
        navigationUrl: mapsLink(t.dropLatitude, t.dropLongitude, t.dropAddress),
      },
      distanceKm: t.distanceKm === null ? null : Number(t.distanceKm),
      // How many digits the customer's code has - never the code itself.
      otpLength: t.order?.deliveryOtp?.length ?? null,
      items: (t.order?.items ?? []).map((i) => ({ name: i.product?.name ?? 'Item', quantity: i.quantity, image: i.product?.images?.[0] ?? null })),
      payment: {
        mode: t.order?.paymentMode ?? null,
        codAmount: Number(t.codAmount),
        collected: t.cod ? { amount: Number(t.cod.collectedAmount), method: t.cod.method, at: t.cod.collectedAt } : null,
      },
      failure: t.failureReasonCode ? { code: t.failureReasonCode, note: t.failureNote, photoUrl: t.failureProofUrl } : null,
      timeline: t.events,
      earned: t.earnings.reduce((s, e) => s + Number(e.amount), 0),
      times: {
        assignedAt: t.assignedAt, arrivedPickupAt: t.arrivedPickupAt, pickedUpAt: t.pickedUpAt, outForDeliveryAt: t.outForDeliveryAt,
        arrivedDropAt: t.arrivedDropAt, deliveredAt: t.deliveredAt, failedAt: t.failedAt, returnedAt: t.returnedAt, cancelledAt: t.cancelledAt,
      },
    };
  }

  notifications(riderId: string) {
    return this.prisma.riderNotification.findMany({ where: { riderId }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async markRead(riderId: string, ids?: string[]) {
    const r = await this.prisma.riderNotification.updateMany({ where: { riderId, readAt: null, ...(ids?.length ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
    return { marked: r.count };
  }
}
