import { ApiProperty } from '@nestjs/swagger';
import { BatchHoldStatus } from '@prisma/client';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

export class SetBatchHoldDto {
  @ApiProperty({ type: [String], example: ['FG-20260905-001'] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  fgBatchNumbers!: string[];

  @ApiProperty({ enum: BatchHoldStatus, description: 'ACTIVE releases a hold; RECALLED is final.' })
  @IsEnum(BatchHoldStatus)
  status!: BatchHoldStatus;

  @ApiProperty({ description: 'Why. Stored on the audit trail, so be specific.' })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}
