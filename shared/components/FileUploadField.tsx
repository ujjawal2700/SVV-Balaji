import {
  CameraOutlined,
  FolderOpenOutlined,
  InboxOutlined,
  PaperClipOutlined,
} from '@ant-design/icons';
import { Alert, App as AntApp, Button, Progress, Space, Typography, Upload } from 'antd';
import type { UploadProps } from 'antd';
import type { ChangeEvent } from 'react';
import { useRef, useState } from 'react';
import { apiErrorMessage } from '../api/client';
import { uploadsApi, type UploadFolder } from '../api/uploads';
import { useIsMobile } from '../hooks/useIsMobile';
import { compressImage, formatBytes } from '../utils/image';

/** Mirrors the ALLOWED_MIME set in the backend's cloudinary.storage.ts. */
const ACCEPT = '.jpg,.jpeg,.png,.webp,.heic,.heif,.pdf';
const MAX_MB = 10;

export interface FileUploadFieldProps {
  folder: UploadFolder;
  /** Called with the stored URL once the upload lands. */
  value?: string;
  onChange?: (url: string | undefined) => void;
  hint?: string;
  disabled?: boolean;
}

/**
 * The one upload control in both apps.
 *
 * -----------------------------------------------------------------------------
 * On a phone this is a camera button, not a drop zone.
 *
 * It used to be an antd Dragger everywhere. "Drop a photo here, or click to
 * choose" is meaningless on a handset, and tapping it opens the file browser -
 * so an executive standing in front of the crop they need to photograph had to
 * leave the app, open the camera, take the photo, come back, and find it in a
 * list. Every one of those steps is a chance to give up.
 *
 * `capture="environment"` on a file input opens the rear camera directly. It is
 * a hint, not a guarantee - a desktop browser ignores it and shows a file
 * picker, which is the right fallback - so the gallery route stays available
 * beside it for photos taken earlier.
 * -----------------------------------------------------------------------------
 *
 * Shaped as a form control (`value` / `onChange`) so antd's Form.Item drives it
 * directly, which keeps every call site to one line.
 */
export function FileUploadField({
  folder,
  value,
  onChange,
  hint,
  disabled,
}: FileUploadFieldProps) {
  const { message } = AntApp.useApp();
  const isMobile = useIsMobile();

  const [progress, setProgress] = useState<number | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const busy = progress !== null;

  /**
   * The whole upload path: check the size, shrink if it is a photo, send.
   *
   * Compression happens BEFORE the size check, because the point is that a
   * 12 MB photo should succeed rather than be rejected - the limit exists to
   * protect the connection, and we have just removed the reason it would have
   * been hit.
   */
  const upload = async (file: File) => {
    setFileName(file.name);
    setSavedNote(null);
    setProgress(0);

    try {
      const result = await compressImage(file);

      if (result.bytes > MAX_MB * 1024 * 1024) {
        message.error(
          `${file.name} is ${formatBytes(result.bytes)}, over the ${MAX_MB} MB limit` +
            (result.compressed ? '' : ` and ${result.reason}`) +
            '. Try a photo taken at a lower resolution.',
          10,
        );
        setProgress(null);
        setFileName(null);
        return;
      }

      if (result.compressed) {
        setSavedNote(`${formatBytes(result.originalBytes)} → ${formatBytes(result.bytes)}`);
      }

      const stored = await uploadsApi.upload(folder, result.file, setProgress);
      onChange?.(stored.url);
      message.success('Photo attached');
    } catch (error) {
      setFileName(null);
      message.error(apiErrorMessage(error, 'Could not upload the file'), 8);
    } finally {
      setProgress(null);
    }
  };

  const onPicked = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared so picking the SAME file twice still fires a change event - which
    // it otherwise does not, and the second attempt after a failed upload
    // silently does nothing.
    event.target.value = '';
    if (file) void upload(file);
  };

  if (value) {
    return (
      <Alert
        type="success"
        showIcon
        icon={<PaperClipOutlined />}
        message={
          <Space size={8} wrap>
            <Typography.Text>{fileName ?? 'File attached'}</Typography.Text>
            {savedNote ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {savedNote}
              </Typography.Text>
            ) : null}
            <Typography.Link href={value} target="_blank" rel="noreferrer noopener">
              View
            </Typography.Link>
            <Typography.Link
              onClick={() => {
                setFileName(null);
                setSavedNote(null);
                onChange?.(undefined);
              }}
            >
              Replace
            </Typography.Link>
          </Space>
        }
      />
    );
  }

  if (busy) {
    return (
      <div style={{ padding: '8px 4px' }}>
        <Progress percent={progress ?? 0} size="small" status="active" />
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          {savedNote ? `Resized ${savedNote} · uploading…` : `Uploading ${fileName}…`}
        </Typography.Text>
      </div>
    );
  }

  if (isMobile) {
    return (
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        {/* Two inputs rather than one, because `capture` cannot be toggled per
            click - the attribute has to be on the element the user activates. */}
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={onPicked}
        />
        <input ref={fileInput} type="file" accept={ACCEPT} hidden onChange={onPicked} />

        <Button
          block
          type="primary"
          size="large"
          icon={<CameraOutlined />}
          disabled={disabled}
          onClick={() => cameraInput.current?.click()}
          style={{ height: 52 }}
        >
          Take a photo
        </Button>

        <Button
          block
          icon={<FolderOpenOutlined />}
          disabled={disabled}
          onClick={() => fileInput.current?.click()}
        >
          Choose an existing file
        </Button>

        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {hint ?? 'Photos are resized before sending, so this works on a weak signal.'}
        </Typography.Text>
      </Space>
    );
  }

  return (
    <Upload.Dragger
      accept={ACCEPT}
      maxCount={1}
      showUploadList={false}
      disabled={disabled}
      beforeUpload={((file: File) => {
        void upload(file);
        // Handled entirely above - returning false stops antd from also
        // uploading it through its own request path.
        return false;
      }) as UploadProps['beforeUpload']}
    >
      <p className="ant-upload-drag-icon" style={{ marginBottom: 4 }}>
        <InboxOutlined />
      </p>
      <p className="ant-upload-text">Drop a photo or PDF here, or click to choose</p>
      <p className="ant-upload-hint" style={{ marginBottom: 0 }}>
        {hint ?? `JPEG, PNG, WebP, HEIC or PDF · up to ${MAX_MB} MB, resized automatically`}
      </p>
    </Upload.Dragger>
  );
}
