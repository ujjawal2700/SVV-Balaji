import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// --- Cleaning & Grading (FRD 18) -------------------------------------------

export class CreateCleaningGradingDto {
  @ApiProperty()
  @IsString()
  rawMaterialBatchId: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  dustRemoved?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  stonesRemoved?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  foreignMaterialRemoved?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  impuritiesSeparated?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  grainSize?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  texture?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  moistureLevel?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  purity?: number;

  @ApiPropertyOptional({ description: 'Weight lost to cleaning' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  wastageQuantity?: number;

  @ApiPropertyOptional({ description: 'QA sign-off (FRD 18.3)' })
  @IsOptional()
  @IsBoolean()
  qaVerified?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}

// --- Production (FRD 20) ---------------------------------------------------

export class ConsumptionDto {
  @ApiProperty({ description: 'Raw material batch to consume from' })
  @IsString()
  rawMaterialBatchId: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  quantityUsed: number;
}

export class CreateProductionBatchDto {
  @ApiProperty()
  @IsString()
  recipeId: string;

  @ApiProperty()
  @IsString()
  branchId: string;

  @ApiProperty()
  @IsString()
  warehouseId: string;

  @ApiProperty()
  @IsDateString()
  productionDate: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  plannedQuantity: number;

  @ApiProperty({
    type: [ConsumptionDto],
    description: 'Raw material batches to consume - this is the traceability link',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ConsumptionDto)
  consumptions: ConsumptionDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  machineName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  machineNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  operatorName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  productionLine?: string;
}

export class CompleteProductionDto {
  @ApiProperty({ description: 'Actual output produced' })
  @IsNumber()
  @Min(0)
  actualQuantity: number;
}
