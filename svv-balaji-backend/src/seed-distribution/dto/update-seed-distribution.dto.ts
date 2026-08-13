import { PartialType } from '@nestjs/swagger';
import { CreateSeedDistributionDto } from './create-seed-distribution.dto';

/**
 * `farmerId` stays editable here, unlike on an agreement: a handout logged
 * against the wrong farmer is a common and harmless data-entry slip, and
 * nothing downstream has been derived from it.
 */
export class UpdateSeedDistributionDto extends PartialType(CreateSeedDistributionDto) {}
