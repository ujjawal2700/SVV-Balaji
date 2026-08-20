import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentStatus } from '@prisma/client';

export class OrderLineDto {
  @ApiProperty()
  @IsString()
  productId: string;

  @ApiProperty({ description: 'Number of packs' })
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateOrderDto {
  @ApiProperty()
  @IsString()
  customerId: string;

  @ApiProperty({ description: 'Warehouse the order is fulfilled from - allocation draws stock here only' })
  @IsString()
  warehouseId: string;

  @ApiPropertyOptional({ description: 'Defaults to now' })
  @IsOptional()
  @IsDateString()
  orderDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  requiredByDate?: string;

  @ApiProperty({ type: [OrderLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  items: OrderLineDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    enum: ['DRAFT', 'PLACED'],
    default: 'PLACED',
    description:
      'A-13: save an incomplete order as a DRAFT. Defaults to PLACED, so existing callers are ' +
      'unaffected. Prices are frozen when the order is PLACED, not when a draft is saved.',
  })
  @IsOptional()
  @IsEnum(['DRAFT', 'PLACED'])
  status?: 'DRAFT' | 'PLACED';
}

export class CancelOrderDto {
  @ApiProperty({ description: 'Recorded on the order and shown in the audit trail' })
  @IsString()
  reason: string;
}

export class UpdatePaymentStatusDto {
  @ApiProperty({ enum: PaymentStatus })
  @IsEnum(PaymentStatus)
  paymentStatus: PaymentStatus;
}
