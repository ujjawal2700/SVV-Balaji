import { DashboardOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Card, Col, Row, Space, Switch, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import type { Warehouse } from '../../api/types';
import { Can } from '../../components/Can';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { RowActions } from '../../components/RowActions';
import { BranchSelect } from '../../components/pickers';
import {
  useDeleteWarehouse,
  useSetWarehouseActive,
  useWarehouses,
} from '../../hooks/useWarehouses';
import { EM_DASH, formatQuantity } from '../../utils/format';
import { WarehouseFormModal } from './WarehouseFormModal';
import { WarehouseOccupancy } from './WarehouseOccupancy';

export function WarehousesPage() {
  const [branchId, setBranchId] = useState<string | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [viewing, setViewing] = useState<Warehouse | null>(null);
  const [showClosed, setShowClosed] = useState(true);

  // The master screen asks for closed warehouses too - it is the only screen
  // that can reopen one.
  const warehouses = useWarehouses(branchId, true);
  const setActive = useSetWarehouseActive();
  const remove = useDeleteWarehouse();

  const rows = (warehouses.data?.data ?? []).filter((w) => showClosed || w.isActive);
  const closedCount = (warehouses.data?.data ?? []).filter((w) => !w.isActive).length;

  const openEdit = (warehouse: Warehouse) => {
    setEditing(warehouse);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const columns: ColumnsType<Warehouse> = [
    {
      title: 'Warehouse',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, warehouse) => (
        <Typography.Link onClick={() => setViewing(warehouse)}>{name}</Typography.Link>
      ),
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    { title: 'Location', dataIndex: 'location', key: 'location' },
    {
      title: 'Branch',
      key: 'branch',
      render: (_, warehouse) => warehouse.branch?.name ?? EM_DASH,
    },
    {
      title: 'Capacity',
      dataIndex: 'capacity',
      key: 'capacity',
      align: 'right',
      render: (value: string | null) =>
        value === null ? (
          <Typography.Text type="secondary">Not set</Typography.Text>
        ) : (
          formatQuantity(value)
        ),
    },
    {
      title: 'Status',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 100,
      render: (isActive: boolean) =>
        isActive ? <Tag color="green">Active</Tag> : <Tag>Inactive</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 260,
      fixed: 'right',
      render: (_, warehouse) => (
        <RowActions
          entity="warehouse"
          label={warehouse.name}
          can="WAREHOUSE_MANAGE"
          isActive={warehouse.isActive}
          onEdit={() => openEdit(warehouse)}
          onSetActive={(isActive) => setActive.mutateAsync({ id: warehouse.id, isActive })}
          onDelete={() => remove.mutateAsync(warehouse.id)}
        >
          <Button size="small" icon={<DashboardOutlined />} onClick={() => setViewing(warehouse)}>
            Occupancy
          </Button>
        </RowActions>
      ),
    },
  ];

  const toolbar = (
    <Row gutter={[12, 12]}>
      <Col xs={24} md={8}>
        <BranchSelect
          allowClear
          placeholder="Filter by branch"
          value={branchId}
          onChange={setBranchId}
        />
      </Col>
      <Col xs={24} md={8}>
        <Space>
          <Switch size="small" checked={showClosed} onChange={setShowClosed} />
          <Typography.Text type="secondary">
            Show closed{closedCount > 0 ? ` (${closedCount})` : ''}
          </Typography.Text>
        </Space>
      </Col>
    </Row>
  );

  return (
    <Card>
      <PageHeader
        title="Warehouses"
        subtitle="Storage locations (FRD Section 16). A collection can book its batch straight into a warehouse on receipt — until one exists here, batches are created unstored."
        actions={
          <Can do="WAREHOUSE_CREATE">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
              New warehouse
            </Button>
          </Can>
        }
      />

      <DataTable<Warehouse>
        rows={rows}
        columns={columns}
        rowKey="id"
        isLoading={warehouses.isLoading}
        isFetching={warehouses.isFetching}
        error={warehouses.error}
        onRetry={() => void warehouses.refetch()}
        toolbar={toolbar}
        emptyText="No warehouses yet — create one before collecting into stock"
      />

      <WarehouseFormModal open={formOpen} warehouse={editing} onClose={closeForm} />
      <WarehouseOccupancy
        warehouseId={viewing?.id ?? null}
        warehouseName={viewing?.name}
        onClose={() => setViewing(null)}
      />
    </Card>
  );
}
