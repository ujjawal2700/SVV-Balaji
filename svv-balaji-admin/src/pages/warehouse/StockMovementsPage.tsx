import { Card, Col, Row, Select, Space, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { MOVEMENT_TYPES, type StockMovement, type StockMovementType } from '../../api/types';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { WarehouseSelect } from '../../components/pickers';
import { useWarehouses, useStockMovements } from '../../hooks/useWarehouses';
import { EM_DASH, formatDateTime, formatQuantity } from '../../utils/format';

const MOVEMENT_COLOURS: Record<StockMovementType, string> = {
  STOCK_IN: 'green',
  STOCK_OUT: 'red',
  TRANSFER: 'blue',
  ADJUSTMENT: 'gold',
};

const label = (value: string) =>
  value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');

/**
 * The inventory audit trail (FRD 17.3 / 17.5).
 *
 * Append-only and never pruned — no edit or delete action exists here by
 * design. If a movement was wrong, the correction is another movement, which is
 * what makes a discrepancy investigable months later.
 */
export function StockMovementsPage() {
  const [warehouseId, setWarehouseId] = useState<string | undefined>();
  const [type, setType] = useState<StockMovementType | undefined>();

  // The API filters by batch and warehouse only, so movement type is filtered
  // client-side rather than sent as a parameter the endpoint would reject.
  const movements = useStockMovements({ warehouseId });
  const warehouses = useWarehouses();

  const warehouseName = useMemo(() => {
    const lookup = new Map((warehouses.data?.data ?? []).map((w) => [w.id, w.name]));
    return (id: string | null) => (id ? (lookup.get(id) ?? id) : null);
  }, [warehouses.data]);

  const rows = useMemo(
    () => (movements.data?.data ?? []).filter((row) => !type || row.movementType === type),
    [movements.data, type],
  );

  const columns: ColumnsType<StockMovement> = [
    {
      title: 'When',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (value: string) => formatDateTime(value),
      sorter: (a, b) => a.createdAt.localeCompare(b.createdAt),
      defaultSortOrder: 'descend',
    },
    {
      title: 'Type',
      dataIndex: 'movementType',
      key: 'movementType',
      width: 130,
      render: (value: StockMovementType) => (
        <Tag color={MOVEMENT_COLOURS[value]}>{label(value)}</Tag>
      ),
    },
    {
      title: 'Batch',
      key: 'batch',
      render: (_, row) => (
        <Typography.Text code>{row.batch?.batchNumber ?? row.batchId}</Typography.Text>
      ),
    },
    {
      title: 'Quantity',
      key: 'quantity',
      align: 'right',
      render: (_, row) => formatQuantity(row.quantity, row.unit),
    },
    {
      title: 'Movement',
      key: 'movement',
      render: (_, row) => {
        const from = warehouseName(row.fromWarehouseId);
        const to = warehouseName(row.toWarehouseId);
        if (from && to) return `${from} → ${to}`;
        if (to) return <Space size={4}>→ {to}</Space>;
        if (from) return <Space size={4}>{from} →</Space>;
        return EM_DASH;
      },
    },
    {
      title: 'Reason',
      dataIndex: 'reason',
      key: 'reason',
      render: (value: string | null) => value ?? EM_DASH,
    },
    {
      title: 'By',
      key: 'performedBy',
      render: (_, row) => row.performedBy?.fullName ?? EM_DASH,
    },
  ];

  const toolbar = (
    <Row gutter={[12, 12]}>
      <Col xs={24} md={8}>
        <WarehouseSelect
          allowClear
          placeholder="Filter by warehouse"
          value={warehouseId}
          onChange={setWarehouseId}
        />
      </Col>
      <Col xs={24} md={6}>
        <Select<StockMovementType>
          allowClear
          style={{ width: '100%' }}
          placeholder="Movement type"
          value={type}
          onChange={setType}
          options={MOVEMENT_TYPES.map((value) => ({ value, label: label(value) }))}
        />
      </Col>
    </Row>
  );

  return (
    <Card>
      <PageHeader
        title="Movement ledger"
        subtitle="Every inventory change, append-only (FRD 17.3 / 17.5). Nothing here can be edited or deleted — a wrong movement is corrected by another movement, which is what keeps a discrepancy investigable later."
      />

      <DataTable<StockMovement>
        rows={rows}
        columns={columns}
        rowKey="id"
        isLoading={movements.isLoading}
        isFetching={movements.isFetching}
        error={movements.error}
        onRetry={() => void movements.refetch()}
        toolbar={toolbar}
        emptyText="No movements recorded yet"
      />
    </Card>
  );
}
