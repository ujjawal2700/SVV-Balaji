/**
 * The storage seam.
 *
 * Cloudinary is what we use today (14 Aug 2026) so that the field executive
 * work is not held up waiting on Decision 3 / A-04. That decision is about
 * where SVV Balaji's files live permanently, and it is still open — so the
 * thing that matters here is that answering it later is a new class in this
 * folder and one line in `uploads.module.ts`, not a change anywhere else in
 * the codebase.
 *
 * Nothing outside this folder knows what the provider is. The three existing
 * document endpoints keep taking the `fileUrl` string they always took.
 */

export interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface StoredFile {
  /** Absolute, publicly fetchable. This is what goes into `fileUrl`. */
  url: string;
  /** Provider-side identifier, kept so the asset can be deleted later. */
  key: string;
  mimeType: string;
  bytes: number;
  /** Present for images. Useful for rendering without a layout shift. */
  width?: number;
  height?: number;
}

/**
 * Folders exist so assets can be found, retention-policied and cleaned up per
 * purpose rather than as one undifferentiated bucket. They map to the three
 * places the API already accepts a `fileUrl`.
 */
export const UPLOAD_FOLDERS = {
  'field-visits': 'svv-balaji/field-visits',
  training: 'svv-balaji/training-materials',
  inspections: 'svv-balaji/harvest-inspections',
  farmers: 'svv-balaji/farmer-documents',
} as const;

export type UploadFolder = keyof typeof UPLOAD_FOLDERS;

export abstract class StorageService {
  abstract put(file: UploadedFileLike, folder: UploadFolder): Promise<StoredFile>;

  /**
   * Best-effort. A failure here is logged rather than thrown: an orphaned
   * asset costs storage, whereas a failed delete that blocks the database row
   * from going away costs correctness.
   */
  abstract remove(key: string): Promise<void>;
}
