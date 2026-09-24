import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { WalletRedemptionMode } from '@prisma/client';

export class UpdateWalletSettingsDto {
  @ApiPropertyOptional({
    enum: WalletRedemptionMode,
    description:
      'SEPARATE: referral and loyalty coins are redeemed independently, each against its own cap. ' +
      'COMBINED: the two balances are pooled into one number and one (stricter) cap at checkout.',
  })
  @IsOptional()
  @IsEnum(WalletRedemptionMode)
  redemptionMode?: WalletRedemptionMode;
}
