import { Tag, Typography } from 'antd';
import type { PurchaseOrderStatus } from '../../../../shared/api/purchaseOrders';

export const PO_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  DRAFT: 'Draft',
  CONFIRMED: 'Confirmed',
  PARTIALLY_FULFILLED: 'Partially Fulfilled',
  FULFILLED: 'Fulfilled',
  CANCELLED: 'Cancelled',
};

export const PO_STATUS_COLORS: Record<PurchaseOrderStatus, string> = {
  DRAFT: 'default',
  CONFIRMED: 'blue',
  PARTIALLY_FULFILLED: 'orange',
  FULFILLED: 'green',
  CANCELLED: 'red',
};

export function PurchaseOrderStatusTag({ status }: { status: PurchaseOrderStatus }) {
  return (
    <Tag color={PO_STATUS_COLORS[status]}>
      {PO_STATUS_LABELS[status]}
    </Tag>
  );
}

export function PurchaseOrderCodeCell({ code }: { code: string }) {
  return <Typography.Text strong copyable={{ text: code }}>{code}</Typography.Text>;
}
