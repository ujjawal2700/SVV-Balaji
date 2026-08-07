import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProcurementPlanDto {
  @ApiProperty()
  @IsString()
  cropName: string;

  @ApiProperty()
  @IsNumber()
  plannedQuantity: number;

  @ApiPropertyOptional({ default: 'KG' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiProperty()
  @IsDateString()
  scheduledFrom: string;

  @ApiProperty()
  @IsDateString()
  scheduledTo: string;

  @ApiProperty()
  @IsString()
  branchId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
