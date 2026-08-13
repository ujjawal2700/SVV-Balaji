import { NodeIndexOutlined } from '@ant-design/icons';
import { Button, Card, Col, Row, Select, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { BATCH_STATUSES, type BatchStatus, type RawMaterialBatch } from '../../api/types';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { FarmerSelect, WarehouseSelect } from '../../components/pickers';
import { useBatches } from '../../hooks/useCollections';
import { EM_DASH, formatDate, formatQuantity } from '../../utils/format';
import { BatchTraceDrawer } from './BatchTraceDrawer';

const STATUS_COLOURS: Record<BatchStatus, string> = {
  COLLECTED: 'blue',
  STORED: 'green',
  UNDER_PRODUCTION: 'gold',
  PACKAGED: 'purple',
  DISPATCHED: 'cyan',
  DELIVERED: 'default',
  REJECTED: 'red',
};

const label = (status: string) =>
  status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ');

export function BatchesPage() {
  const [filters, setFilters] = useState<{
    farmerId?: string;
    status?: BatchStatus;
    warehouseId?: string;
  }>({});
  const [tracing, setTracing] = useState<string | null>(null);

  const batches = useBatches(filters);

  const columns: ColumnsType<RawMaterialBatch> = [
    {
      title: 'Batch number',
      dataIndex: 'batchNumber',
      key: 'batchNumber',
      width: 170,
      render: (value: string) => (
        <Typography.Link onClick={() => setTracing(value)}>
          <Typography.Text code>{value}</Typography.Text>
        </Typography.Link>
      ),
    },
    {
      title: 'Farmer',
      key: 'farmer',
      render: (_, batch) => (
        <div>
          <div>{batch.farmer?.fullName ?? EM_DASH}</div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {batch.farmer?.farmerCode ?? EM_DASH}
          </Typography.Text>
        </div>
      ),
    },
    { title: 'Crop', dataIndex: 'cropName', key: 'cropName' },
    {
      title: 'Quantity',
      key: 'quantity',
      align: 'right',
      render: (_, batch) => formatQuantity(batch.quantity, batch.unit),
    },
    {
      title: 'Warehouse',
      key: 'warehouse',
      render: (_, batch) =>
        batch.warehouse?.name ?? <Typography.Text type="secondary">Not stored</Typography.Text>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 150,
      render: (status: BatchStatus) => <Tag color={STATUS_COLOURS[status]}>{label(status)}</Tag>,
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (value: string) => formatDate(value),
      sorter: (a, b) => a.createdAt.localeCompare(b.createdAt),
    },
    {
      title: '',
      key: 'actions',
      width: 90,
      render: (_, batch) => (
        <Button
          size="small"
          icon={<NodeIndexOutlined />}
          onClick={() => setTracing(batch.batchNumber)}
        >
          Trace
        </Button>
      ),
    },
  ];

  const toolbar = (
    <Row gutter={[12, 12]}>
      <Col xs={24} md={8}>
        <FarmerSelect
          allowClear
          placeholder="Filter by farmer"
          value={filters.farmerId}
          onChange={(farmerId) => setFilters((f) => ({ ...f, farmerId }))}
        />
      </Col>
      <Col xs={12} md={6}>
        <WarehouseSelect
          allowClear
          placeholder="Filter by warehouse"
          value={filters.warehouseId}
          onChange={(warehouseId) => setFilters((f) => ({ ...f, warehouseId }))}
        />
      </Col>
      <Col xs={12} md={6}>
        <Select<BatchStatus>
          allowClear
          style={{ width: '100%' }}
          placeholder="Status"
          value={filters.status}
          onChange={(status) => setFilters((f) => ({ ...f, status }))}
          options={BATCH_STATUSES.map((value) => ({ value, label: label(value) }))}
        />
      </Col>
    </Row>
  );

  return (
    <Card>
      <PageHeader
        title="Raw material batches"
        subtitle="Every batch minted at collection (FRD Section 15). Click a batch number to walk it back to the farmer, the inspection that approved it, and its full stock history."
      />

      <DataTable<RawMaterialBatch>
        rows={batches.data?.data}
        columns={columns}
        rowKey="id"
        isLoading={batches.isLoading}
        isFetching={batches.isFetching}
        error={batches.error}
        onRetry={() => void batches.refetch()}
        toolbar={toolbar}
        emptyText="No batches yet — they are minted when a harvest is collected"
      />

      <BatchTraceDrawer batchNumber={tracing} onClose={() => setTracing(null)} />
    </Card>
  );
}
