import { Tag, Tooltip, Typography } from 'antd';
import type { FarmerStatus } from '../../api/types';

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
  return (
    <Tag
      color={FARMER_STATUS_COLOURS[status] ?? 'default'}
      style={{
        borderRadius: 12,
        padding: '2px 10px',
        fontWeight: 500,
        fontSize: 12,
      }}
    >
      {FARMER_STATUS_LABELS[status]}
    </Tag>
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
    return (
      <Typography.Text
        code
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: '#1d39c4',
          background: '#f0f5ff',
          padding: '3px 8px',
          borderRadius: 6,
          border: '1px solid #d6e4ff',
        }}
      >
        {code}
      </Typography.Text>
    );
  }

  return (
    <Tooltip title="Issued automatically when the farmer is approved (FRD 8.1)">
      <Tag
        style={{
          borderRadius: 12,
          color: '#8c8c8c',
          background: '#fafafa',
          border: '1px dashed #d9d9d9',
          padding: '2px 8px',
          fontSize: 12,
        }}
      >
        Not yet issued
      </Tag>
    </Tooltip>
  );
}
