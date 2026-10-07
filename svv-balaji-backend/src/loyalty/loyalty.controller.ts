import { BadRequestException, Body, Controller, Get, Header, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CoinSource, CoinTransactionReason, LoyaltyEligibility } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerJwtAuthGuard } from '../storefront/guards/customer-jwt-auth.guard';
import { CurrentCustomer } from '../storefront/decorators/current-customer.decorator';
import type { CustomerJwtPayload } from '../storefront/strategies/customer-jwt.strategy';
import { SalesChannel } from '@prisma/client';
import { EstimateLoyaltyDto, UpdateLoyaltySettingsDto } from './dto/loyalty.dto';
import { LoyaltyService } from './loyalty.service';

import { CoinLedgerService, type CoinLedgerFilters } from './coin-ledger.service';
/** Staff side: configure the program and audit what it did. */
@ApiTags('loyalty')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('loyalty')
export class LoyaltyAdminController {
  constructor(
    private readonly service: LoyaltyService,
    private readonly ledger: CoinLedgerService,
  ) {}

  /** Query string -> validated ledger filters (bad values are a 400, not silently ignored). */
  private ledgerFilters(q: Record<string, string | undefined>): CoinLedgerFilters {
    const pick = <T extends string>(v: string | undefined, allowed: readonly T[], name: string): T | undefined => {
      if (!v) return undefined;
      if (!(allowed as readonly string[]).includes(v)) throw new BadRequestException(`Unknown ${name} "${v}"`);
      return v as T;
    };
    return {
      reason: pick(q.reason, Object.values(CoinTransactionReason), 'reason'),
      source: pick(q.source, Object.values(CoinSource), 'source'),
      channel: pick(q.channel, Object.values(SalesChannel), 'channel'),
      from: q.from || undefined,
      to: q.to || undefined,
      search: q.search || undefined,
      customerId: q.customerId || undefined,
    };
  }

  @Get('ledger')
  @RequirePermission('loyalty.view')
  @ApiOperation({
    summary: 'Every coin / point movement across all customers, newest first, with totals',
    description:
      'Filters: reason, source (LOYALTY | REFERRAL), channel (B2B | B2C), from / to (YYYY-MM-DD, IST, inclusive), search ' +
      '(customer name, code, phone or order number), customerId. Paged with page / limit (max 100). `summary` totals use ' +
      'the same filters except reason; `outstanding` is the current balance held by customers of the channel.',
  })
  coinLedger(@Query() q: Record<string, string | undefined>) {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 50));
    return this.ledger.list(this.ledgerFilters(q), page, limit);
  }

  @Get('ledger/export')
  @RequirePermission('loyalty.view')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="coin-ledger.csv"')
  @ApiOperation({ summary: 'The coin ledger for the same filters as CSV (up to 20,000 rows)' })
  coinLedgerCsv(@Query() q: Record<string, string | undefined>) {
    return this.ledger.csv(this.ledgerFilters(q));
  }

  @Get('settings')
  @RequirePermission('loyalty.view')
  @ApiOperation({ summary: 'Current loyalty program configuration' })
  getSettings() {
    return this.service.getSettings();
  }

  @Patch('settings')
  @RequirePermission('loyalty.manage')
  @ApiOperation({
    summary: 'Update the loyalty program',
    description:
      'Applies to orders delivered from now on. What each past order earned is frozen on its own ' +
      'earn record and never restated.',
  })
  updateSettings(@Body() dto: UpdateLoyaltySettingsDto, @CurrentUser() user: JwtPayload) {
    return this.service.updateSettings(dto, user.sub);
  }

  @Get('eligibility')
  @RequirePermission('loyalty.view')
  @ApiOperation({ summary: 'Would a product with this setting, in this category, earn? (for the product form)' })
  @ApiQuery({ name: 'productEligibility', enum: LoyaltyEligibility, required: false })
  @ApiQuery({ name: 'categoryId', required: false })
  eligibility(
    @Query('productEligibility') productEligibility: LoyaltyEligibility = LoyaltyEligibility.INHERIT,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.service.previewEligibility(productEligibility, categoryId || undefined);
  }

  @Get('orders/:orderNumber')
  @RequirePermission('loyalty.view')
  @ApiOperation({ summary: 'What an order earned, line by line, plus returns and ledger rows' })
  order(@Param('orderNumber') orderNumber: string) {
    return this.service.orderBreakdown(orderNumber);
  }

  @Post('housekeeping')
  @RequirePermission('loyalty.manage')
  @ApiOperation({ summary: 'Run the catch-up sweep and expiry now (they also run hourly)' })
  housekeeping() {
    return this.service.housekeeping();
  }
}

/** Customer side: balance, history and what a basket would earn. */
@ApiTags('storefront-loyalty')
@Controller('storefront/loyalty')
export class StorefrontLoyaltyController {
  constructor(
    private readonly service: LoyaltyService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(CustomerJwtAuthGuard)
  @ApiOperation({ summary: 'My points balance, value, expiry and history' })
  async mine(@CurrentCustomer() session: CustomerJwtPayload) {
    const account = await this.prisma.customerAccount.findUnique({
      where: { id: session.sub },
      select: { customerId: true, customer: { select: { channel: true } } },
    });
    if (!account?.customerId || !account.customer) {
      // A retailer still awaiting approval has no commercial record, so no balance.
      return {
        enabled: false,
        balance: 0,
        balanceValueInr: 0,
        lifetimeEarned: 0,
        program: null,
        expiringSoon: null,
        history: [],
      };
    }
    return this.service.summaryForCustomer(account.customerId, account.customer.channel);
  }

  /** Public: the rates are not secret, and a guest browsing a product page should see them. */
  @Post('estimate')
  @ApiOperation({
    summary: 'Points a basket would earn right now',
    description: 'Priced with the same engine as order placement; pass channel=B2B for a retailer.',
  })
  estimate(@Body() dto: EstimateLoyaltyDto) {
    return this.service.estimate(dto.lines, dto.channel ?? SalesChannel.B2C, dto.customerType);
  }
}
