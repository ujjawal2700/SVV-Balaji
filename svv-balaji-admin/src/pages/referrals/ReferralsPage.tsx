import { WalletOutlined } from '@ant-design/icons';
import { Card, Col, DatePicker, Input, Row, Select, Space, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useState } from 'react';
import type { Referral, ReferralQuery, SalesChannel } from '@shared/api/types';
import { SALES_CHANNELS } from '@shared/api/types';
import { DataTable } from '@shared/components/DataTable';
import { PageHeader } from '@shared/components/PageHeader';
import { useReferrals } from '@shared/hooks/useReferrals';
import { EM_DASH, formatCurrency, formatDateTime } from '@shared/utils/format';
import { CoinLedgerDrawer } from './CoinLedgerDrawer';

const { RangePicker } = DatePicker;

const CHANNEL_COLOUR: Record<SalesChannel, string> = { B2B: 'blue', B2C: 'purple' };

/**
 * Super Admin reporting over the refer-a-friend program (FRD addendum, 17
 * Sep) — one row per relationship. `search` matches either side, because a
 * Super Admin usually knows the person's name or number, not which end of
 * the relationship they were.
 */
export function ReferralsPage() {
  const [query, setQuery] = useState<ReferralQuery>({});
  const [ledgerOf, setLedgerOf] = useState<{ id: string; name: string } | null>(null);

  const referrals = useReferrals(query);
  const patchQuery = (patch: Partial<ReferralQuery>) => setQuery((prev) => ({ ...prev, ...patch }));

  const columns: ColumnsType<Referral> = [
    {
      title: 'Referrer',
      key: 'referrer',
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <Typography.Link onClick={() => setLedgerOf({ id: row.referrer.id, name: row.referrer.name })}>
            {row.referrer.name}
          </Typography.Link>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.referrer.phone} · <Typography.Text code style={{ fontSize: 11 }}>{row.referrer.customerCode}</Typography.Text>
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Referred User',
      key: 'referee',
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <Typography.Link onClick={() => setLedgerOf({ id: row.referee.id, name: row.referee.name })}>
            {row.referee.name}
          </Typography.Link>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.referee.phone} · <Typography.Text code style={{ fontSize: 11 }}>{row.referee.customerCode}</Typography.Text>
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Channel',
      key: 'channel',
      width: 90,
      render: (_, row) => <Tag color={CHANNEL_COLOUR[row.referee.channel]}>{row.referee.channel}</Tag>,
    },
    {
      title: 'Referred on',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (value: string) => formatDateTime(value),
      sorter: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    },
    {
      title: 'Status',
      key: 'status',
      width: 130,
      render: (_, row) =>
        row.qualified ? (
          <Tag color="green">Qualified</Tag>
        ) : (
          <Tag color="gold">Pending</Tag>
        ),
    },
    {
      title: 'Referrer Coins',
      dataIndex: 'referrerCoins',
      key: 'referrerCoins',
      width: 120,
      align: 'right',
      render: (value: number) => (value > 0 ? value.toLocaleString('en-IN') : EM_DASH),
    },
    {
      title: 'Referee Coins',
      dataIndex: 'refereeCoins',
      key: 'refereeCoins',
      width: 120,
      align: 'right',
      render: (value: number) => (value > 0 ? value.toLocaleString('en-IN') : EM_DASH),
    },
    {
      title: 'Qualifying Order',
      key: 'qualifyingOrder',
      width: 160,
      render: (_, row) =>
        row.qualifyingOrder ? (
          <Space direction="vertical" size={0}>
            <Typography.Text code style={{ fontSize: 12 }}>{row.qualifyingOrder.orderNumber}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {formatCurrency(row.qualifyingOrder.total)} · {row.qualifyingOrder.status}
            </Typography.Text>
          </Space>
        ) : (
          EM_DASH
        ),
    },
  ];

  const toolbar = (
    <Row gutter={[12, 12]}>
      <Col xs={24} md={7}>
        <Input.Search
          allowClear
          placeholder="Referrer or referred user — name, phone or code"
          onSearch={(value) => patchQuery({ search: value || undefined })}
        />
      </Col>
      <Col xs={12} md={4}>
        <Select
          allowClear
          style={{ width: '100%' }}
          placeholder="Status"
          value={query.status}
          onChange={(value) => patchQuery({ status: value })}
          options={[
            { value: 'QUALIFIED', label: 'Qualified' },
            { value: 'PENDING', label: 'Pending' },
          ]}
        />
      </Col>
      <Col xs={12} md={4}>
        <Select<SalesChannel>
          allowClear
          style={{ width: '100%' }}
          placeholder="Channel"
          value={query.channel}
          onChange={(value) => patchQuery({ channel: value })}
          options={SALES_CHANNELS.map((value) => ({ value, label: value }))}
        />
      </Col>
      <Col xs={24} md={9}>
        <RangePicker
          style={{ width: '100%' }}
          onChange={(dates) =>
            patchQuery({
              from: dates?.[0] ? dates[0].startOf('day').toISOString() : undefined,
              to: dates?.[1] ? dates[1].endOf('day').toISOString() : undefined,
            })
          }
          value={
            query.from && query.to ? [dayjs(query.from), dayjs(query.to)] : undefined
          }
        />
      </Col>
    </Row>
  );

  return (
    <Card>
      <PageHeader
        title="Referral Management"
        subtitle="Who referred whom, whether it qualified, and what each side earned. Click a name to see their complete coin history and make a correction."
        actions={
          <Space>
            <WalletOutlined />
            <Typography.Text type="secondary">
              {(referrals.data ?? []).length} referral{(referrals.data ?? []).length === 1 ? '' : 's'} shown
            </Typography.Text>
          </Space>
        }
      />

      <DataTable<Referral>
        rows={referrals.data}
        columns={columns}
        rowKey="id"
        isLoading={referrals.isLoading}
        isFetching={referrals.isFetching}
        error={referrals.error}
        onRetry={() => void referrals.refetch()}
        toolbar={toolbar}
        emptyText="No referrals match this filter"
      />

      <CoinLedgerDrawer
        customer={ledgerOf}
        onClose={() => setLedgerOf(null)}
      />
    </Card>
  );
}
