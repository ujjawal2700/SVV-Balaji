import { FileDoneOutlined, PrinterOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, App as AntApp, Button, Empty, Space, Spin, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { apiErrorMessage } from '@shared/api/client';
import { invoicesApi } from '@shared/api/invoices';
import { useCan } from '@shared/auth/useCan';
import { useIssueInvoice, useOrderInvoices, useRetryEInvoice } from '@shared/hooks/useInvoices';
import { formatCurrency, formatDate } from '@shared/utils/format';
import { printTaxInvoice } from '@shared/utils/taxInvoicePrint';
import { EInvoiceTag } from './invoiceTags';

const { Text } = Typography;
const SUPPLIED = ['DISPATCHED', 'DELIVERED'];

/**
 * The order's real GST tax invoice(s). Issued by the server at dispatch; this
 * panel prints it, and lets staff raise one for an order dispatched before
 * invoicing was set up.
 */
export function OrderInvoicePanel({ orderId, status }: { orderId: string; status: string }) {
  const { message } = AntApp.useApp();
  const canIssue = useCan('INVOICES_ISSUE');
  const q = useOrderInvoices(orderId);
  const issue = useIssueInvoice();
  const retry = useRetryEInvoice();

  const print = async (id: string) => {
    try {
      const inv = await invoicesApi.get(id);
      if (!printTaxInvoice(inv)) message.warning('Allow pop-ups for this site to print the invoice');
    } catch (e) {
      message.error(apiErrorMessage(e, 'Could not load the invoice'));
    }
  };

  if (q.isLoading) return <Spin />;
  if (q.error) return <Alert type="error" showIcon message={apiErrorMessage(q.error, 'Could not load invoices')} />;

  const rows = q.data ?? [];
  const live = rows.find((r) => r.status === 'ISSUED');
  const supplied = SUPPLIED.includes(status);

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {!live ? (
        <Empty
          image={<FileDoneOutlined style={{ fontSize: 40, color: '#94a3b8' }} />}
          description={supplied
            ? 'No tax invoice yet. It is issued automatically at dispatch once GST Settings are complete.'
            : 'The GST tax invoice is issued when this order is dispatched.'}
        >
          {supplied && canIssue ? (
            <Button
              type="primary"
              loading={issue.isPending}
              onClick={async () => {
                try {
                  const inv = await issue.mutateAsync(orderId);
                  message.success(`Invoice ${inv.invoiceNumber} issued`);
                } catch (e) {
                  message.error(apiErrorMessage(e, 'Could not issue the invoice'), 8);
                }
              }}
            >
              Issue tax invoice
            </Button>
          ) : null}
        </Empty>
      ) : null}

      {rows.map((r) => (
        <div key={r.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px', opacity: r.status === 'CANCELLED' ? 0.6 : 1 }}>
          <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
            <div>
              <Link to={`/invoices?open=${r.id}`} style={{ fontWeight: 700 }}>{r.invoiceNumber}</Link>
              <div><Text type="secondary" style={{ fontSize: 12 }}>{formatDate(r.invoiceDate)} · {r.supplyType} · {formatCurrency(r.grandTotal)}</Text></div>
            </div>
            <Space wrap>
              {r.status === 'CANCELLED' ? <Tag color="red">Cancelled</Tag> : <EInvoiceTag status={r.eInvoiceStatus} />}
              {r.status === 'ISSUED' && r.eInvoiceStatus === 'FAILED' && canIssue ? (
                <Button size="small" icon={<ReloadOutlined />} loading={retry.isPending}
                  onClick={() => retry.mutateAsync(r.id).catch((e) => message.error(apiErrorMessage(e, 'Retry failed')))}>
                  Retry IRN
                </Button>
              ) : null}
              <Button size="small" icon={<PrinterOutlined />} onClick={() => void print(r.id)}>Print</Button>
            </Space>
          </Space>
          {r.status === 'ISSUED' && r.eInvoiceError ? (
            <Alert style={{ marginTop: 8 }} type="warning" showIcon message="E-invoice needs attention" description={r.eInvoiceError} />
          ) : null}
        </div>
      ))}
    </Space>
  );
}
