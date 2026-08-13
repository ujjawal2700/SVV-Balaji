import { Global, Module } from '@nestjs/common';
import { CloudinaryStorage } from './cloudinary.storage';
import { StorageService } from './storage.service';
import { UploadsController } from './uploads.controller';

/**
 * Answering A-04 later is this one binding.
 *
 * Swap `CloudinaryStorage` for an `S3Storage` or `GcsStorage` implementing the
 * same abstract class and nothing else in the codebase changes — not the
 * controller, not the three document endpoints, not the panel. That was the
 * point of putting a seam here rather than calling Cloudinary from the places
 * that need a file.
 *
 * Global so that any module can inject StorageService to clean up its assets
 * on delete without importing this one.
 */
@Global()
@Module({
  controllers: [UploadsController],
  providers: [{ provide: StorageService, useClass: CloudinaryStorage }],
  exports: [StorageService],
})
export class UploadsModule {}
