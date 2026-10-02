import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Card, Input, Segmented, Select, Space, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import {
  RETURN_STATUS_COLOR, RETURN_STATUS_LABEL, returnsApi, type ReturnChannel, type ReturnListQuery, type ReturnRow, type ReturnStatus,
} from '@shared/api/returns';
import { DataTable } from '@shared/components/DataTable';
import { PageHeader } from '@shared/components/PageHeader';
import { ReturnDetailDrawer } from './ReturnDetailDrawer';

const { Text } = Typography;
const inr = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ATTENTION: ReturnStatus[] = ['REQUESTED', 'QC', 'REFUND_INITIATED', 'REPLACEMENT_PROCESSING', 'PICKUP_FAILED', 'DELIVERY_FAILED'];

/**
 * One return/exchange queue. Mounted twice - /returns/customers (B2C) and
 * /returns/retailers (B2B) - because the two are handled separately, each
 * behind its own permission; a request never appears in the other queue.
 */
export function ReturnsQueuePage({ channel }: { channel: ReturnChannel }) {
  const qc = useQueryClient();
  const [query, setQuery] = useState<ReturnListQuery>({ view: 'open', page: 1 });
  const [openId, setOpenId] = useState<string | null>(null);
  const key = ['returns', channel, query];
  const q = useQuery({ queryKey: key, queryFn: () => returnsApi.list(channel, query), refetchInterval: 30_000 });
  const counts = q.data?.counts ?? {};
  const who = channel === 'B2C' ? 'Customer' : 'Retailer';

  const columns: ColumnsType<ReturnRow> = [
    {
      title: 'Request',
      key: 'req',
      render: (_, r) => (
        <div>
          <a onClick={() => setOpenId(r.id)} style={{ fontWeight: 600 }}>{r.requestNumber}</a>
          <div><Tag color={r.type === 'RETURN' ? 'blue' : 'purple'} style={{ margin: 0 }}>{r.type === 'RETURN' ? 'Return' : 'Exchange'}</Tag></div>
        </div>
      ),
    },
    { title: 'Order', dataIndex: 'orderNumber' },
    {
      title: who,
      key: 'customer',
      render: (_, r) => <div>{r.customer.name}<div><Text type="secondary" style={{ fontSize: 12 }}>{r.customer.phone}</Text></div></div>,
    },
    {
      title: 'Item',
      key: 'item',
      render: (_, r) => (
        <div>
          {r.product} × {r.quantity}
          <div><Text type="secondary" style={{ fontSize: 12 }}>{r.reason}{r.companyFault ? ' · our fault' : ''}{r.mediaCount ? ` · ${r.mediaCount} photo(s)` : ''}</Text></div>
        </div>
      ),
    },
    { title: 'Path', dataIndex: 'logistics', render: (l: string) => <Tag>{l === 'QUICK_DELIVERY' ? 'Rider' : 'Shiprocket'}</Tag> },
    {
      title: 'Amount',
      key: 'amount',
      align: 'right',
      render: (_, r) =>
        r.type === 'RETURN' ? inr(r.refundAmount) : r.priceDifference > 0 ? <span>+{inr(r.priceDifference)} <Tag style={{ margin: 0 }}>{r.differenceStatus.toLowerCase()}</Tag></span> : r.priceDifference < 0 ? `−${inr(-r.priceDifference)}` : '—',
    },
    { title: 'Status', dataIndex: 'status', render: (s: ReturnStatus) => <Tag color={RETURN_STATUS_COLOR[s]} style={{ margin: 0 }}>{RETURN_STATUS_LABEL[s]}</Tag> },
    { title: 'Raised', dataIndex: 'createdAt', render: (d: string) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title={`${who} Returns & Exchanges`}
        subtitle={`Per-item returns and exchanges raised by ${channel === 'B2C' ? 'customers' : 'retailers'}: approve, pickup (rider or Shiprocket), QC, refund or replacement.`}
      />
      <Space wrap>
        {ATTENTION.map((s) => (
          <Card key={s} size="small" hoverable onClick={() => setQuery({ ...query, status: query.status === s ? undefined : s, page: 1 })}
            style={{ minWidth: 150, borderColor: query.status === s ? '#f97316' : undefined }}>
            <Badge color={RETURN_STATUS_COLOR[s]} text={RETURN_STATUS_LABEL[s]} />
            <div style={{ fontSize: 20, fontWeight: 700 }}>{counts[s] ?? 0}</div>
          </Card>
        ))}
      </Space>
      <Space wrap>
        <Segmented
          value={query.view}
          onChange={(v) => setQuery({ ...query, view: v as ReturnListQuery['view'], status: undefined, page: 1 })}
          options={[{ label: 'Open', value: 'open' }, { label: 'Closed', value: 'closed' }, { label: 'All', value: 'all' }]}
        />
        <Select allowClear placeholder="Status" style={{ width: 200 }} value={query.status} onChange={(v) => setQuery({ ...query, status: v, page: 1 })}
          options={(Object.keys(RETURN_STATUS_LABEL) as ReturnStatus[]).map((s) => ({ value: s, label: RETURN_STATUS_LABEL[s] }))} />
        <Select allowClear placeholder="Type" style={{ width: 130 }} value={query.type} onChange={(v) => setQuery({ ...query, type: v, page: 1 })}
          options={[{ value: 'RETURN', label: 'Return' }, { value: 'EXCHANGE', label: 'Exchange' }]} />
        <Select allowClear placeholder="Path" style={{ width: 150 }} value={query.logistics} onChange={(v) => setQuery({ ...query, logistics: v, page: 1 })}
          options={[{ value: 'QUICK_DELIVERY', label: 'Rider (Quick)' }, { value: 'SHIPROCKET', label: 'Shiprocket' }]} />
        <Input.Search allowClear placeholder="Request, order, name or phone" style={{ width: 280 }} onSearch={(v) => setQuery({ ...query, search: v || undefined, page: 1 })} />
      </Space>
      <DataTable<ReturnRow>
        rowKey="id"
        columns={columns}
        rows={q.data?.rows}
        isLoading={q.isLoading}
        isFetching={q.isFetching}
        error={q.error}
        onRetry={() => void q.refetch()}
        meta={q.data ? { page: q.data.page, limit: q.data.pageSize, total: q.data.total } : undefined}
        onPageChange={(page) => setQuery({ ...query, page })}
        emptyText="No requests here"
        onRow={(r) => ({ onClick: () => setOpenId(r.id), style: { cursor: 'pointer' } })}
      />
      <ReturnDetailDrawer
        channel={channel}
        id={openId}
        onClose={() => setOpenId(null)}
        onChanged={() => void qc.invalidateQueries({ queryKey: ['returns', channel] })}
      />
    </Space>
  );
}

export function CustomerReturnsPage() {
  return <ReturnsQueuePage channel="B2C" />;
}

export function RetailerReturnsPage() {
  return <ReturnsQueuePage channel="B2B" />;
}
