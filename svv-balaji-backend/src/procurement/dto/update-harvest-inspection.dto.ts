import { PartialType } from '@nestjs/swagger';
import { CreateHarvestInspectionDto } from './create-harvest-inspection.dto';

export class UpdateHarvestInspectionDto extends PartialType(CreateHarvestInspectionDto) {}
