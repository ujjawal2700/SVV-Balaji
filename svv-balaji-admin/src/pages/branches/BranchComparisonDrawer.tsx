import { Alert, DatePicker, Drawer, Space, Spin, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useState } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import type { BranchPerformance } from '@shared/api/types';
import { useConsolidatedPerformance } from '@shared/hooks/useBranches';
import { formatCurrency, toIsoDate } from '@shared/utils/format';

const { RangePicker } = DatePicker;

function toneFor(value: number | null): string {
  if (value === null) return 'default';
  if (value >= 80) return 'green';
  if (value >= 50) return 'gold';
  return 'red';
}

/** Quantities are never summed across units, so a cell can hold more than one figure. */
function byUnit(values: Record<string, number>): string {
  const entries = Object.entries(values);
  if (entries.length === 0) return '—';
  return entries.map(([unit, qty]) => `${qty.toLocaleString()} ${unit}`).join(' · ');
}

/**
 * FRD 6.5 — the Super Admin's consolidated view, and FRD 34's "Branch Reports".
 *
 * One row per branch so they can actually be compared, which is the whole point
 * of the requirement: the per-branch drawer answers "how is this branch doing",
 * and only this answers "which branch is doing better".
 *
 * A branch-scoped user reaching this sees their own branch as a single row
 * rather than a refusal. That is deliberate — the screen still works, it simply
 * has nothing to compare against, which is the honest rendering of what their
 * permissions allow.
 */
export function BranchComparisonDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(30, 'day'),
    dayjs(),
  ]);

  const query = { from: toIsoDate(range[0]), to: toIsoDate(range[1]) };
  const performance = useConsolidatedPerformance(query);
  const rows = performance.data ?? [];

  const columns: ColumnsType<BranchPerformance> = [
    {
      title: 'Branch',
      key: 'branch',
      fixed: 'left',
      width: 180,
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{row.branchName}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.managerName ?? 'No manager assigned'}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Procured',
      key: 'procured',
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <span>{byUnit(row.procurement.quantityByUnit)}</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.procurement.collections} collections ·{' '}
            {formatCurrency(row.procurement.totalValue)}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Produced',
      key: 'produced',
      align: 'right',
      render: (_, row) => (
        <Space direction="vertical" size={0} style={{ alignItems: 'flex-end' }}>
          <span>{row.production.actualQuantity.toLocaleString()}</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.production.completed} of {row.production.batches} runs
          </Typography.Text>
        </Space>
      ),
      sorter: (a, b) => a.production.actualQuantity - b.production.actualQuantity,
    },
    {
      title: 'Revenue',
      key: 'revenue',
      align: 'right',
      render: (_, row) => (
        <Space direction="vertical" size={0} style={{ alignItems: 'flex-end' }}>
          <Typography.Text strong>{formatCurrency(row.sales.revenue)}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.sales.orders} orders
          </Typography.Text>
        </Space>
      ),
      sorter: (a, b) => a.sales.revenue - b.sales.revenue,
      defaultSortOrder: 'descend',
    },
    {
      title: 'Outstanding',
      key: 'outstanding',
      align: 'right',
      render: (_, row) => (
        <Typography.Text type={row.sales.outstanding > 0 ? 'warning' : undefined}>
          {formatCurrency(row.sales.outstanding)}
        </Typography.Text>
      ),
      sorter: (a, b) => a.sales.outstanding - b.sales.outstanding,
    },
    {
      title: 'Inventory',
      key: 'inventory',
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <span>{byUnit(row.inventory.rawMaterialByUnit)}</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.inventory.utilisationPercent === null
              ? 'Utilisation not comparable — mixed units'
              : `${row.inventory.utilisationPercent}% of capacity`}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Efficiency',
      key: 'efficiency',
      width: 130,
      align: 'right',
      render: (_, row) => (
        <Tooltip
          title={
            <Space direction="vertical" size={0}>
              <span>Yield: {row.efficiency.productionYieldPercent ?? 'no data'}%</span>
              <span>Approval: {row.efficiency.inspectionApprovalPercent ?? 'no data'}%</span>
              <span>On time: {row.efficiency.onTimeDeliveryPercent ?? 'no data'}%</span>
            </Space>
          }
        >
          <Tag color={toneFor(row.efficiency.overallPercent)}>
            {row.efficiency.overallPercent === null
              ? 'No data'
              : `${row.efficiency.overallPercent}%`}
          </Tag>
        </Tooltip>
      ),
      sorter: (a, b) => (a.efficiency.overallPercent ?? -1) - (b.efficiency.overallPercent ?? -1),
    },
  ];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={1100}
      title="Compare branches"
      extra={
        <RangePicker
          value={range}
          allowClear={false}
          format="DD MMM YYYY"
          onChange={(values) => {
            if (values?.[0] && values[1]) setRange([values[0], values[1]]);
          }}
        />
      }
    >
      {performance.isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', padding: 64 }}>
          <Spin size="large" />
        </div>
      ) : performance.error ? (
        <Alert
          type="error"
          showIcon
          message="Could not load the comparison"
          description={apiErrorMessage(performance.error)}
        />
      ) : (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {rows.length === 1 ? (
            <Alert
              type="info"
              showIcon
              message="Showing your branch only"
              description="A consolidated view across every branch is available to Super Admins. Your account is scoped to one branch, so there is nothing to compare against."
            />
          ) : null}

          <Table<BranchPerformance>
            rowKey="branchId"
            size="small"
            columns={columns}
            dataSource={rows}
            pagination={false}
            scroll={{ x: 'max-content' }}
          />

          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Efficiency is the mean of production yield, inspection approval rate and on-time
            delivery — whichever of the three have data in this period. Hover a score to see the
            components.
          </Typography.Text>
        </Space>
      )}
    </Drawer>
  );
}
