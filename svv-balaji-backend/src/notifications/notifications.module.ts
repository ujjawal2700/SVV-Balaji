import { Body, Controller, Get, Headers, Module, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PushApp, PushRecipientKind } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { CurrentRider, RiderJwtAuthGuard, type RiderJwtPayload } from '../delivery/riders/rider-auth';
import { CurrentCustomer } from '../storefront/decorators/current-customer.decorator';
import { CustomerJwtAuthGuard } from '../storefront/guards/customer-jwt-auth.guard';
import type { CustomerJwtPayload } from '../storefront/strategies/customer-jwt.strategy';
import { FcmService } from './fcm.service';
import {
  AudienceDto,
  MarkReadDto,
  RecipientKind,
  RegisterDeviceDto,
  SendBroadcastDto,
  UnregisterDeviceDto,
} from './notifications.dto';
import { NotificationsService } from './notifications.service';
import { CustomerOrderNotificationsService } from './customer-order-notifications.service';

/** Super Admin's Push Notifications screen. */
@ApiTags('push-notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('notifications/broadcasts')
export class BroadcastsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get()
  @RequirePermission('pushNotifications.view')
  @ApiOperation({ summary: 'Sent push notifications, newest first, with delivery counts' })
  history(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.svc.history(Number(page) || 1, Number(pageSize) || 20);
  }

  @Get('options')
  @RequirePermission('pushNotifications.view')
  @ApiOperation({ summary: 'Filter choices for the compose form (roles, branches, outlets, sales executives, cities)' })
  options() {
    return this.svc.options();
  }

  @Get('recipients')
  @RequirePermission('pushNotifications.send')
  @ApiOperation({ summary: 'Search people to send to (staff, customers, retailers, riders)' })
  @ApiQuery({ name: 'q', required: true })
  @ApiQuery({ name: 'kind', required: false, enum: RecipientKind })
  search(@Query('q') q = '', @Query('kind') kind?: RecipientKind) {
    return this.svc.searchRecipients(q, Object.values(RecipientKind).includes(kind as RecipientKind) ? kind : undefined);
  }

  @Post('preview')
  @RequirePermission('pushNotifications.send')
  @ApiOperation({ summary: 'How many people (and signed-in devices) an audience matches, without sending' })
  preview(@Body() audience: AudienceDto) {
    return this.svc.preview(audience);
  }

  @Post()
  @RequirePermission('pushNotifications.send')
  @ApiOperation({
    summary: 'Send now',
    description:
      'Everyone matched gets an in-app inbox entry. Those signed in on a device also get a system notification ' +
      '(delivered even when the app is closed). Signed-out devices never show one.',
  })
  send(@Body() dto: SendBroadcastDto, @CurrentUser() user: JwtPayload) {
    return this.svc.send(dto, user.sub);
  }
}

/** Every staff member's own devices and inbox - admin panel and field app. No permission: it is your own data. */
@ApiTags('push-notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications/me')
export class StaffInboxController {
  constructor(private readonly svc: NotificationsService) {}

  @Post('devices')
  @ApiOperation({ summary: 'Register this browser for push (call after sign-in)' })
  register(@Body() dto: RegisterDeviceDto, @CurrentUser() user: JwtPayload, @Headers('user-agent') ua?: string) {
    return this.svc.registerDevice({ kind: PushRecipientKind.STAFF, id: user.sub }, dto, ua);
  }

  @Get('inbox')
  inbox(@CurrentUser() user: JwtPayload) {
    return this.svc.inbox({ userId: user.sub });
  }

  @Patch('inbox/read')
  read(@Body() dto: MarkReadDto, @CurrentUser() user: JwtPayload) {
    return this.svc.markRead({ userId: user.sub }, dto.ids);
  }
}

/** Sign-out for every app. Unauthenticated on purpose - see NotificationsService.unregisterDevice. */
@ApiTags('push-notifications')
@Controller('notifications/devices')
export class DeviceController {
  constructor(private readonly svc: NotificationsService) {}

  @Post('unregister')
  @ApiOperation({ summary: 'Stop pushes to this device (call on sign-out, before clearing the session)' })
  unregister(@Body() dto: UnregisterDeviceDto) {
    return this.svc.unregisterDevice(dto.token);
  }
}

@ApiTags('storefront-notifications')
@ApiBearerAuth()
@UseGuards(CustomerJwtAuthGuard)
@Controller('storefront/notifications')
export class StorefrontInboxController {
  constructor(private readonly svc: NotificationsService) {}

  @Post('devices')
  @ApiOperation({ summary: 'Register this browser for push (call after sign-in)' })
  register(@Body() dto: RegisterDeviceDto, @CurrentCustomer() c: CustomerJwtPayload, @Headers('user-agent') ua?: string) {
    return this.svc.registerDevice({ kind: PushRecipientKind.CUSTOMER, id: c.sub, sessionId: c.sid }, { ...dto, app: PushApp.CUSTOMER }, ua);
  }

  @Get()
  inbox(@CurrentCustomer() c: CustomerJwtPayload) {
    return this.svc.inbox({ customerAccountId: c.sub });
  }

  @Patch('read')
  read(@Body() dto: MarkReadDto, @CurrentCustomer() c: CustomerJwtPayload) {
    return this.svc.markRead({ customerAccountId: c.sub }, dto.ids);
  }
}

/** Rider devices. The rider inbox itself is the existing GET /rider/notifications. */
@ApiTags('rider-app')
@ApiBearerAuth()
@UseGuards(RiderJwtAuthGuard)
@Controller('rider/push-devices')
export class RiderDeviceController {
  constructor(private readonly svc: NotificationsService) {}

  @Post()
  @ApiOperation({ summary: 'Register this phone for push (call after sign-in)' })
  register(@Body() dto: RegisterDeviceDto, @CurrentRider() r: RiderJwtPayload, @Headers('user-agent') ua?: string) {
    return this.svc.registerDevice({ kind: PushRecipientKind.RIDER, id: r.sub, sessionId: r.sid }, { ...dto, app: PushApp.RIDER }, ua);
  }
}

@Module({
  controllers: [BroadcastsController, StaffInboxController, DeviceController, StorefrontInboxController, RiderDeviceController],
  providers: [FcmService, NotificationsService, CustomerOrderNotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
