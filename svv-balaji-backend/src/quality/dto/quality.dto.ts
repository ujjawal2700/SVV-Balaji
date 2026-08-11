import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InspectionStage, QualityResult } from '@prisma/client';

export class CreateQualityInspectionDto {
  @ApiProperty({ enum: InspectionStage })
  @IsEnum(InspectionStage)
  stage: InspectionStage;

  @ApiPropertyOptional({ description: 'Required when stage = RAW_MATERIAL' })
  @IsOptional()
  @IsString()
  rawMaterialBatchId?: string;

  @ApiPropertyOptional({ description: 'Required when stage = IN_PROCESS' })
  @IsOptional()
  @IsString()
  productionBatchId?: string;

  @ApiPropertyOptional({ description: 'Required when stage = FINISHED_GOODS' })
  @IsOptional()
  @IsString()
  finishedGoodsBatchId?: string;

  // FRD 21.1 raw material
  @ApiPropertyOptional() @IsOptional() @IsNumber() moisture?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() purity?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() grainSize?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() color?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() foreignMatter?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() odor?: string;

  // FRD 21.2 in-process
  @ApiPropertyOptional() @IsOptional() @IsString() ingredientRatio?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mixingAccuracy?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() grindingQuality?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() temperature?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() productConsistency?: string;

  // FRD 21.3 finished goods
  @ApiPropertyOptional() @IsOptional() @IsString() productAppearance?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() productWeight?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() packagingQuality?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() labelAccuracy?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() shelfLifeVerified?: boolean;

  @ApiProperty({ enum: QualityResult })
  @IsEnum(QualityResult)
  result: QualityResult;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}
