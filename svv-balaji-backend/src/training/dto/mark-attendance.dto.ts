import { IsArray, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MarkAttendanceDto {
  @ApiProperty({ type: [String], description: 'Farmer IDs who attended' })
  @IsArray()
  @IsString({ each: true })
  farmerIds: string[];
}
