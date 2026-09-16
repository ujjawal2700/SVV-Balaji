import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SupplierVerificationAction } from '@prisma/client';

export class VerifySupplierDto {
  @ApiProperty({ enum: SupplierVerificationAction })
  @IsEnum(SupplierVerificationAction)
  action: SupplierVerificationAction;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}
