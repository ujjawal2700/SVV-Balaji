import { PlusOutlined } from '@ant-design/icons';
import { App as AntApp, Badge, Button, Card, Col, Row, Select, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { apiErrorMessage } from '../../api/client';
import {
  PROCUREMENT_PLAN_STATUSES,
  type ProcurementPlan,
  type ProcurementPlanStatus,
} from '../../api/types';
import { useCan } from '../../auth/useCan';
import { Can } from '../../components/Can';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { BranchSelect } from '../../components/pickers';
import { RowActions } from '../../components/RowActions';
import { useProcurementPlans, useSetPlanStatus, useDeleteProcurementPlan } from '../../hooks/useProcurement';
import { EM_DASH, formatDate, formatQuantity } from '../../utils/format';
import { ProcurementPlanFormModal } from './ProcurementPlanFormModal';

const STATUS_COLOURS: Record<ProcurementPlanStatus, string> = {
  DRAFT: 'default',
  SCHEDULED: 'blue',
  IN_PROGRESS: 'gold',
  COMPLETED: 'green',
  CANCELLED: 'default',
};

const label = (status: string) =>
  status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ');

export function ProcurementPlansPage() {
  const { message } = AntApp.useApp();
  const [filters, setFilters] = useState<{
    branchId?: string;
    status?: ProcurementPlanStatus;
  }>({});
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProcurementPlan | null>(null);

  const plans = useProcurementPlans(filters);
  const setStatus = useSetPlanStatus();
  const remove = useDeleteProcurementPlan();
  const canEdit = useCan('PROCUREMENT_PLAN_CREATE');

  const openForm = (plan?: ProcurementPlan) => {
    setEditing(plan ?? null);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const handleStatusChange = async (plan: ProcurementPlan, status: ProcurementPlanStatus) => {
    try {
      await setStatus.mutateAsync({ id: plan.id, status });
      message.success(`Plan marked ${label(status).toLowerCase()}`);
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not change the status'));
    }
  };

  const columns: ColumnsType<ProcurementPlan> = [
    {
      title: 'Crop',
      dataIndex: 'cropName',
      key: 'cropName',
      render: (crop: string) => <Typography.Text strong>{crop}</Typography.Text>,
    },
    {
      title: 'Planned',
      key: 'plannedQuantity',
      align: 'right',
      render: (_, plan) => formatQuantity(plan.plannedQuantity, plan.unit),
    },
    {
      title: 'Window',
      key: 'window',
      render: (_, plan) => (
        <span>
          {formatDate(plan.scheduledFrom)} → {formatDate(plan.scheduledTo)}
        </span>
      ),
      sorter: (a, b) => a.scheduledFrom.localeCompare(b.scheduledFrom),
    },
    {
      title: 'Branch',
      key: 'branch',
      render: (_, plan) => plan.branch?.name ?? EM_DASH,
    },
    {
      title: 'Inspections',
      key: 'inspections',
      align: 'center',
      width: 110,
      render: (_, plan) => (
        <Badge
          count={plan._count?.inspections ?? 0}
          showZero
          color={plan._count?.inspections ? '#1677ff' : '#bfbfbf'}
        />
      ),
    },
    {
      title: 'Created by',
      key: 'createdBy',
      render: (_, plan) => plan.createdBy?.fullName ?? EM_DASH,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 170,
      render: (status: ProcurementPlanStatus, plan) =>
        canEdit ? (
          <Select<ProcurementPlanStatus>
            size="small"
            value={status}
            style={{ width: 145 }}
            loading={setStatus.isPending}
            onChange={(next) => void handleStatusChange(plan, next)}
            options={PROCUREMENT_PLAN_STATUSES.map((value) => ({
              value,
              label: label(value),
            }))}
          />
        ) : (
          <Tag color={STATUS_COLOURS[status]}>{label(status)}</Tag>
        ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      fixed: 'right',
      render: (_, plan) => (
        <RowActions
          entity="plan"
          label={`${plan.cropName} (${formatQuantity(plan.plannedQuantity, plan.unit)})`}
          can="PROCUREMENT_PLAN_EDIT"
          onEdit={() => openForm(plan)}
          onDelete={() => remove.mutateAsync(plan.id)}
          deleteBlockedReason={
            (plan._count?.inspections ?? 0) > 0
              ? 'Cannot delete because this plan has associated harvest inspections'
              : undefined
          }
        />
      ),
    },
  ];

  const toolbar = (
    <Row gutter={[12, 12]}>
      <Col xs={24} md={8}>
        <BranchSelect
          allowClear
          placeholder="Filter by branch"
          value={filters.branchId}
          onChange={(branchId) => setFilters((f) => ({ ...f, branchId }))}
        />
      </Col>
      <Col xs={24} md={6}>
        <Select<ProcurementPlanStatus>
          allowClear
          style={{ width: '100%' }}
          placeholder="Status"
          value={filters.status}
          onChange={(status) => setFilters((f) => ({ ...f, status }))}
          options={PROCUREMENT_PLAN_STATUSES.map((value) => ({ value, label: label(value) }))}
        />
      </Col>
    </Row>
  );

  return (
    <Card>
      <PageHeader
        title="Procurement plans"
        subtitle="What to buy, from where, and when (FRD 13.1). Harvest inspections can be booked against a plan so the intake is measurable against it."
        actions={
          <Can do="PROCUREMENT_PLAN_CREATE">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm()}>
              New plan
            </Button>
          </Can>
        }
      />

      <DataTable<ProcurementPlan>
        rows={plans.data?.data}
        columns={columns}
        rowKey="id"
        isLoading={plans.isLoading}
        isFetching={plans.isFetching}
        error={plans.error}
        onRetry={() => void plans.refetch()}
        toolbar={toolbar}
        emptyText="No procurement plans yet"
      />

      <ProcurementPlanFormModal
        open={formOpen}
        plan={editing}
        onClose={closeForm}
      />
    </Card>
  );
}
