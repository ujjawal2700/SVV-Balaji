import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateProcurementPlanDto } from './create-procurement-plan.dto';
import { CreateHarvestInspectionDto } from './create-harvest-inspection.dto';

export class UpdateProcurementPlanDto extends PartialType(CreateProcurementPlanDto) {}

/**
 * `farmerId` is excluded. An inspection is a judgement about one farmer's
 * harvest, and its `result` is what allows or blocks collection from that
 * farmer. Reassigning it would transfer an APPROVED result to someone whose
 * crop was never looked at. Record a new inspection instead.
 */
export class UpdateHarvestInspectionDto extends PartialType(
  OmitType(CreateHarvestInspectionDto, ['farmerId'] as const),
) {}
