import { PartialType } from '@nestjs/swagger';
import { CreateBranchDto } from './create-branch.dto';

/**
 * Every field on a branch is editable - a branch has no identifier that
 * anything downstream depends on, unlike a farmer's traceability code.
 */
export class UpdateBranchDto extends PartialType(CreateBranchDto) {}
