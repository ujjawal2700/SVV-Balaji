import { Alert, Card, Col, Progress, Row, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { ProductSelect } from '../../components/pickers';
import {
  useFarmerYieldQuality,
  useMachineYieldHealth,
  useYieldChains,
} from '../../hooks/useYieldTracking';
import { EM_DASH, formatDate, formatQuantity } from '../../utils/format';
import type { YieldChain, YieldStageBreakdown } from '../../../../shared/api/types';

const STAGE_LABEL: Record<YieldStageBreakdown['stage'], string> = {
  CLEANING_GRADING: 'Cleaning & Grading',
  PRODUCTION: 'Production',
  FINISHED_GOODS: 'Finished Goods',
};

function LossPercentTag({ value }: { value: number | null }) {
  if (value === null) return <>{EM_DASH}</>;
  const color = value > 8 ? 'red' : value >= 4 ? 'gold' : 'green';
  return <Tag color={color}>{value.toFixed(2)}%</Tag>;
}

function StageTable({ chain }: { chain: YieldChain }) {
  const columns: ColumnsType<YieldStageBreakdown> = [
    { title: 'Stage', key: 'stage', render: (_, s) => STAGE_LABEL[s.stage] },
    {
      title: 'Input',
      key: 'input',
      align: 'right',
      render: (_, s) => formatQuantity(s.inputQuantity),
    },
    {
      title: 'Output',
      key: 'output',
      align: 'right',
      render: (_, s) => formatQuantity(s.outputQuantity),
    },
    {
      title: 'Loss',
      key: 'loss',
      align: 'right',
      render: (_, s) => formatQuantity(s.lossQuantity),
    },
    {
      title: 'Loss %',
      key: 'lossPercent',
      align: 'right',
      render: (_, s) => <LossPercentTag value={s.lossPercent} />,
    },
    {
      title: 'By-product',
      key: 'byProduct',
      align: 'right',
      render: (_, s) => (s.byProductQuantity > 0 ? formatQuantity(s.byProductQuantity) : EM_DASH),
    },
  ];

  return (
    <Table<YieldStageBreakdown>
      size="small"
      rowKey="stage"
      pagination={false}
      columns={columns}
      dataSource={chain.stages}
    />
  );
}

export function YieldTrackingPage() {
  const [filters, setFilters] = useState<{ productId?: string }>({});
  const chains = useYieldChains(filters);
  const farmerQuality = useFarmerYieldQuality();
  const machineHealth = useMachineYieldHealth();

  const columns: ColumnsType<YieldChain> = [
    {
      title: 'Run',
      key: 'productionBatchNumber',
      width: 170,
      render: (_, chain) => <Typography.Text code>{chain.productionBatchNumber}</Typography.Text>,
    },
    { title: 'Product', key: 'product', render: (_, chain) => chain.productName },
    {
      title: 'Date',
      key: 'productionDate',
      render: (_, chain) => formatDate(chain.productionDate),
      sorter: (a, b) => a.productionDate.localeCompare(b.productionDate),
    },
    {
      title: 'Total input',
      key: 'totalInput',
      align: 'right',
      render: (_, chain) => formatQuantity(chain.totalInput),
    },
    {
      title: 'Total loss',
      key: 'totalLoss',
      align: 'right',
      render: (_, chain) => formatQuantity(chain.totalLoss),
    },
    {
      title: 'By-product',
      key: 'totalByProduct',
      align: 'right',
      render: (_, chain) => (chain.totalByProduct > 0 ? formatQuantity(chain.totalByProduct) : EM_DASH),
    },
    {
      title: 'Final output',
      key: 'finalOutput',
      align: 'right',
      render: (_, chain) => formatQuantity(chain.finalOutput),
    },
    {
      title: 'Yield %',
      key: 'overallYieldPercent',
      align: 'right',
      render: (_, chain) =>
        chain.overallYieldPercent === null ? (
          EM_DASH
        ) : (
          <Progress
            percent={Math.min(100, Math.max(0, chain.overallYieldPercent))}
            size="small"
            style={{ width: 100 }}
            status={chain.alertLevel === 'HIGH' ? 'exception' : 'normal'}
          />
        ),
    },
    {
      title: 'Total loss %',
      key: 'totalLossPercent',
      align: 'right',
      render: (_, chain) => <LossPercentTag value={chain.totalLossPercent} />,
    },
    {
      title: 'Alert',
      key: 'alertLevel',
      width: 100,
      render: (_, chain) =>
        chain.alertLevel === 'HIGH' ? (
          <Tag color="red">HIGH LOSS</Tag>
        ) : (
          <Tag color="green">Normal</Tag>
        ),
    },
  ];

  const toolbar = (
    <Row gutter={[12, 12]}>
      <Col xs={24} md={8}>
        <ProductSelect
          allowClear
          placeholder="Filter by product"
          value={filters.productId}
          onChange={(productId) => setFilters((f) => ({ ...f, productId }))}
        />
      </Col>
    </Row>
  );

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card>
        <PageHeader
          title="Loss & Yield Tracking"
          subtitle="Stage-wise loss across the existing Cleaning & Grading, Production and Finished Goods phases, chain totals and overall yield. Normal expected loss is 4-8% total; anything above that is flagged."
        />

        <DataTable<YieldChain>
          rows={chains.data?.data}
          columns={columns}
          rowKey="productionBatchId"
          isLoading={chains.isLoading}
          isFetching={chains.isFetching}
          error={chains.error}
          onRetry={() => void chains.refetch()}
          toolbar={toolbar}
          emptyText="No completed production runs yet"
          expandable={{
            expandedRowRender: (chain) => (
              <div style={{ padding: '8px 0' }}>
                {chain.alertLevel === 'HIGH' ? (
                  <Alert
                    type="error"
                    showIcon
                    style={{ marginBottom: 12 }}
                    message={`Total loss ${chain.totalLossPercent?.toFixed(2)}% exceeds the normal 8% ceiling`}
                  />
                ) : null}
                <StageTable chain={chain} />
              </div>
            ),
          }}
        />
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Supplier / farmer quality flags" loading={farmerQuality.isLoading}>
            <Typography.Paragraph type="secondary">
              Average loss % pooled across each farmer's cleaning wastage and the production runs
              their raw material fed. Highest average loss first.
            </Typography.Paragraph>
            <Table
              size="small"
              rowKey="farmerId"
              pagination={false}
              dataSource={farmerQuality.data ?? []}
              columns={[
                { title: 'Farmer', key: 'farmer', render: (_, r) => `${r.fullName} (${r.farmerCode ?? EM_DASH})` },
                { title: 'RM batches', dataIndex: 'rawMaterialBatches', align: 'right' },
                {
                  title: 'Avg loss %',
                  key: 'averageLossPercent',
                  align: 'right',
                  render: (_, r) => <LossPercentTag value={r.averageLossPercent} />,
                },
                {
                  title: 'Flagged',
                  key: 'flagged',
                  render: (_, r) => (r.flagged ? <Tag color="red">Repeated high loss</Tag> : EM_DASH),
                },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Machine health flags" loading={machineHealth.isLoading}>
            <Typography.Paragraph type="secondary">
              Each machine's historical average production loss %, and any run whose loss jumped
              past 1.5x that average - a candidate for maintenance review.
            </Typography.Paragraph>
            <Table
              size="small"
              rowKey={(r) => `${r.machineName}-${r.machineNumber ?? ''}`}
              pagination={false}
              dataSource={machineHealth.data ?? []}
              columns={[
                {
                  title: 'Machine',
                  key: 'machine',
                  render: (_, m) => `${m.machineName}${m.machineNumber ? ` (${m.machineNumber})` : ''}`,
                },
                { title: 'Runs', dataIndex: 'totalRuns', align: 'right' },
                {
                  title: 'Avg loss %',
                  key: 'historicalAverageLossPercent',
                  align: 'right',
                  render: (_, m) => <LossPercentTag value={m.historicalAverageLossPercent} />,
                },
                {
                  title: 'Needs review',
                  key: 'needsMaintenanceReview',
                  render: (_, m) =>
                    m.needsMaintenanceReview ? (
                      <Tag color="red">{m.flaggedRuns.length} run(s) flagged</Tag>
                    ) : (
                      <Tag color="green">OK</Tag>
                    ),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
