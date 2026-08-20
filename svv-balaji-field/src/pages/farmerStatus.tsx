import { Tooltip, Typography } from 'antd';
import type { FarmerStatus } from '@shared/api/types';

export const FARMER_STATUS_LABELS: Record<FarmerStatus, string> = {
  PENDING_VERIFICATION: 'Pending verification',
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  BLACKLISTED: 'Blacklisted',
  SUSPENDED: 'Suspended',
};

const FARMER_STATUS_STYLES: Record<FarmerStatus, { bg: string; color: string; border: string }> = {
  PENDING_VERIFICATION: { bg: '#fef3c7', color: '#b45309', border: '#fde68a' }, // Soft Amber
  ACTIVE: { bg: '#d1fae5', color: '#047857', border: '#a7f3d0' }, // Light Green / Emerald
  INACTIVE: { bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' },
  BLACKLISTED: { bg: '#fee2e2', color: '#b91c1c', border: '#fecaca' },
  SUSPENDED: { bg: '#ffedd5', color: '#c2410c', border: '#fed7aa' },
};

export function FarmerStatusTag({ status }: { status: FarmerStatus }) {
  const style = FARMER_STATUS_STYLES[status] || FARMER_STATUS_STYLES.INACTIVE;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        background: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`,
      }}
    >
      {FARMER_STATUS_LABELS[status]}
    </span>
  );
}

/**
 * The traceability code, or an explicit "not yet issued".
 *
 * Never render an empty cell here. `farmerCode` is null until approval by
 * design (FRD 8.1) - a blank would read as missing data rather than as a farmer
 * who has not been approved, and this column is the anchor of the whole
 * farm-to-fork chain.
 */
export function FarmerCodeCell({ code }: { code: string | null }) {
  if (code) {
    return <Typography.Text code>{code}</Typography.Text>;
  }

  return (
    <Tooltip title="Issued automatically when the farmer is approved ">
      <Typography.Text type="secondary">Not yet issued</Typography.Text>
    </Tooltip>
  );
}
