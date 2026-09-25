import { CLIENT_ID_DESCRIPTION } from '../../common/client-id';
import { IsDateString, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFieldVisitDto {
  @ApiPropertyOptional({ description: CLIENT_ID_DESCRIPTION, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  id?: string;

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

  @ApiPropertyOptional({
    description:
      'FRD 12.1 - the planned visit this fulfils. Marks the plan COMPLETED and links it to ' +
      'the new visit. Must be a PLANNED plan for the same farmer.',
  })
  @IsOptional()
  @IsString()
  planId?: string;
}
