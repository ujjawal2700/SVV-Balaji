import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePurchaseOrderDto {
  @ApiProperty()
  @IsString()
  supplierId: string;

  @ApiProperty()
  @IsString()
  materialName: string;

  @ApiProperty()
  @IsNumber()
  @Type(() => Number)
  expectedQuantity: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiProperty()
  @IsNumber()
  @Type(() => Number)
  purchaseRate: number;

  @ApiProperty()
  @IsNumber()
  @Type(() => Number)
  totalAmount: number;

  @ApiProperty()
  @IsDateString()
  orderDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  deliveryDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  qualityStandards?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  terms?: string;
}
