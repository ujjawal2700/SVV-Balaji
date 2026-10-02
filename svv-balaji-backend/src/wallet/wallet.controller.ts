import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
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
import { AdjustRefundWalletDto, UpdateWalletSettingsDto } from './dto/wallet.dto';
import { RefundWalletService } from './refund-wallet.service';
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
    private readonly refundWallet: RefundWalletService,
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

  @Get('customers/:customerId/refund-wallet')
  @RequirePermission('wallet.view')
  @ApiOperation({ summary: "A customer's rupee Refund Wallet: balance and ledger" })
  async refundLedger(@Param('customerId') customerId: string) {
    return { balance: await this.refundWallet.balance(customerId), transactions: await this.refundWallet.ledger(customerId) };
  }

  @Post('customers/:customerId/refund-wallet/adjust')
  @RequirePermission('refundWallet.adjust')
  @ApiOperation({ summary: 'Super Admin correction to a Refund Wallet (signed amount, note required)' })
  adjustRefund(@Param('customerId') customerId: string, @Body() dto: AdjustRefundWalletDto, @CurrentUser() user: JwtPayload) {
    return this.refundWallet.adjust(customerId, dto.amount, dto.note, user.sub);
  }
}

/** Customer side: one combined balance view across both coin pools. */
@ApiTags('storefront-wallet')
@Controller('storefront/wallet')
export class StorefrontWalletController {
  constructor(
    private readonly wallet: WalletService,
    private readonly prisma: PrismaService,
    private readonly refundWallet: RefundWalletService,
  ) {}

  @Get('refund')
  @ApiBearerAuth()
  @UseGuards(CustomerJwtAuthGuard)
  @ApiOperation({ summary: 'My rupee Refund Wallet: balance and recent transactions' })
  async refund(@CurrentCustomer() session: CustomerJwtPayload) {
    const account = await this.prisma.customerAccount.findUnique({ where: { id: session.sub }, select: { customerId: true } });
    if (!account?.customerId) return { balance: 0, transactions: [] };
    return { balance: await this.refundWallet.balance(account.customerId), transactions: await this.refundWallet.ledger(account.customerId, 50) };
  }

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
      return { referralBalance: 0, loyaltyBalance: 0, totalBalance: 0, refundWalletBalance: 0 };
    }
    return this.wallet.getBalance(account.customerId);
  }
}
