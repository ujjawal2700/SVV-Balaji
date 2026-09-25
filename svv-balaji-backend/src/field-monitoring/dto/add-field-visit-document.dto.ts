import { CLIENT_ID_DESCRIPTION } from '../../common/client-id';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddFieldVisitDocumentDto {
  @ApiPropertyOptional({ description: CLIENT_ID_DESCRIPTION, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ description: 'URL of the uploaded file (from your object storage)' })
  @IsString()
  fileUrl: string;

  @ApiProperty({ description: 'photo | pdf | inspection_doc' })
  @IsString()
  fileType: string;
}
