import { ReloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Col, DatePicker, Row, Space, Statistic, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { apiErrorMessage } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { BranchSelect, ProductSelect } from '../../components/pickers';
import { productionCostApi, type ProductionCostReport } from '@shared/api/machines';
import { EM_DASH } from '../../utils/format';
import { ProductionBatchDetailDrawer } from './ProductionBatchDetailDrawer';

const { RangePicker } = DatePicker;
const DAY = 'YYYY-MM-DD';
const inr = (v: number | null | undefined) =>
  v === null || v === undefined ? EM_DASH : `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Run = ProductionCostReport['runs'][number];

/**
 * FRD 34 Production Cost report. Cost of a run = raw material + labour +
 * machine + loss + other (client decision 10 Oct 2026). Runs whose cost has
 * not been recorded are listed but left out of the totals.
 */
export function ProductionCostReportPage() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(29, 'day'), dayjs()]);
  const [branchId, setBranchId] = useState<string | undefined>();
  const [productId, setProductId] = useState<string | undefined>();
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['production-cost-report', range[0].format(DAY), range[1].format(DAY), branchId, productId],
    queryFn: () => productionCostApi.report({ from: range[0].format(DAY), to: range[1].format(DAY), branchId, productId }),
  });
  const d = q.data;

  const columns: ColumnsType<Run> = [
    {
      title: 'Run',
      key: 'run',
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Typography.Link onClick={() => setOpen(r.id)}>
            <Typography.Text code>{r.productionBatchNumber}</Typography.Text>
          </Typography.Link>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {dayjs(r.completedAt ?? r.productionDate).format('D MMM YYYY')}
            {r.machine ? ` · ${r.machine.code ?? ''} ${r.machine.name}` : ''}
          </Typography.Text>
        </Space>
      ),
    },
    { title: 'Product', key: 'product', render: (_, r) => r.product.name },
    { title: 'Output', key: 'out', align: 'right', render: (_, r) => (r.outputQuantity === null ? EM_DASH : `${r.outputQuantity.toLocaleString('en-IN')} ${r.unit}`) },
    { title: 'Raw', dataIndex: 'rawMaterialCost', align: 'right', render: inr },
    { title: 'Labour', dataIndex: 'labourCost', align: 'right', render: inr },
    { title: 'Machine', dataIndex: 'machineCost', align: 'right', render: inr },
    { title: 'Loss', dataIndex: 'lossCost', align: 'right', render: inr },
    { title: 'Other', dataIndex: 'otherCost', align: 'right', render: inr },
    {
      title: 'Total',
      key: 'total',
      align: 'right',
      render: (_, r) => (r.costRecorded ? <strong>{inr(r.totalCost)}</strong> : <Tag color="gold">Not recorded</Tag>),
    },
    { title: 'Per unit', key: 'pu', align: 'right', render: (_, r) => (r.costPerUnit === null ? EM_DASH : `${inr(r.costPerUnit)} / ${r.unit}`) },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <PageHeader
          title="Production Cost"
          subtitle="What each completed run cost: raw material (from the rate paid for it) + labour + machine + loss + other."
          actions={<Button icon={<ReloadOutlined />} onClick={() => void q.refetch()} loading={q.isFetching} />}
        />
        <Card size="small" style={{ borderRadius: 12 }}>
          <Space wrap size={12}>
            <RangePicker value={range} allowClear={false} disabledDate={(x) => x.isAfter(dayjs(), 'day')} onChange={(v) => v?.[0] && v[1] && setRange([v[0], v[1]])} />
            <div style={{ width: 220 }}>
              <BranchSelect value={branchId} onChange={(v) => setBranchId(v as string | undefined)} placeholder="All branches" allowClear />
            </div>
            <div style={{ width: 260 }}>
              <ProductSelect value={productId} onChange={(v) => setProductId(v as string | undefined)} placeholder="All products" allowClear />
            </div>
          </Space>
        </Card>
        {q.isError ? <Alert type="error" showIcon message={apiErrorMessage(q.error)} /> : null}
        {d && d.totals.uncostedRuns > 0 ? (
          <Alert
            type="warning"
            showIcon
            message={`${d.totals.uncostedRuns} of ${d.totals.runs} completed runs have no cost recorded`}
            description="They are listed below but not in the totals. Open a run and use Record cost."
          />
        ) : null}
        <Row gutter={[12, 12]}>
          {(
            [
              ['Total cost', d?.totals.totalCost],
              ['Raw material', d?.totals.rawMaterialCost],
              ['Labour', d?.totals.labourCost],
              ['Machine', d?.totals.machineCost],
              ['Loss', d?.totals.lossCost],
              ['Other', d?.totals.otherCost],
            ] as const
          ).map(([label, v]) => (
            <Col key={label} xs={12} md={8} xl={4}>
              <Card size="small" style={{ borderRadius: 12 }}>
                <Statistic title={label} value={v ?? 0} precision={2} prefix="₹" loading={q.isLoading} />
              </Card>
            </Col>
          ))}
        </Row>
        <Card size="small" title="By product" style={{ borderRadius: 12 }}>
          <Table
            size="small"
            rowKey="productId"
            loading={q.isLoading}
            dataSource={d?.byProduct ?? []}
            pagination={false}
            locale={{ emptyText: 'No costed runs in this range' }}
            columns={[
              { title: 'Product', dataIndex: 'product' },
              { title: 'Runs', dataIndex: 'runs', align: 'right' },
              { title: 'Output', key: 'out', align: 'right', render: (_, p) => `${p.outputQuantity.toLocaleString('en-IN')} ${p.unit}` },
              { title: 'Total cost', dataIndex: 'totalCost', align: 'right', render: inr },
              { title: 'Avg cost per unit', key: 'avg', align: 'right', render: (_, p) => (p.averageCostPerUnit === null ? EM_DASH : `${inr(p.averageCostPerUnit)} / ${p.unit}`) },
            ]}
          />
        </Card>
        <Card size="small" title="Runs" style={{ borderRadius: 12 }}>
          <Table<Run> size="small" rowKey="id" loading={q.isLoading} dataSource={d?.runs ?? []} columns={columns} pagination={{ pageSize: 20 }} scroll={{ x: 1100 }} />
        </Card>
      </Space>
      <ProductionBatchDetailDrawer batchId={open} onClose={() => setOpen(null)} />
    </div>
  );
}
