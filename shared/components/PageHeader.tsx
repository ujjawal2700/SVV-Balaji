import { Space, Typography } from 'antd';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Primary actions, right-aligned. Wrap role-gated ones in <Can>. */
  actions?: ReactNode;
  /** Alias for actions for backward compatibility */
  extra?: ReactNode;
}

export function PageHeader({ title, subtitle, actions, extra }: PageHeaderProps) {
  const rightContent = actions ?? extra;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
        marginBottom: 16,
      }}
    >
      <div>
        <Typography.Title level={4} className="page-title">
          {title}
        </Typography.Title>
        {subtitle ? (
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
            {subtitle}
          </Typography.Text>
        ) : null}
      </div>
      {rightContent ? <Space wrap>{rightContent}</Space> : null}
    </div>
  );
}
