import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateAgreementDto } from './create-agreement.dto';

/**
 * `farmerId` is excluded: moving an agreement to a different farmer would
 * rewrite who the pre-season commitment was made to, and any inspection already
 * raised against it would then point at the wrong person. Register a new
 * agreement instead.
 *
 * Status is not here either - it moves through PATCH /agreements/:id/status.
 */
export class UpdateAgreementDto extends PartialType(
  OmitType(CreateAgreementDto, ['farmerId'] as const),
) {}
