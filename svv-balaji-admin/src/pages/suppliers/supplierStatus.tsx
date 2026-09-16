import { Tag, Typography } from 'antd';
import type { SupplierStatus } from '../../../../shared/api/suppliers';

export const SUPPLIER_STATUS_LABELS: Record<SupplierStatus, string> = {
  PENDING_VERIFICATION: 'Pending Verification',
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  BLACKLISTED: 'Blacklisted',
  SUSPENDED: 'Suspended',
};

export const SUPPLIER_STATUS_COLORS: Record<SupplierStatus, string> = {
  PENDING_VERIFICATION: 'warning',
  ACTIVE: 'success',
  INACTIVE: 'default',
  BLACKLISTED: 'error',
  SUSPENDED: 'error',
};

export function SupplierStatusTag({ status }: { status: SupplierStatus }) {
  return (
    <Tag color={SUPPLIER_STATUS_COLORS[status]}>
      {SUPPLIER_STATUS_LABELS[status]}
    </Tag>
  );
}

export function SupplierCodeCell({ code }: { code: string | null }) {
  if (!code) {
    return <Typography.Text type="secondary">Pending approval</Typography.Text>;
  }
  return <Typography.Text strong copyable>{code}</Typography.Text>;
}
