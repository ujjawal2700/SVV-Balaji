import { Tag, Typography } from 'antd';
import type { TransportStatus } from '../../../../shared/api/transports';

export const TRANSPORT_STATUS_LABELS: Record<TransportStatus, string> = {
  SCHEDULED: 'Scheduled',
  IN_TRANSIT: 'In Transit',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

export const TRANSPORT_STATUS_COLORS: Record<TransportStatus, string> = {
  SCHEDULED: 'blue',
  IN_TRANSIT: 'gold',
  DELIVERED: 'green',
  CANCELLED: 'red',
};

export function TransportStatusTag({ status }: { status: TransportStatus }) {
  return (
    <Tag color={TRANSPORT_STATUS_COLORS[status]}>
      {TRANSPORT_STATUS_LABELS[status]}
    </Tag>
  );
}

export function TransportCodeCell({ id }: { id: string }) {
  const shortCode = `TR-${id.slice(0, 8).toUpperCase()}`;
  return <Typography.Text strong copyable={{ text: id }}>{shortCode}</Typography.Text>;
}
