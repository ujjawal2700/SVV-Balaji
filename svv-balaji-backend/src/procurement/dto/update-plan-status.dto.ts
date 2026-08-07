import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ProcurementPlanStatus } from '@prisma/client';

export class UpdatePlanStatusDto {
  @ApiProperty({ enum: ProcurementPlanStatus })
  @IsEnum(ProcurementPlanStatus)
  status: ProcurementPlanStatus;
}
