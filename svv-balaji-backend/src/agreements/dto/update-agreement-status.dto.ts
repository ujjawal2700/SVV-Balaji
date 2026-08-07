import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AgreementStatus } from '@prisma/client';

export class UpdateAgreementStatusDto {
  @ApiProperty({ enum: AgreementStatus })
  @IsEnum(AgreementStatus)
  status: AgreementStatus;
}
