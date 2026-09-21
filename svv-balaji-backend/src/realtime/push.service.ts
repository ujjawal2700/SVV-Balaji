import { Injectable, Logger } from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import type { OrderSummary } from './order-summary';

/**
 * Web Push (VAPID) to staff browsers - the notification that still arrives when
 * the admin dashboard is closed or its socket is down. Chrome delivers these
 * through FCM under the hood; the standard protocol needs no Firebase project.
 *
 * Enabled by VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (generate once with
 * `npx web-push generate-vapid-keys`). Without them it stays off, quietly.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly enabled: boolean;

  constructor(private readonly prisma: PrismaService) {
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    this.enabled = Boolean(pub && priv);
    if (this.enabled) {
      webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:admin@svvbalaji.com', pub!, priv!);
    } else {
      this.logger.warn('Web push is off: set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY to enable order alerts when the dashboard is closed');
    }
  }

  get publicKey(): string | null {
    return this.enabled ? (process.env.VAPID_PUBLIC_KEY ?? null) : null;
  }

  async subscribe(userId: string, sub: { endpoint: string; p256dh: string; auth: string }) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: { userId, ...sub },
      update: { userId, p256dh: sub.p256dh, auth: sub.auth },
    });
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  }

  /** Users (with a subscription) to consider for an order alert. */
  subscriptionsFor(userIds: string[]) {
    return this.prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
  }

  async sendNewOrder(
    subs: Array<{ id: string; endpoint: string; p256dh: string; auth: string }>,
    order: OrderSummary,
  ): Promise<number> {
    if (!this.enabled || subs.length === 0) return 0;
    const payload = JSON.stringify({
      title: `New order ${order.orderNumber}`,
      body: `${order.customerName} · ₹${order.total.toFixed(2)} · ${order.fulfillmentMethod ?? order.channel} · ${order.nodeName}`,
      tag: order.id, // one notification per order, however many devices/retries
      url: '/b2c-orders',
      orderId: order.id,
    });
    let sent = 0;
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
        sent += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        // 404/410: the browser revoked it. Forget it rather than retry forever.
        if (status === 404 || status === 410) await this.prisma.pushSubscription.deleteMany({ where: { id: s.id } });
        else this.logger.warn(`Push failed (${status ?? 'network'}): ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return sent;
  }
}
