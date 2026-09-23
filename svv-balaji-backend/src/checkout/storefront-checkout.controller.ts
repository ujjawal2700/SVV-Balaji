import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentCustomer } from '../storefront/decorators/current-customer.decorator';
import { CustomerJwtAuthGuard } from '../storefront/guards/customer-jwt-auth.guard';
import type { CustomerJwtPayload } from '../storefront/strategies/customer-jwt.strategy';
import { AddressesService, CreateAddressDto, UpdateAddressDto } from './addresses.service';
import { CheckoutService } from './checkout.service';
import { CouponsService } from './coupons.service';
import { CustomerContextService } from './customer-context.service';
import { CheckoutDto, ConfirmCheckoutDto } from './dto/checkout.dto';
import { StorefrontOrdersService } from './storefront-orders.service';

/**
 * Everything a signed-in shopper does to buy: addresses, quote, pay, track.
 * Every route is scoped to the customer behind the session - an id from the
 * client is only ever looked up "and belongs to me".
 */
@ApiTags('storefront-checkout')
@ApiBearerAuth()
@UseGuards(CustomerJwtAuthGuard)
@Controller('storefront')
export class StorefrontCheckoutController {
  constructor(
    private readonly ctx: CustomerContextService,
    private readonly addresses: AddressesService,
    private readonly checkout: CheckoutService,
    private readonly coupons: CouponsService,
    private readonly orders: StorefrontOrdersService,
  ) {}

  // --- addresses ---
  @Get('addresses')
  async listAddresses(@CurrentCustomer() s: CustomerJwtPayload) {
    return this.addresses.list((await this.ctx.forAccount(s.sub)).id);
  }

  @Post('addresses')
  async createAddress(@CurrentCustomer() s: CustomerJwtPayload, @Body() dto: CreateAddressDto) {
    return this.addresses.create((await this.ctx.forAccount(s.sub)).id, dto);
  }

  @Patch('addresses/:id')
  async updateAddress(@CurrentCustomer() s: CustomerJwtPayload, @Param('id') id: string, @Body() dto: UpdateAddressDto) {
    return this.addresses.update((await this.ctx.forAccount(s.sub)).id, id, dto);
  }

  @Delete('addresses/:id')
  async deleteAddress(@CurrentCustomer() s: CustomerJwtPayload, @Param('id') id: string) {
    return this.addresses.remove((await this.ctx.forAccount(s.sub)).id, id);
  }

  // --- checkout ---
  @Post('checkout/quote')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Price, route and validate a cart (takes no stock)',
    description:
      'The server decides the delivery method, the fulfilment node, the ETA, the fee, tax and every discount. ' +
      'Prices and totals in the request are ignored (there are no such fields).',
  })
  async quote(@CurrentCustomer() s: CustomerJwtPayload, @Body() dto: CheckoutDto) {
    return this.checkout.quote(await this.ctx.forAccount(s.sub), dto);
  }

  @Post('checkout/sessions')
  @ApiOperation({
    summary: 'Start a checkout: hold the stock (15 min) and open the payment',
    description:
      'Send an `Idempotency-Key` header on every attempt (one per checkout, reused only on retry). ' +
      'A retried or double-tapped request with the same key returns the session already opened for ' +
      'it instead of taking a second stock hold.',
  })
  async start(
    @CurrentCustomer() s: CustomerJwtPayload,
    @Body() dto: CheckoutDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.checkout.startSession(await this.ctx.forAccount(s.sub), dto, idempotencyKey);
  }

  @Post('checkout/sessions/:id/confirm')
  @HttpCode(200)
  @ApiOperation({ summary: 'Payment done (or COD/credit chosen): place the order. Idempotent.' })
  async confirm(@CurrentCustomer() s: CustomerJwtPayload, @Param('id') id: string, @Body() dto: ConfirmCheckoutDto) {
    return this.checkout.confirm(await this.ctx.forAccount(s.sub), id, dto);
  }

  @Post('checkout/sessions/:id/abort')
  @HttpCode(200)
  @ApiOperation({ summary: 'Payment failed or abandoned: release the held stock' })
  async abort(@CurrentCustomer() s: CustomerJwtPayload, @Param('id') id: string) {
    return this.checkout.abort((await this.ctx.forAccount(s.sub)).id, id);
  }

  @Get('coupons')
  @ApiOperation({ summary: 'Offers this shopper could use' })
  async availableCoupons(@CurrentCustomer() s: CustomerJwtPayload) {
    const customer = await this.ctx.forAccount(s.sub);
    const rows = await this.coupons.available(customer.channel);
    return rows.map((c) => ({
      code: c.code, title: c.title, description: c.description, type: c.type, value: Number(c.value),
      minOrderValue: Number(c.minOrderValue), maxDiscount: c.maxDiscount === null ? null : Number(c.maxDiscount), expiresAt: c.expiresAt,
    }));
  }

  // --- orders ---
  @Get('orders')
  async myOrders(@CurrentCustomer() s: CustomerJwtPayload) {
    return this.orders.list((await this.ctx.forAccount(s.sub)).id);
  }

  @Get('orders/:orderNumber')
  async myOrder(@CurrentCustomer() s: CustomerJwtPayload, @Param('orderNumber') orderNumber: string) {
    return this.orders.detail((await this.ctx.forAccount(s.sub)).id, orderNumber);
  }
}
