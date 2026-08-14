import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsString } from 'class-validator';

export class SetRolePermissionsDto {
  @ApiProperty({
    type: [String],
    description:
      'The complete set of permission keys this role should hold. This REPLACES whatever it ' +
      'holds now - send the full list, not a delta. An empty array is valid and means the role ' +
      'can sign in but reach nothing.',
    example: ['farmers.view', 'farmers.create', 'agreements.view'],
  })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissions!: string[];
}
