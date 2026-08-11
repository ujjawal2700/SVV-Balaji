import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CustomerType, SalesChannel } from '@prisma/client';

export class CreatePriceListDto {
  @ApiProperty()
  @IsString()
  productId: string;

  @ApiProperty({ enum: SalesChannel })
  @IsEnum(SalesChannel)
  channel: SalesChannel;

  @ApiPropertyOptional({
    enum: CustomerType,
    description:
      'Narrows the rule to one customer type within the channel - e.g. a keener distributor ' +
      'rate. Omit for a rate that applies to the whole channel.',
  })
  @IsOptional()
  @IsEnum(CustomerType)
  customerType?: CustomerType;

  @ApiProperty({ description: 'Price per pack, exclusive of GST' })
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @ApiPropertyOptional({ default: 5, description: 'GST percentage applied to this line' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  gstRatePercent?: number;

  @ApiPropertyOptional({ default: 1, description: 'Quantity break - this rate applies from here up' })
  @IsOptional()
  @IsInt()
  @Min(1)
  minQuantity?: number;

  @ApiProperty()
  @IsDateString()
  effectiveFrom: string;

  @ApiPropertyOptional({ description: 'Leave open-ended unless the rate is known to expire' })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @ApiPropertyOptional({ default: 'INR' })
  @IsOptional()
  @IsString()
  currency?: string;
}

export class SupersedePriceDto {
  @ApiProperty({ description: 'The new rate that replaces this one' })
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @ApiProperty({ description: 'When the new rate takes effect. The old rate is closed the instant before.' })
  @IsDateString()
  effectiveFrom: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  gstRatePercent?: number;
}

export class SetPriceListActiveDto {
  @ApiProperty()
  @IsBoolean()
  isActive: boolean;
}
