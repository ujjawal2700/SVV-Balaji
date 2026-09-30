import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  CustomerAccountStatus,
  Prisma,
  PushApp,
  PushRecipientKind,
  RiderAvailability,
  RiderStatus,
  SalesChannel,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FcmService } from './fcm.service';
import {
  AudienceDto,
  BroadcastAudienceType,
  RecipientKind,
  RegisterDeviceDto,
  SendBroadcastDto,
} from './notifications.dto';

/** Who a broadcast resolves to, by identity system. */
interface Recipients {
  staff: string[];
  customers: string[];
  riders: string[];
}

export interface CustomerNotificationMessage {
  title: string;
  body: string;
  link: string;
  tag: string;
}

const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  BRANCH_MANAGER: 'Branch Manager',
  PROCUREMENT_MANAGER: 'Procurement Manager',
  AGRICULTURE_EXPERT: 'Agriculture Expert',
  PRODUCTION_MANAGER: 'Production Manager',
  QA_MANAGER: 'QA Manager',
  WAREHOUSE_MANAGER: 'Warehouse Manager',
  SALES_TEAM: 'Sales Executive',
  LOGISTICS_TEAM: 'Logistics Team',
};

const clean = (list?: string[]) => (list ?? []).map((s) => s.trim()).filter(Boolean);

/** Case-insensitive "equals any of" - Prisma's `in` has no insensitive mode on every provider. */
const anyOf = (values: string[]): Prisma.StringNullableFilter[] =>
  values.map((v) => ({ equals: v, mode: 'insensitive' as const }));

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fcm: FcmService,
  ) {}

  get pushEnabled() {
    return this.fcm.enabled;
  }

  // ------------------------------------------------------------------ devices

  /**
   * Called by every app right after sign-in (and on each app start while signed in). The same
   * browser signing in as someone else re-points the row rather than keeping both owners.
   */
  async registerDevice(
    owner: { kind: PushRecipientKind; id: string; sessionId?: string | null },
    dto: RegisterDeviceDto,
    userAgent?: string,
  ) {
    const expected: Record<PushRecipientKind, PushApp[]> = {
      STAFF: [PushApp.ADMIN, PushApp.FIELD],
      CUSTOMER: [PushApp.CUSTOMER],
      RIDER: [PushApp.RIDER],
    };
    if (!expected[owner.kind].includes(dto.app)) {
      const article = /^[AEIOU]/.test(dto.app) ? 'an' : 'a';
      throw new BadRequestException(
        `A ${owner.kind.toLowerCase()} session cannot register ${article} ${dto.app} device`,
      );
    }
    const ownerFields = {
      kind: owner.kind,
      app: dto.app,
      userId: owner.kind === PushRecipientKind.STAFF ? owner.id : null,
      customerAccountId: owner.kind === PushRecipientKind.CUSTOMER ? owner.id : null,
      riderId: owner.kind === PushRecipientKind.RIDER ? owner.id : null,
      sessionId: owner.sessionId ?? null,
      userAgent: userAgent?.slice(0, 300) ?? null,
    };
    await this.prisma.$transaction(async (tx) => {
      // FCM can rotate a browser token. Customer/rider sessions identify one
      // device login, so remove its superseded token immediately instead of
      // waiting for a future send to discover that it is dead. Staff do not
      // carry a session id and may legitimately have several devices.
      if (owner.sessionId) {
        await tx.pushDevice.deleteMany({
          where: {
            kind: owner.kind,
            app: dto.app,
            sessionId: owner.sessionId,
            token: { not: dto.token },
          },
        });
      }
      await tx.pushDevice.upsert({
        where: { token: dto.token },
        create: { token: dto.token, ...ownerFields },
        update: ownerFields,
      });
    });
    return { registered: true, pushEnabled: this.fcm.enabled };
  }

  /**
   * Sign-out. Needs no auth on purpose: the app calls it while signing out, often with an
   * access token that has just expired, and knowing a token is proof enough of holding the device.
   */
  async unregisterDevice(token: string) {
    const r = await this.prisma.pushDevice.deleteMany({ where: { token } });
    return { removed: r.count };
  }

  // ------------------------------------------------------------------ audience

  async resolve(a: AudienceDto): Promise<Recipients> {
    const out: Recipients = { staff: [], customers: [], riders: [] };
    const want = (t: BroadcastAudienceType) =>
      a.type === t || a.type === BroadcastAudienceType.EVERYONE;

    if (a.type === BroadcastAudienceType.SPECIFIC) {
      const refs = a.recipients ?? [];
      if (refs.length === 0) throw new BadRequestException('Pick at least one person');
      const ids = (k: RecipientKind) => [
        ...new Set(refs.filter((r) => r.kind === k).map((r) => r.id)),
      ];
      // Re-read so a stale id or an account suspended since it was picked is dropped, not sent to.
      const [staff, customers, riders] = await Promise.all([
        this.prisma.user.findMany({
          where: { id: { in: ids(RecipientKind.STAFF) }, status: UserStatus.ACTIVE },
          select: { id: true },
        }),
        this.prisma.customerAccount.findMany({
          where: { id: { in: ids(RecipientKind.CUSTOMER) }, status: CustomerAccountStatus.ACTIVE },
          select: { id: true },
        }),
        this.prisma.rider.findMany({
          where: { id: { in: ids(RecipientKind.RIDER) }, status: RiderStatus.ACTIVE },
          select: { id: true },
        }),
      ]);
      return {
        staff: staff.map((x) => x.id),
        customers: customers.map((x) => x.id),
        riders: riders.map((x) => x.id),
      };
    }

    const cities = clean(a.cities);
    const states = clean(a.states);
    const pincodes = clean(a.pincodes);

    if (want(BroadcastAudienceType.STAFF)) {
      const roles = a.type === BroadcastAudienceType.STAFF ? (a.roles ?? []) : [];
      const branchIds = a.type === BroadcastAudienceType.STAFF ? clean(a.branchIds) : [];
      const rows = await this.prisma.user.findMany({
        where: {
          status: UserStatus.ACTIVE,
          ...(roles.length ? { role: { in: roles } } : {}),
          ...(branchIds.length ? { branchId: { in: branchIds } } : {}),
        },
        select: { id: true },
      });
      out.staff = rows.map((r) => r.id);
    }

    for (const [type, channel] of [
      [BroadcastAudienceType.CUSTOMERS, SalesChannel.B2C],
      [BroadcastAudienceType.RETAILERS, SalesChannel.B2B],
    ] as const) {
      if (!want(type)) continue;
      const scoped = a.type === type;
      const salesExecIds =
        scoped && type === BroadcastAudienceType.RETAILERS ? clean(a.salesExecutiveIds) : [];
      const and: Prisma.CustomerAccountWhereInput[] = [];
      // An account's location can be on the signup form (retailers), on the Customer record,
      // or only on a saved delivery address (most B2C shoppers) - any of the three counts.
      const located = (field: 'city' | 'state' | 'pincode', values: string[]) => {
        if (!scoped || values.length === 0) return;
        and.push({
          OR: [
            ...anyOf(values).map((f) => ({ [field]: f })),
            ...anyOf(values).map((f) => ({ customer: { [field]: f } })),
            {
              customer: { addresses: { some: { OR: anyOf(values).map((f) => ({ [field]: f })) } } },
            },
          ] as Prisma.CustomerAccountWhereInput[],
        });
      };
      located('city', cities);
      located('state', states);
      located('pincode', pincodes);
      if (salesExecIds.length) and.push({ customer: { assignedToId: { in: salesExecIds } } });

      const rows = await this.prisma.customerAccount.findMany({
        where: { channel, status: CustomerAccountStatus.ACTIVE, AND: and },
        select: { id: true },
      });
      out.customers.push(...rows.map((r) => r.id));
    }

    if (want(BroadcastAudienceType.RIDERS)) {
      const scoped = a.type === BroadcastAudienceType.RIDERS;
      const warehouseIds = scoped ? clean(a.warehouseIds) : [];
      const rows = await this.prisma.rider.findMany({
        where: {
          status: RiderStatus.ACTIVE,
          ...(warehouseIds.length ? { warehouseId: { in: warehouseIds } } : {}),
          ...(scoped && cities.length ? { OR: anyOf(cities).map((city) => ({ city })) } : {}),
          ...(scoped && a.onlineOnly ? { availability: RiderAvailability.ONLINE } : {}),
        },
        select: { id: true },
      });
      out.riders = rows.map((r) => r.id);
    }
    return out;
  }

  /**
   * Devices that may show a system notification right now: the owner is still signed in on
   * them. Anything else gets the inbox entry only.
   */
  private async liveDevices(r: Recipients) {
    const now = new Date();
    const [staff, customers, riders] = await Promise.all([
      this.prisma.pushDevice.findMany({
        // Staff logout clears refreshTokenHash - that is the signed-out state for staff.
        where: {
          kind: PushRecipientKind.STAFF,
          userId: { in: r.staff },
          user: { refreshTokenHash: { not: null } },
        },
        select: { token: true, userId: true },
      }),
      this.prisma.pushDevice.findMany({
        where: {
          kind: PushRecipientKind.CUSTOMER,
          customerAccountId: { in: r.customers },
          sessionId: { not: null },
        },
        select: { token: true, customerAccountId: true, sessionId: true },
      }),
      this.prisma.pushDevice.findMany({
        where: {
          kind: PushRecipientKind.RIDER,
          riderId: { in: r.riders },
          sessionId: { not: null },
        },
        select: { token: true, riderId: true, sessionId: true },
      }),
    ]);

    const [liveCustomerSessions, liveRiderSessions] = await Promise.all([
      this.prisma.customerSession.findMany({
        where: {
          id: { in: customers.map((d) => d.sessionId!) },
          revokedAt: null,
          expiresAt: { gt: now },
        },
        select: { id: true },
      }),
      this.prisma.riderSession.findMany({
        where: {
          id: { in: riders.map((d) => d.sessionId!) },
          revokedAt: null,
          expiresAt: { gt: now },
        },
        select: { id: true },
      }),
    ]);
    const cs = new Set(liveCustomerSessions.map((s) => s.id));
    const rs = new Set(liveRiderSessions.map((s) => s.id));

    return [
      ...staff.map((d) => ({ token: d.token, owner: `S:${d.userId}` })),
      ...customers
        .filter((d) => cs.has(d.sessionId!))
        .map((d) => ({ token: d.token, owner: `C:${d.customerAccountId}` })),
      ...riders
        .filter((d) => rs.has(d.sessionId!))
        .map((d) => ({ token: d.token, owner: `R:${d.riderId}` })),
    ];
  }

  async preview(a: AudienceDto) {
    const r = await this.resolve(a);
    const devices = await this.liveDevices(r);
    return {
      staff: r.staff.length,
      customers: r.customers.length,
      riders: r.riders.length,
      total: r.staff.length + r.customers.length + r.riders.length,
      reachable: new Set(devices.map((d) => d.owner)).size,
      devices: devices.length,
      pushEnabled: this.fcm.enabled,
    };
  }

  // ------------------------------------------------------------------ send

  /**
   * Deliver one transactional order update to one storefront account.
   *
   * The inbox row is written before FCM is attempted, so an offline customer
   * still sees the update later. `orderEventId` is unique in the database:
   * lifecycle retries, duplicate in-process signals and multiple API replicas
   * all converge on one inbox row and one push attempt.
   */
  async notifyCustomerForOrderEvent(
    customerAccountId: string,
    orderEventId: string,
    message: CustomerNotificationMessage,
  ) {
    let notification: { id: string };
    try {
      notification = await this.prisma.appNotification.create({
        data: {
          kind: PushRecipientKind.CUSTOMER,
          customerAccountId,
          orderEventId,
          title: message.title,
          body: message.body,
          link: message.link,
        },
        select: { id: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { created: false, sent: 0, failed: 0 };
      }
      throw error;
    }

    const devices = await this.liveDevices({
      staff: [],
      customers: [customerAccountId],
      riders: [],
    });
    const result = await this.fcm.send(
      devices.map((d) => d.token),
      { ...message, notificationId: notification.id },
    );
    if (result.deadTokens.length) {
      await this.prisma.pushDevice.deleteMany({ where: { token: { in: result.deadTokens } } });
    }
    this.logger.log(
      `Order notification ${orderEventId}: customer ${customerAccountId}, ${devices.length} device(s), ` +
        `${result.sent} sent, ${result.failed} failed`,
    );
    return { created: true, sent: result.sent, failed: result.failed };
  }

  async send(dto: SendBroadcastDto, actorId: string) {
    const r = await this.resolve(dto.audience);
    const total = r.staff.length + r.customers.length + r.riders.length;
    if (total === 0)
      throw new BadRequestException('Nobody matches this audience - widen the filters');

    const link = dto.link?.trim() || null;
    const imageUrl = dto.imageUrl?.trim() || null;
    const summary = await this.describe(dto.audience, r);

    // Inbox rows first, in one transaction: whatever happens to delivery, everyone matched has
    // the message waiting in the app.
    const broadcast = await this.prisma.$transaction(async (tx) => {
      const b = await tx.pushBroadcast.create({
        data: {
          title: dto.title,
          body: dto.body,
          imageUrl,
          link,
          audience: dto.audience as unknown as Prisma.InputJsonValue,
          audienceSummary: summary,
          recipientCount: total,
          createdById: actorId,
        },
      });
      const common = { broadcastId: b.id, title: dto.title, body: dto.body, imageUrl, link };
      if (r.staff.length) {
        await tx.appNotification.createMany({
          data: r.staff.map((userId) => ({ ...common, kind: PushRecipientKind.STAFF, userId })),
        });
      }
      if (r.customers.length) {
        await tx.appNotification.createMany({
          data: r.customers.map((customerAccountId) => ({
            ...common,
            kind: PushRecipientKind.CUSTOMER,
            customerAccountId,
          })),
        });
      }
      if (r.riders.length) {
        // Riders already have an inbox (rider_notifications) with a screen in the rider app.
        await tx.riderNotification.createMany({
          data: r.riders.map((riderId) => ({
            riderId,
            type: 'BROADCAST',
            title: dto.title,
            body: dto.body,
            imageUrl,
            link,
          })),
        });
      }
      return b;
    });

    const devices = await this.liveDevices(r);
    const result = await this.fcm.send(
      devices.map((d) => d.token),
      { title: dto.title, body: dto.body, imageUrl, link, tag: `broadcast-${broadcast.id}` },
    );
    if (result.deadTokens.length) {
      await this.prisma.pushDevice.deleteMany({ where: { token: { in: result.deadTokens } } });
    }

    const updated = await this.prisma.pushBroadcast.update({
      where: { id: broadcast.id },
      data: {
        reachableCount: new Set(devices.map((d) => d.owner)).size,
        deviceCount: devices.length,
        sentCount: result.sent,
        failedCount: result.failed,
      },
    });
    this.logger.log(
      `Broadcast ${updated.id}: ${total} recipients, ${devices.length} devices, ${result.sent} sent, ${result.failed} failed`,
    );
    return { ...updated, pushEnabled: this.fcm.enabled };
  }

  private async describe(a: AudienceDto, r: Recipients): Promise<string> {
    const parts: string[] = [];
    switch (a.type) {
      case BroadcastAudienceType.EVERYONE:
        parts.push('Everyone');
        break;
      case BroadcastAudienceType.CUSTOMERS:
        parts.push('Customers (B2C)');
        break;
      case BroadcastAudienceType.RETAILERS:
        parts.push('Retailers (B2B)');
        break;
      case BroadcastAudienceType.RIDERS:
        parts.push(a.onlineOnly ? 'Riders (online now)' : 'Riders');
        break;
      case BroadcastAudienceType.STAFF:
        parts.push(
          a.roles?.length ? a.roles.map((x) => ROLE_LABELS[x] ?? x).join(', ') : 'All staff',
        );
        break;
      case BroadcastAudienceType.SPECIFIC:
        parts.push(`${r.staff.length + r.customers.length + r.riders.length} selected people`);
        break;
    }
    if (a.type === BroadcastAudienceType.SPECIFIC || a.type === BroadcastAudienceType.EVERYONE)
      return parts.join(' · ');
    if (clean(a.cities).length) parts.push(`city: ${clean(a.cities).join(', ')}`);
    if (clean(a.states).length) parts.push(`state: ${clean(a.states).join(', ')}`);
    if (clean(a.pincodes).length) parts.push(`pincode: ${clean(a.pincodes).join(', ')}`);
    if (clean(a.branchIds).length) {
      const b = await this.prisma.branch.findMany({
        where: { id: { in: clean(a.branchIds) } },
        select: { name: true },
      });
      parts.push(`branch: ${b.map((x) => x.name).join(', ')}`);
    }
    if (clean(a.warehouseIds).length) {
      const w = await this.prisma.warehouse.findMany({
        where: { id: { in: clean(a.warehouseIds) } },
        select: { name: true },
      });
      parts.push(`outlet: ${w.map((x) => x.name).join(', ')}`);
    }
    if (clean(a.salesExecutiveIds).length) {
      const u = await this.prisma.user.findMany({
        where: { id: { in: clean(a.salesExecutiveIds) } },
        select: { fullName: true },
      });
      parts.push(`sales exec: ${u.map((x) => x.fullName).join(', ')}`);
    }
    return parts.join(' · ');
  }

  // ------------------------------------------------------------------ admin reads

  history(page = 1, pageSize = 20) {
    const take = Math.min(Math.max(pageSize, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;
    return this.prisma.$transaction(async (tx) => {
      const [items, total] = await Promise.all([
        tx.pushBroadcast.findMany({
          orderBy: { createdAt: 'desc' },
          skip,
          take,
          include: { createdBy: { select: { id: true, fullName: true } } },
        }),
        tx.pushBroadcast.count(),
      ]);
      const ids = items.map((i) => i.id);
      const reads = ids.length
        ? await tx.appNotification.groupBy({
            by: ['broadcastId'],
            where: { broadcastId: { in: ids }, readAt: { not: null } },
            _count: true,
          })
        : [];
      const readMap = new Map(reads.map((x) => [x.broadcastId, x._count]));
      return {
        items: items.map((i) => ({ ...i, readCount: readMap.get(i.id) ?? 0 })),
        total,
        page: Math.max(page, 1),
        pageSize: take,
      };
    });
  }

  /** Filter choices for the compose form. */
  async options() {
    const [branches, outlets, salesExecutives, cities] = await Promise.all([
      this.prisma.branch.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.warehouse.findMany({
        where: { isActive: true },
        select: { id: true, name: true, kind: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.user.findMany({
        where: { role: UserRole.SALES_TEAM, status: UserStatus.ACTIVE },
        select: { id: true, fullName: true },
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.$queryRaw<Array<{ city: string }>>`
        SELECT DISTINCT initcap(trim(city)) AS city FROM (
          SELECT city FROM customer_accounts UNION ALL
          SELECT city FROM customers UNION ALL
          SELECT city FROM customer_addresses UNION ALL
          SELECT city FROM riders
        ) c WHERE city IS NOT NULL AND trim(city) <> '' ORDER BY 1 LIMIT 500`,
    ]);
    return {
      roles: Object.values(UserRole).map((value) => ({ value, label: ROLE_LABELS[value] })),
      branches,
      outlets,
      salesExecutives,
      cities: cities.map((c) => c.city),
      pushEnabled: this.fcm.enabled,
    };
  }

  /** People search for "Specific people". */
  async searchRecipients(q: string, kind?: RecipientKind) {
    const term = q.trim();
    if (term.length < 2) return [];
    const text = { contains: term, mode: 'insensitive' as const };
    const want = (k: RecipientKind) => !kind || kind === k;
    const [staff, accounts, riders] = await Promise.all([
      want(RecipientKind.STAFF)
        ? this.prisma.user.findMany({
            where: {
              status: UserStatus.ACTIVE,
              OR: [{ fullName: text }, { email: text }, { phone: text }],
            },
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
              _count: { select: { pushDevices: true } },
            },
            take: 15,
          })
        : [],
      want(RecipientKind.CUSTOMER)
        ? this.prisma.customerAccount.findMany({
            where: {
              status: CustomerAccountStatus.ACTIVE,
              OR: [{ fullName: text }, { phone: text }, { email: text }, { businessName: text }],
            },
            select: {
              id: true,
              fullName: true,
              phone: true,
              channel: true,
              businessName: true,
              _count: { select: { pushDevices: true } },
            },
            take: 15,
          })
        : [],
      want(RecipientKind.RIDER)
        ? this.prisma.rider.findMany({
            where: {
              status: RiderStatus.ACTIVE,
              OR: [{ fullName: text }, { phone: text }, { code: text }],
            },
            select: {
              id: true,
              fullName: true,
              phone: true,
              code: true,
              _count: { select: { pushDevices: true } },
            },
            take: 15,
          })
        : [],
    ]);
    return [
      ...staff.map((u) => ({
        kind: RecipientKind.STAFF,
        id: u.id,
        name: u.fullName,
        subtitle: `${ROLE_LABELS[u.role]} · ${u.email}`,
        group: ROLE_LABELS[u.role],
        devices: u._count.pushDevices,
      })),
      ...accounts.map((c) => ({
        kind: RecipientKind.CUSTOMER,
        id: c.id,
        name:
          c.channel === SalesChannel.B2B && c.businessName
            ? `${c.businessName} (${c.fullName})`
            : c.fullName,
        subtitle: c.phone,
        group: c.channel === SalesChannel.B2B ? 'Retailer' : 'Customer',
        devices: c._count.pushDevices,
      })),
      ...riders.map((r) => ({
        kind: RecipientKind.RIDER,
        id: r.id,
        name: r.fullName,
        subtitle: [r.code, r.phone].filter(Boolean).join(' · '),
        group: 'Rider',
        devices: r._count.pushDevices,
      })),
    ];
  }

  // ------------------------------------------------------------------ inbox (staff + storefront)

  async inbox(owner: { userId?: string; customerAccountId?: string }) {
    const where = owner.userId
      ? { userId: owner.userId }
      : { customerAccountId: owner.customerAccountId };
    const [items, unread] = await Promise.all([
      this.prisma.appNotification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          title: true,
          body: true,
          imageUrl: true,
          link: true,
          readAt: true,
          createdAt: true,
        },
      }),
      this.prisma.appNotification.count({ where: { ...where, readAt: null } }),
    ]);
    return { items, unread };
  }

  async markRead(owner: { userId?: string; customerAccountId?: string }, ids?: string[]) {
    const where = owner.userId
      ? { userId: owner.userId }
      : { customerAccountId: owner.customerAccountId };
    const r = await this.prisma.appNotification.updateMany({
      where: { ...where, readAt: null, ...(ids?.length ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
    return { marked: r.count };
  }
}
