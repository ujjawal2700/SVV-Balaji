import type { ReactNode } from 'react';
import { Card, Space, Typography } from 'antd';

const { Text } = Typography;

/**
 * Icon + label/value row used in profile "contact info" cards. Pulls its type
 * and colour from the shared `page-*` classes in styles.css, not inline
 * styles, so this look changes everywhere at once when that file changes.
 * Shared between CustomerDetailPage and RetailerDetailPage - keep them in
 * sync by editing here, not by copy-pasting into each page.
 */
export function InfoRow({ icon, label, value, extra }: { icon: ReactNode; label: string; value: ReactNode; extra?: ReactNode }) {
  return (
    <Space align="start" size={14}>
      <div className="page-icon-badge page-icon-badge--neutral">{icon}</div>
      <Space direction="vertical" size={1}>
        <Text className="page-field-label">{label}</Text>
        <Space size={6}>
          <Text className="page-field-value">{value}</Text>
          {extra}
        </Space>
      </Space>
    </Space>
  );
}

/** One of the top-row stat cards on a profile page (orders, LTV, credit, etc.). */
export function StatCard({
  icon,
  tone,
  label,
  value,
}: {
  icon: ReactNode;
  tone: 'slate' | 'green' | 'amber' | 'pink' | 'blue' | 'red';
  label: string;
  value: ReactNode;
}) {
  return (
    <Card bodyStyle={{ padding: '16px 20px' }} className="page-card">
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <div className={`page-icon-badge page-icon-badge--${tone}`} style={{ width: 36, height: 36, borderRadius: 10 }}>
          {icon}
        </div>
        <Text className="page-field-label">{label}</Text>
        <Text className="page-stat-value">{value}</Text>
      </Space>
    </Card>
  );
}
