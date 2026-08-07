import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFieldVisitDto {
  @ApiProperty()
  @IsString()
  farmerId: string;

  @ApiProperty()
  @IsString()
  branchId: string;

  @ApiProperty()
  @IsDateString()
  visitDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cropName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cropGrowthStage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cropHealth?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pestStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  diseaseObservation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fertilizerAdvice?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  irrigationAdvice?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pestControlSuggestions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  harvestPreparation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  yieldPredictionQty?: number;
}
