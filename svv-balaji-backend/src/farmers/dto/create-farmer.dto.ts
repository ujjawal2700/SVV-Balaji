import { CLIENT_ID_DESCRIPTION } from '../../common/client-id';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFarmerDto {
  @ApiPropertyOptional({ description: CLIENT_ID_DESCRIPTION, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  id?: string;

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

  @ApiPropertyOptional({
    description:
      'FRD 7.1 Family Details - free text, e.g. "4 dependants; two sons farm with him". ' +
      'Advisory only: it does not block approval.',
  })
  @IsOptional()
  @IsString()
  familyDetails?: string;

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
