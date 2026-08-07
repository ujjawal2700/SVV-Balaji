import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddFieldVisitDocumentDto {
  @ApiProperty({ description: 'URL of the uploaded file (from your object storage)' })
  @IsString()
  fileUrl: string;

  @ApiProperty({ description: 'photo | pdf | inspection_doc' })
  @IsString()
  fileType: string;
}
