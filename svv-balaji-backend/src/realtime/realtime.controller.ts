import { Body, Controller, Delete, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { branchScopeFor } from '../common/branch-scope';
import { PrismaService } from '../prisma/prisma.service';
import { ORDER_SUMMARY_SELECT, toSummary } from './order-summary';
import { PushService } from './push.service';

class PushSubscribeDto {
  @ApiProperty() @IsString() @MinLength(10) endpoint!: string;
  @ApiProperty() @IsString() @MinLength(10) p256dh!: string;
  @ApiProperty() @IsString() @MinLength(5) auth!: string;
}

class PushUnsubscribeDto {
  @ApiProperty() @IsString() @MinLength(10) endpoint!: string;
}

@ApiTags('realtime')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class RealtimeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  /**
   * Reconciliation. A socket that dropped (or a dashboard that was closed)
   * calls this with the time of its last successful fetch and gets every order
   * created or changed since, oldest first. Overlap is fine - the client
   * dedups by `id`. `serverTime` is the value to pass next time; it is taken
   * BEFORE the query so an order committed mid-request is seen by the next call
   * rather than falling between them.
   */
  @Get('orders-sync')
  @RequirePermission('orders.view')
  @ApiOperation({ summary: 'Orders created or changed since a timestamp (reconnect catch-up)' })
  @ApiQuery({ name: 'since', required: true, description: 'ISO time of the last successful fetch' })
  async sync(@Query('since') since: string, @Query('limit') limit: string | undefined, @CurrentUser() user: JwtPayload) {
    const serverTime = new Date();
    const from = new Date(since);
    const cursor = Number.isNaN(from.getTime()) ? new Date(serverTime.getTime() - 24 * 3600_000) : from;
    const take = Math.min(Math.max(Number(limit) || 200, 1), 500);
    const branchId = branchScopeFor(user);

    const rows = await this.prisma.order.findMany({
      where: { updatedAt: { gt: cursor }, ...(branchId ? { branchId } : {}) },
      orderBy: { updatedAt: 'asc' },
      take,
      select: ORDER_SUMMARY_SELECT,
    });
    return {
      serverTime: serverTime.toISOString(),
      // More than `take` changed: the caller should page again from the last row's updatedAt.
      hasMore: rows.length === take,
      orders: rows.map(toSummary),
    };
  }

  @Get('notifications/push/key')
  @ApiOperation({ summary: 'VAPID public key for web push (null when push is not configured)' })
  key() {
    return { publicKey: this.push.publicKey };
  }

  @Post('notifications/push/subscribe')
  @RequirePermission('orders.view')
  @ApiOperation({ summary: 'Register this browser for new-order alerts' })
  async subscribe(@Body() dto: PushSubscribeDto, @CurrentUser() user: JwtPayload) {
    await this.push.subscribe(user.sub, dto);
    return { subscribed: true };
  }

  @Delete('notifications/push/subscribe')
  @RequirePermission('orders.view')
  async unsubscribe(@Body() dto: PushUnsubscribeDto, @CurrentUser() user: JwtPayload) {
    await this.push.unsubscribe(user.sub, dto.endpoint);
    return { subscribed: false };
  }
}
