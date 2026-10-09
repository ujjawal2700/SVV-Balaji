import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PushRecipientKind, UserRole } from '@prisma/client';
import { PermissionsService } from '../auth/permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminOrdersGateway } from './admin-orders.gateway';
import { OrderEventsService } from './order-events.service';
import { loadSummary } from './order-summary';
import { PushService } from './push.service';

/** Things that need someone at the store / office to act. */
export type StaffAlertType =
  | 'NEW_ORDER'
  | 'RIDER_SIGNUP'
  | 'RIDER_DOCUMENT'
  | 'RETURN_REQUEST'
  | 'AFFILIATE_APPLICATION'
  | 'RETAILER_SIGNUP'
  | 'SUPPORT_TICKET';

export interface StaffAlert {
  type: StaffAlertType;
  title: string;
  body: string;
  /** Admin panel path that opens the thing to act on. */
  link: string;
  /** Only staff whose role holds this permission are told (Super Admin always). */
  permission: string;
  /** Branch-scoped work (orders): Super Admin plus that branch's staff only. */
  branchId?: string | null;
  /**
   * Notification tag. One per thing (e.g. `new_order-<orderId>`) so the system
   * notification the open dashboard raises and the web push for the same order
   * collapse into one. Default: unique per alert.
   */
  tag?: string;
}

/** What the admin socket and the browser push carry. */
export interface StaffAlertPayload {
  type: StaffAlertType;
  title: string;
  body: string;
  link: string;
  tag: string;
}

/**
 * One way to tell staff "something needs you": an entry in the header bell
 * (AppNotification, kind STAFF), a live pop-up on any open admin tab
 * (`alerts:new` on the /admin socket) and a system notification on every
 * browser that turned alerts on (VAPID web push - shown by public/sw.js unless
 * the dashboard is the focused tab, which already showed the pop-up).
 *
 * Best-effort: never throws, so an alert can never undo the action behind it.
 */
@Injectable()
export class StaffAlertsService implements OnModuleInit {
  private readonly logger = new Logger(StaffAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly push: PushService,
    private readonly gateway: AdminOrdersGateway,
    private readonly orderEvents: OrderEventsService,
  ) {}

  onModuleInit(): void {
    // Checkout publishes `new` once the order has committed (storefront orders only).
    this.orderEvents.on('new', (orderId) => void this.newOrder(orderId));
  }

  async notify(alert: StaffAlert): Promise<void> {
    try {
      const users = await this.prisma.user.findMany({
        where: {
          status: 'ACTIVE',
          ...(alert.branchId ? { OR: [{ role: UserRole.SUPER_ADMIN }, { branchId: alert.branchId }] } : {}),
        },
        select: { id: true, role: true },
      });
      const ids: string[] = [];
      for (const u of users) {
        if (u.role === UserRole.SUPER_ADMIN || (await this.permissions.can(u.role, alert.permission))) ids.push(u.id);
      }
      if (!ids.length) return;

      await this.prisma.appNotification.createMany({
        data: ids.map((userId) => ({ kind: PushRecipientKind.STAFF, userId, title: alert.title, body: alert.body, link: alert.link })),
      });
      const payload: StaffAlertPayload = {
        type: alert.type,
        title: alert.title,
        body: alert.body,
        link: alert.link,
        tag: alert.tag ?? `${alert.type.toLowerCase()}-${Date.now()}`,
      };
      this.gateway.alertUsers(ids, payload);
      await this.push.sendAlert(await this.push.subscriptionsFor(ids), payload);
    } catch (error) {
      this.logger.warn(`Staff alert ${alert.type} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async newOrder(orderId: string) {
    try {
      const o = await loadSummary(this.prisma, orderId);
      if (!o || o.source !== 'STOREFRONT') return;
      await this.notify({
        type: 'NEW_ORDER',
        title: `New ${o.channel === 'B2B' ? 'retailer ' : ''}order ${o.orderNumber}`,
        body: `${o.customerName} · ₹${o.total.toFixed(2)} · ${o.fulfillmentMethod ?? o.channel} · ${o.nodeName}`,
        link: `/${o.channel === 'B2B' ? 'b2b' : 'b2c'}-orders/${o.id}`,
        permission: 'orders.view',
        branchId: o.branchId,
        tag: `new_order-${o.id}`,
      });
    } catch (error) {
      this.logger.warn(`New-order alert ${orderId} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
