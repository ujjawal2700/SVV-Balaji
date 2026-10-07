import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App as AntApp, Button, Card, Descriptions, Input, Modal, Space, Table, Tabs, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { affiliatesApi, type PayoutDueRow, type PayoutRow } from '@shared/api/affiliates';
import { apiErrorMessage } from '@shared/api/client';
import { useCan } from '@shared/auth/useCan';
import { PageHeader } from '@shared/components/PageHeader';
import { EM_DASH, formatCurrency, formatDate, formatDateTime } from '@shared/utils/format';

const { Text } = Typography;

/**
 * Month-end payout run. Lists affiliates whose commission has matured (past the
 * hold window, order delivered, no open return), net of any clawback for items
 * returned after an earlier payout. Money is sent outside the system (UPI /
 * bank); "Mark paid" records it against the transfer reference.
 */
export function AffiliatePayoutsPage() {
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader title="Affiliate Payouts" subtitle="Matured commission ready to pay, and every payout made." />
      <Tabs items={[
        { key: 'due', label: 'Ready to pay', children: <Due /> },
        { key: 'history', label: 'Payout history', children: <History /> },
      ]} />
    </Space>
  );
}

function payTo(a: PayoutDueRow) {
  return a.payoutMethod === 'UPI'
    ? `UPI ${a.payoutUpiId ?? EM_DASH}`
    : `${a.payoutBankName ?? 'Bank'} · ${a.payoutAccountName ?? ''} · A/c ${a.payoutAccountNumber ?? EM_DASH} · ${a.payoutIfsc ?? ''}`;
}

function Due() {
  const canPay = useCan('AFFILIATE_PAYOUTS_PAY');
  const q = useQuery({ queryKey: ['affiliate-payouts', 'due'], queryFn: affiliatesApi.payoutsDue });
  const [paying, setPaying] = useState<PayoutDueRow | null>(null);
  const total = (q.data?.data ?? []).reduce((n, r) => n + r.balances.payable, 0);

  const columns: ColumnsType<PayoutDueRow> = [
    { title: 'Affiliate', key: 'a', render: (_, a) => <div><Text strong>{a.fullName}</Text> <Tag>{a.code}</Tag>{a.status !== 'APPROVED' ? <Tag color="volcano">{a.status}</Tag> : null}<div style={{ fontSize: 12, color: '#78716c' }}>{a.phone}</div></div> },
    { title: 'Pay to', key: 'to', render: (_, a) => (a.payoutDetailsComplete ? payTo(a) : <Tag color="red">Payout details missing</Tag>) },
    { title: 'Items', dataIndex: 'commissionCount', align: 'right' },
    { title: 'Matured since', dataIndex: 'oldestApprovedAt', render: formatDate },
    { title: 'Matured', key: 'gross', align: 'right', render: (_, a) => formatCurrency(a.balances.approvedGross) },
    {
      title: 'Clawback', key: 'claw', align: 'right',
      render: (_, a) => (a.balances.clawbackDue ? <Tooltip title="Commission on items returned after an earlier payout">−{formatCurrency(a.balances.clawbackDue)}</Tooltip> : EM_DASH),
    },
    { title: 'To pay', key: 'net', align: 'right', render: (_, a) => <Text strong>{formatCurrency(a.balances.payable)}</Text> },
    {
      title: '', key: 'act',
      render: (_, a) => (canPay ? <Button type="primary" size="small" disabled={!a.payoutDetailsComplete} onClick={() => setPaying(a)}>Mark paid</Button> : null),
    },
  ];
  return (
    <Card>
      <Space style={{ marginBottom: 12 }} wrap>
        <Text>Total due: <Text strong>{formatCurrency(total)}</Text></Text>
        <Text type="secondary">Minimum payout {formatCurrency(q.data?.minPayoutAmount ?? 0)} · commission on hold or with an open return is not included.</Text>
      </Space>
      <Table rowKey="id" size="middle" loading={q.isLoading} dataSource={q.data?.data ?? []} columns={columns} scroll={{ x: 1000 }} locale={{ emptyText: 'Nobody is owed a payout right now' }} />
      <PayModal row={paying} onClose={() => setPaying(null)} />
    </Card>
  );
}

function PayModal({ row, onClose }: { row: PayoutDueRow | null; onClose: () => void }) {
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  if (!row) return null;
  const pay = async () => {
    setBusy(true);
    try {
      const p = await affiliatesApi.pay({ affiliateId: row.id, reference: reference.trim(), expectedNetAmount: row.balances.payable, note: note.trim() || undefined });
      message.success(`${p.payoutNumber}: ${formatCurrency(p.netAmount)} recorded for ${row.fullName}`);
      void qc.invalidateQueries({ queryKey: ['affiliate-payouts'] });
      void qc.invalidateQueries({ queryKey: ['affiliates'] });
      setReference('');
      setNote('');
      onClose();
    } catch (e) {
      message.error(apiErrorMessage(e, 'Could not record the payout'), 8);
      void qc.invalidateQueries({ queryKey: ['affiliate-payouts', 'due'] });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open title={`Pay ${row.fullName}`} okText={`Record ${formatCurrency(row.balances.payable)} as paid`} onCancel={onClose} onOk={pay}
      okButtonProps={{ disabled: reference.trim().length < 4, loading: busy }}>
      <Alert type="info" showIcon style={{ marginBottom: 12 }} message="Send the money first (UPI / bank), then record the transaction reference here." />
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="Pay to">{payTo(row)}</Descriptions.Item>
        <Descriptions.Item label="Matured commission">{formatCurrency(row.balances.approvedGross)} ({row.commissionCount} items)</Descriptions.Item>
        {row.balances.clawbackDue ? <Descriptions.Item label="Less clawback">−{formatCurrency(row.balances.clawbackDue)}</Descriptions.Item> : null}
        <Descriptions.Item label="Amount to send"><Text strong>{formatCurrency(row.balances.payable)}</Text></Descriptions.Item>
      </Descriptions>
      <Input style={{ marginTop: 12 }} placeholder="UTR / UPI transaction reference" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} />
      <Input.TextArea style={{ marginTop: 8 }} rows={2} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
    </Modal>
  );
}

function History() {
  const q = useQuery({ queryKey: ['affiliate-payouts', 'history'], queryFn: () => affiliatesApi.payouts() });
  const columns: ColumnsType<PayoutRow> = [
    { title: 'Payout', dataIndex: 'payoutNumber', render: (v: string) => <Text strong>{v}</Text> },
    { title: 'Paid', dataIndex: 'paidAt', render: formatDateTime },
    { title: 'Affiliate', key: 'a', render: (_, p) => <span>{p.affiliateName} <Tag>{p.affiliateCode}</Tag></span> },
    { title: 'Paid to', dataIndex: 'paidTo' },
    { title: 'Reference', dataIndex: 'reference' },
    { title: 'Items', dataIndex: 'commissionCount', align: 'right' },
    { title: 'Gross', dataIndex: 'grossAmount', align: 'right', render: formatCurrency },
    { title: 'Clawback', dataIndex: 'clawbackAmount', align: 'right', render: (v: number) => (v ? `−${formatCurrency(v)}` : EM_DASH) },
    { title: 'Net paid', dataIndex: 'netAmount', align: 'right', render: (v: number) => <Text strong>{formatCurrency(v)}</Text> },
  ];
  return (
    <Card>
      <Table rowKey="id" size="middle" loading={q.isLoading} dataSource={q.data ?? []} columns={columns} scroll={{ x: 1000 }} locale={{ emptyText: 'No payouts yet' }} />
    </Card>
  );
}
