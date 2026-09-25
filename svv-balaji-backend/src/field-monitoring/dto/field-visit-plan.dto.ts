import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { FieldVisitPlanStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * FRD 12.1 - "schedule and record farm visits". This is the schedule half.
 *
 * `branchId` and `expertId` are optional: a plan defaults to the farmer's
 * branch and to whoever is planning it, which is the executive planning their
 * own week. A Branch Manager assigning a visit to someone else passes both.
 */
export class CreateFieldVisitPlanDto {
  @ApiProperty()
  @IsString()
  farmerId: string;

  @ApiProperty({ description: 'The day the visit is planned for (YYYY-MM-DD).' })
  @IsDateString()
  plannedDate: string;

  @ApiPropertyOptional({ description: 'Defaults to the farmer\'s branch.' })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ description: 'The executive expected to go. Defaults to the caller.' })
  @IsOptional()
  @IsString()
  expertId?: string;

  @ApiPropertyOptional({ description: 'Crop monitoring, pest follow-up, pre-harvest check…' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  purpose?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  cropName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

/**
 * Rescheduling or reassigning. The farmer is fixed: a plan moved to a different
 * farmer is a different plan, and should be cancelled and raised again.
 */
export class UpdateFieldVisitPlanDto extends PartialType(
  OmitType(CreateFieldVisitPlanDto, ['farmerId'] as const),
) {}

export class CancelFieldVisitPlanDto {
  @ApiPropertyOptional({ description: 'Why the visit will not happen - shown on the plan.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class QueryFieldVisitPlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  farmerId?: string;

  @ApiPropertyOptional({ description: 'Plans assigned to one executive - the field app\'s "Mine".' })
  @IsOptional()
  @IsString()
  expertId?: string;

  @ApiPropertyOptional({ enum: FieldVisitPlanStatus })
  @IsOptional()
  @IsEnum(FieldVisitPlanStatus)
  status?: FieldVisitPlanStatus;

  @ApiPropertyOptional({ description: 'Planned on or after this date (YYYY-MM-DD).' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Planned on or before this date (YYYY-MM-DD).' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
