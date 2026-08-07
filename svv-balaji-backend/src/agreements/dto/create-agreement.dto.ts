import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAgreementDto {
  @ApiProperty()
  @IsString()
  farmerId: string;

  @ApiProperty()
  @IsString()
  cropName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  variety?: string;

  @ApiProperty()
  @IsNumber()
  expectedQuantity: number;

  @ApiProperty()
  @IsNumber()
  purchaseRate: number;

  @ApiProperty()
  @IsDateString()
  agreementDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  harvestDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  qualityStandards?: string;
}
