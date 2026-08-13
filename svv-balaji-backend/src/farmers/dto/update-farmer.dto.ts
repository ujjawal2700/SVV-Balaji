import { PartialType } from '@nestjs/swagger';
import { CreateFarmerDto } from './create-farmer.dto';

/**
 * `farmerCode` is absent from CreateFarmerDto and so cannot be set here
 * either - and that is the point. The code is the traceability anchor: it is
 * issued once on approval, printed onto agreements and carried down the chain
 * into batches and finished packs. Editing it would silently break every trace
 * already recorded against it, so the only way to change one is not to.
 */
export class UpdateFarmerDto extends PartialType(CreateFarmerDto) {}
