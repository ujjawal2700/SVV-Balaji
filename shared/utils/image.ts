/**
 * Client-side photo downscaling, for uploads from a phone in a field.
 *
 * -----------------------------------------------------------------------------
 * Why this exists.
 *
 * A photo from a current handset is 3000-4000px wide and 4-8 MB. Three of those
 * on a harvest inspection is 20 MB over rural mobile data - minutes of upload,
 * or a timeout, and the executive has already walked away. Meanwhile nothing
 * downstream needs that resolution: these images are evidence of crop condition
 * and KYC documents, viewed on a laptop screen and printed at most at A4.
 *
 * 1920px on the long edge at quality 0.8 puts a typical crop photo at
 * 250-500 KB. That is 10-20x less data for no practical loss, and it is the
 * difference between an upload that works on one bar and one that does not.
 * -----------------------------------------------------------------------------
 */

/** Long edge, in pixels, after downscaling. */
const MAX_DIMENSION = 1920;

/** JPEG quality. 0.8 is the usual knee - past it, size climbs faster than quality. */
const QUALITY = 0.8;

/** Below this, compressing costs more in time than it saves in bytes. */
const SKIP_BELOW_BYTES = 400 * 1024;

export interface CompressionResult {
  file: File;
  /** Bytes before, so the UI can show what it saved. */
  originalBytes: number;
  bytes: number;
  /** False when the original was returned untouched, with the reason. */
  compressed: boolean;
  reason?: string;
}

/**
 * Downscale an image file, or return it unchanged with a reason.
 *
 * Never throws. A failure here must not stop an upload - the server accepts the
 * original perfectly well, it is just bigger. Falling back silently is right;
 * refusing to upload because we could not shrink it would not be.
 */
export async function compressImage(file: File): Promise<CompressionResult> {
  const originalBytes = file.size;
  const unchanged = (reason: string): CompressionResult => ({
    file,
    originalBytes,
    bytes: originalBytes,
    compressed: false,
    reason,
  });

  if (!file.type.startsWith('image/')) return unchanged('not an image');
  if (file.size <= SKIP_BELOW_BYTES) return unchanged('already small');

  try {
    /**
     * `imageOrientation: 'from-image'` applies the EXIF rotation flag while
     * decoding. Without it, a photo taken in portrait comes out sideways -
     * canvas drops EXIF, so the orientation has to be resolved here or it is
     * lost for good.
     */
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });

    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      return unchanged('no canvas context');
    }

    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', QUALITY),
    );
    if (!blob) return unchanged('encoding failed');

    // A photo that is already well compressed can come out LARGER after a
    // re-encode. Keep whichever is smaller rather than assuming we helped.
    if (blob.size >= originalBytes) return unchanged('original was already smaller');

    const renamed = file.name.replace(/\.(heic|heif|png|webp)$/i, '.jpg');
    return {
      file: new File([blob], renamed, { type: 'image/jpeg', lastModified: file.lastModified }),
      originalBytes,
      bytes: blob.size,
      compressed: true,
    };
  } catch {
    /**
     * Most often HEIC on Android or desktop Chrome, which cannot decode it.
     * Safari can, so an iPhone gets compression and an Android phone shooting
     * HEIC does not - it uploads the original, which the server accepts.
     */
    return unchanged('this format cannot be resized in the browser');
  }
}

/** "4.2 MB", "380 KB" - for telling the user what happened. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}
