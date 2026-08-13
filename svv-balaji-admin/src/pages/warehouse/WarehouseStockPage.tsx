import { ImportOutlined, SwapOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, InputNumber, Row, Space, Switch, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import type { WarehouseStock } from '../../api/types';
import { useCan } from '../../auth/useCan';
import { Can } from '../../components/Can';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { WarehouseSelect } from '../../components/pickers';
import { useLowStock, useWarehouseStock } from '../../hooks/useWarehouses';
import { EM_DASH, formatDateTime, formatQuantity } from '../../utils/format';
import { StockActionModal, type StockAction } from './StockActionModal';
import { TransferStockModal } from './TransferStockModal';

export function WarehouseStockPage() {
  const [warehouseId, setWarehouseId] = useState<string | undefined>();
  const [lowOnly, setLowOnly] = useState(false);
  const [threshold, setThreshold] = useState(100);

  const [action, setAction] = useState<StockAction | null>(null);
  const [actionRow, setActionRow] = useState<WarehouseStock | null>(null);
  const [transferRow, setTransferRow] = useState<WarehouseStock | null>(null);

  const canMutate = useCan('STOCK_MUTATE');

  const all = useWarehouseStock(lowOnly ? {} : { warehouseId });
  const low = useLowStock(threshold, warehouseId, lowOnly);

  const rows = lowOnly ? low.data?.items : all.data?.data;
  const query = lowOnly ? low : all;

  const openAction = (next: StockAction, row: WarehouseStock) => {
    setActionRow(row);
    setAction(next);
  };

  const columns: ColumnsType<WarehouseStock> = [
    {
      title: 'Batch',
      key: 'batch',
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <Typography.Text code>{row.batch?.batchNumber ?? row.batchId}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.batch?.cropName ?? EM_DASH}
            {row.batch?.farmer?.farmerCode ? ` · ${row.batch.farmer.farmerCode}` : ''}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Warehouse',
      key: 'warehouse',
      render: (_, row) => row.warehouse?.name ?? EM_DASH,
    },
    {
      title: 'On hand',
      key: 'quantity',
      align: 'right',
      render: (_, row) => formatQuantity(row.quantity, row.unit),
      sorter: (a, b) => Number(a.quantity) - Number(b.quantity),
    },
    {
      title: 'Reserved',
      key: 'reservedQuantity',
      align: 'right',
      render: (_, row) =>
        Number(row.reservedQuantity) > 0 ? (
          <Typography.Text type="warning">
            {formatQuantity(row.reservedQuantity, row.unit)}
          </Typography.Text>
        ) : (
          EM_DASH
        ),
    },
    {
      title: 'Available',
      key: 'available',
      align: 'right',
      render: (_, row) => (
        <Typography.Text strong>
          {formatQuantity(Number(row.quantity) - Number(row.reservedQuantity), row.unit)}
        </Typography.Text>
      ),
    },
    {
      title: 'Location',
      dataIndex: 'storageLocation',
      key: 'storageLocation',
      render: (value: string | null) => value ?? EM_DASH,
    },
    {
      title: 'Batch status',
      key: 'batchStatus',
      render: (_, row) => (row.batch?.status ? <Tag>{row.batch.status}</Tag> : EM_DASH),
    },
    {
      title: 'Updated',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      render: (value: string) => formatDateTime(value),
    },
    ...(canMutate
      ? [
          {
            title: 'Actions',
            key: 'actions',
            width: 240,
            fixed: 'right' as const,
            render: (_: unknown, row: WarehouseStock) => (
              <Space size={4}>
                <Button size="small" onClick={() => openAction('out', row)}>
                  Out
                </Button>
                <Button size="small" onClick={() => setTransferRow(row)}>
                  Transfer
                </Button>
                <Button size="small" onClick={() => openAction('adjust', row)}>
                  Adjust
                </Button>
              </Space>
            ),
          },
        ]
      : []),
  ];

  const toolbar = (
    <Row gutter={[12, 12]} align="middle">
      <Col xs={24} md={8}>
        <WarehouseSelect
          allowClear
          placeholder="Filter by warehouse"
          value={warehouseId}
          onChange={setWarehouseId}
        />
      </Col>
      <Col xs={24} md={10}>
        <Space>
          <Switch checked={lowOnly} onChange={setLowOnly} />
          <Typography.Text>Low stock only</Typography.Text>
          <InputNumber
            size="small"
            min={0}
            step={10}
            value={threshold}
            disabled={!lowOnly}
            onChange={(value) => setThreshold(value ?? 0)}
            style={{ width: 96 }}
          />
          <Typography.Text type="secondary">at or below</Typography.Text>
        </Space>
      </Col>
    </Row>
  );

  return (
    <Card>
      <PageHeader
        title="Warehouse stock"
        subtitle="Batch-wise on-hand stock (FRD 16.7 / 17.1). Every movement writes a ledger row in the same transaction as the balance change, so the two can never drift apart."
        actions={
          <Can do="STOCK_MUTATE">
            <Button
              type="primary"
              icon={<ImportOutlined />}
              disabled={!warehouseId}
              onClick={() => {
                setActionRow(null);
                setAction('in');
              }}
            >
              Stock in
            </Button>
          </Can>
        }
      />

      {!warehouseId ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="Select a warehouse to book stock in"
          description="Stock-in needs to know which warehouse is receiving. Taking stock out, transferring and adjusting are row actions, so they already know."
        />
      ) : null}

      {lowOnly && low.data ? (
        <Alert
          type={low.data.count > 0 ? 'warning' : 'success'}
          showIcon
          style={{ marginBottom: 12 }}
          message={
            low.data.count > 0
              ? `${low.data.count} batch${low.data.count === 1 ? '' : 'es'} at or below ${low.data.threshold}`
              : `Nothing at or below ${low.data.threshold}`
          }
        />
      ) : null}

      <DataTable<WarehouseStock>
        rows={rows}
        columns={columns}
        rowKey="id"
        isLoading={query.isLoading}
        isFetching={query.isFetching}
        error={query.error}
        onRetry={() => void query.refetch()}
        toolbar={toolbar}
        emptyText={
          lowOnly ? 'Nothing below the threshold' : 'No stock held — book a batch in to start'
        }
      />

      <StockActionModal
        action={action}
        row={actionRow}
        warehouseId={warehouseId}
        onClose={() => {
          setAction(null);
          setActionRow(null);
        }}
      />
      <TransferStockModal row={transferRow} onClose={() => setTransferRow(null)} />

      <Typography.Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0, fontSize: 12 }}>
        <SwapOutlined /> Reserved quantity is stock already promised to an order. It counts as
        unavailable — a withdrawal or transfer cannot dip into it.
      </Typography.Paragraph>
    </Card>
  );
}
