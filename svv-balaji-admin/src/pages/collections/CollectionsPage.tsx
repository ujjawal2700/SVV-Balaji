import { PlusOutlined } from '@ant-design/icons';
import { App as AntApp, Button, Card, Col, Row, Select, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { apiErrorMessage } from '../../api/client';
import {
  PAYMENT_STATUSES,
  type PaymentStatus,
  type RawMaterialCollection,
} from '../../api/types';
import { useCan } from '../../auth/useCan';
import { Can } from '../../components/Can';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { BranchSelect, FarmerSelect } from '../../components/pickers';
import { useCollections, useSetPaymentStatus } from '../../hooks/useCollections';
import { EM_DASH, formatCurrency, formatDate, formatQuantity } from '../../utils/format';
import { RowActions } from '../../components/RowActions';
import { useDeleteCollection } from '../../hooks/useCollections';
import { CollectionCorrectionModal } from './CollectionCorrectionModal';
import { CollectionFormModal } from './CollectionFormModal';

const PAYMENT_COLOURS: Record<PaymentStatus, string> = {
  PENDING: 'red',
  PARTIAL: 'gold',
  PAID: 'green',
};

const label = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();

export function CollectionsPage() {
  const { message } = AntApp.useApp();
  const [filters, setFilters] = useState<{ farmerId?: string; branchId?: string }>({});
  const [formOpen, setFormOpen] = useState(false);
  const [correcting, setCorrecting] = useState<RawMaterialCollection | null>(null);
  const remove = useDeleteCollection();

  const collections = useCollections(filters);
  const setPayment = useSetPaymentStatus();
  const canEdit = useCan('COLLECTION_CREATE');

  const handlePaymentChange = async (
    collection: RawMaterialCollection,
    paymentStatus: PaymentStatus,
  ) => {
    try {
      await setPayment.mutateAsync({ id: collection.id, paymentStatus });
      message.success(`${collection.receiptNumber} marked ${label(paymentStatus).toLowerCase()}`);
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not update the payment status'));
    }
  };

  const columns: ColumnsType<RawMaterialCollection> = [
    {
      title: 'Receipt',
      dataIndex: 'receiptNumber',
      key: 'receiptNumber',
      width: 150,
      render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
    },
    {
      title: 'Batch',
      key: 'batch',
      width: 160,
      render: (_, row) =>
        row.batch ? (
          <div>
            <Typography.Text code>{row.batch.batchNumber}</Typography.Text>
            <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
              {row.batch.status}
            </Typography.Text>
          </div>
        ) : (
          EM_DASH
        ),
    },
    {
      title: 'Farmer',
      key: 'farmer',
      render: (_, row) => (
        <div>
          <div>{row.farmer?.fullName ?? EM_DASH}</div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.farmer?.farmerCode ?? EM_DASH}
          </Typography.Text>
        </div>
      ),
    },
    { title: 'Crop', dataIndex: 'cropName', key: 'cropName' },
    {
      title: 'Net weight',
      key: 'netWeight',
      align: 'right',
      render: (_, row) => formatQuantity(row.netWeight, row.unit),
    },
    {
      title: 'Rate',
      dataIndex: 'purchaseRate',
      key: 'purchaseRate',
      align: 'right',
      render: (value: string) => formatCurrency(value),
    },
    {
      title: 'Total',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      align: 'right',
      render: (value: string) => (
        <Typography.Text strong>{formatCurrency(value)}</Typography.Text>
      ),
    },
    {
      title: 'Collected',
      dataIndex: 'collectionDate',
      key: 'collectionDate',
      render: (value: string) => formatDate(value),
      sorter: (a, b) => a.collectionDate.localeCompare(b.collectionDate),
    },
    {
      title: 'Payment',
      dataIndex: 'paymentStatus',
      key: 'paymentStatus',
      width: 150,
      render: (status: PaymentStatus, row) =>
        canEdit ? (
          <Select<PaymentStatus>
            size="small"
            value={status}
            style={{ width: 125 }}
            loading={setPayment.isPending}
            onChange={(next) => void handlePaymentChange(row, next)}
            options={PAYMENT_STATUSES.map((value) => ({ value, label: label(value) }))}
          />
        ) : (
          <Tag color={PAYMENT_COLOURS[status]}>{label(status)}</Tag>
        ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      fixed: 'right',
      render: (_, row) => {
        // The server's own guards are stricter than anything the list can see -
        // it also checks whether the batch has been cleaned, consumed or moved.
        // These two are the ones the list already knows, so they are worth
        // saying up front rather than after the confirm dialog.
        const paid =
          row.paymentStatus !== 'PENDING'
            ? `The farmer has been paid against ${row.receiptNumber} — deleting it would leave the payment with nothing to reconcile against`
            : undefined;
        const inUse =
          row.batch && row.batch.status !== 'COLLECTED' && row.batch.status !== 'STORED'
            ? `Batch ${row.batch.batchNumber} is ${row.batch.status.toLowerCase().replace(/_/g, ' ')} — it has moved on into production`
            : undefined;

        return (
          <RowActions
            entity="collection"
            label={row.receiptNumber}
            can="COLLECTION_EDIT"
            canDelete="COLLECTION_DELETE"
            onEdit={() => setCorrecting(row)}
            onDelete={() => remove.mutateAsync(row.id)}
            deleteBlockedReason={paid ?? inUse}
          />
        );
      },
    },
  ];

  const unpaid = (collections.data?.data ?? []).filter(
    (row) => row.paymentStatus !== 'PAID',
  ).length;

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
      <Col xs={24} md={6}>
        <BranchSelect
          allowClear
          placeholder="Filter by branch"
          value={filters.branchId}
          onChange={(branchId) => setFilters((f) => ({ ...f, branchId }))}
        />
      </Col>
    </Row>
  );

  return (
    <Card>
      <PageHeader
        title="Collections"
        subtitle={
          unpaid > 0
            ? `${unpaid} collection${unpaid === 1 ? '' : 's'} not yet paid in full. Each collection mints its raw material batch in the same transaction — that link is where traceability starts.`
            : 'Receiving approved harvests (FRD Section 14). Each collection mints its raw material batch in the same transaction.'
        }
        actions={
          <Can do="COLLECTION_CREATE">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
              Record collection
            </Button>
          </Can>
        }
      />

      <DataTable<RawMaterialCollection>
        rows={collections.data?.data}
        columns={columns}
        rowKey="id"
        isLoading={collections.isLoading}
        isFetching={collections.isFetching}
        error={collections.error}
        onRetry={() => void collections.refetch()}
        toolbar={toolbar}
        emptyText="Nothing collected yet"
      />

      <CollectionFormModal open={formOpen} onClose={() => setFormOpen(false)} />
      <CollectionCorrectionModal collection={correcting} onClose={() => setCorrecting(null)} />
    </Card>
  );
}
