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

  // A-12 paging. Parsed (and range-checked) by pageRequest(); strings here so
  // the bare-array response stays the default when they are absent.
  @ApiPropertyOptional({ description: 'Page number from 1. Sending page or limit switches the response to { data, meta }.' })
  @IsOptional()
  @IsString()
  page?: string;

  @ApiPropertyOptional({ description: 'Rows per page, 1-100 (default 20).' })
  @IsOptional()
  @IsString()
  limit?: string;
}
