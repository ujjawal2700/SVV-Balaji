import {
  Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, RawBodyRequest, Req, UnauthorizedException, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Matches, MinLength, IsString } from 'class-validator';
import type { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { Inject } from '@nestjs/common';
import { StripOrderSecretsInterceptor } from '../common/strip-order-secrets.interceptor';
import { CheckoutService } from './checkout.service';
import { CheckoutSettingsService, UpdateCheckoutSettingsDto } from './checkout-settings.service';
import { CouponsService, CreateCouponDto, UpdateCouponDto } from './coupons.service';
import { FulfillmentService } from './fulfillment.service';
import { PAYMENT_GATEWAY, type PaymentGateway } from './payment/payment-gateway';

class ScanDto {
  @ApiProperty({ example: 'FG-20260921-001' }) @IsString() @MinLength(6) code!: string;
}
class AssignRiderDto {
  @ApiProperty() @IsString() @MinLength(2) riderName!: string;
  @ApiProperty() @Matches(/^[6-9]\d{9}$/, { message: 'Enter a valid 10-digit mobile number' }) riderPhone!: string;
}
class VerifyOtpDto {
  @ApiProperty({ example: '4821' }) @Matches(/^\d{4,6}$/, { message: 'The OTP is 4-6 digits' }) otp!: string;
}

const tokenMatches = (given: string | undefined, expected: string | undefined) => {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

/** Super Admin: checkout & fulfilment rules. */
@ApiTags('checkout-settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('checkout-settings')
export class CheckoutSettingsController {
  constructor(private readonly settings: CheckoutSettingsService) {}

  @Get() @RequirePermission('checkoutSettings.view') get() { return this.settings.get(); }

  @Patch()
  @RequirePermission('checkoutSettings.manage')
  update(@Body() dto: UpdateCheckoutSettingsDto, @CurrentUser() user: JwtPayload) {
    return this.settings.update(dto, user.sub);
  }
}

@ApiTags('coupons')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('coupons')
export class CouponsAdminController {
  constructor(private readonly coupons: CouponsService) {}

  @Get() @RequirePermission('coupons.view') list() { return this.coupons.list(); }
  @Post() @RequirePermission('coupons.manage') create(@Body() dto: CreateCouponDto) { return this.coupons.create(dto); }
  @Patch(':id') @RequirePermission('coupons.manage') update(@Param('id') id: string, @Body() dto: UpdateCouponDto) { return this.coupons.update(id, dto); }
}

/** Staff actions on a placed order. Every one goes through SalesService.advance, which enforces the order of steps. */
@ApiTags('fulfillment')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(StripOrderSecretsInterceptor)
@Controller('orders')
export class FulfillmentController {
  constructor(private readonly fulfillment: FulfillmentService) {}

  @Post(':id/start-packing')
  @RequirePermission('orders.allocate')
  @ApiOperation({ summary: 'Confirm (if needed) and FIFO-allocate the oldest valid batches; returns the pick list' })
  start(@Param('id') id: string, @CurrentUser() user: JwtPayload) { return this.fulfillment.startPacking(id, user.sub); }

  @Get(':id/pick-plan')
  @RequirePermission('orders.view')
  plan(@Param('id') id: string) { return this.fulfillment.plan(id); }

  @Post(':id/scan')
  @HttpCode(200)
  @RequirePermission('orders.pack')
  @ApiOperation({ summary: 'Scan a batch label; only a batch allocated to this order is accepted. Last scan = PACKED.' })
  scan(@Param('id') id: string, @Body() dto: ScanDto, @CurrentUser() user: JwtPayload) { return this.fulfillment.scan(id, dto.code, user.sub); }

  @Post(':id/assign-rider')
  @RequirePermission('orders.dispatch')
  @ApiOperation({ summary: 'LOCAL: assign an in-house rider and send the order out for delivery' })
  rider(@Param('id') id: string, @Body() dto: AssignRiderDto, @CurrentUser() user: JwtPayload) {
    return this.fulfillment.assignRider(id, { name: dto.riderName, phone: dto.riderPhone }, user.sub);
  }

  @Post(':id/ship')
  @RequirePermission('orders.dispatch')
  @ApiOperation({ summary: 'SHIPROCKET: create the shipment (AWB, courier, label, tracking link) and dispatch' })
  ship(@Param('id') id: string, @CurrentUser() user: JwtPayload) { return this.fulfillment.ship(id, user.sub); }

  @Post(':id/verify-otp')
  @HttpCode(200)
  @RequirePermission('orders.deliver')
  @ApiOperation({ summary: "LOCAL: enter the customer's doorstep OTP to complete the delivery" })
  otp(@Param('id') id: string, @Body() dto: VerifyOtpDto, @CurrentUser() user: JwtPayload) { return this.fulfillment.verifyOtp(id, dto.otp, user.sub); }
}

/** Server-to-server callbacks. Unauthenticated by JWT; each is authenticated by its own secret. */
@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly fulfillment: FulfillmentService,
    private readonly checkout: CheckoutService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
  ) {}

  @Post('shiprocket')
  @HttpCode(200)
  @ApiOperation({ summary: 'Shiprocket tracking updates (header x-api-key = SHIPROCKET_WEBHOOK_TOKEN)' })
  async shiprocket(@Headers('x-api-key') key: string | undefined, @Body() body: Record<string, unknown>) {
    if (!tokenMatches(key, process.env.SHIPROCKET_WEBHOOK_TOKEN)) throw new UnauthorizedException('Bad webhook token');
    return this.fulfillment.handleShiprocketWebhook(body);
  }

  @Post('razorpay')
  @HttpCode(200)
  @ApiOperation({ summary: 'Razorpay payment.captured (verified by X-Razorpay-Signature over the raw body)' })
  async razorpay(@Req() req: RawBodyRequest<Request>, @Headers('x-razorpay-signature') signature: string | undefined) {
    const raw = req.rawBody?.toString('utf8') ?? '';
    if (!signature || !this.gateway.verifyWebhook(raw, signature)) throw new UnauthorizedException('Bad webhook signature');
    const event = JSON.parse(raw) as { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string } } } };
    const payment = event.payload?.payment?.entity;
    if (event.event === 'payment.captured' && payment?.order_id && payment.id) {
      return this.checkout.confirmFromWebhook(payment.order_id, payment.id);
    }
    return { ignored: true };
  }
}
