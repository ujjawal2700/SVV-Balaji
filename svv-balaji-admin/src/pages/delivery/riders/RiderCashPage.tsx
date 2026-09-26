import { BankOutlined, TeamOutlined, WalletOutlined, WarningOutlined } from '@ant-design/icons';
import { Button, Card, Col, DatePicker, Empty, Row, Space, Table, Tag, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RiderCashReport } from '@shared/api/delivery';
import { useCan } from '@shared/auth/useCan';
import { PageHeader } from '@shared/components/PageHeader';
import { useDeliverySettings, useRiderCashReport } from '@shared/hooks/useDelivery';
import { StatCard } from '../../customers/detailPageParts';
import { DepositModal } from './RiderDetailPage';
import { OutletSelect, RiderCell, inr } from './riderParts';

dayjs.extend(relativeTime);

type Holder = RiderCashReport['riders'][number];

/** COD cash each rider is carrying, and the deposits they handed over at the outlet. */
export function RiderCashPage() {
  const [outlet, setOutlet] = useState<string | undefined>();
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const report = useRiderCashReport({ warehouseId: outlet, ...(range ? { from: range[0].format('YYYY-MM-DD'), to: range[1].format('YYYY-MM-DD') } : {}) });
  const settings = useDeliverySettings();
  const canCash = useCan('RIDER_CASH_RECORD');
  const navigate = useNavigate();
  const [deposit, setDeposit] = useState<Holder | null>(null);
  const data = report.data;
  const limit = settings.data?.maxCashInHand ? Number(settings.data.maxCashInHand) : null;
  const over = limit ? (data?.riders ?? []).filter((r) => r.balance >= limit).length : 0;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="Cash & Deposits"
        subtitle="Cash on delivery a rider collects stays on their ledger until they hand it over at the outlet and it is recorded here."
        extra={<OutletSelect allowClear placeholder="All outlets" value={outlet} onChange={setOutlet} style={{ width: 200 }} />}
      />
      <Row gutter={[16, 16]}>
        <Col xs={12} lg={6}><StatCard icon={<WalletOutlined />} tone="amber" label="Cash held by riders" value={inr(data?.totalHeld ?? 0)} /></Col>
        <Col xs={12} lg={6}><StatCard icon={<TeamOutlined />} tone="slate" label="Riders holding cash" value={data?.riders.length ?? 0} /></Col>
        <Col xs={12} lg={6}><StatCard icon={<WarningOutlined />} tone="red" label={limit ? `At the ${inr(limit)} limit` : 'Cash limit'} value={limit ? over : 'Not set'} /></Col>
        <Col xs={12} lg={6}><StatCard icon={<BankOutlined />} tone="green" label="Deposited in period" value={inr(data?.deposits.total ?? 0)} /></Col>
      </Row>

      <Card className="page-card" title="Holding now">
        <Table<Holder>
          rowKey="id" loading={report.isLoading} dataSource={data?.riders ?? []} scroll={{ x: 800 }} pagination={{ pageSize: 20, hideOnSinglePage: true }}
          locale={{ emptyText: <Empty description="No rider is holding cash" /> }}
          columns={[
            { title: 'Rider', key: 'r', render: (_, r) => <RiderCell rider={r} sub={[r.code, r.warehouse?.name].filter(Boolean).join(' · ')} onOpen={() => navigate(`/riders/${r.id}?tab=cash`)} /> },
            { title: 'Last collected', key: 'c', render: (_, r) => (r.lastCollectedAt ? dayjs(r.lastCollectedAt).fromNow() : '—') },
            { title: 'Last deposit', key: 'd', render: (_, r) => (r.lastDepositAt ? dayjs(r.lastDepositAt).format('D MMM, h:mm A') : 'Never') },
            {
              title: 'Holding', dataIndex: 'balance', align: 'right',
              render: (v: number) => <Space size={6}>{limit && v >= limit ? <Tag color="red">At limit</Tag> : null}<Typography.Text strong>{inr(v)}</Typography.Text></Space>,
            },
            { title: '', key: 'a', align: 'right', render: (_, r) => (canCash && r.balance > 0 ? <Button size="small" type="primary" onClick={() => setDeposit(r)}>Record deposit</Button> : null) },
          ]}
        />
      </Card>

      <Card className="page-card" title="Deposits"
        extra={<DatePicker.RangePicker value={range} onChange={(v) => setRange(v && v[0] && v[1] ? [v[0], v[1]] : null)} placeholder={['Last 30 days', 'today']} />}>
        <Table
          rowKey="id" size="middle" loading={report.isLoading} dataSource={data?.deposits.entries ?? []} scroll={{ x: 800 }} pagination={{ pageSize: 20, hideOnSinglePage: true }}
          locale={{ emptyText: <Empty description="No deposits in this period" /> }}
          columns={[
            { title: 'When', dataIndex: 'createdAt', render: (d: string) => dayjs(d).format('D MMM YYYY, h:mm A') },
            { title: 'Rider', key: 'r', render: (_, e) => <a onClick={() => navigate(`/riders/${e.rider.id}?tab=cash`)}>{e.rider.fullName}</a> },
            { title: 'Reference', dataIndex: 'reference', render: (v) => v ?? '—' },
            { title: 'Recorded by', key: 'b', render: (_, e) => e.recordedBy?.fullName ?? '—' },
            { title: 'Amount', dataIndex: 'amount', align: 'right', render: (v: number) => <Typography.Text strong>{inr(v)}</Typography.Text> },
          ]}
        />
      </Card>
      <DepositModal rider={deposit} onClose={() => setDeposit(null)} />
    </Space>
  );
}
