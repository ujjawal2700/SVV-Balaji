import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { FarmerStatus } from '@prisma/client';

// Matches FRD 7.4 Farmer Search filters (crop/quality-rating filters land
// once procurement/quality data exists in later phases).
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
}
