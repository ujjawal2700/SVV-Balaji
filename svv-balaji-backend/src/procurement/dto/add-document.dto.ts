import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddDocumentDto {
  @ApiProperty({ description: 'URL of the uploaded file (from your object storage)' })
  @IsString()
  fileUrl: string;

  @ApiProperty({ description: 'crop_image | inspection_photo | pdf | quality_certificate' })
  @IsString()
  fileType: string;
}
