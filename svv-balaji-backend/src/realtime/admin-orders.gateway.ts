import { Logger, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { PermissionsService } from '../auth/permissions/permissions.service';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { OrderEventsService } from './order-events.service';
import { loadSummary, type OrderSummary } from './order-summary';
import { PushService } from './push.service';

const ALL_ROOM = 'orders:all';
const branchRoom = (branchId: string) => `branch:${branchId}`;
const userRoom = (userId: string) => `user:${userId}`;

/**
 * Live order feed for the Super Admin panel.
 *
 * Connect with `io('/admin', { auth: { token: <staff access token> } })`. The
 * token is verified and the user must hold `orders.view`; Super Admin joins the
 * all-orders room, anyone else only their own branch's room - the same boundary
 * the REST list enforces.
 *
 * Events: `orders:new` (a committed new order) and `orders:updated` (any status
 * change), each carrying the order summary. `order.id` is the dedup key.
 *
 * A socket is a convenience, never the source of truth: a client that was
 * offline catches up through `GET /orders-sync?since=` (see RealtimeController).
 */
@WebSocketGateway({ namespace: '/admin', cors: { origin: true, credentials: true } })
export class AdminOrdersGateway implements OnGatewayConnection, OnModuleInit {
  private readonly logger = new Logger(AdminOrdersGateway.name);

  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly permissions: PermissionsService,
    private readonly prisma: PrismaService,
    private readonly events: OrderEventsService,
    private readonly push: PushService,
  ) {}

  onModuleInit(): void {
    this.events.on('new', (id) => void this.broadcast('orders:new', id, true));
    this.events.on('updated', (id) => void this.broadcast('orders:updated', id, false));
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = (client.handshake.auth as { token?: string } | undefined)?.token;
      if (!token) throw new Error('no token');
      const user = await this.jwt.verifyAsync<JwtPayload>(token, { secret: process.env.JWT_ACCESS_SECRET });
      if (!(await this.permissions.can(user.role as never, 'orders.view'))) throw new Error('no orders.view');

      if (user.role === 'SUPER_ADMIN') await client.join(ALL_ROOM);
      else if (user.branchId) await client.join(branchRoom(user.branchId));
      else throw new Error('user has no branch');
      await client.join(userRoom(user.sub));
      client.emit('ready', { serverTime: new Date().toISOString() });
    } catch (error) {
      this.logger.debug(`Rejected socket ${client.id}: ${error instanceof Error ? error.message : String(error)}`);
      client.emit('unauthorized');
      client.disconnect(true);
    }
  }

  private async broadcast(event: 'orders:new' | 'orders:updated', orderId: string, alertOffline: boolean) {
    try {
      const summary = await loadSummary(this.prisma, orderId);
      if (!summary) return;
      let target = this.server.to(ALL_ROOM);
      if (summary.branchId) target = target.to(branchRoom(summary.branchId));
      target.emit(event, summary);
      if (alertOffline) await this.alertOfflineStaff(summary);
    } catch (error) {
      this.logger.warn(`Order broadcast failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Push to staff who should hear about this order but have no live socket. */
  private async alertOfflineStaff(order: OrderSummary): Promise<void> {
    if (!this.push.publicKey) return;
    const users = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        OR: [{ role: 'SUPER_ADMIN' }, ...(order.branchId ? [{ branchId: order.branchId }] : [])],
        pushSubscriptions: { some: {} },
      },
      select: { id: true, role: true },
    });

    const offline: string[] = [];
    for (const u of users) {
      if (u.role !== 'SUPER_ADMIN' && !(await this.permissions.can(u.role, 'orders.view'))) continue;
      const live = await this.server.in(userRoom(u.id)).fetchSockets();
      if (live.length === 0) offline.push(u.id);
    }
    if (offline.length === 0) return;
    await this.push.sendNewOrder(await this.push.subscriptionsFor(offline), order);
  }
}
