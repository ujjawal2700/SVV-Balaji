import { CLIENT_ID_DESCRIPTION } from '../../common/client-id';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';
import { SeedSource } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSeedDistributionDto {
  @ApiPropertyOptional({ description: CLIENT_ID_DESCRIPTION, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  id?: string;

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

  @ApiPropertyOptional({
    enum: SeedSource,
    description:
      'Where the seed came from. COMPANY_STOCK: `seedStockId` is required and the quantity is ' +
      'deducted from that lot. EXTERNAL (farmer-provided / outside purchase): no lot, nothing ' +
      'deducted. Required on create; inferred as COMPANY_STOCK when only `seedStockId` is sent.',
  })
  @IsOptional()
  @IsEnum(SeedSource)
  seedSource?: SeedSource;

  @ApiPropertyOptional({
    description:
      'FRD 10.2 - the seed stock lot this is issued from (COMPANY_STOCK only). Seed name, variety, ' +
      'batch number and unit are taken from the lot.',
  })
  @IsOptional()
  @IsString()
  seedStockId?: string;
}
