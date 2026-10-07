import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { CurrentCustomer } from '../storefront/decorators/current-customer.decorator';
import { CustomerJwtAuthGuard } from '../storefront/guards/customer-jwt-auth.guard';
import type { CustomerJwtPayload } from '../storefront/strategies/customer-jwt.strategy';
import { AffiliateSettingsService } from './affiliate-settings.service';
import { AffiliateTrackingCookie } from './affiliate-tracking.cookie';
import { AffiliatesService } from './affiliates.service';
import {
  ApplyAffiliateDto, CreatePayoutDto, ListAffiliatesQueryDto, ListAttributionsQueryDto, ListCommissionsQueryDto, ReasonDto,
  SetCategoryRatesDto, TrackClickDto, UpdateAffiliateSettingsDto, UpdateMyAffiliateDto,
} from './dto/affiliates.dto';

/** Public: the storefront calls this when someone lands on a page with ?aff=CODE. */
@ApiTags('storefront-affiliate')
@Controller('storefront/affiliate')
export class AffiliateTrackingController {
  constructor(
    private readonly affiliates: AffiliatesService,
    private readonly cookie: AffiliateTrackingCookie,
  ) {}

  @Get('program')
  @ApiOperation({ summary: 'Public affiliate landing page data: rules, commission % per category, headline stats' })
  program() {
    return this.affiliates.programInfo();
  }

  @Post('track')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Record an affiliate link visit and set the aff_tracker cookie',
    description:
      'Sets an HTTP-only, signed `aff_tracker` cookie for the program\'s cookie window (default 30 days). Last click wins: ' +
      'a visit through a different affiliate\'s link overwrites it. An unknown or inactive code sets nothing and returns tracked:false.',
  })
  async track(@Body() dto: TrackClickDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const click = await this.affiliates.trackClick(dto, { ip: req.ip, userAgent: req.headers['user-agent'] });
    if (!click) return { tracked: false };
    this.cookie.set(res, click.clickId, click.cookieDays);
    return { tracked: true, affiliateCode: click.affiliateCode, expiresInDays: click.cookieDays };
  }
}

/** The affiliate's own side: apply, dashboard, ledger, payouts. Any storefront login may apply. */
@ApiTags('storefront-affiliate')
@ApiBearerAuth()
@UseGuards(CustomerJwtAuthGuard)
@Controller('storefront/affiliate')
export class StorefrontAffiliateController {
  constructor(private readonly affiliates: AffiliatesService) {}

  @Get('me')
  @ApiOperation({ summary: 'My affiliate application / dashboard (clicks, successful orders, earnings)' })
  me(@CurrentCustomer() s: CustomerJwtPayload) {
    return this.affiliates.mine(s.sub);
  }

  @Post('apply')
  @ApiOperation({ summary: 'Apply to the affiliate program (or re-apply after a rejection)' })
  apply(@CurrentCustomer() s: CustomerJwtPayload, @Body() dto: ApplyAffiliateDto) {
    return this.affiliates.apply(s.sub, dto);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update my payout details / promotion link' })
  update(@CurrentCustomer() s: CustomerJwtPayload, @Body() dto: UpdateMyAffiliateDto) {
    return this.affiliates.updateMine(s.sub, dto);
  }

  @Get('commissions')
  @ApiOperation({ summary: 'My commission ledger, one row per order item' })
  commissions(@CurrentCustomer() s: CustomerJwtPayload, @Query() q: ListCommissionsQueryDto) {
    return this.affiliates.myCommissions(s.sub, q);
  }

  @Get('payouts')
  @ApiOperation({ summary: 'Payouts made to me' })
  payouts(@CurrentCustomer() s: CustomerJwtPayload) {
    return this.affiliates.myPayouts(s.sub);
  }
}

@ApiTags('affiliates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('affiliates')
export class AffiliatesAdminController {
  constructor(private readonly affiliates: AffiliatesService) {}

  // Static routes first - ':id' would otherwise swallow them.
  @Get('commissions')
  @RequirePermission('affiliates.view')
  @ApiOperation({ summary: 'Commission ledger across affiliates (filter by affiliate / status)' })
  commissions(@Query() q: ListCommissionsQueryDto) {
    return this.affiliates.commissions(q);
  }

  @Get('attributions')
  @RequirePermission('affiliates.view')
  @ApiOperation({ summary: 'Attributed orders; status=FRAUD is the self-referral log' })
  attributions(@Query() q: ListAttributionsQueryDto) {
    return this.affiliates.attributions(q);
  }

  @Get()
  @RequirePermission('affiliates.view')
  @ApiOperation({ summary: 'Affiliates and applications, with clicks, orders and balances' })
  list(@Query() q: ListAffiliatesQueryDto) {
    return this.affiliates.list(q);
  }

  @Get(':id')
  @RequirePermission('affiliates.view')
  detail(@Param('id') id: string) {
    return this.affiliates.detail(id);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermission('affiliates.review')
  approve(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.affiliates.approve(id, user.sub);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermission('affiliates.review')
  reject(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() user: JwtPayload) {
    return this.affiliates.reject(id, dto.reason, user.sub);
  }

  @Post(':id/suspend')
  @HttpCode(200)
  @RequirePermission('affiliates.review')
  @ApiOperation({ summary: 'Stop tracking and earning; commission already earned is still owed' })
  suspend(@Param('id') id: string, @Body() dto: ReasonDto) {
    return this.affiliates.suspend(id, dto.reason);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @RequirePermission('affiliates.review')
  reactivate(@Param('id') id: string) {
    return this.affiliates.reactivate(id);
  }
}

@ApiTags('affiliates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('affiliate-settings')
export class AffiliateSettingsController {
  constructor(private readonly settings: AffiliateSettingsService) {}

  @Get()
  @RequirePermission('affiliateSettings.view')
  get() {
    return this.settings.effective();
  }

  @Patch()
  @RequirePermission('affiliateSettings.manage')
  @ApiOperation({ summary: 'Program switch, cookie window, hold days, default rate, minimum payout' })
  update(@Body() dto: UpdateAffiliateSettingsDto, @CurrentUser() user: JwtPayload) {
    return this.settings.update(dto, user.sub);
  }

  @Get('category-rates')
  @RequirePermission('affiliateSettings.view')
  @ApiOperation({ summary: 'Commission % per category: own rate, effective rate and where it is inherited from' })
  categoryRates() {
    return this.settings.categoryMatrix();
  }

  @Put('category-rates')
  @RequirePermission('affiliateSettings.manage')
  @ApiOperation({ summary: 'Set or clear (null) category rates. Applies to orders placed from now on - never re-prices earned commission.' })
  setCategoryRates(@Body() dto: SetCategoryRatesDto, @CurrentUser() user: JwtPayload) {
    return this.settings.setCategoryRates(dto, user.sub);
  }
}

@ApiTags('affiliates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('affiliate-payouts')
export class AffiliatePayoutsController {
  constructor(private readonly affiliates: AffiliatesService) {}

  @Get('due')
  @RequirePermission('affiliatePayouts.view')
  @ApiOperation({ summary: 'Affiliates owed matured commission (past the hold window), net of clawbacks' })
  due() {
    return this.affiliates.payoutsDue();
  }

  @Get()
  @RequirePermission('affiliatePayouts.view')
  history(@Query('affiliateId') affiliateId?: string) {
    return this.affiliates.payoutHistory(affiliateId || undefined);
  }

  @Post()
  @RequirePermission('affiliatePayouts.pay')
  @ApiOperation({ summary: 'Record a manual payout (UPI / bank transfer made outside the system) - settles every matured commission' })
  pay(@Body() dto: CreatePayoutDto, @CurrentUser() user: JwtPayload) {
    return this.affiliates.pay(dto, user.sub);
  }
}
