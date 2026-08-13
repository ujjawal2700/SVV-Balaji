import { InboxOutlined, PaperClipOutlined } from '@ant-design/icons';
import { Alert, App as AntApp, Progress, Space, Typography, Upload } from 'antd';
import type { UploadProps } from 'antd';
import { useState } from 'react';
import { apiErrorMessage } from '../api/client';
import { uploadsApi, type UploadFolder } from '../api/uploads';

/** Mirrors the ALLOWED_MIME set in the backend's cloudinary.storage.ts. */
const ACCEPT = '.jpg,.jpeg,.png,.webp,.heic,.heif,.pdf';
const MAX_MB = 10;

export interface FileUploadFieldProps {
  folder: UploadFolder;
  /** Called with the stored URL once the upload lands. */
  value?: string;
  onChange?: (url: string | undefined) => void;
  /** Shown above the drop area. */
  hint?: string;
  disabled?: boolean;
}

/**
 * The one upload control in the panel.
 *
 * It exists because three endpoints — field visit documents, training materials
 * and harvest inspection documents — take a `fileUrl`, and until now that meant
 * asking the user to upload the file somewhere themselves and paste a link.
 * Nobody standing in a field was ever going to do that, so the feature
 * effectively did not exist.
 *
 * Shaped as a form control (`value` / `onChange`) so antd's Form.Item can drive
 * it directly, which keeps the three call sites to one line each.
 */
export function FileUploadField({
  folder,
  value,
  onChange,
  hint,
  disabled,
}: FileUploadFieldProps) {
  const { message } = AntApp.useApp();
  const [progress, setProgress] = useState<number | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const beforeUpload: UploadProps['beforeUpload'] = (file) => {
    // Checked here as well as on the server, because a 10 MB photograph on a
    // field connection takes long enough that finding out afterwards is its
    // own small disaster.
    if (file.size > MAX_MB * 1024 * 1024) {
      message.error(
        `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB, over the ${MAX_MB} MB limit. ` +
          `Most phone cameras can be set to a smaller photo size.`,
        8,
      );
      return Upload.LIST_IGNORE;
    }
    return true;
  };

  const customRequest: UploadProps['customRequest'] = async (options) => {
    const file = options.file as File;
    setProgress(0);
    setFileName(file.name);

    try {
      const stored = await uploadsApi.upload(folder, file, setProgress);
      onChange?.(stored.url);
      options.onSuccess?.(stored);
      message.success(`${file.name} uploaded`);
    } catch (error) {
      setFileName(null);
      options.onError?.(error as Error);
      message.error(apiErrorMessage(error, 'Could not upload the file'), 8);
    } finally {
      setProgress(null);
    }
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
            <Typography.Link href={value} target="_blank" rel="noreferrer noopener">
              View
            </Typography.Link>
            <Typography.Link
              onClick={() => {
                setFileName(null);
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

  return (
    <Upload.Dragger
      accept={ACCEPT}
      maxCount={1}
      showUploadList={false}
      disabled={disabled || progress !== null}
      beforeUpload={beforeUpload}
      customRequest={customRequest}
    >
      {progress !== null ? (
        <div style={{ padding: 8 }}>
          <Progress percent={progress} size="small" status="active" />
          <Typography.Text type="secondary">Uploading {fileName}…</Typography.Text>
        </div>
      ) : (
        <>
          <p className="ant-upload-drag-icon" style={{ marginBottom: 4 }}>
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">Drop a photo or PDF here, or click to choose</p>
          <p className="ant-upload-hint" style={{ marginBottom: 0 }}>
            {hint ?? `JPEG, PNG, WebP, HEIC or PDF · up to ${MAX_MB} MB`}
          </p>
        </>
      )}
    </Upload.Dragger>
  );
}
