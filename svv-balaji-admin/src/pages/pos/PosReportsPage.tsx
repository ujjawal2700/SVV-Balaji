import { BarChartOutlined, ClockCircleOutlined, FileDoneOutlined, PieChartOutlined, ShopOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, DatePicker, Progress, Row, Space, Statistic, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import type { PosShift } from '@shared/api/pos';
import { useAuth } from '@shared/auth/useAuth';
import { useCan } from '@shared/auth/useCan';
import { usePosReport, usePosShifts } from '@shared/hooks/usePos';
import { toIsoDay } from '@shared/utils/format';
import { Can } from '../../components/Can';
import { PageHeader } from '../../components/PageHeader';
import { formatCurrency, formatDateTime } from '../../utils/format';
import { CloseShiftModal } from './PosNewSalePage';
import { OutletPicker } from './posShared';

const { Text } = Typography;

/**
 * Counter performance and cash-drawer reconciliation, computed by the server
 * from recorded sales, refunds and shifts. Nothing on this page is typed in
 * except the cash a cashier counts when closing a shift.
 */
export function PosReportsPage() {
  const { user } = useAuth();
  const canReconcileAny = useCan('POS_RECONCILE');
  const [outletId, setOutletId] = useState<string | undefined>();
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>([dayjs(), dayjs()]);
  const [closing, setClosing] = useState<PosShift | null>(null);
  const from = toIsoDay(range?.[0]);
  const to = toIsoDay(range?.[1]);

  const report = usePosReport({ outletId, from, to });
  const shifts = usePosShifts({ outletId, from, to });
  // Open shifts from earlier days still need closing, so show them whatever the range.
  const stillOpen = usePosShifts({ outletId, status: 'OPEN' });
  const r = report.data;
  const shiftRows = [...(stillOpen.data ?? []).filter((s) => !(shifts.data ?? []).some((x) => x.id === s.id)), ...(shifts.data ?? [])];

  const net = r?.totals.netSales ?? 0;
  const pct = (v: number) => (net > 0 ? Math.round((v / net) * 100) : 0);

  const shiftColumns: ColumnsType<PosShift> = [
    {
      title: 'Shift & Store',
      key: 'shift',
      width: 230,
      render: (_, s) => (
        <Space direction="vertical" size={2}>
          <Text strong style={{ color: '#1890ff' }}>{s.shiftNumber}</Text>
          <Text style={{ fontSize: 12 }}><ShopOutlined /> {s.outlet?.name}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}><UserOutlined /> {s.cashier?.fullName} · {formatDateTime(s.openedAt)}{s.closedAt ? ` – ${formatDateTime(s.closedAt)}` : ''}</Text>
        </Space>
      ),
    },
    { title: 'Opening cash', key: 'open', width: 120, render: (_, s) => formatCurrency(s.openingCash) },
    { title: 'Cash sales', key: 'cash', width: 120, render: (_, s) => <Text style={{ color: '#52c41a' }}>{formatCurrency(s.salesByMode.CASH)}</Text> },
    { title: 'Digital', key: 'digital', width: 120, render: (_, s) => <Text style={{ color: '#13c2c2' }}>{formatCurrency(s.salesByMode.UPI + s.salesByMode.CARD)}</Text> },
    { title: 'Cash refunds', key: 'ref', width: 120, render: (_, s) => (s.cashRefunds ? <Text type="danger">-{formatCurrency(s.cashRefunds)}</Text> : '—') },
    { title: 'Expected cash', key: 'exp', width: 130, render: (_, s) => <Text strong>{formatCurrency(s.expectedCash)}</Text> },
    { title: 'Counted', key: 'counted', width: 120, render: (_, s) => (s.countedCash === null ? '—' : formatCurrency(s.countedCash)) },
    {
      title: 'Status',
      key: 'status',
      width: 190,
      render: (_, s) =>
        s.status === 'OPEN' ? (
          <Tag color="processing">OPEN</Tag>
        ) : s.discrepancy === 0 ? (
          <Tag color="success">BALANCED (₹0)</Tag>
        ) : (
          <Tag color="warning">{(s.discrepancy ?? 0) < 0 ? 'SHORT' : 'OVER'} ({formatCurrency(s.discrepancy)})</Tag>
        ),
    },
    {
      title: 'Action',
      key: 'action',
      width: 150,
      fixed: 'right',
      render: (_, s) =>
        s.status === 'OPEN' && (s.cashierId === user?.id || canReconcileAny) ? (
          <Button type="primary" size="small" icon={<FileDoneOutlined />} onClick={() => setClosing(s)}>Close & reconcile</Button>
        ) : s.notes ? (
          <Text type="secondary" style={{ fontSize: 11 }}>{s.notes}</Text>
        ) : null,
    },
  ];

  return (
    <Can do="POS_VIEW" fallback={<div style={{ padding: 24 }}>Access Denied</div>}>
      <PageHeader
        title="POS Sale Reports & Cash Shift Reconciliation"
        subtitle="Counter sales, payment split, cashier shifts and drawer reconciliation - all computed from recorded sales. Refunds count on the day the money went back."
        actions={[
          <OutletPicker key="outlet" allowAll value={outletId} onChange={setOutletId} style={{ width: 240 }} />,
          <DatePicker.RangePicker key="range" value={range} onChange={setRange} allowClear={false} />,
        ]}
      />

      {report.error ? <Alert style={{ marginBottom: 16 }} type="error" showIcon message={apiErrorMessage(report.error, 'Could not load the report')} /> : null}

      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ borderRadius: 8 }} loading={report.isLoading}>
            <Statistic title={`Net counter revenue (${r?.totals.salesCount ?? 0} bill${r?.totals.salesCount === 1 ? '' : 's'})`} value={net} precision={2} prefix="₹" valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ borderRadius: 8 }} loading={report.isLoading}>
            <Statistic title="Average bill" value={r?.totals.averageBill ?? 0} precision={2} prefix="₹" valueStyle={{ color: '#1890ff' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ borderRadius: 8 }} loading={report.isLoading}>
            <Statistic title="GST collected" value={r?.totals.taxCollected ?? 0} precision={2} prefix="₹" valueStyle={{ color: '#722ed1' }} />
            <Text type="secondary" style={{ fontSize: 12 }}>Discounts given: {formatCurrency(r?.totals.discountGiven ?? 0)}</Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ borderRadius: 8 }} loading={report.isLoading}>
            <Statistic title={`Refunds (${r?.totals.refundsCount ?? 0})`} value={r?.totals.refundsAmount ?? 0} precision={2} prefix="₹" valueStyle={{ color: '#ff4d4f' }} />
          </Card>
        </Col>
      </Row>

      <Card title={<Space><PieChartOutlined style={{ color: '#1890ff' }} /><span>Payment split</span></Space>} style={{ marginBottom: 20, borderRadius: 8 }} loading={report.isLoading}>
        <Row gutter={[24, 16]} align="middle">
          {([['CASH', 'Cash', '#52c41a'], ['UPI', 'UPI QR', '#13c2c2'], ['CARD', 'Card', '#1890ff']] as const).map(([m, label, color]) => (
            <Col xs={24} md={8} key={m}>
              <Text type="secondary">{label} ({pct(r?.byMode[m].total ?? 0)}%, {r?.byMode[m].count ?? 0} bill{(r?.byMode[m].count ?? 0) === 1 ? '' : 's'})</Text>
              <Progress percent={pct(r?.byMode[m].total ?? 0)} strokeColor={color} />
              <Text strong>{formatCurrency(r?.byMode[m].total ?? 0)}</Text>
            </Col>
          ))}
        </Row>
      </Card>

      <Card
        title={<Space><ClockCircleOutlined style={{ color: '#fa8c16' }} /><span>Cashier shifts & drawer reconciliation</span></Space>}
        bodyStyle={{ padding: 0 }}
        style={{ marginBottom: 20, borderRadius: 8 }}
      >
        <Table
          dataSource={shiftRows}
          columns={shiftColumns}
          rowKey="id"
          loading={shifts.isLoading}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 1300 }}
          locale={{ emptyText: 'No shifts in this period' }}
        />
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title={<Space><BarChartOutlined style={{ color: '#52c41a' }} /><span>Top selling products</span></Space>} style={{ borderRadius: 8 }}>
            <Table
              dataSource={r?.topItems ?? []}
              rowKey="productId"
              pagination={false}
              size="small"
              scroll={{ x: 560 }}
              locale={{ emptyText: 'No sales in this period' }}
              columns={[
                { title: 'SKU', dataIndex: 'sku', render: (v: string | null) => (v ? <Tag color="blue">{v}</Tag> : '—') },
                { title: 'Product', dataIndex: 'name', render: (v: string) => <Text strong>{v}</Text> },
                { title: 'Packs sold', dataIndex: 'quantity', align: 'right' },
                { title: 'Revenue', dataIndex: 'revenue', align: 'right', render: (v: number) => <Text strong style={{ color: '#52c41a' }}>{formatCurrency(v)}</Text> },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title={<Space><ShopOutlined /><span>By store</span></Space>} style={{ borderRadius: 8 }}>
            <Table
              dataSource={r?.byOutlet ?? []}
              rowKey="outletId"
              pagination={false}
              size="small"
              locale={{ emptyText: 'No sales in this period' }}
              columns={[
                { title: 'Store', dataIndex: 'name' },
                { title: 'Bills', dataIndex: 'count', align: 'right' },
                { title: 'Net', dataIndex: 'total', align: 'right', render: (v: number) => formatCurrency(v) },
              ]}
            />
          </Card>
        </Col>
      </Row>

      {closing ? (
        <CloseShiftModal open onClose={() => setClosing(null)} shiftId={closing.id} shiftNumber={closing.shiftNumber} expected={closing.expectedCash} />
      ) : null}
    </Can>
  );
}
