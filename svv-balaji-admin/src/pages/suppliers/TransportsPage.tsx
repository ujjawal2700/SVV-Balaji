import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  EditOutlined,
  PlusOutlined,
  SendOutlined,
} from '@ant-design/icons';
import {
  App as AntApp,
  Button,
  Card,
  Col,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { apiErrorMessage } from '../../api/client';
import type {
  QueryTransportDto,
  SupplierTransport,
  TransportStatus,
} from '../../../../shared/api/transports';
import { useCan } from '../../auth/useCan';
import { Can } from '../../components/Can';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { WarehouseSelect } from '../../components/pickers';
import { useSuppliers } from '../../hooks/useSuppliers';
import {
  useCancelTransport,
  useDispatchTransport,
  useTransports,
} from '../../hooks/useTransports';
import { formatDate, formatQuantity } from '../../utils/format';
import { DeliverTransportModal } from './DeliverTransportModal';
import { TransportDetailDrawer } from './TransportDetailDrawer';
import { TransportFormModal } from './TransportFormModal';
import {
  TRANSPORT_STATUS_LABELS,
  TransportCodeCell,
  TransportStatusTag,
} from './transportStatus';

export function TransportsPage() {
  const { message } = AntApp.useApp();
  const [query, setQuery] = useState<QueryTransportDto>({});
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierTransport | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [delivering, setDelivering] = useState<SupplierTransport | null>(null);

  const transports = useTransports(query);
  const suppliers = useSuppliers();
  const dispatch = useDispatchTransport();
  const cancel = useCancelTransport();

  const canCreate = useCan('TRANSPORT_CREATE');
  const canEdit = useCan('TRANSPORT_EDIT');

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (t: SupplierTransport) => {
    setEditing(t);
    setFormOpen(true);
  };

  const handleDispatch = (t: SupplierTransport) => {
    Modal.confirm({
      title: 'Confirm Dispatch',
      content: `Mark transport for ${t.materialName} (${formatQuantity(t.quantity, t.unit)}) as IN TRANSIT?`,
      okText: 'Dispatch',
      okType: 'primary',
      onOk: async () => {
        try {
          await dispatch.mutateAsync(t.id);
          message.success('Transport marked as in transit');
        } catch (err) {
          message.error(apiErrorMessage(err, 'Could not dispatch transport'));
        }
      },
    });
  };

  const handleCancel = (t: SupplierTransport) => {
    let remarks = '';
    Modal.confirm({
      title: 'Cancel Transport',
      content: (
        <div style={{ marginTop: 12 }}>
          <Typography.Paragraph>
            Are you sure you want to cancel this transport of {t.materialName}?
          </Typography.Paragraph>
          <Input.TextArea
            placeholder="Cancellation reason (optional)"
            rows={2}
            onChange={(e) => {
              remarks = e.target.value;
            }}
          />
        </div>
      ),
      okText: 'Yes, Cancel Transport',
      okType: 'danger',
      onOk: async () => {
        try {
          await cancel.mutateAsync({ id: t.id, remarks });
          message.success('Transport cancelled');
        } catch (err) {
          message.error(apiErrorMessage(err, 'Could not cancel transport'));
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

  const columns: ColumnsType<SupplierTransport> = [
    {
      title: 'ID',
      key: 'id',
      width: 130,
      render: (_, t) => <TransportCodeCell id={t.id} />,
    },
    {
      title: 'Supplier',
      key: 'supplier',
      render: (_, t) => (
        <Space direction="vertical" size={0}>
          <Typography.Link onClick={() => setDetailId(t.id)}>
            {t.supplier?.fullName || 'View Details'}
          </Typography.Link>
          {t.supplier?.supplierCode && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t.supplier.supplierCode}
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
      title: 'Quantity',
      key: 'quantity',
      align: 'right',
      render: (_, t) => formatQuantity(t.quantity, t.unit),
    },
    {
      title: 'Scheduled Date',
      dataIndex: 'scheduledDate',
      key: 'scheduledDate',
      render: (val: string) => formatDate(val),
    },
    {
      title: 'Vehicle / Driver',
      key: 'logistics',
      render: (_, t) => (
        <Space direction="vertical" size={0}>
          {t.vehicleNumber ? <Tag>{t.vehicleNumber}</Tag> : <span>-</span>}
          {t.driverName && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t.driverName} {t.driverPhone ? `(${t.driverPhone})` : ''}
            </Typography.Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Destination',
      key: 'destination',
      render: (_, t) => (
        <Space direction="vertical" size={0}>
          <span>{t.warehouse?.name || (t.warehouseId ? 'Assigned' : '-')}</span>
          {t.deliveryLocation && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t.deliveryLocation}
            </Typography.Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: TransportStatus) => <TransportStatusTag status={status} />,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 180,
      render: (_, t) => {
        if (!canEdit) {
          return (
            <Button size="small" type="link" onClick={() => setDetailId(t.id)}>
              View
            </Button>
          );
        }

        return (
          <Space size="small">
            {t.status === 'SCHEDULED' && (
              <>
                <Button
                  size="small"
                  type="text"
                  icon={<EditOutlined />}
                  onClick={() => openEdit(t)}
                  title="Edit"
                />
                <Button
                  size="small"
                  type="primary"
                  ghost
                  icon={<SendOutlined />}
                  onClick={() => handleDispatch(t)}
                >
                  Dispatch
                </Button>
              </>
            )}

            {(t.status === 'IN_TRANSIT' || t.status === 'SCHEDULED') && (
              <Button
                size="small"
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={() => setDelivering(t)}
              >
                Deliver
              </Button>
            )}

            {t.status !== 'DELIVERED' && t.status !== 'CANCELLED' && (
              <Button
                size="small"
                danger
                type="text"
                icon={<CloseCircleOutlined />}
                onClick={() => handleCancel(t)}
                title="Cancel Transport"
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
        title="Supplier Transports"
        subtitle="Manage inbound raw material transports, dispatches, and warehouse receiving from suppliers"
        actions={
          <Can do="TRANSPORT_CREATE">
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Schedule Transport
            </Button>
          </Can>
        }
      />

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={6}>
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
          <Col xs={24} sm={12} md={6}>
            <Input
              allowClear
              placeholder="Search material / crop name"
              value={query.materialName}
              onChange={(e) =>
                setQuery((prev) => ({ ...prev, materialName: e.target.value || undefined }))
              }
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <WarehouseSelect
              allowClear
              placeholder="Filter by destination warehouse"
              value={query.warehouseId}
              onChange={(val) => setQuery((prev) => ({ ...prev, warehouseId: val }))}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Select
              allowClear
              placeholder="Filter by status"
              value={query.status}
              onChange={(val) => setQuery((prev) => ({ ...prev, status: val }))}
              options={Object.entries(TRANSPORT_STATUS_LABELS).map(([k, v]) => ({
                value: k,
                label: v,
              }))}
              style={{ width: '100%' }}
            />
          </Col>
        </Row>
      </Card>

      <DataTable
        rows={transports.data}
        columns={columns}
        rowKey="id"
        isLoading={transports.isLoading}
        isFetching={transports.isFetching}
        error={transports.error}
        onRetry={transports.refetch}
        emptyText="No supplier transport records found"
      />

      <TransportFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        editing={editing}
      />

      <DeliverTransportModal
        open={!!delivering}
        onClose={() => setDelivering(null)}
        transport={delivering}
      />

      <TransportDetailDrawer
        transportId={detailId}
        onClose={() => setDetailId(null)}
      />
    </>
  );
}
