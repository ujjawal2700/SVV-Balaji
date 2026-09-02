import { FileExcelOutlined, FilePdfOutlined, FilePptOutlined, FileWordOutlined, PaperClipOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { Image, Space, Tag, Typography } from 'antd';

/**
 * An uploaded file, shown as the thing it is.
 *
 * Both the training materials list and the visit documents list previously
 * rendered every attachment as a tag plus the raw storage URL as link text. So
 * an uploaded photograph never appeared anywhere: the upload field showed it
 * briefly, then the form reset and the photo became a 120-character Cloudinary
 * URL in a list. "I uploaded an image and it doesn't show" was exactly right.
 *
 * Images now render as a thumbnail that opens full size on click; video gets a
 * playable element; documents get their own icon and a readable filename rather
 * than the URL they happen to live at.
 */

/** The last path segment, minus Cloudinary's cache-busting version prefix. */
function filenameFrom(url: string): string {
  try {
    const path = new URL(url).pathname;
    const last = path.split('/').filter(Boolean).pop() ?? url;
    return decodeURIComponent(last);
  } catch {
    return url.split('/').pop() ?? url;
  }
}

const looksLikeImage = (url: string, fileType?: string) =>
  fileType === 'image' || fileType === 'photo' || /\.(jpe?g|png|webp|heic|heif)(\?|$)/i.test(url);

const looksLikeVideo = (url: string, fileType?: string) =>
  fileType === 'video' || /\.(mp4|mov)(\?|$)/i.test(url);

function DocumentIcon({ url }: { url: string }) {
  if (/\.pdf(\?|$)/i.test(url)) return <FilePdfOutlined style={{ fontSize: 22, color: '#cf1322' }} />;
  if (/\.(docx?)(\?|$)/i.test(url)) return <FileWordOutlined style={{ fontSize: 22, color: '#1554ad' }} />;
  if (/\.(xlsx?)(\?|$)/i.test(url)) return <FileExcelOutlined style={{ fontSize: 22, color: '#237804' }} />;
  if (/\.(pptx?)(\?|$)/i.test(url)) return <FilePptOutlined style={{ fontSize: 22, color: '#d46b08' }} />;
  return <PaperClipOutlined style={{ fontSize: 22, color: '#8c8c8c' }} />;
}

export function AttachmentPreview({
  url,
  fileType,
  /** Thumbnail edge in px. */
  size = 64,
}: {
  url: string;
  fileType?: string;
  size?: number;
}) {
  const name = filenameFrom(url);

  if (looksLikeImage(url, fileType)) {
    return (
      <Space align="start">
        {/* antd's Image gives click-to-zoom and a broken-image fallback for
            free, which matters here: a dead storage URL should look dead
            rather than render as an empty box. */}
        <Image
          src={url}
          alt={name}
          width={size}
          height={size}
          style={{ objectFit: 'cover', borderRadius: 6 }}
          preview={{ src: url }}
          fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect width='64' height='64' fill='%23f5f5f5'/%3E%3Ctext x='32' y='36' font-size='9' text-anchor='middle' fill='%23999'%3Emissing%3C/text%3E%3C/svg%3E"
        />
        <Space direction="vertical" size={0}>
          <Tag>{fileType ?? 'image'}</Tag>
          <Typography.Text type="secondary" style={{ fontSize: 12 }} ellipsis>
            {name}
          </Typography.Text>
        </Space>
      </Space>
    );
  }

  if (looksLikeVideo(url, fileType)) {
    return (
      <Space align="start">
        <video
          src={url}
          controls
          preload="metadata"
          style={{ width: size * 2.4, height: size, borderRadius: 6, background: '#000' }}
        />
        <Space direction="vertical" size={0}>
          <Tag icon={<PlayCircleOutlined />}>{fileType ?? 'video'}</Tag>
          <Typography.Text type="secondary" style={{ fontSize: 12 }} ellipsis>
            {name}
          </Typography.Text>
        </Space>
      </Space>
    );
  }

  return (
    <Space align="center">
      <DocumentIcon url={url} />
      <Space direction="vertical" size={0}>
        <Tag>{fileType ?? 'file'}</Tag>
        <Typography.Link
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          style={{ fontSize: 13 }}
        >
          {name}
        </Typography.Link>
      </Space>
    </Space>
  );
}
