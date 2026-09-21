import { Tag } from 'antd';
import type { BatchHoldStatus } from '@shared/api/types';

const LABELS: Record<BatchHoldStatus, { color: string; text: string }> = {
  ACTIVE: { color: 'green', text: 'Active' },
  ON_HOLD: { color: 'orange', text: 'On hold' },
  RECALLED: { color: 'red', text: 'Recalled' },
};

/** One rendering of a batch's sale status, shared by the trace and recall screens. */
export function HoldTag({ status }: { status: BatchHoldStatus }) {
  const { color, text } = LABELS[status];
  return <Tag color={color}>{text}</Tag>;
}
