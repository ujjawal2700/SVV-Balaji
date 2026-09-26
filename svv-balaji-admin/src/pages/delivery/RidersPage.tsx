import { CheckCircleOutlined, StopOutlined, TeamOutlined, WalletOutlined, WifiOutlined } from '@ant-design/icons';
import { Button, Card, Col, Input, Row, Space, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { RiderRow, RiderStatus } from '@shared/api/delivery';
import { useCan } from '@shared/auth/useCan';
import { PageHeader } from '@shared/components/PageHeader';
import { useRiders } from '@shared/hooks/useDelivery';
import { StatCard } from '../customers/detailPageParts';
import { ApproveModal, OutletSelect, RIDER_STATUS, RiderCell, inr, useRiderActions, vehicleText } from './riders/riderParts';

type Tab = 'ALL' | RiderStatus;
const TABS: Tab[] = ['ALL', 'ACTIVE', 'PENDING_APPROVAL', 'SUSPENDED', 'REJECTED', 'PENDING_VERIFICATION'];

/** Every rider, by status. A row opens the rider's page (deliveries, earnings, cash, settings). */
export function RidersPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.includes(params.get('status') as Tab) ? params.get('status') : 'ALL') as Tab;
  const [q, setQ] = useState('');
  const [outlet, setOutlet] = useState<string | undefined>();
  const riders = useRiders({ q: q || undefined, warehouseId: outlet });
  const canManage = useCan('RIDERS_MANAGE');
  const actions = useRiderActions();
  const navigate = useNavigate();
  const [approve, setApprove] = useState<RiderRow | null>(null);

  const all = riders.data ?? [];
  const count = (s: RiderStatus) => all.filter((r) => r.status === s).length;
  const rows = useMemo(() => (tab === 'ALL' ? all : all.filter((r) => r.status === tab)), [all, tab]);
  const online = all.filter((r) => r.status === 'ACTIVE' && r.availability === 'ONLINE').length;
  const cashHeld = all.reduce((a, r) => a + (r.cashInHand ?? 0), 0);
  const open = (r: RiderRow) => navigate(`/riders/${r.id}`);

  const columns: ColumnsType<RiderRow> = [
    { title: 'Rider', key: 'r', width: 250, render: (_, r) => <RiderCell rider={r} onOpen={() => open(r)} /> },
    { title: 'Status', key: 's', render: (_, r) => <Tag color={RIDER_STATUS[r.status].color}>{RIDER_STATUS[r.status].label}</Tag> },
    {
      title: 'Now', key: 'n',
      render: (_, r) => (r.status === 'ACTIVE' ? (
        <Space size={4} wrap>
          <Tag color={r.availability === 'ONLINE' ? 'green' : 'default'}>{r.availability === 'ONLINE' ? 'Online' : 'Offline'}</Tag>
          {r.activeTasks ? <Tag color="orange">{r.activeTasks} in hand</Tag> : null}
        </Space>
      ) : '—'),
    },
    { title: 'Outlet', key: 'o', render: (_, r) => r.warehouse?.name ?? '—' },
    { title: 'Vehicle', key: 'v', render: (_, r) => vehicleText(r.vehicleType, r.vehicleNumber) },
    { title: 'City', dataIndex: 'city', render: (v) => v ?? '—' },
    { title: 'Cash held', key: 'c', align: 'right', render: (_, r) => (r.cashInHand ? <Typography.Text strong>{inr(r.cashInHand)}</Typography.Text> : '—') },
    { title: 'Joined', dataIndex: 'createdAt', render: (d: string) => dayjs(d).format('D MMM YYYY') },
    {
      title: '', key: 'act', fixed: 'right', width: 170,
      render: (_, r) => (
        <Space onClick={(e) => e.stopPropagation()}>
          {canManage && r.status === 'PENDING_APPROVAL' ? <Button size="small" type="primary" onClick={() => setApprove(r)}>Approve</Button> : null}
          {canManage && r.status === 'ACTIVE' ? <Button size="small" danger icon={<StopOutlined />} onClick={() => actions.suspend(r)}>Suspend</Button> : null}
          {canManage && r.status === 'SUSPENDED' ? <Button size="small" onClick={() => actions.reactivate(r)}>Reactivate</Button> : null}
          <Button size="small" type="link" onClick={() => open(r)}>Open</Button>
        </Space>
      ),
    },
  ];

  const label = (t: Tab) => {
    const n = t === 'ALL' ? all.length : count(t);
    const text = t === 'ALL' ? 'All' : t === 'PENDING_VERIFICATION' ? 'Unverified' : RIDER_STATUS[t].label;
    return <span>{text} <Typography.Text type="secondary">({n})</Typography.Text></span>;
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader title="All Riders" subtitle="Everyone who signed up to deliver. Open a rider for their deliveries, earnings, cash in hand and settings." />
      <Row gutter={[16, 16]}>
        <Col xs={12} lg={6}><StatCard icon={<TeamOutlined />} tone="slate" label="Riders" value={all.length} /></Col>
        <Col xs={12} lg={6}><StatCard icon={<CheckCircleOutlined />} tone="green" label="Active" value={count('ACTIVE')} /></Col>
        <Col xs={12} lg={6}><StatCard icon={<WifiOutlined />} tone="blue" label="Online now" value={online} /></Col>
        <Col xs={12} lg={6}><StatCard icon={<WalletOutlined />} tone="amber" label="COD cash held" value={inr(cashHeld)} /></Col>
      </Row>
      <Card className="page-card" styles={{ body: { paddingTop: 4 } }}>
        <Tabs
          activeKey={tab}
          onChange={(k) => setParams(k === 'ALL' ? {} : { status: k }, { replace: true })}
          items={TABS.map((t) => ({ key: t, label: label(t) }))}
          tabBarExtraContent={
            <Space wrap>
              <OutletSelect allowClear placeholder="All outlets" value={outlet} onChange={setOutlet} style={{ width: 180 }} />
              <Input.Search allowClear placeholder="Name, phone, code" onSearch={setQ} style={{ width: 200 }} />
            </Space>
          }
        />
        <Table<RiderRow>
          rowKey="id" columns={columns} dataSource={rows} loading={riders.isLoading} scroll={{ x: 1250 }} pagination={{ pageSize: 20, hideOnSinglePage: true }}
          onRow={(r) => ({ onClick: () => open(r), style: { cursor: 'pointer' } })}
        />
      </Card>
      <ApproveModal rider={approve} onClose={() => setApprove(null)} />
    </Space>
  );
}
