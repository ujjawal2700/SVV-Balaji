import { EnvironmentOutlined } from '@ant-design/icons';
import { Alert, Descriptions, Drawer, Empty, Space, Spin, Tag, Timeline, Typography } from 'antd';
import { apiErrorMessage } from '../../api/client';
import type { StockMovement } from '../../api/types';
import { useBatchTrace } from '../../hooks/useCollections';
import { EM_DASH, formatDate, formatDateTime, formatQuantity } from '../../utils/format';

interface BatchTraceDrawerProps {
  batchNumber: string | null;
  onClose: () => void;
}

const MOVEMENT_COLOURS: Record<StockMovement['movementType'], string> = {
  STOCK_IN: 'green',
  STOCK_OUT: 'red',
  TRANSFER: 'blue',
  ADJUSTMENT: 'gold',
};

/**
 * The upstream half of the traceability chain: batch → collection → inspection
 * → farmer, plus every stock movement the batch has been through.
 *
 * The downstream half (production, packaging, order) is what `/trace` resolves
 * once a batch has been through Phase 3.
 */
export function BatchTraceDrawer({ batchNumber, onClose }: BatchTraceDrawerProps) {
  const trace = useBatchTrace(batchNumber ?? undefined);
  const data = trace.data;

  return (
    <Drawer
      open={Boolean(batchNumber)}
      onClose={onClose}
      width={720}
      title={batchNumber ? `Trace ${batchNumber}` : 'Batch trace'}
    >
      {trace.isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', padding: 48 }}>
          <Spin />
        </div>
      ) : trace.error ? (
        <Alert type="error" showIcon message={apiErrorMessage(trace.error)} />
      ) : data ? (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Descriptions bordered column={2} size="small" title="Batch">
            <Descriptions.Item label="Batch number">
              <Typography.Text code>{data.batchNumber}</Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag>{data.status}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Crop">{data.cropName}</Descriptions.Item>
            <Descriptions.Item label="Quantity">
              {formatQuantity(data.quantity, data.unit)}
            </Descriptions.Item>
            <Descriptions.Item label="Warehouse">
              {data.warehouse?.name ?? 'Not stored'}
            </Descriptions.Item>
            <Descriptions.Item label="Branch">{data.branch?.name ?? EM_DASH}</Descriptions.Item>
          </Descriptions>

          <Descriptions bordered column={2} size="small" title="Grown by">
            <Descriptions.Item label="Farmer">{data.farmer.fullName}</Descriptions.Item>
            <Descriptions.Item label="Traceability code">
              <Typography.Text code>{data.farmer.farmerCode ?? EM_DASH}</Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="Village">{data.farmer.village}</Descriptions.Item>
            <Descriptions.Item label="District">
              {data.farmer.district}, {data.farmer.state}
            </Descriptions.Item>
            <Descriptions.Item label="Farm location" span={2}>
              {data.farmer.gpsLocation ? (
                <>
                  <EnvironmentOutlined /> {data.farmer.gpsLocation}
                </>
              ) : (
                EM_DASH
              )}
            </Descriptions.Item>
          </Descriptions>

          {data.collection ? (
            <Descriptions bordered column={2} size="small" title="Collection">
              <Descriptions.Item label="Receipt">
                <Typography.Text code>{data.collection.receiptNumber}</Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="Collected">
                {formatDate(data.collection.collectionDate)}
              </Descriptions.Item>
              <Descriptions.Item label="Net weight">
                {formatQuantity(data.collection.netWeight, data.collection.unit)}
              </Descriptions.Item>
              <Descriptions.Item label="Payment">
                <Tag>{data.collection.paymentStatus}</Tag>
              </Descriptions.Item>
              {data.collection.inspection ? (
                <>
                  <Descriptions.Item label="Inspection result">
                    <Tag
                      color={data.collection.inspection.result === 'APPROVED' ? 'green' : 'red'}
                    >
                      {data.collection.inspection.result}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="Inspected">
                    {formatDate(data.collection.inspection.inspectionDate)}
                  </Descriptions.Item>
                  <Descriptions.Item label="Moisture">
                    {data.collection.inspection.moistureLevel ?? EM_DASH}
                  </Descriptions.Item>
                  <Descriptions.Item label="Foreign matter">
                    {data.collection.inspection.foreignMatter ?? EM_DASH}
                  </Descriptions.Item>
                </>
              ) : null}
            </Descriptions>
          ) : null}

          <div>
            <Typography.Title level={5}>
              Stock movements ({data.stockMovements.length})
            </Typography.Title>
            {data.stockMovements.length === 0 ? (
              <Empty description="Never stocked — this batch has no movement history" />
            ) : (
              <Timeline
                items={data.stockMovements.map((movement) => ({
                  color: MOVEMENT_COLOURS[movement.movementType],
                  children: (
                    <Space direction="vertical" size={0}>
                      <Space>
                        <Tag color={MOVEMENT_COLOURS[movement.movementType]}>
                          {movement.movementType.replace('_', ' ')}
                        </Tag>
                        <Typography.Text strong>
                          {formatQuantity(movement.quantity, movement.unit)}
                        </Typography.Text>
                      </Space>
                      {movement.reason ? (
                        <Typography.Text>{movement.reason}</Typography.Text>
                      ) : null}
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {formatDateTime(movement.createdAt)}
                      </Typography.Text>
                    </Space>
                  ),
                }))}
              />
            )}
          </div>
        </Space>
      ) : null}
    </Drawer>
  );
}
