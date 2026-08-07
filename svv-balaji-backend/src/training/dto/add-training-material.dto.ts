import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddTrainingMaterialDto {
  @ApiProperty({ description: 'URL of the uploaded file (from your object storage)' })
  @IsString()
  fileUrl: string;

  @ApiProperty({ description: 'pdf | image | presentation | video' })
  @IsString()
  fileType: string;
}
