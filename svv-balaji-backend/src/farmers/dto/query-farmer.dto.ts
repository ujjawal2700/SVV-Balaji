import { IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { FarmerStatus } from '@prisma/client';

// Matches FRD 7.4 Farmer Search filters. All eight are now implemented: crop
// and quality rating landed with FRD 7.6 performance scoring.
export class QueryFarmerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  village?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ enum: FarmerStatus })
  @IsOptional()
  @IsEnum(FarmerStatus)
  status?: FarmerStatus;

  @ApiPropertyOptional({
    description: 'FRD 7.4 Crop filter - substring match against the farmer\'s recorded crop details',
  })
  @IsOptional()
  @IsString()
  crop?: string;

  @ApiPropertyOptional({
    description:
      'FRD 7.4 Quality Rating filter - farmers rated at or above this (0-100). ' +
      'Unrated farmers are excluded, because "no rating" is not "meets your bar".',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  minRating?: number;
}
