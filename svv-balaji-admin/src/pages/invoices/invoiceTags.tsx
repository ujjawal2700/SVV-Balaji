import { Tag, Tooltip } from 'antd';
import { EINVOICE_STATUS_LABEL, type EInvoiceStatus } from '@shared/api/invoices';

const COLOR: Record<EInvoiceStatus, string> = {
  NOT_APPLICABLE: 'default',
  PENDING: 'processing',
  GENERATED: 'green',
  FAILED: 'orange',
  CANCELLED: 'red',
};

/** E-invoice (IRN) state. "Not required" covers B2C and e-invoicing switched off. */
export function EInvoiceTag({ status, error }: { status: EInvoiceStatus; error?: string | null }) {
  const tag = <Tag color={COLOR[status]} style={{ margin: 0 }}>{EINVOICE_STATUS_LABEL[status]}</Tag>;
  return error ? <Tooltip title={error}>{tag}</Tooltip> : tag;
}
