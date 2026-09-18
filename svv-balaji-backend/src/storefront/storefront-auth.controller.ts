import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SalesChannel } from '@prisma/client';
import { StorefrontAuthService } from './storefront-auth.service';
import {
  ListAccountsQueryDto,
  RegisterRetailerDto,
  RejectAccountDto,
  RequestOtpDto,
  StorefrontRefreshDto,
  UpdateStorefrontProfileDto,
  VerifyOtpDto,
} from './dto/storefront-auth.dto';
import { CustomerJwtAuthGuard } from './guards/customer-jwt-auth.guard';
import { CurrentCustomer } from './decorators/current-customer.decorator';
import type { CustomerJwtPayload } from './strategies/customer-jwt.strategy';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('storefront-auth')
@Controller('storefront/auth')
export class StorefrontAuthController {
  constructor(private readonly service: StorefrontAuthService) {}

  @Get('referral/check')
  @ApiOperation({
    summary: 'Validate a referral code before submitting it',
    description:
      'Public - used for live feedback on the signup form (exists, active, not your own code) ' +
      'before the applicant commits to it. Creates nothing.',
  })
  checkReferralCode(@Query('code') code: string, @Query('phone') phone: string) {
    return this.service.checkReferralCode(code, phone);
  }

  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request a login/registration code',
    description:
      'Works for both an existing account and a brand new number. In mock mode (no SMS ' +
      'provider configured yet) the response includes devCode.',
  })
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.service.requestOtp(dto.phone);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify the code and sign in',
    description:
      'An unknown number self-provisions as a B2C consumer. A known number signs in as ' +
      'whatever channel it already is - the caller does not choose.',
  })
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.service.verifyOtp(dto);
  }

  @Post('register-retailer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Register as a B2B retailer',
    description:
      'Requires an OTP already requested for this number. Creates a PENDING_APPROVAL account, ' +
      'not a session - staff review the GSTIN before it can sign in and order.',
  })
  registerRetailer(@Body() dto: RegisterRetailerDto & { code: string }) {
    return this.service.registerRetailer(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: StorefrontRefreshDto) {
    return this.service.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(CustomerJwtAuthGuard)
  logout(@CurrentCustomer() customer: CustomerJwtPayload) {
    return this.service.logout(customer.sub);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(CustomerJwtAuthGuard)
  me(@CurrentCustomer() customer: CustomerJwtPayload) {
    return this.service.me(customer.sub);
  }

  @Patch('profile')
  @ApiBearerAuth()
  @UseGuards(CustomerJwtAuthGuard)
  updateProfile(@CurrentCustomer() customer: CustomerJwtPayload, @Body() dto: UpdateStorefrontProfileDto) {
    return this.service.updateProfile(customer.sub, dto);
  }
}

/**
 * The staff-side review queue for retailer signups. Separate controller
 * because it sits behind the staff guard, not the customer one.
 */
@ApiTags('storefront-accounts')
@ApiBearerAuth()
@Controller('storefront/accounts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StorefrontAccountsController {
  constructor(private readonly service: StorefrontAuthService) {}

  @Get()
  @RequirePermission('customerAccounts.view')
  @ApiOperation({ summary: 'List storefront accounts', description: 'Both channels, including the pending-approval queue.' })
  list(@Query() query: ListAccountsQueryDto) {
    return this.service.listAccounts({ channel: query.channel as SalesChannel | undefined, search: query.search });
  }

  @Patch(':id/approve')
  @RequirePermission('customerAccounts.review')
  @ApiOperation({ summary: 'Approve a retailer registration', description: 'Creates the Customer record it will order against.' })
  approve(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.approveAccount(id, user.sub);
  }

  @Patch(':id/reject')
  @RequirePermission('customerAccounts.review')
  @ApiOperation({ summary: 'Reject a retailer registration' })
  reject(@Param('id') id: string, @CurrentUser() user: JwtPayload, @Body() dto: RejectAccountDto) {
    return this.service.rejectAccount(id, user.sub, dto);
  }
}
