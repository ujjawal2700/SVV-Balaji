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

/**
 * What FRD 35 says the repository accepts, plus what FRD 11.3 needs.
 *
 * This used to be images and PDF only, which silently broke two documented
 * requirements: FRD 35 names Excel and Word explicitly, and FRD 11.3 requires
 * presentations and videos as training material — while the training screen
 * offered "presentation" and "video" in its type dropdown, so a trainer picked
 * a type the uploader would then reject.
 *
 * Both the modern (OOXML) and legacy Office types are listed. A field office
 * running Office 2007 sends `application/vnd.ms-excel`, and refusing it would
 * be refusing the actual file the client has.
 */
const ALLOWED_MIME = new Set([
  // Photographs — the bulk of what the field apps send.
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',

  // Documents and certificates.
  'application/pdf',

  // FRD 35 — Word.
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',

  // FRD 35 — Excel.
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

  // FRD 11.3 — training presentations.
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',

  // FRD 11.3 — training videos. Kept deliberately narrow: these are the two
  // formats a phone actually produces, and video is the one category that can
  // blow the size limit, so widening it is a decision not an oversight.
  'video/mp4',
  'video/quicktime',
]);

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Video gets its own ceiling.
 *
 * One flat 10 MB limit was fine while this accepted photographs and PDFs. It
 * stopped being fine the moment FRD 11.3 training videos were allowed through
 * the type check: a two-minute clip from a phone is 30-60 MB, so every real
 * video would have passed the MIME gate and then been refused by the size gate
 * — allowed in principle, impossible in practice, which is the most annoying
 * kind of "supported".
 */
const DEFAULT_MAX_VIDEO_BYTES = 20 * 1024 * 1024;

@Injectable()
export class CloudinaryStorage extends StorageService {
  private readonly logger = new Logger(CloudinaryStorage.name);

  private readonly cloudName = process.env.CLOUDINARY_CLOUD_NAME ?? '';
  private readonly apiKey = process.env.CLOUDINARY_API_KEY ?? '';
  private readonly apiSecret = process.env.CLOUDINARY_API_SECRET ?? '';
  private readonly maxBytes = Number(process.env.MAX_UPLOAD_BYTES ?? DEFAULT_MAX_BYTES);
  private readonly maxVideoBytes = Number(
    process.env.MAX_VIDEO_UPLOAD_BYTES ?? DEFAULT_MAX_VIDEO_BYTES,
  );

  /** The ceiling that applies to this file. Video is the only exception. */
  private limitFor(mimetype: string): number {
    return mimetype.startsWith('video/') ? this.maxVideoBytes : this.maxBytes;
  }

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
        `${file.mimetype} files cannot be uploaded. Accepted: photographs (JPEG, PNG, WebP, ` +
          `HEIC), PDF, Word, Excel, PowerPoint, and MP4 or MOV video.`,
      );
    }

    const limit = this.limitFor(file.mimetype);
    if (file.size > limit) {
      const limitMb = (limit / 1024 / 1024).toFixed(0);
      const actualMb = (file.size / 1024 / 1024).toFixed(1);
      throw new BadRequestException(
        `${file.originalname} is ${actualMb} MB, over the ${limitMb} MB limit for ` +
          `${file.mimetype.startsWith('video/') ? 'video' : 'this file type'}. ` +
          (file.mimetype.startsWith('video/')
            ? 'Record a shorter clip, or lower the recording quality in the camera settings.'
            : 'Most phone cameras can be set to a smaller photo size.'),
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

  /**
   * `resourceType` matters now that this account holds more than images.
   *
   * Cloudinary files an upload under `image`, `video` or `raw`, and destroy
   * only works against the right one — deleting a Word document through
   * `/image/destroy` returns "not found" and leaves the asset in place. Upload
   * uses `auto`, which picks for us, so deletion has to try each bucket rather
   * than assume. Cheap: it stops at the first success, and images are first
   * because they are the overwhelming majority.
   */
  async remove(key: string): Promise<void> {
    this.assertConfigured();

    for (const resourceType of ['image', 'raw', 'video'] as const) {
      if (await this.destroy(key, resourceType)) return;
    }

    this.logger.warn(`Could not delete ${key} from Cloudinary in any resource type`);
  }

  private async destroy(key: string, resourceType: string): Promise<boolean> {
    const timestamp = Math.floor(Date.now() / 1000);
    const form = new FormData();
    form.append('public_id', key);
    form.append('api_key', this.apiKey);
    form.append('timestamp', String(timestamp));
    form.append('signature', cloudinarySignature({ public_id: key, timestamp }, this.apiSecret));

    try {
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${this.cloudName}/${resourceType}/destroy`,
        { method: 'POST', body: form },
      );
      if (!response.ok) {
        this.logger.warn(
          `Could not delete ${key} from Cloudinary (${resourceType}): HTTP ${response.status}`,
        );
        return false;
      }
      // Cloudinary answers 200 with { result: 'not found' } for the wrong bucket.
      const body = (await response.json()) as { result?: string };
      return body.result === 'ok';
    } catch (error) {
      // Deliberately swallowed. An orphaned asset costs a few kilobytes; a
      // throw here would stop the database row being deleted, which costs
      // correctness. See the note on StorageService.remove.
      this.logger.warn(`Could not delete ${key} from Cloudinary: ${String(error)}`);
      return false;
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
