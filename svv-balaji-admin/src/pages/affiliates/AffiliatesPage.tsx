import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App as AntApp, Badge, Button, Card, Descriptions, Drawer, Input, Modal, Select, Space, Table, Tabs, Tag, Tooltip, Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import {
  AFFILIATE_STATUS_COLOR, affiliatesApi, COMMISSION_STATUS_COLOR, COMMISSION_STATUS_LABEL, FRAUD_REASON_LABEL, type AffiliateListRow, type AffiliateStatus,
  type AttributionRow, type CommissionRow, type CommissionStatus,
} from '@shared/api/affiliates';
import { apiErrorMessage } from '@shared/api/client';
import { useCan } from '@shared/auth/useCan';
import { PageHeader } from '@shared/components/PageHeader';
import { EM_DASH, formatCurrency, formatDate, formatDateTime } from '@shared/utils/format';

const { Text } = Typography;

/**
 * Super Admin: affiliate applications (approve / reject), every affiliate with
 * clicks, orders and balances, the per-item commission ledger, and orders the
 * self-referral check flagged as fraud.
 */
export function AffiliatesPage() {
  const pending = useQuery({ queryKey: ['affiliates', 'list', 'PENDING', ''], queryFn: () => affiliatesApi.list({ status: 'PENDING' }) });
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader title="Affiliate Program" subtitle="Applications, affiliates, per-item commission and the self-referral log." />
      <Tabs
        items={[
          { key: 'applications', label: <Badge count={pending.data?.length ?? 0} size="small" offset={[10, 0]}>Applications</Badge>, children: <AffiliateTable fixedStatus="PENDING" /> },
          { key: 'affiliates', label: 'All affiliates', children: <AffiliateTable /> },
          { key: 'commissions', label: 'Commission ledger', children: <CommissionLedger /> },
          { key: 'fraud', label: 'Fraud log', children: <FraudLog /> },
        ]}
      />
    </Space>
  );
}

function AffiliateTable({ fixedStatus }: { fixedStatus?: AffiliateStatus }) {
  const [status, setStatus] = useState<AffiliateStatus | undefined>(fixedStatus);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<AffiliateListRow | null>(null);
  const q = useQuery({ queryKey: ['affiliates', 'list', status ?? 'ALL', search], queryFn: () => affiliatesApi.list({ status, search: search || undefined }) });

  const columns: ColumnsType<AffiliateListRow> = [
    {
      title: 'Affiliate', key: 'name',
      render: (_, a) => (
        <div>
          <Text strong>{a.fullName}</Text> <Tag>{a.code}</Tag>
          <div style={{ fontSize: 12, color: '#78716c' }}>{a.phone}{a.email ? ` · ${a.email}` : ''}</div>
        </div>
      ),
    },
    { title: 'Status', dataIndex: 'status', render: (s: AffiliateStatus) => <Tag color={AFFILIATE_STATUS_COLOR[s]}>{s}</Tag> },
    { title: 'Promotes on', dataIndex: 'promotionUrl', ellipsis: true, render: (v: string | null) => v ?? EM_DASH },
    { title: 'Clicks', dataIndex: 'clicks', align: 'right' },
    {
      title: 'Orders', key: 'orders', align: 'right',
      render: (_, a) => <>{a.successfulOrders}{a.flaggedOrders ? <Tooltip title="Flagged as self-referral"> <Tag color="red">{a.flaggedOrders} flagged</Tag></Tooltip> : null}</>,
    },
    { title: 'On hold', key: 'pending', align: 'right', render: (_, a) => formatCurrency(a.balances.pending) },
    { title: 'Payable', key: 'payable', align: 'right', render: (_, a) => formatCurrency(a.balances.payable) },
    { title: 'Paid', key: 'paid', align: 'right', render: (_, a) => formatCurrency(a.balances.paid) },
    { title: 'Applied', dataIndex: 'appliedAt', render: formatDate },
    { title: '', key: 'open', render: (_, a) => <Button size="small" onClick={() => setOpen(a)}>{a.status === 'PENDING' ? 'Review' : 'Open'}</Button> },
  ];

  return (
    <Card>
      <Space style={{ marginBottom: 12 }} wrap>
        <Input.Search placeholder="Name, code, phone, email" allowClear onSearch={setSearch} style={{ width: 280 }} />
        {fixedStatus ? null : (
          <Select allowClear placeholder="Any status" style={{ width: 160 }} value={status} onChange={setStatus}
            options={(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'] as const).map((s) => ({ value: s, label: s }))} />
        )}
      </Space>
      <Table rowKey="id" size="middle" loading={q.isLoading} dataSource={q.data ?? []} columns={columns} scroll={{ x: 1000 }}
        locale={{ emptyText: fixedStatus ? 'No applications waiting' : 'No affiliates yet' }} />
      <AffiliateDrawer row={open} onClose={() => setOpen(null)} />
    </Card>
  );
}

function AffiliateDrawer({ row, onClose }: { row: AffiliateListRow | null; onClose: () => void }) {
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const canReview = useCan('AFFILIATES_REVIEW');
  const [busy, setBusy] = useState(false);
  const [reasonFor, setReasonFor] = useState<'reject' | 'suspend' | null>(null);
  const [reason, setReason] = useState('');

  const act = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      message.success(done);
      void qc.invalidateQueries({ queryKey: ['affiliates'] });
      setReasonFor(null);
      setReason('');
      onClose();
    } catch (e) {
      message.error(apiErrorMessage(e, 'Could not update the affiliate'), 6);
    } finally {
      setBusy(false);
    }
  };
  if (!row) return null;
  const a = row;
  return (
    <Drawer open width={560} title={<Space>{a.fullName}<Tag color={AFFILIATE_STATUS_COLOR[a.status]}>{a.status}</Tag></Space>} onClose={onClose}
      extra={canReview ? (
        <Space>
          {a.status === 'PENDING' ? (
            <>
              <Button danger onClick={() => setReasonFor('reject')}>Reject</Button>
              <Button type="primary" loading={busy} onClick={() => act(() => affiliatesApi.approve(a.id), `${a.fullName} approved - their links now earn`)}>Approve</Button>
            </>
          ) : null}
          {a.status === 'APPROVED' ? <Button danger onClick={() => setReasonFor('suspend')}>Suspend</Button> : null}
          {a.status === 'SUSPENDED' ? <Button loading={busy} onClick={() => act(() => affiliatesApi.reactivate(a.id), 'Reactivated')}>Reactivate</Button> : null}
        </Space>
      ) : null}
    >
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="Code">{a.code}</Descriptions.Item>
        <Descriptions.Item label="Phone">{a.phone}</Descriptions.Item>
        <Descriptions.Item label="Email">{a.email ?? EM_DASH}</Descriptions.Item>
        <Descriptions.Item label="Shopper account">{a.customerId ? 'Yes (own purchases never earn)' : 'No'}</Descriptions.Item>
        <Descriptions.Item label="Promotes on">{a.promotionUrl ?? EM_DASH}</Descriptions.Item>
        <Descriptions.Item label="Audience">{a.audienceSize ?? EM_DASH}</Descriptions.Item>
        <Descriptions.Item label="Plan">{a.promotionPlan ?? EM_DASH}</Descriptions.Item>
        <Descriptions.Item label="PAN">{a.pan ?? EM_DASH}</Descriptions.Item>
        <Descriptions.Item label="Payout">
          {a.payoutMethod === 'UPI' ? `UPI ${a.payoutUpiId ?? EM_DASH}` : `${a.payoutBankName ?? 'Bank'} · ${a.payoutAccountName ?? ''} · ${a.payoutAccountNumber ?? ''} · ${a.payoutIfsc ?? ''}`}
        </Descriptions.Item>
        <Descriptions.Item label="Applied">{formatDateTime(a.appliedAt)}</Descriptions.Item>
        {a.rejectionReason ? <Descriptions.Item label="Rejected because">{a.rejectionReason}</Descriptions.Item> : null}
        {a.suspendedReason ? <Descriptions.Item label="Suspended because">{a.suspendedReason}</Descriptions.Item> : null}
      </Descriptions>
      <Descriptions column={2} size="small" style={{ marginTop: 16 }} title="Performance">
        <Descriptions.Item label="Clicks">{a.clicks}</Descriptions.Item>
        <Descriptions.Item label="Successful orders">{a.successfulOrders}</Descriptions.Item>
        <Descriptions.Item label="On hold">{formatCurrency(a.balances.pending)}</Descriptions.Item>
        <Descriptions.Item label="Payable now">{formatCurrency(a.balances.payable)}</Descriptions.Item>
        <Descriptions.Item label="Paid">{formatCurrency(a.balances.paid)}</Descriptions.Item>
        <Descriptions.Item label="Taken back (returns)">{formatCurrency(a.balances.reversed)}</Descriptions.Item>
      </Descriptions>
      <Modal open={reasonFor !== null} title={reasonFor === 'reject' ? 'Reject application' : 'Suspend affiliate'} okText={reasonFor === 'reject' ? 'Reject' : 'Suspend'}
        okButtonProps={{ danger: true, disabled: reason.trim().length < 3, loading: busy }} onCancel={() => setReasonFor(null)}
        onOk={() => act(
          () => (reasonFor === 'reject' ? affiliatesApi.reject(a.id, reason) : affiliatesApi.suspend(a.id, reason)),
          reasonFor === 'reject' ? 'Application rejected' : 'Affiliate suspended - links stop tracking',
        )}>
        <Text type="secondary">{reasonFor === 'reject' ? 'The applicant sees this reason and can apply again.' : 'Commission already earned is still owed and paid.'}</Text>
        <Input.TextArea rows={3} style={{ marginTop: 8 }} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Reason" />
      </Modal>
    </Drawer>
  );
}

function CommissionLedger() {
  const [status, setStatus] = useState<CommissionStatus | undefined>();
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['affiliates', 'commissions', status, page], queryFn: () => affiliatesApi.commissions({ status, page, pageSize: 50 }) });
  const columns: ColumnsType<CommissionRow> = [
    { title: 'Order', key: 'order', render: (_, c) => <div><Text strong>{c.orderNumber}</Text><div style={{ fontSize: 12, color: '#78716c' }}>{formatDate(c.orderDate)} · {c.orderStatus}</div></div> },
    { title: 'Affiliate', key: 'aff', render: (_, c) => <span>{c.affiliateName} <Tag>{c.affiliateCode}</Tag></span> },
    { title: 'Item', key: 'item', render: (_, c) => <div>{c.productName} × {c.quantity}<div style={{ fontSize: 12, color: '#78716c' }}>{c.categoryName ?? 'No category'}</div></div> },
    {
      title: 'Base', key: 'base', align: 'right',
      render: (_, c) => <Tooltip title={`Gross ${formatCurrency(c.grossAmount)} − coupon share ${formatCurrency(c.couponShare)} (GST and delivery excluded)`}>{formatCurrency(c.baseAmount)}</Tooltip>,
    },
    { title: 'Rate', key: 'rate', align: 'right', render: (_, c) => <Tooltip title={c.rateSource === 'PARENT_CATEGORY' ? 'Inherited from the parent category' : c.rateSource === 'DEFAULT' ? 'Program default' : 'Category rate'}>{c.ratePercent}%</Tooltip> },
    { title: 'Commission', dataIndex: 'commissionAmount', align: 'right', render: formatCurrency },
    { title: 'Returned', key: 'ret', align: 'right', render: (_, c) => (c.refundedQuantity ? `${c.refundedQuantity} · −${formatCurrency(c.refundedAmount)}` : EM_DASH) },
    { title: 'Net', dataIndex: 'netAmount', align: 'right', render: (v: number) => <Text strong>{formatCurrency(v)}</Text> },
    {
      title: 'Status', key: 'status',
      render: (_, c) => (
        <div>
          <Tag color={COMMISSION_STATUS_COLOR[c.status]}>{COMMISSION_STATUS_LABEL[c.status]}</Tag>
          {c.adjustments.some((x) => x.clawback) ? <Tag color="volcano">Clawback</Tag> : null}
          <div style={{ fontSize: 12, color: '#78716c' }}>{c.status === 'PENDING' ? `Release ${formatDate(c.releaseDate)}` : c.payoutNumber ?? c.statusNote ?? ''}</div>
        </div>
      ),
    },
  ];
  return (
    <Card>
      <Select allowClear placeholder="Any status" style={{ width: 180, marginBottom: 12 }} value={status} onChange={(v) => { setStatus(v); setPage(1); }}
        options={(Object.keys(COMMISSION_STATUS_LABEL) as CommissionStatus[]).map((s) => ({ value: s, label: COMMISSION_STATUS_LABEL[s] }))} />
      <Table rowKey="id" size="middle" loading={q.isLoading} dataSource={q.data?.data ?? []} columns={columns} scroll={{ x: 1100 }}
        pagination={{ current: page, pageSize: 50, total: q.data?.total ?? 0, onChange: setPage, showSizeChanger: false }} />
    </Card>
  );
}

function FraudLog() {
  const q = useQuery({ queryKey: ['affiliates', 'attributions', 'FRAUD'], queryFn: () => affiliatesApi.attributions({ status: 'FRAUD' }) });
  const columns: ColumnsType<AttributionRow> = [
    { title: 'When', dataIndex: 'createdAt', render: formatDateTime },
    { title: 'Order', key: 'order', render: (_, r) => <div><Text strong>{r.orderNumber}</Text><div style={{ fontSize: 12, color: '#78716c' }}>{formatCurrency(r.orderTotal)} · {r.orderStatus}</div></div> },
    { title: 'Buyer', key: 'buyer', render: (_, r) => `${r.customerName} (${r.customerCode})` },
    { title: 'Affiliate', key: 'aff', render: (_, r) => <span>{r.affiliateName} <Tag>{r.affiliateCode}</Tag></span> },
    { title: 'Why', key: 'why', render: (_, r) => <Space wrap size={4}>{r.fraudReasons.map((x) => <Tag key={x} color="red">{FRAUD_REASON_LABEL[x] ?? x}</Tag>)}</Space> },
    { title: 'Detail', dataIndex: 'fraudDetail', render: (v: string | null) => <Text type="secondary">{v ?? EM_DASH}</Text> },
  ];
  return (
    <Card>
      <Text type="secondary">Orders that came through an affiliate link but matched the affiliate's own account, phone, email or payment instrument. No commission was generated.</Text>
      <Table style={{ marginTop: 12 }} rowKey="id" size="middle" loading={q.isLoading} dataSource={q.data ?? []} columns={columns} scroll={{ x: 900 }}
        locale={{ emptyText: 'No self-referrals detected' }} />
    </Card>
  );
}
