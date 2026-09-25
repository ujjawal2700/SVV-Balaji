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

  @ApiPropertyOptional({
    description:
      'FRD 10.2 - the seed stock lot this is issued from. The quantity is deducted from the lot, ' +
      'and seed name, variety, batch number and unit are taken from it. Omit for inputs that ' +
      'did not come out of company stock: those are recorded but nothing is deducted.',
  })
  @IsOptional()
  @IsString()
  seedStockId?: string;
}
