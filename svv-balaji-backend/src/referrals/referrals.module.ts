import { Body, Controller, Get, Module, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, NotEquals } from 'class-validator';
import { CoinSource, SalesChannel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReferralService } from '../common/referral.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

export class AdjustCoinBalanceDto {
  @ApiProperty({
    example: -50,
    description: 'Positive refunds or bonuses the balance; negative claws it back. Never zero.',
  })
  @IsInt()
  @NotEquals(0)
  amount: number;

  @ApiProperty({ example: 'Reversed - the qualifying order was later cancelled as fraudulent' })
  @IsString()
  @IsNotEmpty()
  note: string;

  @ApiPropertyOptional({
    enum: CoinSource,
    default: CoinSource.LOYALTY,
    description: 'Which wallet pool this correction applies to - defaults to LOYALTY for historical callers.',
  })
  @IsOptional()
  @IsEnum(CoinSource)
  source?: CoinSource;
}

/**
 * Super Admin reporting over the refer-a-friend program: who referred whom,
 * whether it qualified, what each side earned, and the full coin ledger
 * (including manual corrections) behind any customer's current balance.
 *
 * Deliberately separate from ReferralSettingsModule - that one configures the
 * program, this one reports on and corrects what actually happened. Both are
 * thin controllers over the same global ReferralService.
 */
@ApiTags('referrals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('referrals')
export class ReferralsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly referrals: ReferralService,
  ) {}

  @Get()
  @RequirePermission('referrals.view')
  @ApiOperation({
    summary: 'Every referral relationship, most recent first',
    description:
      '`search` matches a referrer or referee by name, phone, referral code or customer code - ' +
      'whichever side is being looked up is not known in advance.',
  })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['QUALIFIED', 'PENDING'] })
  @ApiQuery({ name: 'channel', required: false, enum: SalesChannel })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date - referral created on/after' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date - referral created on/before' })
  list(
    @Query('search') search?: string,
    @Query('status') status?: 'QUALIFIED' | 'PENDING',
    @Query('channel') channel?: SalesChannel,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.referrals.listReferrals(this.prisma, {
      search,
      status,
      channel,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  @Get('ledger/:customerId')
  @RequirePermission('referrals.view')
  @ApiOperation({
    summary: "A customer's complete coin history",
    description:
      'Every reward earned as a referrer, the one reward earned as a referee, and every manual ' +
      'adjustment - newest first, with the qualifying order or the staff member behind each row.',
  })
  ledger(@Param('customerId') customerId: string) {
    return this.referrals.getCoinLedger(this.prisma, customerId);
  }

  @Post('ledger/:customerId/adjust')
  @RequirePermission('referrals.adjust')
  @ApiOperation({
    summary: 'Manually correct a customer\'s coin balance',
    description:
      'A refund, reversal or other correction - never automatic. Refused if it would take the ' +
      'balance below zero, or without a reason.',
  })
  adjust(
    @Param('customerId') customerId: string,
    @Body() dto: AdjustCoinBalanceDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.referrals.adjustBalance(this.prisma, customerId, dto, user.sub);
  }
}

@Module({
  controllers: [ReferralsController],
})
export class ReferralsModule {}
