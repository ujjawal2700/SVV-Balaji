import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateFarmerStatusDto {
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE', 'BLACKLISTED', 'SUSPENDED'] })
  @IsIn(['ACTIVE', 'INACTIVE', 'BLACKLISTED', 'SUSPENDED'])
  status: 'ACTIVE' | 'INACTIVE' | 'BLACKLISTED' | 'SUSPENDED';
}
