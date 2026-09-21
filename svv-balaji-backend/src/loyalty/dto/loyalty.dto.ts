import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CustomerType, LoyaltyCalculationBase, SalesChannel } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class UpdateLoyaltySettingsDto {
  @ApiPropertyOptional({ description: 'Master switch for earning.' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 2, description: 'Percent of the eligible amount earned as rewards, B2C. 0 = off.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  earnPercentB2C?: number;

  @ApiPropertyOptional({ example: 1, description: 'Percent of the eligible amount earned as rewards, B2B. 0 = off.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  earnPercentB2B?: number;

  @ApiPropertyOptional({ example: 1, description: 'Rupees one point is worth. 1 = 1 point is Rs 1; 0.25 = 4 points per rupee.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  pointValueInr?: number;

  @ApiPropertyOptional({ enum: LoyaltyCalculationBase })
  @IsOptional()
  @IsEnum(LoyaltyCalculationBase)
  calculationBase?: LoyaltyCalculationBase;

  @ApiPropertyOptional({ description: 'Whether a product with no product/category rule earns.' })
  @IsOptional()
  @IsBoolean()
  defaultEligible?: boolean;

  @ApiPropertyOptional({ description: 'Lines sold below MRP (incl. GST) earn only when true.' })
  @IsOptional()
  @IsBoolean()
  appliesToDiscountedProducts?: boolean;

  @ApiPropertyOptional({ nullable: true, description: 'Minimum eligible value of a single line. null = none.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minEligibleItemAmount?: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'Minimum eligible total for an order to earn. null = none.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minEligibleOrderAmount?: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'Cap on the rupee value earned per order. null = none.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maxRewardPerOrderInr?: number | null;

  @ApiPropertyOptional({ description: 'Whether customers may spend points at checkout.' })
  @IsOptional()
  @IsBoolean()
  redemptionEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Most of an order (percent) that points can pay for.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxRedemptionPercent?: number;

  @ApiPropertyOptional({ description: 'Fewest points one redemption may use.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  minRedeemPoints?: number;

  @ApiPropertyOptional({ nullable: true, description: 'Months until earned points lapse. 0/null = never.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  pointsExpiryMonths?: number | null;
}

export class EstimateLineDto {
  @ApiProperty()
  @IsString()
  productId!: string;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  @Max(100000)
  quantity!: number;
}

export class EstimateLoyaltyDto {
  @ApiProperty({ type: [EstimateLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => EstimateLineDto)
  lines!: EstimateLineDto[];

  @ApiPropertyOptional({ enum: SalesChannel })
  @IsOptional()
  @IsEnum(SalesChannel)
  channel?: SalesChannel;

  @ApiPropertyOptional({ enum: CustomerType })
  @IsOptional()
  @IsEnum(CustomerType)
  customerType?: CustomerType;
}

export class ReturnLineDto {
  @ApiProperty()
  @IsString()
  orderItemId!: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class RecordReturnDto {
  @ApiProperty({ type: [ReturnLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReturnLineDto)
  items!: ReturnLineDto[];

  @ApiProperty({ example: 'Damaged in transit' })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;

  @ApiPropertyOptional({ description: 'Money refunded, when known. Informational.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  refundAmount?: number;
}
