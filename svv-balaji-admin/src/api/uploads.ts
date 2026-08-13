import { api } from './client';
import { unwrap } from './envelope';

/** Mirrors UPLOAD_FOLDERS in the backend's storage.service.ts. */
export type UploadFolder = 'field-visits' | 'training' | 'inspections' | 'farmers';

export interface StoredFile {
  /** Absolute and publicly fetchable. This is what goes into `fileUrl`. */
  url: string;
  /** Provider-side identifier, kept so the asset can be deleted later. */
  key: string;
  mimeType: string;
  bytes: number;
  width?: number;
  height?: number;
}

export const uploadsApi = {
  /**
   * Sends the file to our own API, which signs and forwards it to the file
   * store. Deliberately not a direct browser-to-Cloudinary upload: that needs
   * an unsigned preset, which is a public write endpoint on the media account
   * that anyone reading the bundle can post to.
   *
   * `Content-Type` is left unset on purpose — the browser has to set it itself
   * so it can append the multipart boundary. Passing the axios default of
   * `application/json` here produces a request the server cannot parse, and the
   * error it gives back does not point at the cause.
   */
  async upload(
    folder: UploadFolder,
    file: File,
    onProgress?: (percent: number) => void,
  ): Promise<StoredFile> {
    const body = new FormData();
    body.append('file', file);

    const response = await api.post<StoredFile>(`/uploads/${folder}`, body, {
      headers: { 'Content-Type': undefined },
      onUploadProgress: (event) => {
        if (!onProgress || !event.total) return;
        onProgress(Math.round((event.loaded / event.total) * 100));
      },
    });

    return unwrap<StoredFile>(response.data);
  },
};
