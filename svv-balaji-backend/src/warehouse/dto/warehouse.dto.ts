import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
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
