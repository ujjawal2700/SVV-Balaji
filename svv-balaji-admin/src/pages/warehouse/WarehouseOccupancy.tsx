import { Alert, Descriptions, Drawer, Progress, Space, Spin, Table, Tag, Typography } from 'antd';
import { useMemo } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { WarehouseStock } from '../../api/types';
import { useWarehouseStatus, useWarehouseStock } from '../../hooks/useWarehouses';
import { EM_DASH, formatQuantity } from '../../utils/format';

interface WarehouseOccupancyProps {
  warehouseId: string | null;
  warehouseName?: string;
  onClose: () => void;
}

/**
 * Occupancy against capacity (FRD 16.6).
 *
 * The API's `occupied` figure sums quantity across batches WITHOUT regard to
 * unit, so a warehouse holding both KG and QUINTAL reports a number that means
 * nothing — and `utilisationPercent` derived from it is worse, because it looks
 * authoritative.
 *
 * So this screen computes its own breakdown from the stock rows and only shows
 * the utilisation bar when every batch shares one unit. When they do not, it
 * says so instead of drawing a gauge that lies. Raised with Ujjawal; if the API
 * starts normalising units, the mixed-unit branch simply stops being reached.
 */
export function WarehouseOccupancy({
  warehouseId,
  warehouseName,
  onClose,
}: WarehouseOccupancyProps) {
  const status = useWarehouseStatus(warehouseId ?? undefined);
  const stock = useWarehouseStock(warehouseId ? { warehouseId } : {});

  const byUnit = useMemo(() => {
    const rows = warehouseId ? (stock.data?.data ?? []) : [];
    const totals = new Map<string, { onHand: number; reserved: number; batches: number }>();

    for (const row of rows) {
      const entry = totals.get(row.unit) ?? { onHand: 0, reserved: 0, batches: 0 };
      entry.onHand += Number(row.quantity);
      entry.reserved += Number(row.reservedQuantity);
      entry.batches += 1;
      totals.set(row.unit, entry);
    }

    return [...totals.entries()].map(([unit, totals_]) => ({ unit, ...totals_ }));
  }, [stock.data, warehouseId]);

  const singleUnit = byUnit.length <= 1;
  const utilisation = status.data?.utilisationPercent;

  return (
    <Drawer
      open={Boolean(warehouseId)}
      onClose={onClose}
      width={620}
      title={warehouseName ? `Occupancy — ${warehouseName}` : 'Occupancy'}
    >
      {status.isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', padding: 48 }}>
          <Spin />
        </div>
      ) : status.error ? (
        <Alert type="error" showIcon message={apiErrorMessage(status.error)} />
      ) : status.data ? (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {status.data.capacity === null ? (
            <Alert
              type="info"
              showIcon
              message="No capacity recorded"
              description="Set a capacity on the warehouse to see utilisation."
            />
          ) : singleUnit && utilisation !== null && utilisation !== undefined ? (
            <div>
              <Progress
                percent={Math.min(utilisation, 100)}
                status={utilisation > 90 ? 'exception' : utilisation > 75 ? 'active' : 'normal'}
              />
              <Typography.Text type="secondary">
                {formatQuantity(status.data.occupied, byUnit[0]?.unit)} of{' '}
                {formatQuantity(status.data.capacity)} used
              </Typography.Text>
            </div>
          ) : (
            <Alert
              type="warning"
              showIcon
              message="Utilisation cannot be calculated"
              description={
                <>
                  This warehouse holds stock in {byUnit.length} different units (
                  {byUnit.map((row) => row.unit).join(', ')}). Capacity is a single number, so
                  adding those quantities together would be meaningless. The per-unit breakdown
                  below is the accurate view.
                </>
              }
            />
          )}

          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="Capacity">
              {status.data.capacity === null ? EM_DASH : formatQuantity(status.data.capacity)}
            </Descriptions.Item>
            <Descriptions.Item label="Distinct batches">
              {status.data.distinctBatches}
            </Descriptions.Item>
          </Descriptions>

          <div>
            <Typography.Title level={5}>Held, by unit</Typography.Title>
            <Table<{ unit: string; onHand: number; reserved: number; batches: number }>
              size="small"
              rowKey="unit"
              dataSource={byUnit}
              loading={stock.isLoading}
              pagination={false}
              columns={[
                { title: 'Unit', dataIndex: 'unit', render: (unit: string) => <Tag>{unit}</Tag> },
                {
                  title: 'On hand',
                  dataIndex: 'onHand',
                  align: 'right',
                  render: (value: number, row) => formatQuantity(value, row.unit),
                },
                {
                  title: 'Reserved',
                  dataIndex: 'reserved',
                  align: 'right',
                  render: (value: number, row) => formatQuantity(value, row.unit),
                },
                {
                  title: 'Available',
                  key: 'available',
                  align: 'right',
                  render: (_, row) => (
                    <Typography.Text strong>
                      {formatQuantity(row.onHand - row.reserved, row.unit)}
                    </Typography.Text>
                  ),
                },
                { title: 'Batches', dataIndex: 'batches', align: 'right' },
              ]}
            />
          </div>

          <div>
            <Typography.Title level={5}>Batches held ({stock.data?.data.length ?? 0})</Typography.Title>
            <Table<WarehouseStock>
              size="small"
              rowKey="id"
              dataSource={stock.data?.data ?? []}
              loading={stock.isLoading}
              pagination={false}
              scroll={{ x: 'max-content' }}
              columns={[
                {
                  title: 'Batch',
                  key: 'batch',
                  render: (_, row) => (
                    <Typography.Text code>{row.batch?.batchNumber ?? row.batchId}</Typography.Text>
                  ),
                },
                { title: 'Crop', key: 'crop', render: (_, row) => row.batch?.cropName ?? EM_DASH },
                {
                  title: 'On hand',
                  key: 'quantity',
                  align: 'right',
                  render: (_, row) => formatQuantity(row.quantity, row.unit),
                },
                {
                  title: 'Location',
                  dataIndex: 'storageLocation',
                  render: (value: string | null) => value ?? EM_DASH,
                },
              ]}
            />
          </div>
        </Space>
      ) : null}
    </Drawer>
  );
}
