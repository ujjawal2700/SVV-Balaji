import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFinishedGoodsBatchDto {
  @ApiProperty()
  @IsString()
  productionBatchId: string;

  @ApiProperty({ description: 'pouch | box | bottle | jar | sack' })
  @IsString()
  packagingType: string;

  @ApiProperty({ description: 'Net weight per pack' })
  @IsNumber()
  @Min(0.001)
  netWeight: number;

  @ApiPropertyOptional({ default: 'KG' })
  @IsOptional()
  @IsString()
  weightUnit?: string;

  @ApiProperty({ description: 'Number of packs produced' })
  @IsInt()
  @Min(1)
  packCount: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  mrp?: number;

  @ApiProperty()
  @IsDateString()
  packagingDate: string;

  @ApiProperty()
  @IsDateString()
  manufacturingDate: string;

  @ApiPropertyOptional({ description: 'Derived from shelfLifeDays when omitted' })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  shelfLifeDays?: number;
}

export class StockFinishedGoodsDto {
  @ApiProperty()
  @IsString()
  warehouseId: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  storageLocation?: string;
}
