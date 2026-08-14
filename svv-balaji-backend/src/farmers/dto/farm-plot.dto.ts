import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * "lat,lng" with optional sign and decimals - the same shape already stored in
 * `Farmer.gpsLocation`, so one parser serves both. Validated rather than left
 * free text because the consumer trace page plots it on a map, and a malformed
 * value there is a blank map with no explanation.
 */
export const GPS_PATTERN = /^-?\d{1,3}(\.\d+)?,\s*-?\d{1,3}(\.\d+)?$/;

export class CreateFarmPlotDto {
  @ApiProperty({ example: 'North field', description: 'What the farmer calls it' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: '142/3B', description: 'Revenue survey number' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  surveyNumber?: string;

  @ApiProperty({ example: 2.5 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100000)
  areaAcres!: number;

  @ApiPropertyOptional({ example: 'Black cotton' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  soilType?: string;

  @ApiPropertyOptional({ example: 'Drip' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  irrigationType?: string;

  @ApiPropertyOptional({ example: 'Borewell' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  waterSource?: string;

  @ApiPropertyOptional({ example: 'Wheat' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  currentCrop?: string;

  @ApiPropertyOptional({ example: '2026-06-15' })
  @IsOptional()
  @IsDateString()
  sowingDate?: string;

  @ApiPropertyOptional({ example: '2026-10-20' })
  @IsOptional()
  @IsDateString()
  expectedHarvest?: string;

  @ApiPropertyOptional({ example: '19.0760, 72.8777', description: 'lat,lng captured on the plot' })
  @IsOptional()
  @Matches(GPS_PATTERN, {
    message: 'gpsLocation must be "latitude,longitude", for example "19.0760, 72.8777"',
  })
  gpsLocation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateFarmPlotDto extends PartialType(CreateFarmPlotDto) {
  @ApiPropertyOptional({ description: 'Set false when the farmer stops working this plot' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
