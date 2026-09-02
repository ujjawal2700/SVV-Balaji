import { Alert, Card, Space, Typography } from 'antd';
import type { ReactNode } from 'react';

/**
 * What an unbuilt storefront screen renders.
 *
 * This scaffold is routing and structure only — the screens themselves are the
 * next piece of work. Rather than leave empty files that look finished, each
 * page states which FRD section it owes, what it will do, and anything that has
 * to exist on the server first.
 *
 * Delete this component when the last page is real. If it is still imported
 * somewhere at that point, that page was missed.
 */
export function Placeholder({
  frd,
  title,
  summary,
  blockedBy,
  children,
}: {
  /** e.g. "29.1" — the FRD section this screen implements. */
  frd: string;
  title: string;
  summary: ReactNode;
  /** Anything that must exist before this screen can be built for real. */
  blockedBy?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="store-container">
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            FRD {frd}
          </Typography.Text>
          <Typography.Title level={2} style={{ margin: '4px 0 0' }}>
            {title}
          </Typography.Title>
        </div>

        <Card>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Typography.Paragraph style={{ marginBottom: 0 }}>{summary}</Typography.Paragraph>
            {children}
          </Space>
        </Card>

        {blockedBy ? (
          <Alert type="warning" showIcon message="Needs this first" description={blockedBy} />
        ) : null}

        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          Screen not built yet — this is the WS3.5 scaffold.
        </Typography.Text>
      </Space>
    </div>
  );
}
