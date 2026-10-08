import { ReloadOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Col, DatePicker, Descriptions, Row, Space, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiErrorMessage } from '@shared/api/client';
import { reportsApi, type AgeingBucket, type FinanceChannel, type FinanceReport, type ReportQuery } from '@shared/api/reports';
import { useAuth } from '@shared/auth/useAuth';
import { BranchSelect } from '@shared/components/pickers';
import { PageHeader } from '@shared/components/PageHeader';
import { inr, Legend, LineChart, periodLabel, SERIES, ShareBars, type Series } from '../../components/charts';
import { Kpi, RANGE_PRESETS } from '../reports/SalesAnalyticsPage';

const { Text } = Typography;
const { RangePicker } = DatePicker;

const AGEING_LABEL: Record<AgeingBucket, string> = {
  NOT_DUE: 'Not yet due',
  D1_30: '1-30 days overdue',
  D31_60: '31-60 days',
  D61_90: '61-90 days',
  D90_PLUS: 'Over 90 days',
};

const REFUND_LABEL: Record<string, string> = {
  WALLET: 'Refund wallet',
  UPI: 'UPI (manual)',
  BANK: 'Bank transfer (manual)',
  CREDIT_NOTE: 'B2B credit note',
  UNSPECIFIED: 'Method not recorded',
};

type TrendKey = 'billed' | 'collected';
const TREND_SERIES: Series<TrendKey>[] = [
  { key: 'billed', label: 'Billed (orders placed)', color: SERIES.blue },
  { key: 'collected', label: 'Collected (money received)', color: SERIES.orange },
];

/**
 * Earnings & Financial MIS (`/earnings`). Read-only: every figure comes from
 * GET /reports/finance. Money is recorded on the screens that own it
 * (Receivables & Credit, Tax Invoices, returns, POS), never here.
 */
export function EarningsFinancePage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [range, setRange] = useState<[Dayjs, Dayjs]>(RANGE_PRESETS[2].value);
  const [branchId, setBranchId] = useState<string | undefined>();

  const query: ReportQuery = { from: range[0].format('YYYY-MM-DD'), to: range[1].format('YYYY-MM-DD'), branchId };
  const q = useQuery({
    queryKey: ['reports', 'finance', query],
    queryFn: () => reportsApi.finance(query),
    placeholderData: keepPreviousData,
  });

  return (
    <div style={{ padding: '16px 8px 32px', maxWidth: 1400, margin: '0 auto' }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <PageHeader
          title="Earnings & Financial MIS"
          subtitle="Billed is what was sold in the range; collected is money that arrived in the range, whatever it was for."
          actions={<Button icon={<ReloadOutlined />} onClick={() => void q.refetch()} loading={q.isFetching} />}
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
            {isSuperAdmin ? (
              <div style={{ width: 220 }}>
                <BranchSelect value={branchId} onChange={setBranchId} placeholder="All branches" allowClear />
              </div>
            ) : null}
          </Space>
        </Card>
        {q.isError ? <Alert type="error" showIcon message={apiErrorMessage(q.error, 'Could not load the report')} /> : null}
        {q.data ? <FinanceBody d={q.data} /> : q.isLoading ? <Card loading style={{ borderRadius: 12 }} /> : null}
      </Space>
    </div>
  );
}

function FinanceBody({ d }: { d: FinanceReport }) {
  const t = d.totals;
  const channelColumns: ColumnsType<FinanceChannel> = [
    { title: 'Channel', dataIndex: 'label', render: (v: string, r) => <Space direction="vertical" size={0}><Text strong>{v}</Text><Text type="secondary" style={{ fontSize: 12 }}>{r.orders} {r.key === 'POS' ? 'sales' : 'orders'} · {r.share}% of billing</Text></Space> },
    { title: 'Billed', dataIndex: 'billed', align: 'right', render: inr },
    { title: 'GST in it', dataIndex: 'tax', align: 'right', render: inr },
    { title: 'Net of GST', dataIndex: 'netOfTax', align: 'right', render: inr },
    { title: 'Paid so far', dataIndex: 'collected', align: 'right', render: inr },
    { title: 'Still unpaid', dataIndex: 'outstanding', align: 'right', render: (v: number) => (v > 0 ? <Text type="warning">{inr(v)}</Text> : inr(v)) },
    { title: 'Discounts', dataIndex: 'discounts', align: 'right', render: inr },
    { title: 'Coins redeemed', dataIndex: 'coinsRedeemed', align: 'right', render: inr },
    { title: 'Refunded', dataIndex: 'refunds', align: 'right', render: inr },
    { title: 'Avg order', dataIndex: 'avgOrderValue', align: 'right', render: inr },
  ];
  const debtorColumns: ColumnsType<FinanceReport['receivables']['topDebtors'][number]> = [
    { title: 'Retailer', key: 'name', render: (_, r) => <Space direction="vertical" size={0}><Link to={`/b2b-customers/${r.customerId}`}>{r.name}</Link><Text type="secondary" style={{ fontSize: 12 }}>{r.customerCode} · {r.phone}</Text></Space> },
    { title: 'Terms', dataIndex: 'paymentTerms', render: (v: string) => v.replace('CREDIT_', '') + (v === 'PREPAID' ? '' : ' days') },
    { title: 'Outstanding', dataIndex: 'outstanding', align: 'right', render: inr },
    { title: 'Overdue', dataIndex: 'overdue', align: 'right', render: (v: number) => (v > 0 ? <Text type="danger">{inr(v)}</Text> : '—') },
    { title: 'Oldest overdue', dataIndex: 'oldestOverdueDays', align: 'right', render: (v: number) => (v ? `${v} days` : '—') },
    { title: 'Credit limit', dataIndex: 'creditLimit', align: 'right', render: (v: number | null) => (v === null ? 'No limit' : inr(v)) },
  ];
  const recentColumns: ColumnsType<FinanceReport['recentCollections'][number]> = [
    { title: 'When', dataIndex: 'at', render: (v: string) => dayjs(v).format('D MMM YYYY, HH:mm') },
    { title: 'Source', dataIndex: 'source', render: (v: string, r) => <Space size={4}><Tag>{v}</Tag><Text type="secondary" style={{ fontSize: 12 }}>{r.mode}</Text></Space> },
    { title: 'From', dataIndex: 'party', render: (v: string | null) => v ?? '—' },
    { title: 'Order / receipt', dataIndex: 'document', render: (v: string | null) => v ?? '—' },
    { title: 'Reference', dataIndex: 'reference', render: (v: string | null) => (v ? <Text copyable style={{ fontSize: 12 }}>{v}</Text> : '—') },
    { title: 'Amount', dataIndex: 'amount', align: 'right', render: inr },
  ];

  return (
    <>
      <Row gutter={[12, 12]}>
        <Col xs={12} md={8} xl={4}><Kpi label="Billed (incl. GST)" value={inr(t.billed)} hint={`${t.orders} orders & counter sales`} /></Col>
        <Col xs={12} md={8} xl={4}><Kpi label="Net of GST" value={inr(t.netOfTax)} hint={`GST ${inr(t.tax)}`} /></Col>
        <Col xs={12} md={8} xl={4}><Kpi label="Money received" value={inr(d.collections.total)} hint="Cash basis, all sources" /></Col>
        <Col xs={12} md={8} xl={4}><Kpi label="Unpaid from this range" value={inr(t.outstanding)} hint="Billed in range, not yet paid" /></Col>
        <Col xs={12} md={8} xl={4}><Kpi label="Refunded" value={inr(t.refunds)} hint={`Net revenue ${inr(t.netRevenue)}`} /></Col>
        <Col xs={12} md={8} xl={4}><Kpi label="B2B overdue (today)" value={inr(d.receivables.overdue)} hint={`of ${inr(d.receivables.outstanding)} owed`} /></Col>
      </Row>

      <Card style={{ borderRadius: 12 }} title="By channel">
        <Table size="small" rowKey="key" columns={channelColumns} dataSource={d.channels} pagination={false} scroll={{ x: 1100 }}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0}><Text strong>Total</Text></Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right"><Text strong>{inr(t.billed)}</Text></Table.Summary.Cell>
              <Table.Summary.Cell index={2} align="right">{inr(t.tax)}</Table.Summary.Cell>
              <Table.Summary.Cell index={3} align="right">{inr(t.netOfTax)}</Table.Summary.Cell>
              <Table.Summary.Cell index={4} align="right">{inr(t.collected)}</Table.Summary.Cell>
              <Table.Summary.Cell index={5} align="right">{inr(t.outstanding)}</Table.Summary.Cell>
              <Table.Summary.Cell index={6} colSpan={3} />
              <Table.Summary.Cell index={9} />
            </Table.Summary.Row>
          )}
        />
      </Card>

      <Card style={{ borderRadius: 12 }} title="Billed vs collected">
        <Tabs
          size="small"
          items={[
            {
              key: 'chart',
              label: 'Chart',
              children: (
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Legend series={TREND_SERIES} />
                  <LineChart data={d.trend} series={TREND_SERIES} />
                </Space>
              ),
            },
            {
              key: 'table',
              label: 'Table',
              children: (
                <Table size="small" rowKey="period" pagination={false} scroll={{ y: 320 }} dataSource={d.trend}
                  columns={[
                    { title: 'Period', dataIndex: 'period', render: periodLabel },
                    { title: 'Billed', dataIndex: 'billed', align: 'right', render: inr },
                    { title: 'Collected', dataIndex: 'collected', align: 'right', render: inr },
                  ]}
                />
              ),
            },
          ]}
        />
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card style={{ borderRadius: 12, height: '100%' }} title="Money received, by how" extra={<Text strong>{inr(d.collections.total)}</Text>}>
            <ShareBars color={SERIES.orange} rows={d.collections.rows.map((r) => ({ key: r.key, label: r.label, value: r.amount, hint: `${r.count} payments` }))} emptyText="Nothing received in this range" />
            {d.collections.refundWalletUsed > 0 ? (
              <Text type="secondary" style={{ display: 'block', marginTop: 12, fontSize: 12 }}>
                Plus {inr(d.collections.refundWalletUsed)} paid by customers from their refund wallet (not new money).
              </Text>
            ) : null}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card style={{ borderRadius: 12, height: '100%' }} title="Refunds" extra={<Text strong>{inr(d.refunds.total)}</Text>}>
            <Descriptions size="small" column={1} bordered>
              {Object.entries(d.refunds.returns.byMethod).map(([k, v]) => (
                <Descriptions.Item key={k} label={`Returns - ${REFUND_LABEL[k] ?? k}`}>{inr(v)}</Descriptions.Item>
              ))}
              <Descriptions.Item label={`POS bill refunds (${d.refunds.posRefunds.count})`}>{inr(d.refunds.posRefunds.amount)}</Descriptions.Item>
              <Descriptions.Item label="Return refunds issued">{d.refunds.returns.count}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card
            style={{ borderRadius: 12, height: '100%' }}
            title="GST on invoices, less credit notes"
            extra={<Space size={12}><Link to="/invoices">Tax Invoices</Link><Link to="/gst-returns">GSTR-1</Link></Space>}
          >
            <Row gutter={[12, 12]}>
              <Col xs={12} md={6}><Kpi label="Net taxable value" value={inr(d.gst.netTaxable)} hint={`${d.gst.invoices} invoices`} /></Col>
              <Col xs={12} md={6}><Kpi label="CGST" value={inr(d.gst.netCgst)} /></Col>
              <Col xs={12} md={6}><Kpi label="SGST" value={inr(d.gst.netSgst)} /></Col>
              <Col xs={12} md={6}><Kpi label="IGST" value={inr(d.gst.netIgst)} /></Col>
            </Row>
            {d.gst.creditNotes.count ? (
              <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
                After {d.gst.creditNotes.count} credit note{d.gst.creditNotes.count === 1 ? '' : 's'} taking off {inr(d.gst.creditNotes.taxable)} taxable
                and {inr(d.gst.creditNotes.tax)} GST. Invoices alone: {inr(d.gst.taxable)} taxable, {inr(d.gst.tax)} GST.
              </Text>
            ) : null}
            <Table
              style={{ marginTop: 12 }}
              size="small"
              rowKey="rate"
              pagination={false}
              dataSource={d.gst.byRate}
              locale={{ emptyText: 'No invoices issued in this range' }}
              columns={[
                { title: 'GST rate', dataIndex: 'rate', render: (v: number) => `${v}%` },
                { title: 'Taxable value', dataIndex: 'taxable', align: 'right', render: inr },
                { title: 'Tax', dataIndex: 'tax', align: 'right', render: inr },
              ]}
            />
            <Space wrap style={{ marginTop: 12 }}>
              <Tag>B2B: {d.gst.bySupply.B2B.invoices} invoices, tax {inr(d.gst.bySupply.B2B.tax)}</Tag>
              <Tag>B2C: {d.gst.bySupply.B2C.invoices} invoices, tax {inr(d.gst.bySupply.B2C.tax)}</Tag>
              {d.gst.cancelled ? <Tag color="default">{d.gst.cancelled} cancelled (excluded)</Tag> : null}
              {d.gst.eInvoice.pending ? <Tag color="gold">IRN pending {d.gst.eInvoice.pending}</Tag> : null}
              {d.gst.eInvoice.failed ? <Tag color="red">IRN failed {d.gst.eInvoice.failed}</Tag> : null}
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card style={{ borderRadius: 12, height: '100%' }} title="Owed by the business">
            <Descriptions size="small" column={1} bordered>
              <Descriptions.Item label={<Link to="/affiliates/payouts">Affiliate commission ready to pay</Link>}>
                {inr(d.payables.affiliateCommission.amount)} ({d.payables.affiliateCommission.lines} items)
              </Descriptions.Item>
              <Descriptions.Item label={<Link to="/riders/earnings">Rider pay earned in this range</Link>}>
                {inr(d.payables.riderEarnings)}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>

      <Card
        style={{ borderRadius: 12 }}
        title="B2B receivables as of today"
        extra={<Link to="/receivables">Receivables & Credit</Link>}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space wrap>
            {(Object.keys(AGEING_LABEL) as AgeingBucket[]).map((b) => (
              <Tag key={b} color={b === 'NOT_DUE' ? 'default' : b === 'D1_30' ? 'gold' : 'red'}>
                {AGEING_LABEL[b]}: {inr(d.receivables.ageing[b])}
              </Tag>
            ))}
          </Space>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {d.receivables.debtors} retailers owe money. Credit period runs from the{' '}
            {d.receivables.creditPeriodStart === 'DISPATCH' ? 'dispatch date' : 'order date'}.
          </Text>
          <Table size="small" rowKey="customerId" columns={debtorColumns} dataSource={d.receivables.topDebtors} pagination={false} scroll={{ x: 760 }} locale={{ emptyText: 'Nobody owes anything' }} />
        </Space>
      </Card>

      <Card style={{ borderRadius: 12 }} title="Latest money received" extra={<Text type="secondary" style={{ fontSize: 12 }}>Online, COD and credit receipts; last 50 in the range</Text>}>
        <Table size="small" rowKey={(r) => `${r.source}-${r.id}`} columns={recentColumns} dataSource={d.recentCollections} pagination={{ pageSize: 10 }} scroll={{ x: 820 }} locale={{ emptyText: 'Nothing received in this range' }} />
      </Card>
    </>
  );
}
