import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AssignBranchManagerDto {
  @ApiPropertyOptional({
    nullable: true,
    description:
      'FRD 6.2. The user to make accountable for this branch. They must hold the ' +
      'BRANCH_MANAGER role, be active, and already work at this branch. Omit or send null to ' +
      'vacate the post - a branch between appointments is a real state.',
  })
  @IsOptional()
  @IsString()
  managerId?: string | null;
}
