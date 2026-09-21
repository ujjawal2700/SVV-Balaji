import { IsEnum, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { WarehouseKind } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateWarehouseDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  location: string;

  @ApiProperty()
  @IsString()
  branchId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  capacity?: number;

  @ApiPropertyOptional({ enum: WarehouseKind, description: 'CENTRAL ships nationally by courier; OUTLET is a franchise store delivering locally.' })
  @IsOptional()
  @IsEnum(WarehouseKind)
  kind?: WarehouseKind;

  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() state?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[1-9]\d{5}$/, { message: 'Enter a valid 6-digit pincode' }) pincode?: string;

  @ApiPropertyOptional({ description: 'Required for an OUTLET: where the store is, for the delivery-radius test.' })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 6 }) @Min(-90) @Max(90)
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsNumber({ maxDecimalPlaces: 6 }) @Min(-180) @Max(180)
  longitude?: number;

  @ApiPropertyOptional({ description: 'How far this outlet delivers, km. Empty = the program default.' })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.5) @Max(100)
  serviceRadiusKm?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() contactPhone?: string;
}

export class StockInDto {
  @ApiProperty()
  @IsString()
  batchId: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  quantity: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  storageLocation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class StockOutDto {
  @ApiProperty()
  @IsString()
  batchId: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  quantity: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class TransferStockDto {
  @ApiProperty()
  @IsString()
  batchId: string;

  @ApiProperty()
  @IsString()
  fromWarehouseId: string;

  @ApiProperty()
  @IsString()
  toWarehouseId: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  quantity: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class AdjustStockDto {
  @ApiProperty()
  @IsString()
  batchId: string;

  @ApiProperty({ description: 'New absolute on-hand quantity after the count' })
  @IsNumber()
  @Min(0)
  newQuantity: number;

  @ApiProperty({ description: 'Why the adjustment was needed - required for audit' })
  @IsString()
  reason: string;
}

/**
 * Every field on a warehouse is editable. Capacity in particular is expected
 * to change - racking gets added - and the occupancy figures are derived, not
 * stored, so a capacity change is reflected immediately without a migration.
 */
export class UpdateWarehouseDto extends PartialType(CreateWarehouseDto) {}
