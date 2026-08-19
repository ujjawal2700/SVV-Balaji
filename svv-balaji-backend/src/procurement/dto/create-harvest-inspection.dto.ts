import { IsDateString, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InspectionResult } from '@prisma/client';

export class CreateHarvestInspectionDto {
  @ApiProperty()
  @IsString()
  farmerId: string;

  @ApiPropertyOptional({ description: 'Link to the pre-season agreement, if one exists' })
  @IsOptional()
  @IsString()
  agreementId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  procurementPlanId?: string;

  @ApiPropertyOptional({
    description:
      'Which of the farmer\'s plots this harvest came from. Optional - a farmer whose land is ' +
      'not mapped yet is still inspectable, and every inspection predating plots has none.',
  })
  @IsOptional()
  @IsString()
  plotId?: string;

  @ApiProperty()
  @IsString()
  cropName: string;

  @ApiProperty()
  @IsDateString()
  inspectionDate: string;

  // FRD 13.2 inspection checklist
  @ApiPropertyOptional({ description: 'Moisture %' })
  @IsOptional()
  @IsNumber()
  moistureLevel?: number;

  @ApiPropertyOptional({ description: 'Foreign matter %' })
  @IsOptional()
  @IsNumber()
  foreignMatter?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  grainSize?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  grainColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  smell?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  physicalDamage?: string;

  @ApiProperty({ enum: InspectionResult })
  @IsEnum(InspectionResult)
  result: InspectionResult;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}
