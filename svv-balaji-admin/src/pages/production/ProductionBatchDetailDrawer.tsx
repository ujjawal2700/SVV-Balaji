import { Alert, Descriptions, Drawer, Empty, Space, Spin, Table, Tag, Typography } from 'antd';
import { apiErrorMessage } from '../../api/client';
import type { ProductionConsumption, QualityInspection } from '../../api/types';
import { useProductionBatch } from '../../hooks/useProduction';
import { EM_DASH, formatDate, formatQuantity } from '../../utils/format';

interface ProductionBatchDetailDrawerProps {
  batchId: string | null;
  onClose: () => void;
}

export function ProductionBatchDetailDrawer({
  batchId,
  onClose,
}: ProductionBatchDetailDrawerProps) {
  const batch = useProductionBatch(batchId ?? undefined);
  const data = batch.data;

  return (
    <Drawer
      open={Boolean(batchId)}
      onClose={onClose}
      width={760}
      title={data ? `Run ${data.productionBatchNumber}` : 'Production run'}
    >
      {batch.isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', padding: 48 }}>
          <Spin />
        </div>
      ) : batch.error ? (
        <Alert type="error" showIcon message={apiErrorMessage(batch.error)} />
      ) : data ? (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Descriptions bordered column={2} size="small" title="Run">
            <Descriptions.Item label="Product">{data.product?.name ?? EM_DASH}</Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag>{data.status}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Recipe">
              {data.recipe ? `${data.recipe.recipeCode} v${data.recipeVersion}` : EM_DASH}
            </Descriptions.Item>
            <Descriptions.Item label="Type">
              {data.productionType === 'MULTI_GRAIN' ? 'Multigrain' : 'Single grain'}
            </Descriptions.Item>
            <Descriptions.Item label="Date">{formatDate(data.productionDate)}</Descriptions.Item>
            <Descriptions.Item label="Branch">{data.branch?.name ?? EM_DASH}</Descriptions.Item>
            <Descriptions.Item label="Planned">
              {formatQuantity(data.plannedQuantity, data.unit)}
            </Descriptions.Item>
            <Descriptions.Item label="Actual">
              {formatQuantity(data.actualQuantity, data.unit)}
            </Descriptions.Item>
            <Descriptions.Item label="Process loss" span={2}>
              {data.productionLoss === null ? (
                EM_DASH
              ) : Number(data.productionLoss) < 0 ? (
                <Typography.Text type="warning">
                  {formatQuantity(data.productionLoss, data.unit)} — output exceeded plan
                </Typography.Text>
              ) : (
                formatQuantity(data.productionLoss, data.unit)
              )}
            </Descriptions.Item>
          </Descriptions>

          <Descriptions bordered column={2} size="small" title="Machine & operator">
            <Descriptions.Item label="Machine">{data.machineName ?? EM_DASH}</Descriptions.Item>
            <Descriptions.Item label="Number">{data.machineNumber ?? EM_DASH}</Descriptions.Item>
            <Descriptions.Item label="Operator">{data.operatorName ?? EM_DASH}</Descriptions.Item>
            <Descriptions.Item label="Line">{data.productionLine ?? EM_DASH}</Descriptions.Item>
          </Descriptions>

          <div>
            <Typography.Title level={5}>
              Raw material consumed ({data.consumptions?.length ?? 0})
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
              These rows are the traceability link across the processing step — they are what lets a
              finished pack name the farmers behind it.
            </Typography.Paragraph>
            <Table<ProductionConsumption>
              size="small"
              rowKey="id"
              dataSource={data.consumptions ?? []}
              pagination={false}
              locale={{ emptyText: <Empty description="Nothing consumed" /> }}
              columns={[
                {
                  title: 'Batch',
                  key: 'batch',
                  render: (_, row) => (
                    <Typography.Text code>{row.rawMaterialBatch?.batchNumber}</Typography.Text>
                  ),
                },
                {
                  title: 'Crop',
                  key: 'crop',
                  render: (_, row) => row.rawMaterialBatch?.cropName ?? EM_DASH,
                },
                {
                  title: 'Farmer',
                  key: 'farmer',
                  render: (_, row) =>
                    row.rawMaterialBatch?.farmer ? (
                      <Space direction="vertical" size={0}>
                        <span>{row.rawMaterialBatch.farmer.fullName}</span>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {row.rawMaterialBatch.farmer.farmerCode}
                        </Typography.Text>
                      </Space>
                    ) : (
                      EM_DASH
                    ),
                },
                {
                  title: 'Used',
                  key: 'quantityUsed',
                  align: 'right',
                  render: (_, row) => formatQuantity(row.quantityUsed, row.unit),
                },
              ]}
            />
          </div>

          <div>
            <Typography.Title level={5}>
              Quality inspections ({data.qualityInspections?.length ?? 0})
            </Typography.Title>
            <Table<QualityInspection>
              size="small"
              rowKey="id"
              dataSource={data.qualityInspections ?? []}
              pagination={false}
              locale={{ emptyText: <Empty description="No in-process inspection recorded" /> }}
              columns={[
                { title: 'Stage', dataIndex: 'stage', render: (v: string) => v.replace(/_/g, ' ') },
                {
                  title: 'Result',
                  dataIndex: 'result',
                  render: (result: string) => (
                    <Tag color={result === 'PASS' ? 'green' : result === 'FAIL' ? 'red' : 'gold'}>
                      {result.replace(/_/g, ' ')}
                    </Tag>
                  ),
                },
                { title: 'When', dataIndex: 'createdAt', render: formatDate },
              ]}
            />
          </div>

          <div>
            <Typography.Title level={5}>
              Packed into ({data.finishedGoodsBatches?.length ?? 0})
            </Typography.Title>
            {(data.finishedGoodsBatches ?? []).length === 0 ? (
              <Empty description="Not packed yet" />
            ) : (
              <Space size={[4, 8]} wrap>
                {(data.finishedGoodsBatches ?? []).map((fg) => (
                  <Tag key={fg.id} color={fg.qaReleased ? 'green' : 'gold'}>
                    {fg.fgBatchNumber} {fg.qaReleased ? '· released' : '· awaiting QA'}
                  </Tag>
                ))}
              </Space>
            )}
          </div>
        </Space>
      ) : null}
    </Drawer>
  );
}
