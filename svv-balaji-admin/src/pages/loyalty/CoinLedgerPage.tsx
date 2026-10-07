import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  ClockCircleOutlined,
  DownloadOutlined,
  EditOutlined,
  GiftOutlined,
  RollbackOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { App as AntApp, Button, Card, Col, DatePicker, Input, Row, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiErrorMessage } from '@shared/api/client';
import { loyaltyApi, type CoinLedgerQuery, type CoinLedgerRow, type CoinReason } from '@shared/api/loyalty';
import { PageHeader } from '@shared/components/PageHeader';
import { formatDate, formatDateTime } from '@shared/utils/format';
import { StatCard } from '../customers/detailPageParts';

const { Text } = Typography;

const REASONS: Array<{ value: CoinReason; label: string; color: string }> = [
  { value: 'LOYALTY_EARN', label: 'Loyalty earned', color: 'green' },
  { value: 'LOYALTY_REDEMPTION', label: 'Points used at checkout', color: 'blue' },
  { value: 'LOYALTY_REDEMPTION_REFUND', label: 'Points given back (cancelled)', color: 'cyan' },
  { value: 'LOYALTY_REVERSAL', label: 'Taken back (return)', color: 'red' },
  { value: 'LOYALTY_EXPIRY', label: 'Expired', color: 'default' },
  { value: 'REFERRAL_REFERRER_REWARD', label: 'Referral reward - referrer', color: 'purple' },
  { value: 'REFERRAL_REFEREE_REWARD', label: 'Referral reward - new customer', color: 'magenta' },
  { value: 'REFERRAL_REDEMPTION', label: 'Referral coins used', color: 'geekblue' },
  { value: 'REFERRAL_REDEMPTION_REFUND', label: 'Referral coins given back', color: 'cyan' },
  { value: 'MANUAL_ADJUSTMENT', label: 'Manual adjustment (staff)', color: 'orange' },
];
const REASON = Object.fromEntries(REASONS.map((r) => [r.value, r])) as Record<CoinReason, (typeof REASONS)[number]>;

const n = (v: number) => v.toLocaleString('en-IN');
const customerPath = (c: CoinLedgerRow['customer']) => `/${c.channel === 'B2B' ? 'b2b' : 'b2c'}-customers/${c.id}`;
const orderPath = (o: NonNullable<CoinLedgerRow['order']>) => `/${o.channel === 'B2B' ? 'b2b' : 'b2c'}-orders/${o.id}`;

/**
 * Super Admin: every loyalty point and referral coin that moved, across all
 * customers - issued on delivery, used at checkout, given back on a
 * cancellation, taken back on a return, expired, and staff corrections - with
 * totals for the filters and a CSV export. 1 coin = the configured point value.
 */
export function CoinLedgerPage() {
  const { message } = AntApp.useApp();
  const [filters, setFilters] = useState<CoinLedgerQuery>({});
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const pageSize = 50;

  const set = (patch: Partial<CoinLedgerQuery>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };
  const q = useQuery({
    queryKey: ['loyalty', 'ledger', filters, page],
    queryFn: () => loyaltyApi.coinLedger({ ...filters, page, limit: pageSize }),
    placeholderData: keepPreviousData,
  });
  const s = q.data?.summary;

  const exportCsv = async () => {
    setExporting(true);
    try {
      const blob = await loyaltyApi.coinLedgerCsv(filters);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `coin-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      message.error(apiErrorMessage(e, 'Could not export the ledger'));
    } finally {
      setExporting(false);
    }
  };

  const columns: ColumnsType<CoinLedgerRow> = [
    { title: 'When', dataIndex: 'createdAt', width: 170, render: (v: string) => formatDateTime(v) },
    {
      title: 'Customer', key: 'customer', width: 230,
      render: (_, r) => (
        <div>
          <Link to={customerPath(r.customer)}><Text strong>{r.customer.name}</Text></Link>
          <div style={{ fontSize: 12, color: '#78716c' }}>
            {r.customer.customerCode} · <Tag style={{ margin: 0, fontSize: 10.5, lineHeight: '16px' }}>{r.customer.channel === 'B2B' ? 'Retailer' : 'Customer'}</Tag>
          </div>
        </div>
      ),
    },
    {
      title: 'Type', key: 'reason', width: 230,
      render: (_, r) => (
        <Space direction="vertical" size={2}>
          <Tag color={REASON[r.reason]?.color} style={{ margin: 0 }}>{REASON[r.reason]?.label ?? r.reasonLabel}</Tag>
          <Text type="secondary" style={{ fontSize: 11.5 }}>{r.source === 'LOYALTY' ? 'Loyalty points' : 'Referral coins'}</Text>
        </Space>
      ),
    },
    {
      title: 'Coins', dataIndex: 'amount', align: 'right', width: 110,
      render: (v: number) => (
        <Text strong style={{ color: v > 0 ? '#15803d' : v < 0 ? '#b91c1c' : undefined, fontSize: 14 }}>
          {v > 0 ? '+' : ''}{n(v)}
        </Text>
      ),
    },
    {
      title: 'Order', key: 'order', width: 160,
      render: (_, r) => (r.order ? <Link to={orderPath(r.order)}>{r.order.orderNumber}</Link> : <Text type="secondary">-</Text>),
    },
    {
      title: 'Details', key: 'details',
      render: (_, r) => (
        <Space direction="vertical" size={2} style={{ fontSize: 12.5 }}>
          {r.referralText ? <Text style={{ fontSize: 12.5 }}>{r.referralText}</Text> : null}
          {r.note ? <Text style={{ fontSize: 12.5 }}>{r.note}</Text> : null}
          {r.performedBy ? <Text type="secondary" style={{ fontSize: 12 }}><EditOutlined /> by {r.performedBy}</Text> : null}
          {r.reason === 'LOYALTY_EARN' && r.expiresAt ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Expires {formatDate(r.expiresAt)}{r.remainingAmount !== null && r.remainingAmount !== r.amount ? ` · ${n(r.remainingAmount)} still live` : ''}
            </Text>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="Coin & Points Ledger"
        subtitle="Every loyalty point and referral coin given, used, taken back or expired - across all customers and retailers."
        actions={
          <Button icon={<DownloadOutlined />} loading={exporting} onClick={() => void exportCsv()}>
            Export CSV
          </Button>
        }
      />

      {/* Totals for the current filters */}
      <Row gutter={[16, 16]}>
        <Col xs={12} md={8} xl={4}>
          <StatCard icon={<GiftOutlined style={{ fontSize: 18 }} />} tone="green" label="ISSUED" value={s ? n(s.issued) : '…'} />
        </Col>
        <Col xs={12} md={8} xl={4}>
          <StatCard icon={<ArrowDownOutlined style={{ fontSize: 18 }} />} tone="blue" label="USED AT CHECKOUT" value={s ? n(s.redeemed) : '…'} />
        </Col>
        <Col xs={12} md={8} xl={4}>
          <StatCard icon={<RollbackOutlined style={{ fontSize: 18 }} />} tone="red" label="TAKEN BACK" value={s ? n(s.reversed) : '…'} />
        </Col>
        <Col xs={12} md={8} xl={4}>
          <StatCard icon={<ClockCircleOutlined style={{ fontSize: 18 }} />} tone="slate" label="EXPIRED" value={s ? n(s.expired) : '…'} />
        </Col>
        <Col xs={12} md={8} xl={4}>
          <StatCard
            icon={<EditOutlined style={{ fontSize: 18 }} />}
            tone="amber"
            label="STAFF ADJUSTMENTS"
            value={s ? <span><span style={{ color: '#15803d' }}>+{n(s.manualAdded)}</span> / <span style={{ color: '#b91c1c' }}>−{n(s.manualRemoved)}</span></span> : '…'}
          />
        </Col>
        <Col xs={12} md={8} xl={4}>
          <Tooltip title="What customers of this channel hold right now (not limited by the date or search filters)">
            <div>
              <StatCard icon={<WalletOutlined style={{ fontSize: 18 }} />} tone="pink" label="HELD NOW" value={s ? n(s.outstanding) : '…'} />
            </div>
          </Tooltip>
        </Col>
      </Row>

      <Card>
        {/* Filters */}
        <Space wrap style={{ marginBottom: 14 }}>
          <Input.Search
            allowClear
            placeholder="Customer name, code, phone or order no."
            style={{ width: 300 }}
            onSearch={(v) => set({ search: v.trim() || undefined })}
          />
          <Select
            allowClear
            placeholder="Any type"
            style={{ width: 250 }}
            value={filters.reason}
            onChange={(v) => set({ reason: v })}
            options={REASONS.map((r) => ({ value: r.value, label: r.label }))}
          />
          <Select
            allowClear
            placeholder="Points & coins"
            style={{ width: 170 }}
            value={filters.source}
            onChange={(v) => set({ source: v })}
            options={[{ value: 'LOYALTY', label: 'Loyalty points' }, { value: 'REFERRAL', label: 'Referral coins' }]}
          />
          <Select
            allowClear
            placeholder="Customers & retailers"
            style={{ width: 190 }}
            value={filters.channel}
            onChange={(v) => set({ channel: v })}
            options={[{ value: 'B2C', label: 'Customers (B2C)' }, { value: 'B2B', label: 'Retailers (B2B)' }]}
          />
          <DatePicker.RangePicker
            value={range}
            format="DD MMM YYYY"
            onChange={(v) => {
              setRange(v);
              set({ from: v?.[0]?.format('YYYY-MM-DD'), to: v?.[1]?.format('YYYY-MM-DD') });
            }}
          />
        </Space>

        {s ? (
          <Text type="secondary" style={{ display: 'block', marginBottom: 10, fontSize: 12.5 }}>
            {n(s.transactions)} entr{s.transactions === 1 ? 'y' : 'ies'} for {n(s.customers)} customer{s.customers === 1 ? '' : 's'}
            {filters.reason ? ` · showing ${REASON[filters.reason]?.label.toLowerCase()} only` : ''}
          </Text>
        ) : null}

        <Table<CoinLedgerRow>
          rowKey="id"
          size="middle"
          loading={q.isFetching}
          dataSource={q.data?.data ?? []}
          columns={columns}
          scroll={{ x: 1100 }}
          locale={{ emptyText: 'No coin movements match these filters' }}
          pagination={{
            current: page,
            pageSize,
            total: q.data?.meta.total ?? 0,
            onChange: setPage,
            showSizeChanger: false,
            showTotal: (t) => `${n(t)} entries`,
          }}
        />
      </Card>

      {/* Break-down by type */}
      {s && s.byReason.length ? (
        <Card title="By type" size="small">
          <Table
            rowKey="reason"
            size="small"
            pagination={false}
            dataSource={s.byReason}
            columns={[
              { title: 'Type', dataIndex: 'reason', render: (r: CoinReason) => <Tag color={REASON[r]?.color}>{REASON[r]?.label ?? r}</Tag> },
              { title: 'Entries', dataIndex: 'count', align: 'right', render: n },
              {
                title: 'Coins', dataIndex: 'amount', align: 'right',
                render: (v: number) => <Text strong style={{ color: v > 0 ? '#15803d' : v < 0 ? '#b91c1c' : undefined }}>{v > 0 ? '+' : ''}{n(v)}</Text>,
              },
            ]}
          />
        </Card>
      ) : null}
    </Space>
  );
}
