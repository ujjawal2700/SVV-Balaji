import { Body, Controller, Get, Module, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ReferralRewardTrigger } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReferralService } from '../common/referral.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

export class ReferralFaqItemDto {
  @ApiProperty()
  @IsString()
  question!: string;

  @ApiProperty()
  @IsString()
  answer!: string;
}

export class UpdateReferralSettingsDto {
  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  referrerRewardCoins?: number;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsInt()
  @Min(0)
  refereeRewardCoins?: number;

  @ApiPropertyOptional({ enum: ReferralRewardTrigger })
  @IsOptional()
  @IsEnum(ReferralRewardTrigger)
  rewardTrigger?: ReferralRewardTrigger;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: [ReferralFaqItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReferralFaqItemDto)
  customerFaqs?: ReferralFaqItemDto[];

  @ApiPropertyOptional({ type: [ReferralFaqItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReferralFaqItemDto)
  retailerFaqs?: ReferralFaqItemDto[];

  @ApiPropertyOptional({ description: 'Whether referral coins can be redeemed at checkout at all.' })
  @IsOptional()
  @IsBoolean()
  redemptionEnabled?: boolean;

  @ApiPropertyOptional({ example: 1, description: 'What one referral coin is worth, in INR.' })
  @IsOptional()
  @IsNumber()
  pointValueInr?: number;

  @ApiPropertyOptional({ example: 50, description: '% of an order\'s payable amount referral coins may cover.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxRedemptionPercent?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  minRedeemPoints?: number;

  @ApiPropertyOptional({ description: 'Months until an earned referral coin lapses; omit/null = never expires.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  pointsExpiryMonths?: number;
}

/**
 * The one screen behind this: Referral & Reward Settings. Reads and writes
 * are thin wrappers around ReferralService, which is where the actual
 * crediting logic (and the reasons REGISTRATION/ACCOUNT_VERIFICATION share a
 * trigger point) lives - this controller only exists because that service is
 * global and has no HTTP surface of its own.
 */
@ApiTags('referral-settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('referral-settings')
export class ReferralSettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly referrals: ReferralService,
  ) {}

  @Get()
  @RequirePermission('referralSettings.view')
  @ApiOperation({ summary: 'Current referral reward configuration' })
  get() {
    return this.referrals.getSettings(this.prisma);
  }

  @Patch()
  @RequirePermission('referralSettings.manage')
  @ApiOperation({
    summary: 'Update referral reward configuration',
    description:
      'Applies live to every referral going forward, including ones already created under a ' +
      'different trigger and not yet rewarded - see Referral.rewardedAt.',
  })
  update(@Body() dto: UpdateReferralSettingsDto, @CurrentUser() user: JwtPayload) {
    return this.referrals.updateSettings(this.prisma, dto, user.sub);
  }
}

@Module({
  controllers: [ReferralSettingsController],
})
export class ReferralSettingsModule {}
