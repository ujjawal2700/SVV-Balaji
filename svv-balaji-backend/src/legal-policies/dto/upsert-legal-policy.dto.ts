import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PolicyAudience, PolicyType } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class UpsertLegalPolicyDto {
  @ApiProperty({ enum: PolicyAudience })
  @IsEnum(PolicyAudience)
  audience!: PolicyAudience;

  @ApiProperty({ enum: PolicyType })
  @IsEnum(PolicyType)
  type!: PolicyType;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  title!: string;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  content!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  version?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
