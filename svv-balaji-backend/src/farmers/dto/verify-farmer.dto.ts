import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FarmerVerificationAction } from '@prisma/client';

export class VerifyFarmerDto {
  @ApiProperty({ enum: FarmerVerificationAction })
  @IsEnum(FarmerVerificationAction)
  action: FarmerVerificationAction;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}
