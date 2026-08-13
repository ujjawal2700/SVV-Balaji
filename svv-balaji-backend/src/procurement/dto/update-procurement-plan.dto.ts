import { PartialType } from '@nestjs/swagger';
import { CreateProcurementPlanDto } from './create-procurement-plan.dto';

export class UpdateProcurementPlanDto extends PartialType(CreateProcurementPlanDto) {}
