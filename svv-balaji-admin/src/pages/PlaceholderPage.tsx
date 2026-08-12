import { Alert, Card, Descriptions, Space, Tag, Typography } from 'antd';
import { useLocation } from 'react-router-dom';
import { ROLE_LABELS } from '../auth/types';
import { findNavItem } from '../layout/navigation';

/**
 * Stand-in for a screen that has not been built yet.
 *
 * It is not filler. Each one states what the screen will do, which API routes
 * it drives, who may see it and which workstream delivers it — so the shell is
 * demonstrable to the client today, and whoever picks up the real screen starts
 * from the contract rather than from the Swagger page.
 */
export function PlaceholderPage() {
  const location = useLocation();
  const item = findNavItem(location.pathname);

  if (!item) {
    return <Alert type="warning" message="No screen is registered for this path." showIcon />;
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Space align="center">
            <Typography.Title level={4} style={{ margin: 0 }}>
              {item.label}
            </Typography.Title>
            <Tag color="orange">Not built yet</Tag>
            <Tag>{item.workstream}</Tag>
          </Space>
          <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
            {item.description}
          </Typography.Paragraph>
        </Space>
      </Card>

      <Card size="small" title="Contract">
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="Visible to">
            <Space size={[4, 4]} wrap>
              <Tag color="blue">{ROLE_LABELS.SUPER_ADMIN}</Tag>
              {item.roles
                .filter((role) => role !== 'SUPER_ADMIN')
                .map((role) => (
                  <Tag key={role}>{ROLE_LABELS[role]}</Tag>
                ))}
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="API routes">
            {item.endpoints.length === 0 ? (
              <Typography.Text type="secondary">Aggregates several — TBD</Typography.Text>
            ) : (
              <Space direction="vertical" size={2}>
                {item.endpoints.map((endpoint) => (
                  <Typography.Text key={endpoint} code>
                    {endpoint}
                  </Typography.Text>
                ))}
              </Space>
            )}
          </Descriptions.Item>
        </Descriptions>
      </Card>
    </Space>
  );
}
