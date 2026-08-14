import {
  BadRequestException,
  Controller,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import {
  StorageService,
  UPLOAD_FOLDERS,
  type UploadedFileLike,
  type UploadFolder,
} from './storage.service';

const FOLDERS = Object.keys(UPLOAD_FOLDERS) as UploadFolder[];

@ApiTags('uploads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly storage: StorageService) {}

  /**
   * The one place a file enters the system.
   *
   * Deliberately not role-restricted beyond "signed in": the three places that
   * accept a `fileUrl` — field visit documents, training materials and harvest
   * inspection documents — are each guarded on their own endpoint, and that is
   * where the authority sits. Restricting here as well would mean adding a
   * role to this list every time another screen learns to take an attachment,
   * and forgetting to would produce a 403 with nothing explaining it.
   *
   * Returns a `url` that goes straight into those DTOs unchanged, which is why
   * none of them needed a migration.
   */
  @Post(':folder')
  @RequirePermission('uploads.create')
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'folder', enum: FOLDERS })
  @ApiOperation({
    summary: 'Upload a photograph or PDF',
    description:
      'Multipart, field name "file". Images (JPEG, PNG, WebP, HEIC) and PDFs, up to the ' +
      'MAX_UPLOAD_BYTES limit. The returned url is what the document endpoints expect.',
  })
  @UseInterceptors(FileInterceptor('file'))
  async upload(@Param('folder') folder: string, @UploadedFile() file: UploadedFileLike) {
    if (!file) {
      throw new BadRequestException('No file was received. Send it as multipart field "file".');
    }

    if (!FOLDERS.includes(folder as UploadFolder)) {
      throw new BadRequestException(
        `Unknown upload folder "${folder}". Expected one of: ${FOLDERS.join(', ')}.`,
      );
    }

    return this.storage.put(file, folder as UploadFolder);
  }
}
