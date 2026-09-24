import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerJwtAuthGuard } from '../storefront/guards/customer-jwt-auth.guard';
import { CurrentCustomer } from '../storefront/decorators/current-customer.decorator';
import type { CustomerJwtPayload } from '../storefront/strategies/customer-jwt.strategy';
import { UpdateWalletSettingsDto } from './dto/wallet.dto';
import { WalletService } from './wallet.service';

/** Staff side: configure whether the two coin pools redeem separately or together. */
@ApiTags('wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('wallet')
export class WalletAdminController {
  constructor(
    private readonly wallet: WalletService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('settings')
  @RequirePermission('wallet.view')
  @ApiOperation({ summary: 'Current wallet redemption mode (separate vs combined)' })
  getSettings() {
    return this.wallet.getSettings();
  }

  @Patch('settings')
  @RequirePermission('wallet.manage')
  @ApiOperation({ summary: 'Set whether referral and loyalty coins redeem separately or as one combined balance' })
  updateSettings(@Body() dto: UpdateWalletSettingsDto, @CurrentUser() user: JwtPayload) {
    return this.wallet.updateSettings(dto, user.sub);
  }

  @Get('customers/:customerId')
  @RequirePermission('wallet.view')
  @ApiOperation({ summary: "A customer's combined wallet balance - referral coins, loyalty coins and the total" })
  balance(@Param('customerId') customerId: string) {
    return this.wallet.getBalance(customerId);
  }
}

/** Customer side: one combined balance view across both coin pools. */
@ApiTags('storefront-wallet')
@Controller('storefront/wallet')
export class StorefrontWalletController {
  constructor(
    private readonly wallet: WalletService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(CustomerJwtAuthGuard)
  @ApiOperation({ summary: 'My combined wallet balance - referral coins, loyalty coins, and the total' })
  async mine(@CurrentCustomer() session: CustomerJwtPayload) {
    const account = await this.prisma.customerAccount.findUnique({
      where: { id: session.sub },
      select: { customerId: true },
    });
    if (!account?.customerId) {
      return { referralBalance: 0, loyaltyBalance: 0, totalBalance: 0 };
    }
    return this.wallet.getBalance(account.customerId);
  }
}
