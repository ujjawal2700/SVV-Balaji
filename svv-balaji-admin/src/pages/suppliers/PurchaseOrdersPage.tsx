import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  EditOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import {
  App as AntApp,
  Button,
  Card,
  Col,
  Modal,
  Row,
  Select,
  Space,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { apiErrorMessage } from '../../api/client';
import type {
  PurchaseOrder,
  PurchaseOrderStatus,
  QueryPurchaseOrderDto,
} from '../../../../shared/api/purchaseOrders';
import { useCan } from '../../auth/useCan';
import { Can } from '../../components/Can';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { useSuppliers } from '../../hooks/useSuppliers';
import {
  usePurchaseOrders,
  useSetPurchaseOrderStatus,
} from '../../hooks/usePurchaseOrders';
import { formatCurrency, formatDate, formatQuantity } from '../../utils/format';
import { PurchaseOrderDetailDrawer } from './PurchaseOrderDetailDrawer';
import { PurchaseOrderFormModal } from './PurchaseOrderFormModal';
import {
  PO_STATUS_LABELS,
  PurchaseOrderCodeCell,
  PurchaseOrderStatusTag,
} from './purchaseOrderStatus';

export function PurchaseOrdersPage() {
  const { message } = AntApp.useApp();
  const [query, setQuery] = useState<QueryPurchaseOrderDto>({});
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PurchaseOrder | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const purchaseOrders = usePurchaseOrders(query);
  const suppliers = useSuppliers();
  const setStatus = useSetPurchaseOrderStatus();

  const canCreate = useCan('PURCHASE_ORDER_CREATE');
  const canEdit = useCan('PURCHASE_ORDER_EDIT');
  const canSetStatus = useCan('PURCHASE_ORDER_STATUS');

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (po: PurchaseOrder) => {
    setEditing(po);
    setFormOpen(true);
  };

  const handleStatusChange = (po: PurchaseOrder, newStatus: PurchaseOrderStatus) => {
    Modal.confirm({
      title: `Update Purchase Order Status`,
      content: `Are you sure you want to mark ${po.poNumber} as ${PO_STATUS_LABELS[newStatus]}?`,
      okText: `Confirm ${PO_STATUS_LABELS[newStatus]}`,
      okType: newStatus === 'CANCELLED' ? 'danger' : 'primary',
      onOk: async () => {
        try {
          await setStatus.mutateAsync({ id: po.id, status: newStatus });
          message.success(`${po.poNumber} marked as ${PO_STATUS_LABELS[newStatus]}`);
        } catch (err) {
          message.error(apiErrorMessage(err, 'Could not update status'));
        }
      },
    });
  };

  const supplierFilterOptions = useMemo(
    () =>
      (suppliers.data ?? []).map((s) => ({
        value: s.id,
        label: `${s.fullName}${s.supplierCode ? ` (${s.supplierCode})` : ''}`,
      })),
    [suppliers.data],
  );

  const columns: ColumnsType<PurchaseOrder> = [
    {
      title: 'PO Number',
      dataIndex: 'poNumber',
      key: 'poNumber',
      width: 170,
      render: (code: string, po) => (
        <Typography.Link onClick={() => setDetailId(po.id)}>
          <PurchaseOrderCodeCell code={code} />
        </Typography.Link>
      ),
    },
    {
      title: 'Supplier',
      key: 'supplier',
      render: (_, po) => (
        <Space direction="vertical" size={0}>
          <Typography.Link onClick={() => setDetailId(po.id)}>
            {po.supplier?.fullName || 'View Supplier'}
          </Typography.Link>
          {po.supplier?.supplierCode && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {po.supplier.supplierCode}
            </Typography.Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Material',
      dataIndex: 'materialName',
      key: 'materialName',
      render: (name: string) => <Typography.Text strong>{name}</Typography.Text>,
    },
    {
      title: 'Expected Qty',
      key: 'expectedQuantity',
      align: 'right',
      render: (_, po) => formatQuantity(po.expectedQuantity, po.unit),
    },
    {
      title: 'Rate',
      key: 'purchaseRate',
      align: 'right',
      render: (_, po) => `${formatCurrency(po.purchaseRate)} / ${po.unit}`,
    },
    {
      title: 'Total Amount',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      align: 'right',
      render: (val: number) => (
        <Typography.Text strong>{formatCurrency(val)}</Typography.Text>
      ),
    },
    {
      title: 'Order Date',
      dataIndex: 'orderDate',
      key: 'orderDate',
      render: (d: string) => formatDate(d),
    },
    {
      title: 'Delivery Due',
      dataIndex: 'deliveryDate',
      key: 'deliveryDate',
      render: (d: string | null) => formatDate(d),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status: PurchaseOrderStatus) => <PurchaseOrderStatusTag status={status} />,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 160,
      render: (_, po) => {
        if (!canEdit && !canSetStatus) {
          return (
            <Button size="small" type="link" onClick={() => setDetailId(po.id)}>
              View
            </Button>
          );
        }

        return (
          <Space size="small">
            {canEdit && po.status === 'DRAFT' && (
              <Button
                size="small"
                type="text"
                icon={<EditOutlined />}
                onClick={() => openEdit(po)}
                title="Edit PO"
              />
            )}

            {canSetStatus && po.status === 'DRAFT' && (
              <Button
                size="small"
                type="primary"
                ghost
                icon={<CheckCircleOutlined />}
                onClick={() => handleStatusChange(po, 'CONFIRMED')}
              >
                Confirm
              </Button>
            )}

            {canSetStatus && (po.status === 'CONFIRMED' || po.status === 'PARTIALLY_FULFILLED') && (
              <Button
                size="small"
                type="primary"
                onClick={() => handleStatusChange(po, 'FULFILLED')}
              >
                Fulfill
              </Button>
            )}

            {canSetStatus && po.status !== 'FULFILLED' && po.status !== 'CANCELLED' && (
              <Button
                size="small"
                danger
                type="text"
                icon={<CloseCircleOutlined />}
                onClick={() => handleStatusChange(po, 'CANCELLED')}
                title="Cancel PO"
              />
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Purchase Orders"
        subtitle="Manage supplier raw material purchase agreements, rates, and delivery fulfillment"
        actions={
          <Can do="PURCHASE_ORDER_CREATE">
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Create Purchase Order
            </Button>
          </Can>
        }
      />

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={8}>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Filter by supplier"
              options={supplierFilterOptions}
              value={query.supplierId}
              onChange={(val) => setQuery((prev) => ({ ...prev, supplierId: val }))}
              style={{ width: '100%' }}
            />
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Select
              allowClear
              placeholder="Filter by status"
              value={query.status}
              onChange={(val) => setQuery((prev) => ({ ...prev, status: val }))}
              options={Object.entries(PO_STATUS_LABELS).map(([k, v]) => ({
                value: k,
                label: v,
              }))}
              style={{ width: '100%' }}
            />
          </Col>
        </Row>
      </Card>

      <DataTable
        rows={purchaseOrders.data}
        columns={columns}
        rowKey="id"
        isLoading={purchaseOrders.isLoading}
        isFetching={purchaseOrders.isFetching}
        error={purchaseOrders.error}
        onRetry={purchaseOrders.refetch}
        emptyText="No purchase orders found"
      />

      <PurchaseOrderFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        editing={editing}
      />

      <PurchaseOrderDetailDrawer
        poId={detailId}
        onClose={() => setDetailId(null)}
      />
    </>
  );
}
