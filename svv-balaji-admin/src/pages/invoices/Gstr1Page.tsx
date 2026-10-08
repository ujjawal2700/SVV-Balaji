import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, App as AntApp, Button, Card, Col, DatePicker, Row, Space, Table, Tabs, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiErrorMessage } from '@shared/api/client';
import { creditNotesApi, type Gstr1Report } from '@shared/api/creditNotes';
import { PageHeader } from '@shared/components/PageHeader';
import { formatCurrency } from '@shared/utils/format';
import { Kpi, downloadBlob } from '../reports/SalesAnalyticsPage';

const { Text, Paragraph } = Typography;

type HsnRow = Gstr1Report['hsn']['hsn_b2b'][number];

/**
 * GSTR-1 preparation (`/gst-returns`). Shows what this month's return will hold,
 * table by table, and downloads the JSON for the GST offline tool. Nothing is
 * filed from here.
 */
export function Gstr1Page() {
  const { message } = AntApp.useApp();
  // Default to last month - the one being filed on the 11th.
  const [month, setMonth] = useState<Dayjs>(dayjs().subtract(1, 'month').startOf('month'));
  const [downloading, setDownloading] = useState(false);
  const m = month.format('YYYY-MM');
  const q = useQuery({ queryKey: ['gstr1', m], queryFn: () => creditNotesApi.gstr1(m) });
  const d = q.data;

  const download = async () => {
    setDownloading(true);
    try {
      downloadBlob(await creditNotesApi.gstr1Download(m), `GSTR1_${d?.gstin ?? ''}_${month.format('MMYYYY')}.json`);
    } catch (e) {
      message.error(apiErrorMessage(e, 'Could not download'));
    } finally {
      setDownloading(false);
    }
  };

  const hsnColumns = [
    { title: 'HSN/SAC', dataIndex: 'hsn_sc', render: (v: string) => (v === 'NA' ? <Text type="danger">Missing</Text> : v) },
    { title: 'Description', dataIndex: 'desc' },
    { title: 'UQC', dataIndex: 'uqc' },
    { title: 'Qty', dataIndex: 'qty', align: 'right' as const },
    { title: 'Rate', dataIndex: 'rt', align: 'right' as const, render: (v: number) => `${v}%` },
    { title: 'Taxable', dataIndex: 'txval', align: 'right' as const, render: (v: number) => formatCurrency(v) },
    { title: 'IGST', dataIndex: 'iamt', align: 'right' as const, render: (v: number) => formatCurrency(v) },
    { title: 'CGST', dataIndex: 'camt', align: 'right' as const, render: (v: number) => formatCurrency(v) },
    { title: 'SGST', dataIndex: 'samt', align: 'right' as const, render: (v: number) => formatCurrency(v) },
  ];

  return (
    <div style={{ padding: '16px 8px 32px', maxWidth: 1400, margin: '0 auto' }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <PageHeader
          title="GSTR-1"
          subtitle="Outward supplies for a month, from the tax invoices and credit notes issued in this system."
          actions={
            <Space wrap>
              <Button icon={<ReloadOutlined />} onClick={() => void q.refetch()} loading={q.isFetching} />
              <Button type="primary" icon={<DownloadOutlined />} disabled={!d} loading={downloading} onClick={() => void download()}>
                Download JSON
              </Button>
            </Space>
          }
        />
        <Card size="small" style={{ borderRadius: 12 }}>
          <Space wrap size={12}>
            <DatePicker
              picker="month"
              value={month}
              allowClear={false}
              disabledDate={(dt) => dt.isAfter(dayjs(), 'month')}
              onChange={(v) => v && setMonth(v.startOf('month'))}
            />
            {d ? <Text type="secondary">GSTIN {d.gstin} · return period {month.format('MMYYYY')}</Text> : null}
          </Space>
        </Card>

        <Alert
          type="info"
          showIcon
          message="Prepared for review, not filed"
          description={
            <Paragraph style={{ margin: 0 }}>
              Import the JSON into the GST offline tool (or compare it with the portal) before filing. Invoices raised
              outside this system are not in it. Credit notes against B2C invoices are netted into table 7; against
              registered buyers they are listed in 9B. See <Link to="/invoices?tab=credit-notes">Credit notes</Link>.
            </Paragraph>
          }
        />

        {q.isError ? <Alert type="error" showIcon message={apiErrorMessage(q.error, 'Could not prepare GSTR-1')} /> : null}
        {d?.warnings.length ? (
          <Alert type="warning" showIcon message="Fix before filing" description={<ul style={{ margin: 0, paddingLeft: 18 }}>{d.warnings.map((w) => <li key={w}>{w}</li>)}</ul>} />
        ) : null}

        {d ? (
          <>
            <Row gutter={[12, 12]}>
              <Col xs={12} md={6}><Kpi label="Invoices" value={d.counts.invoices} hint={`${d.counts.cancelledInvoices} cancelled`} /></Col>
              <Col xs={12} md={6}><Kpi label="Credit notes" value={d.counts.creditNotes} hint={`${d.counts.cancelledCreditNotes} cancelled`} /></Col>
              <Col xs={12} md={6}>
                <Kpi label="Taxable value (net)" value={formatCurrency(d.summary.filter((s) => !s.section.startsWith('cdn')).reduce((a, s) => a + s.taxable, 0) - d.summary.filter((s) => s.section.startsWith('cdn')).reduce((a, s) => a + s.taxable, 0))} />
              </Col>
              <Col xs={12} md={6}>
                <Kpi label="Tax (net)" value={formatCurrency(d.summary.filter((s) => !s.section.startsWith('cdn')).reduce((a, s) => a + s.tax, 0) - d.summary.filter((s) => s.section.startsWith('cdn')).reduce((a, s) => a + s.tax, 0))} />
              </Col>
            </Row>

            <Card style={{ borderRadius: 12 }} title="Tables">
              <Table
                size="small"
                rowKey={(r) => r.section}
                pagination={false}
                dataSource={d.summary}
                columns={[
                  { title: 'Table', dataIndex: 'table', width: 70 },
                  { title: 'Section', dataIndex: 'label' },
                  { title: 'Documents / rows', dataIndex: 'documents', align: 'right' },
                  { title: 'Taxable value', dataIndex: 'taxable', align: 'right', render: (v: number) => formatCurrency(v) },
                  { title: 'Tax', dataIndex: 'tax', align: 'right', render: (v: number) => formatCurrency(v) },
                ]}
              />
            </Card>

            <Card style={{ borderRadius: 12 }} title="Table 12 - HSN summary (net of credit notes)">
              <Tabs
                size="small"
                items={[
                  { key: 'b2b', label: `B2B (${d.hsn.hsn_b2b.length})`, children: <Table<HsnRow> size="small" rowKey="num" pagination={false} dataSource={d.hsn.hsn_b2b} columns={hsnColumns} scroll={{ x: 900 }} /> },
                  { key: 'b2c', label: `B2C (${d.hsn.hsn_b2c.length})`, children: <Table<HsnRow> size="small" rowKey="num" pagination={false} dataSource={d.hsn.hsn_b2c} columns={hsnColumns} scroll={{ x: 900 }} /> },
                ]}
              />
            </Card>

            <Card style={{ borderRadius: 12 }} title="Table 13 - Documents issued">
              <Table
                size="small"
                rowKey={(r) => `${r.type}-${r.from}`}
                pagination={false}
                locale={{ emptyText: 'Nothing issued this month' }}
                dataSource={d.docIssue.doc_det.flatMap((x) => x.docs.map((doc) => ({ type: x.doc_typ, ...doc })))}
                columns={[
                  { title: 'Document', dataIndex: 'type' },
                  { title: 'From', dataIndex: 'from' },
                  { title: 'To', dataIndex: 'to' },
                  { title: 'Total', dataIndex: 'totnum', align: 'right' },
                  { title: 'Cancelled', dataIndex: 'cancel', align: 'right' },
                  { title: 'Net issued', dataIndex: 'net_issue', align: 'right' },
                ]}
              />
            </Card>
          </>
        ) : q.isLoading ? <Card loading style={{ borderRadius: 12 }} /> : null}
      </Space>
    </div>
  );
}
