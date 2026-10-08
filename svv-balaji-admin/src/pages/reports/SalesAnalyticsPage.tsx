import { ArrowDownOutlined, ArrowUpOutlined, DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Alert, App as AntApp, Button, Card, Col, DatePicker, Row, Segmented, Space, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { apiErrorMessage } from '@shared/api/client';
import { reportsApi, type ReorderRow, type ReportQuery, type SalesReport } from '@shared/api/reports';
import type { SalesChannel } from '@shared/api/types';
import { useAuth } from '@shared/auth/useAuth';
import { BranchSelect } from '@shared/components/pickers';
import { PageHeader } from '@shared/components/PageHeader';
import { CohortTable, inr, Legend, periodLabel, SERIES, ShareBars, StackedBarChart, type Series } from '../../components/charts';
import { ORDER_STATUS_LABEL } from '../sales/orderStatus';

const { Text } = Typography;
const { RangePicker } = DatePicker;

const FMT = 'YYYY-MM-DD';

export const RANGE_PRESETS: { label: string; value: [Dayjs, Dayjs] }[] = [
  { label: 'Last 7 days', value: [dayjs().subtract(6, 'day'), dayjs()] },
  { label: 'Last 30 days', value: [dayjs().subtract(29, 'day'), dayjs()] },
  { label: 'This month', value: [dayjs().startOf('month'), dayjs()] },
  { label: 'Last month', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
  { label: 'Last 90 days', value: [dayjs().subtract(89, 'day'), dayjs()] },
  { label: 'This year', value: [dayjs().startOf('year'), dayjs()] },
];

type TrendKey = 'b2b' | 'b2c' | 'pos';
const TREND_SERIES: Series<TrendKey>[] = [
  { key: 'b2b', label: 'B2B', color: SERIES.blue },
  { key: 'b2c', label: 'B2C', color: SERIES.orange },
  { key: 'pos', label: 'Store counter (POS)', color: SERIES.aqua },
];

const REORDER_TAG: Record<ReorderRow['state'], { color: string; label: string }> = {
  OVERDUE: { color: 'red', label: 'Overdue' },
  DUE: { color: 'gold', label: 'Due' },
  ON_TRACK: { color: 'green', label: 'On track' },
  ONE_ORDER: { color: 'default', label: 'One order so far' },
};

/** A KPI tile: value, and the change against the previous period when there is one. */
export function Kpi({ label, value, change, hint, invert }: { label: string; value: ReactNode; change?: number | null; hint?: ReactNode; invert?: boolean }) {
  const good = change != null && (invert ? change < 0 : change > 0);
  return (
    <Card size="small" style={{ borderRadius: 12, height: '100%' }} bodyStyle={{ padding: '14px 16px' }}>
      <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>
      <div style={{ fontSize: 22, fontWeight: 600, fontVariantNumeric: 'tabular-nums', lineHeight: 1.3, marginTop: 2 }}>{value}</div>
      <div style={{ fontSize: 12, minHeight: 18 }}>
        {change != null ? (
          <Text type={change === 0 ? 'secondary' : good ? 'success' : 'danger'} style={{ fontSize: 12 }}>
            {change > 0 ? <ArrowUpOutlined /> : change < 0 ? <ArrowDownOutlined /> : null} {Math.abs(change)}% vs previous period
          </Text>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>{hint ?? ''}</Text>
        )}
      </div>
    </Card>
  );
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Sales Analytics (`/reports`). Everything on the page is one call to
 * GET /reports/sales; the filters above it are the query.
 */
export function SalesAnalyticsPage() {
  const { message } = AntApp.useApp();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [range, setRange] = useState<[Dayjs, Dayjs]>(RANGE_PRESETS[1].value);
  const [channel, setChannel] = useState<'ALL' | SalesChannel>('ALL');
  const [branchId, setBranchId] = useState<string | undefined>();
  const [exporting, setExporting] = useState(false);

  const query: ReportQuery = {
    from: range[0].format(FMT),
    to: range[1].format(FMT),
    channel: channel === 'ALL' ? undefined : channel,
    branchId,
  };
  const q = useQuery({
    queryKey: ['reports', 'sales', query],
    queryFn: () => reportsApi.sales(query),
    placeholderData: keepPreviousData,
  });
  const d = q.data;

  const trendSeries = useMemo(
    () => TREND_SERIES.filter((s) => (channel === 'B2B' ? s.key === 'b2b' : channel === 'B2C' ? s.key !== 'b2b' : true)),
    [channel],
  );

  const exportCsv = async () => {
    setExporting(true);
    try {
      downloadBlob(await reportsApi.salesCsv(query), `sales-orders-${query.from}-to-${query.to}.csv`);
    } catch (e) {
      message.error(apiErrorMessage(e, 'Could not export the orders'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ padding: '16px 8px 32px', maxWidth: 1400, margin: '0 auto' }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <PageHeader
          title="Sales Analytics"
          subtitle="Orders and counter sales placed in the range and not cancelled. Amounts include GST."
          actions={
            <Space wrap>
              <Button icon={<ReloadOutlined />} onClick={() => void q.refetch()} loading={q.isFetching} />
              <Button icon={<DownloadOutlined />} loading={exporting} onClick={() => void exportCsv()}>Export orders (CSV)</Button>
            </Space>
          }
        />

        <Card size="small" style={{ borderRadius: 12 }}>
          <Space wrap size={12}>
            <RangePicker
              value={range}
              presets={RANGE_PRESETS}
              allowClear={false}
              disabledDate={(dt) => dt.isAfter(dayjs(), 'day')}
              onChange={(v) => v?.[0] && v[1] && setRange([v[0], v[1]])}
            />
            <Segmented
              value={channel}
              onChange={(v) => setChannel(v as typeof channel)}
              options={[{ label: 'All channels', value: 'ALL' }, { label: 'B2B', value: 'B2B' }, { label: 'B2C', value: 'B2C' }]}
            />
            {isSuperAdmin ? (
              <div style={{ width: 220 }}>
                <BranchSelect value={branchId} onChange={setBranchId} placeholder="All branches" allowClear />
              </div>
            ) : null}
            {d ? (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Compared with {dayjs(d.previousRange.from).format('D MMM')} – {dayjs(d.previousRange.to).format('D MMM YYYY')}
              </Text>
            ) : null}
          </Space>
        </Card>

        {q.isError ? <Alert type="error" showIcon message={apiErrorMessage(q.error, 'Could not load the report')} /> : null}

        {d ? <SalesBody d={d} trendSeries={trendSeries} /> : q.isLoading ? <Card loading style={{ borderRadius: 12 }} /> : null}
      </Space>
    </div>
  );
}

function SalesBody({ d, trendSeries }: { d: SalesReport; trendSeries: Series<TrendKey>[] }) {
  const k = d.kpis;
  const grainWord = d.granularity === 'day' ? 'day' : d.granularity === 'week' ? 'week (from Monday)' : 'month';

  const productColumns: ColumnsType<SalesReport['topProducts'][number]> = [
    { title: 'Product', key: 'name', render: (_, r) => <Space direction="vertical" size={0}><Text strong>{r.name}</Text><Text type="secondary" style={{ fontSize: 12 }}>{r.sku}</Text></Space> },
    { title: 'Units', dataIndex: 'units', align: 'right' },
    { title: 'Order lines', dataIndex: 'orders', align: 'right' },
    { title: 'Revenue', dataIndex: 'revenue', align: 'right', render: (v: number) => inr(v) },
    { title: 'Share', dataIndex: 'share', align: 'right', render: (v: number) => `${v}%` },
  ];
  const regionColumns: ColumnsType<SalesReport['byRegion'][number]> = [
    { title: 'State', dataIndex: 'state' },
    { title: 'Orders', dataIndex: 'orders', align: 'right' },
    { title: 'Customers', dataIndex: 'customers', align: 'right', render: (v: number, r) => (r.state && v === 0 ? '—' : v) },
    { title: 'Revenue', dataIndex: 'revenue', align: 'right', render: (v: number) => inr(v) },
    { title: 'Share', dataIndex: 'share', align: 'right', render: (v: number) => `${v}%` },
  ];
  const reorderColumns: ColumnsType<ReorderRow> = [
    {
      title: 'Retailer',
      key: 'name',
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Link to={`/b2b-customers/${r.customerId}`}>{r.name}</Link>
          <Text type="secondary" style={{ fontSize: 12 }}>{r.customerCode}{r.city ? ` · ${r.city}` : ''} · {r.phone}</Text>
        </Space>
      ),
    },
    { title: 'Orders', dataIndex: 'orders', align: 'right' },
    { title: 'Usual gap', dataIndex: 'avgGapDays', align: 'right', render: (v: number | null) => (v === null ? '—' : `${v} days`) },
    { title: 'Last order', dataIndex: 'lastOrderDate', render: (v: string, r) => `${dayjs(v).format('D MMM YYYY')} (${r.daysSinceLast} d ago)` },
    { title: 'Expected next', dataIndex: 'expectedNextDate', render: (v: string | null) => (v ? dayjs(v).format('D MMM YYYY') : '—') },
    { title: 'Lifetime value', dataIndex: 'lifetimeValue', align: 'right', render: (v: number) => inr(v) },
    { title: 'Status', dataIndex: 'state', render: (s: ReorderRow['state']) => <Tag color={REORDER_TAG[s].color}>{REORDER_TAG[s].label}</Tag> },
  ];
  const trendColumns: ColumnsType<SalesReport['trend'][number]> = [
    { title: d.granularity === 'month' ? 'Month' : d.granularity === 'week' ? 'Week from' : 'Day', dataIndex: 'period', render: (p: string) => periodLabel(p) },
    ...trendSeries.map((s) => ({ title: s.label, dataIndex: s.key, align: 'right' as const, render: (v: number) => inr(v) })),
    { title: 'Total', dataIndex: 'total', align: 'right', render: (v: number) => inr(v) },
    { title: 'Orders', dataIndex: 'orders', align: 'right' },
  ];

  return (
    <>
      <Row gutter={[12, 12]}>
        <Col xs={12} md={8} xl={4}><Kpi label="Revenue (incl. GST)" value={inr(k.revenue)} change={d.changes.revenue} /></Col>
        <Col xs={12} md={8} xl={4}><Kpi label="Net of GST" value={inr(k.netOfTax)} hint="What the business keeps" /></Col>
        <Col xs={12} md={8} xl={4}><Kpi label="Orders + counter sales" value={(k.orders + k.posSales).toLocaleString('en-IN')} change={d.changes.orders} hint={`${k.posSales} at POS`} /></Col>
        <Col xs={12} md={8} xl={4}><Kpi label="Average order value" value={inr(k.avgOrderValue)} change={d.changes.avgOrderValue} /></Col>
        <Col xs={12} md={8} xl={4}><Kpi label="Units sold" value={k.units.toLocaleString('en-IN')} change={d.changes.units} /></Col>
        <Col xs={12} md={8} xl={4}><Kpi label="Ordering customers" value={k.customers} change={d.changes.customers} hint={`${k.newCustomers} new`} /></Col>
        <Col xs={12} md={8} xl={4}><Kpi label="New customers" value={k.newCustomers} hint="First order ever in this range" /></Col>
        <Col xs={12} md={8} xl={4}><Kpi label="Repeat rate" value={`${k.repeatRate}%`} hint={`${k.returningCustomers} had ordered before`} /></Col>
        <Col xs={12} md={8} xl={4}><Kpi label="Cancelled" value={k.cancelledOrders} hint={`${k.cancellationRate}% of orders placed`} /></Col>
        <Col xs={12} md={8} xl={4}><Kpi label="Return / exchange requests" value={k.returnRequests} change={d.changes.returnRequests} invert /></Col>
        <Col xs={12} md={8} xl={4}><Kpi label="Return rate" value={`${k.returnRate}%`} hint="Requests per order sold" /></Col>
        <Col xs={12} md={8} xl={4}>
          <Kpi label="Gross margin" value="—" hint={<span title={d.margin.reason}>Needs product cost (with client)</span>} />
        </Col>
      </Row>

      <Card
        style={{ borderRadius: 12 }}
        title="Revenue over time"
        extra={<Text type="secondary" style={{ fontSize: 12 }}>One bar per {grainWord}</Text>}
      >
        <Tabs
          size="small"
          items={[
            {
              key: 'chart',
              label: 'Chart',
              children: (
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  {trendSeries.length > 1 ? <Legend series={trendSeries} /> : null}
                  <StackedBarChart
                    data={d.trend}
                    series={trendSeries}
                    tooltipExtra={(r) => <div style={{ color: '#52514e', marginTop: 2 }}>{r.orders} orders</div>}
                  />
                </Space>
              ),
            },
            { key: 'table', label: 'Table', children: <Table size="small" rowKey="period" columns={trendColumns} dataSource={d.trend} pagination={false} scroll={{ y: 320 }} /> },
          ]}
        />
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card style={{ borderRadius: 12, height: '100%' }} title="Where sales came from">
            <ShareBars
              rows={d.bySource.map((s) => ({ key: s.key, label: s.label, value: s.revenue, hint: `${s.orders} orders · ${s.share}%` }))}
              emptyText="No sales in this range"
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card style={{ borderRadius: 12, height: '100%' }} title="Revenue by category">
            <ShareBars
              rows={d.byCategory.map((c) => ({ key: c.categoryId ?? 'none', label: c.name, value: c.revenue, hint: `${c.units} units · ${c.share}%` }))}
              emptyText="No sales in this range"
            />
          </Card>
        </Col>
      </Row>

      <Card style={{ borderRadius: 12 }} title="Top products">
        <Table size="small" rowKey="productId" columns={productColumns} dataSource={d.topProducts} pagination={false} scroll={{ x: 640 }} />
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card style={{ borderRadius: 12, height: '100%' }} title="By state" extra={<Text type="secondary" style={{ fontSize: 12 }}>Customer billing state; POS by store</Text>}>
            <Table size="small" rowKey="state" columns={regionColumns} dataSource={d.byRegion} pagination={false} />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card style={{ borderRadius: 12, height: '100%' }} title="Orders placed by current status">
            <ShareBars
              format={(n) => String(n)}
              rows={Object.entries(d.statusMix)
                .sort((a, b) => b[1] - a[1])
                .map(([s, n]) => ({ key: s, label: ORDER_STATUS_LABEL[s as keyof typeof ORDER_STATUS_LABEL] ?? s, value: n }))}
              emptyText="No orders placed in this range"
            />
          </Card>
        </Col>
      </Row>

      {d.reorder ? (
        <Card
          style={{ borderRadius: 12 }}
          title="B2B reorder cycles"
          extra={
            <Text type="secondary" style={{ fontSize: 12 }}>
              Typical gap between orders: {d.reorder.medianGapDays === null ? '—' : `${d.reorder.medianGapDays} days`}
            </Text>
          }
        >
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Text type="secondary">
              Each retailer&apos;s own rhythm from their order history. <b>Due</b> once they pass their usual gap,{' '}
              <b>overdue</b> past 1.5× it - time for the sales executive to call.
            </Text>
            <Space wrap>
              <Tag color="red">Overdue {d.reorder.counts.overdue}</Tag>
              <Tag color="gold">Due {d.reorder.counts.due}</Tag>
              <Tag color="green">On track {d.reorder.counts.onTrack}</Tag>
              <Tag>One order so far {d.reorder.counts.oneOrder}</Tag>
            </Space>
            <Table size="small" rowKey="customerId" columns={reorderColumns} dataSource={d.reorder.customers} pagination={{ pageSize: 10 }} scroll={{ x: 900 }} />
          </Space>
        </Card>
      ) : null}

      <Card
        style={{ borderRadius: 12 }}
        title="Customer cohorts"
        extra={<Text type="secondary" style={{ fontSize: 12 }}>% of each month&apos;s new customers who ordered again</Text>}
      >
        <CohortTable rows={d.cohorts} />
      </Card>

      <Alert type="info" showIcon message="Gross margin is not shown" description={d.margin.reason} />
    </>
  );
}
