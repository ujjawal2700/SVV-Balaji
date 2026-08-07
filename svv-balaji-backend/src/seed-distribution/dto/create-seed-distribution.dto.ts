import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSeedDistributionDto {
  @ApiProperty()
  @IsString()
  farmerId: string;

  @ApiProperty()
  @IsString()
  seedName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  seedVariety?: string;

  @ApiProperty()
  @IsNumber()
  quantity: number;

  @ApiPropertyOptional({ default: 'KG' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  batchNumber?: string;

  @ApiProperty()
  @IsDateString()
  distributionDate: string;
}
