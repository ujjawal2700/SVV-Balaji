import { NodeIndexOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Row, Select, Space, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import {
  BATCH_STATUSES,
  type BatchStatus,
  type RawMaterialBatch,
  type RawMaterialCollection,
} from '../../api/types';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { RowActions } from '../../components/RowActions';
import { FarmerSelect, WarehouseSelect } from '../../components/pickers';
import { useBatches, useDeleteCollection } from '../../hooks/useCollections';
import { EM_DASH, formatDate, formatQuantity } from '../../utils/format';
import { CollectionCorrectionModal } from '../collections/CollectionCorrectionModal';
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
  const [correcting, setCorrecting] = useState<RawMaterialCollection | null>(null);

  const batches = useBatches(filters);
  const removeCollection = useDeleteCollection();

  /**
   * A batch has no editable fields of its own. Quantity, crop, farmer and
   * branch are all copied from the collection that minted it, so correcting a
   * batch means correcting that collection - and the same is true of deleting
   * one, which is why both actions here operate on the collection and take the
   * batch with them. Two places to change a quantity would guarantee they
   * eventually disagree.
   */
  const asCollection = (batch: RawMaterialBatch): RawMaterialCollection | null => {
    if (!batch.collection) return null;
    return {
      ...batch.collection,
      inspectionId: '',
      farmerId: batch.farmerId,
      farmer: batch.farmer,
      branchId: batch.branchId,
      cropName: batch.cropName,
      collectedById: '',
      batch: { id: batch.id, batchNumber: batch.batchNumber, status: batch.status },
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
    } as RawMaterialCollection;
  };

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
      title: 'Actions',
      key: 'actions',
      width: 240,
      fixed: 'right',
      render: (_, batch) => {
        const collection = asCollection(batch);
        const movedOn =
          batch.status !== 'COLLECTED' && batch.status !== 'STORED'
            ? `This batch is ${label(batch.status).toLowerCase()} — it has moved on into production`
            : undefined;
        const paid =
          collection && collection.paymentStatus !== 'PENDING'
            ? `The farmer has been paid against ${collection.receiptNumber}`
            : undefined;

        return (
          <RowActions
            entity="batch"
            label={batch.batchNumber}
            can="COLLECTION_EDIT"
            canDelete="COLLECTION_DELETE"
            onEdit={collection && !movedOn ? () => setCorrecting(collection) : undefined}
            onDelete={collection ? () => removeCollection.mutateAsync(collection.id) : undefined}
            deleteBlockedReason={movedOn ?? paid}
          >
            <Button
              size="small"
              icon={<NodeIndexOutlined />}
              onClick={() => setTracing(batch.batchNumber)}
            >
              Trace
            </Button>
          </RowActions>
        );
      },
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

      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message="Batches are corrected through their collection"
          description="A batch inherits its quantity, crop and farmer from the collection that minted it, so Correct and Delete here act on that collection — and deleting one removes the batch, its stock line and its receipt movement together. Both are refused once the batch has been cleaned, inspected, consumed or moved."
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
      </Space>

      <CollectionCorrectionModal collection={correcting} onClose={() => setCorrecting(null)} />
      <BatchTraceDrawer batchNumber={tracing} onClose={() => setTracing(null)} />
    </Card>
  );
}
