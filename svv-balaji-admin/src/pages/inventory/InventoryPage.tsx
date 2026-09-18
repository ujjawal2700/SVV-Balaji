import { EditOutlined } from '@ant-design/icons';
import { Card, Input, Progress, Segmented, Space, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import type { ProductStockSummary, StockStatus } from '@shared/api/types';
import { Can } from '@shared/components/Can';
import { DataTable } from '@shared/components/DataTable';
import { PageHeader } from '@shared/components/PageHeader';
import { useProductStockSummary } from '@shared/hooks/useProduction';
import { EM_DASH } from '@shared/utils/format';
import { ThresholdEditModal } from './ThresholdEditModal';

const STATUS_COLOUR: Record<StockStatus, string> = { OK: 'green', LOW: 'gold', CRITICAL: 'red' };
const STATUS_LABEL: Record<StockStatus, string> = { OK: 'In stock', LOW: 'Low', CRITICAL: 'Critical' };

/**
 * Sellable finished-goods stock against each product's reorder point and
 * safety stock - the two trip wires, not the raw ledger. `/stock-movements`
 * and `/warehouse-stock` already show the ledger and per-warehouse detail for
 * whoever moves stock; this answers "what needs reordering" in one screen.
 */
export function InventoryPage() {
  const summary = useProductStockSummary();
  const [statusFilter, setStatusFilter] = useState<StockStatus | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<ProductStockSummary | null>(null);

  const rows = useMemo(() => {
    const all = summary.data ?? [];
    return all.filter((row) => {
      if (statusFilter !== 'ALL' && row.status !== statusFilter) return false;
      if (search && !`${row.name} ${row.sku}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [summary.data, statusFilter, search]);

  const counts = useMemo(() => {
    const all = summary.data ?? [];
    return {
      LOW: all.filter((r) => r.status === 'LOW').length,
      CRITICAL: all.filter((r) => r.status === 'CRITICAL').length,
    };
  }, [summary.data]);

  const columns: ColumnsType<ProductStockSummary> = [
    {
      title: 'Product',
      key: 'name',
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{row.name}</Typography.Text>
          <Typography.Text code style={{ fontSize: 12 }}>
            {row.sku}
          </Typography.Text>
        </Space>
      ),
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    {
      title: 'Category',
      key: 'category',
      render: (_, row) => row.category?.name ?? EM_DASH,
    },
    {
      title: 'Available',
      key: 'available',
      width: 200,
      render: (_, row) => {
        const ceiling = Math.max(row.availableQuantity, row.reorderPoint, row.safetyStock, 1);
        return (
          <Space direction="vertical" size={0} style={{ width: '100%' }}>
            <Typography.Text strong>
              {row.availableQuantity} {row.unit}
            </Typography.Text>
            <Progress
              percent={Math.min(100, Math.round((row.availableQuantity / ceiling) * 100))}
              showInfo={false}
              size="small"
              strokeColor={STATUS_COLOUR[row.status]}
            />
          </Space>
        );
      },
    },
    {
      title: 'Reorder point',
      dataIndex: 'reorderPoint',
      key: 'reorderPoint',
      width: 120,
      align: 'right',
    },
    {
      title: 'Safety stock',
      dataIndex: 'safetyStock',
      key: 'safetyStock',
      width: 120,
      align: 'right',
    },
    {
      title: 'Status',
      key: 'status',
      width: 130,
      render: (_, row) => (
        <Space direction="vertical" size={2}>
          <Tag color={STATUS_COLOUR[row.status]}>{STATUS_LABEL[row.status]}</Tag>
          {row.allowBackorder ? (
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              Backorder allowed
            </Typography.Text>
          ) : null}
        </Space>
      ),
      filters: [
        { text: 'In stock', value: 'OK' },
        { text: 'Low', value: 'LOW' },
        { text: 'Critical', value: 'CRITICAL' },
      ],
      onFilter: (value, row) => row.status === value,
    },
    {
      title: '',
      key: 'actions',
      width: 90,
      fixed: 'right',
      render: (_, row) => (
        <Can do="PRODUCT_MANAGE">
          <a onClick={() => setEditing(row)}>
            <EditOutlined /> Edit
          </a>
        </Can>
      ),
    },
  ];

  const toolbar = (
    <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
      <Segmented<StockStatus | 'ALL'>
        value={statusFilter}
        onChange={setStatusFilter}
        options={[
          { label: 'All', value: 'ALL' },
          { label: `Low (${counts.LOW})`, value: 'LOW' },
          { label: `Critical (${counts.CRITICAL})`, value: 'CRITICAL' },
        ]}
      />
      <Input.Search allowClear placeholder="Product or SKU" style={{ width: 240 }} onChange={(e) => setSearch(e.target.value)} />
    </Space>
  );

  return (
    <Card>
      <PageHeader
        title="Inventory"
        subtitle="Sellable finished-goods stock against each product's reorder point and safety stock, aggregated across every warehouse."
      />

      <DataTable<ProductStockSummary>
        rows={rows}
        columns={columns}
        rowKey="productId"
        isLoading={summary.isLoading}
        isFetching={summary.isFetching}
        error={summary.error}
        onRetry={() => void summary.refetch()}
        toolbar={toolbar}
        emptyText="No active products yet"
      />

      <ThresholdEditModal row={editing} onClose={() => setEditing(null)} />
    </Card>
  );
}
