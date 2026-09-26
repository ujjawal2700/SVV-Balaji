import { Logger, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConnectedSocket, MessageBody, OnGatewayConnection, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { DeliveryEventsService } from './core/delivery-core';
import { riderAccessSecret, type RiderJwtPayload } from './riders/rider-auth';

const room = (riderId: string) => `rider:${riderId}`;

/**
 * Live channel for the rider app (namespace /rider). Rider token in
 * `auth.token`; a rider joins only their own room, so they only ever hear
 * about their own offers and tasks. The app should also re-fetch on
 * reconnect - events are nudges, the REST API is the source of truth.
 */
@WebSocketGateway({ namespace: '/rider', cors: { origin: true, credentials: true } })
export class RiderGateway implements OnGatewayConnection, OnModuleInit {
  private readonly logger = new Logger(RiderGateway.name);
  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly events: DeliveryEventsService,
  ) {}

  onModuleInit() {
    this.events.on((e) => {
      if (!this.server) return;
      if (e.kind === 'offer:new') this.server.to(room(e.riderId)).emit('offer:new', { offerId: e.offerId, taskId: e.taskId });
      else if (e.kind === 'offer:closed') this.server.to(room(e.riderId)).emit('offer:closed', { offerId: e.offerId, taskId: e.taskId, status: e.status });
      else if (e.kind === 'task:updated' && e.riderId) this.server.to(room(e.riderId)).emit('task:updated', { taskId: e.taskId, status: e.status });
      else if (e.kind === 'notification') this.server.to(room(e.riderId)).emit('notification', { id: e.notificationId });
    });
  }

  async handleConnection(client: Socket) {
    try {
      const token = (client.handshake.auth as { token?: string } | undefined)?.token;
      if (!token) throw new Error('no token');
      const p = await this.jwt.verifyAsync<RiderJwtPayload>(token, { secret: riderAccessSecret() });
      if (p.typ !== 'rider') throw new Error('not a rider token');
      const s = await this.prisma.riderSession.findUnique({ where: { id: p.sid }, select: { riderId: true, revokedAt: true, expiresAt: true } });
      if (!s || s.riderId !== p.sub || s.revokedAt || s.expiresAt <= new Date()) throw new Error('session ended');
      client.data.riderId = p.sub;
      await client.join(room(p.sub));
      client.emit('ready', { serverTime: new Date().toISOString() });
    } catch (e) {
      this.logger.debug(`Rejected rider socket ${client.id}: ${e instanceof Error ? e.message : String(e)}`);
      client.emit('unauthorized');
      client.disconnect(true);
    }
  }

  /** Location heartbeat while the app is open (cheaper than a REST call every few seconds). */
  @SubscribeMessage('location')
  async location(@ConnectedSocket() client: Socket, @MessageBody() body: { latitude?: number; longitude?: number }) {
    const riderId = client.data.riderId as string | undefined;
    if (!riderId || typeof body?.latitude !== 'number' || typeof body?.longitude !== 'number') return;
    if (Math.abs(body.latitude) > 90 || Math.abs(body.longitude) > 180) return;
    await this.prisma.rider.update({ where: { id: riderId }, data: { lastLatitude: body.latitude, lastLongitude: body.longitude, lastLocationAt: new Date() } });
  }
}
