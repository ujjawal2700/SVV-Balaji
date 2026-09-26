import { BadRequestException, Injectable } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CheckoutSettings, CreditPeriodStart } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';

const money = (label: string) => ({ each: false, message: `${label} must be 0 or more` });

export class UpdateCheckoutSettingsDto {
  @ApiPropertyOptional({ description: 'Km an outlet delivers when it has no radius of its own.' })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.5) @Max(100)
  localRadiusKm?: number;

  @ApiPropertyOptional({ nullable: true, description: 'The central depot. null = first active CENTRAL warehouse.' })
  @IsOptional() @IsString()
  centralWarehouseId?: string | null;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0, money('Local fee')) localBaseFee?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) localFreeAbove?: number | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) shipBaseFee?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) shipFreeAbove?: number | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) b2bBaseFee?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) b2bFreeAbove?: number | null;

  @IsOptional() @IsInt() @Min(0) @Max(600) prepMinutes?: number;
  @IsOptional() @IsInt() @Min(0) @Max(60) minutesPerKm?: number;
  @IsOptional() @IsInt() @Min(0) @Max(60) shipMinDays?: number;
  @IsOptional() @IsInt() @Min(0) @Max(60) shipMaxDays?: number;

  @IsOptional() @IsBoolean() codEnabled?: boolean;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) codMaxAmount?: number | null;

  @ApiPropertyOptional({ description: 'Minutes stock is held while the customer pays.' })
  @IsOptional() @IsInt() @Min(1) @Max(120)
  reservationTtlMinutes?: number;

  @IsOptional() @IsInt() @Min(4) @Max(6)
  deliveryOtpDigits?: number;

  @ApiPropertyOptional({
    enum: CreditPeriodStart,
    description: 'B2B credit: the day "Net N days" counts from. DISPATCH (default, recommended) or ORDER_DATE.',
  })
  @IsOptional() @IsEnum(CreditPeriodStart)
  creditPeriodStart?: CreditPeriodStart;
}

export interface EffectiveCheckoutSettings {
  localRadiusKm: number;
  centralWarehouseId: string | null;
  fees: {
    localBaseFee: number; localFreeAbove: number | null;
    shipBaseFee: number; shipFreeAbove: number | null;
    b2bBaseFee: number; b2bFreeAbove: number | null;
  };
  eta: { prepMinutes: number; minutesPerKm: number; shipMinDays: number; shipMaxDays: number };
  codEnabled: boolean;
  codMaxAmount: number | null;
  reservationTtlMinutes: number;
  deliveryOtpDigits: number;
}

const num = (d: unknown) => (d === null || d === undefined ? null : Number(d));

/** Single-row config, lazily created (same pattern as LoyaltySettings). */
@Injectable()
export class CheckoutSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<CheckoutSettings> {
    const row = await this.prisma.checkoutSettings.findFirst({ orderBy: { createdAt: 'asc' } });
    return row ?? this.prisma.checkoutSettings.create({ data: {} });
  }

  async update(dto: UpdateCheckoutSettingsDto, userId: string): Promise<CheckoutSettings> {
    const current = await this.get();
    const min = dto.shipMinDays ?? current.shipMinDays;
    const max = dto.shipMaxDays ?? current.shipMaxDays;
    if (min > max) throw new BadRequestException('Minimum shipping days cannot exceed the maximum');

    if (dto.centralWarehouseId) {
      const w = await this.prisma.warehouse.findUnique({ where: { id: dto.centralWarehouseId } });
      if (!w || !w.isActive) throw new BadRequestException('The central warehouse must be an active warehouse');
    }
    return this.prisma.checkoutSettings.update({ where: { id: current.id }, data: { ...dto, updatedById: userId } });
  }

  async effective(): Promise<EffectiveCheckoutSettings> {
    const s = await this.get();
    return {
      localRadiusKm: Number(s.localRadiusKm),
      centralWarehouseId: s.centralWarehouseId,
      fees: {
        localBaseFee: Number(s.localBaseFee), localFreeAbove: num(s.localFreeAbove),
        shipBaseFee: Number(s.shipBaseFee), shipFreeAbove: num(s.shipFreeAbove),
        b2bBaseFee: Number(s.b2bBaseFee), b2bFreeAbove: num(s.b2bFreeAbove),
      },
      eta: { prepMinutes: s.prepMinutes, minutesPerKm: s.minutesPerKm, shipMinDays: s.shipMinDays, shipMaxDays: s.shipMaxDays },
      codEnabled: s.codEnabled,
      codMaxAmount: num(s.codMaxAmount),
      reservationTtlMinutes: s.reservationTtlMinutes,
      deliveryOtpDigits: s.deliveryOtpDigits,
    };
  }
}
