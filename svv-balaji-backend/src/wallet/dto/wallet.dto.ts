import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
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

export class AdjustRefundWalletDto {
  @ApiProperty({ description: 'Rupees. Positive credits, negative debits.', example: 150 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  amount!: number;

  @ApiProperty({ description: 'Why - required, shown in the ledger.' })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  note!: string;
}
