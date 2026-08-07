import { IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFarmerDto {
  @ApiProperty()
  @IsString()
  fullName: string;

  @ApiProperty()
  @IsString()
  mobile: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  aadhaarNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  panNumber?: string;

  @ApiProperty()
  @IsString()
  village: string;

  @ApiProperty()
  @IsString()
  district: string;

  @ApiProperty()
  @IsString()
  state: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'lat,lng' })
  @IsOptional()
  @IsString()
  gpsLocation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  farmSizeAcres?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  landType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  irrigationType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cropDetails?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankAccountName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankAccountNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ifscCode?: string;

  @ApiProperty()
  @IsString()
  branchId: string;
}
