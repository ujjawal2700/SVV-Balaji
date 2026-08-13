import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  StorageService,
  UPLOAD_FOLDERS,
  type StoredFile,
  type UploadedFileLike,
  type UploadFolder,
} from './storage.service';

/**
 * Builds the SHA-1 signature Cloudinary expects on an authenticated upload.
 *
 * The rule, from their docs: take every parameter you are sending EXCEPT
 * `file`, `cloud_name`, `resource_type` and `api_key`; sort by key; join as
 * `k=v` with `&`; append the API secret; SHA-1 the result.
 *
 * Exported so it can be tested directly. Getting this wrong produces a bare
 * "Invalid Signature" from Cloudinary with nothing to debug against, which is
 * exactly the kind of thing worth pinning with a test.
 */
export function cloudinarySignature(
  params: Record<string, string | number>,
  apiSecret: string,
): string {
  const canonical = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');

  return createHash('sha1').update(`${canonical}${apiSecret}`).digest('hex');
}

/** Images and PDFs only. */
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
]);

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

@Injectable()
export class CloudinaryStorage extends StorageService {
  private readonly logger = new Logger(CloudinaryStorage.name);

  private readonly cloudName = process.env.CLOUDINARY_CLOUD_NAME ?? '';
  private readonly apiKey = process.env.CLOUDINARY_API_KEY ?? '';
  private readonly apiSecret = process.env.CLOUDINARY_API_SECRET ?? '';
  private readonly maxBytes = Number(process.env.MAX_UPLOAD_BYTES ?? DEFAULT_MAX_BYTES);

  /**
   * Uploads go browser -> our API -> Cloudinary, never browser -> Cloudinary.
   *
   * Cloudinary's unsigned upload widget would be less code, but it requires an
   * unsigned preset, which is a public write endpoint on our media account
   * that anyone who reads the bundle can post to. Signing here keeps the
   * secret server-side and means every upload has already passed the JWT guard.
   */
  async put(file: UploadedFileLike, folder: UploadFolder): Promise<StoredFile> {
    this.assertConfigured();

    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException(
        `${file.mimetype} files cannot be uploaded. Photographs (JPEG, PNG, WebP, HEIC) and ` +
          `PDFs are accepted.`,
      );
    }

    if (file.size > this.maxBytes) {
      const limitMb = (this.maxBytes / 1024 / 1024).toFixed(0);
      const actualMb = (file.size / 1024 / 1024).toFixed(1);
      throw new BadRequestException(
        `${file.originalname} is ${actualMb} MB, over the ${limitMb} MB limit. ` +
          `Most phone cameras can be set to a smaller photo size.`,
      );
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const signedParams = { folder: UPLOAD_FOLDERS[folder], timestamp };

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }), file.originalname);
    form.append('api_key', this.apiKey);
    form.append('timestamp', String(timestamp));
    form.append('folder', UPLOAD_FOLDERS[folder]);
    form.append('signature', cloudinarySignature(signedParams, this.apiSecret));

    // `auto` lets Cloudinary decide between image and raw, which is what makes
    // one endpoint work for both photographs and PDFs.
    const endpoint = `https://api.cloudinary.com/v1_1/${this.cloudName}/auto/upload`;

    let response: Response;
    try {
      response = await fetch(endpoint, { method: 'POST', body: form });
    } catch (error) {
      this.logger.error(`Cloudinary unreachable: ${String(error)}`);
      throw new InternalServerErrorException(
        'The file store could not be reached. The record was not saved - try again.',
      );
    }

    const payload = (await response.json().catch(() => ({}))) as {
      secure_url?: string;
      public_id?: string;
      bytes?: number;
      width?: number;
      height?: number;
      error?: { message?: string };
    };

    if (!response.ok || !payload.secure_url || !payload.public_id) {
      const detail = payload.error?.message ?? `HTTP ${response.status}`;
      this.logger.error(`Cloudinary rejected an upload: ${detail}`);
      throw new InternalServerErrorException(`The file store rejected the upload: ${detail}`);
    }

    return {
      url: payload.secure_url,
      key: payload.public_id,
      mimeType: file.mimetype,
      bytes: payload.bytes ?? file.size,
      width: payload.width,
      height: payload.height,
    };
  }

  async remove(key: string): Promise<void> {
    this.assertConfigured();

    const timestamp = Math.floor(Date.now() / 1000);
    const form = new FormData();
    form.append('public_id', key);
    form.append('api_key', this.apiKey);
    form.append('timestamp', String(timestamp));
    form.append('signature', cloudinarySignature({ public_id: key, timestamp }, this.apiSecret));

    try {
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${this.cloudName}/image/destroy`,
        { method: 'POST', body: form },
      );
      if (!response.ok) {
        this.logger.warn(`Could not delete ${key} from Cloudinary: HTTP ${response.status}`);
      }
    } catch (error) {
      // Deliberately swallowed. An orphaned asset costs a few kilobytes; a
      // throw here would stop the database row being deleted, which costs
      // correctness. See the note on StorageService.remove.
      this.logger.warn(`Could not delete ${key} from Cloudinary: ${String(error)}`);
    }
  }

  private assertConfigured() {
    if (!this.cloudName || !this.apiKey || !this.apiSecret) {
      throw new InternalServerErrorException(
        'File storage is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and ' +
          'CLOUDINARY_API_SECRET in .env.',
      );
    }
  }
}
