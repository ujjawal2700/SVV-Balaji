import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCollectionDto {
  @ApiProperty({ description: 'Must reference an APPROVED harvest inspection (FRD 13.5)' })
  @IsString()
  inspectionId: string;

  @ApiProperty()
  @IsString()
  branchId: string;

  @ApiProperty()
  @IsDateString()
  collectionDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  collectionLocation?: string;

  @ApiProperty({ description: 'Gross weight including packaging' })
  @IsNumber()
  @Min(0)
  grossWeight: number;

  @ApiProperty({ description: 'Net weight - must not exceed gross' })
  @IsNumber()
  @Min(0)
  netWeight: number;

  @ApiPropertyOptional({ default: 'KG' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiProperty({ description: 'Rate per unit. Defaults to the agreement rate when omitted.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  purchaseRate?: number;

  @ApiPropertyOptional({ description: 'Warehouse the batch is stored into on receipt' })
  @IsOptional()
  @IsString()
  warehouseId?: string;
}
