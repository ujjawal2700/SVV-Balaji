import { Logger, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { PermissionsService } from '../auth/permissions/permissions.service';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { OrderEventsService } from './order-events.service';
import { loadSummary } from './order-summary';
import type { StaffAlertPayload } from './staff-alerts.service';

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
  ) {}

  onModuleInit(): void {
    // The new-order bell entry and browser push are StaffAlertsService's job.
    this.events.on('new', (id) => void this.broadcast('orders:new', id));
    this.events.on('updated', (id) => void this.broadcast('orders:updated', id));
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

  private async broadcast(event: 'orders:new' | 'orders:updated', orderId: string) {
    try {
      const summary = await loadSummary(this.prisma, orderId);
      if (!summary) return;
      let target = this.server.to(ALL_ROOM);
      if (summary.branchId) target = target.to(branchRoom(summary.branchId));
      target.emit(event, summary);
    } catch (error) {
      this.logger.warn(`Order broadcast failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** A staff alert (see StaffAlertsService) to these users' open dashboards. */
  alertUsers(userIds: string[], payload: StaffAlertPayload): void {
    try {
      if (userIds.length) this.server?.to(userIds.map(userRoom)).emit('alerts:new', payload);
    } catch (error) {
      this.logger.warn(`Alert broadcast failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Broadcast support ticket events to all connected admin dashboards in realtime. */
  broadcastTicket(event: 'tickets:new' | 'tickets:message' | 'tickets:updated' | 'tickets:resolved', payload: unknown): void {
    try {
      this.server?.emit(event, payload);
    } catch (error) {
      this.logger.warn(`Ticket broadcast failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
