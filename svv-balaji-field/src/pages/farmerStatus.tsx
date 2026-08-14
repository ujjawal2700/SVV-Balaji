import { Tag, Tooltip, Typography } from 'antd';
import type { FarmerStatus } from '@shared/api/types';

export const FARMER_STATUS_LABELS: Record<FarmerStatus, string> = {
  PENDING_VERIFICATION: 'Pending verification',
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  BLACKLISTED: 'Blacklisted',
  SUSPENDED: 'Suspended',
};

const FARMER_STATUS_COLOURS: Record<FarmerStatus, string> = {
  PENDING_VERIFICATION: 'gold',
  ACTIVE: 'green',
  INACTIVE: 'default',
  BLACKLISTED: 'red',
  SUSPENDED: 'orange',
};

export function FarmerStatusTag({ status }: { status: FarmerStatus }) {
  return <Tag color={FARMER_STATUS_COLOURS[status]}>{FARMER_STATUS_LABELS[status]}</Tag>;
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
    <Tooltip title="Issued automatically when the farmer is approved (FRD 8.1)">
      <Typography.Text type="secondary">Not yet issued</Typography.Text>
    </Tooltip>
  );
}
