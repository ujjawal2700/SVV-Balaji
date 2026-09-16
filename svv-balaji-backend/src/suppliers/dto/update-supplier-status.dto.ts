import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SupplierStatus } from '@prisma/client';

export class UpdateSupplierStatusDto {
  @ApiProperty({ enum: SupplierStatus })
  @IsEnum(SupplierStatus)
  status: SupplierStatus;
}
