import { CheckOutlined, PlusOutlined } from '@ant-design/icons';
import {
  App as AntApp,
  Button,
  Card,
  Col,
  Form,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { apiErrorMessage } from '../../api/client';
import {
  PRODUCTION_STATUSES,
  type ProductionBatch,
  type ProductionStatus,
} from '../../api/types';
import { Can } from '../../components/Can';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { BranchSelect } from '../../components/pickers';
import { RowActions } from '../../components/RowActions';
import { useCompleteProduction, useProductionBatches, useDeleteProductionBatch } from '../../hooks/useProduction';
import { EM_DASH, formatDate, formatQuantity } from '../../utils/format';
import { ProductionBatchDetailDrawer } from './ProductionBatchDetailDrawer';
import { ProductionBatchFormModal } from './ProductionBatchFormModal';

const STATUS_COLOURS: Record<ProductionStatus, string> = {
  PLANNED: 'default',
  IN_PROGRESS: 'gold',
  COMPLETED: 'green',
  PAUSED: 'orange',
  CANCELLED: 'default',
};

const label = (value: string) =>
  value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');

function CompleteModal({
  batch,
  onClose,
}: {
  batch: ProductionBatch | null;
  onClose: () => void;
}) {
  const [form] = Form.useForm<{ actualQuantity: number }>();
  const { message } = AntApp.useApp();
  const complete = useCompleteProduction();

  const handleSubmit = async () => {
    if (!batch) return;
    const values = await form.validateFields();
    try {
      const updated = await complete.mutateAsync({
        id: batch.id,
        actualQuantity: values.actualQuantity,
      });
      const loss = Number(updated.productionLoss ?? 0);
      message.success(
        loss > 0
          ? `Run completed. Process loss ${formatQuantity(loss, updated.unit)}.`
          : 'Run completed.',
        6,
      );
      onClose();
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not complete the run'));
    }
  };

  return (
    <Modal
      open={Boolean(batch)}
      title={batch ? `Complete ${batch.productionBatchNumber}` : 'Complete run'}
      okText="Record output"
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={complete.isPending}
      destroyOnClose
    >
      <Form form={form} layout="vertical" requiredMark preserve={false}>
        <Typography.Paragraph type="secondary">
          Planned output was {formatQuantity(batch?.plannedQuantity, batch?.unit)}. Process loss is
          derived as planned minus actual, so enter what actually came off the line.
        </Typography.Paragraph>
        <Form.Item
          name="actualQuantity"
          label={`Actual output (${batch?.unit ?? 'KG'})`}
          rules={[{ required: true, message: 'Enter the actual output' }]}
        >
          <InputNumber style={{ width: '100%' }} min={0} step={1} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export function ProductionBatchesPage() {
  const [filters, setFilters] = useState<{ status?: ProductionStatus; branchId?: string }>({});
  const [formOpen, setFormOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [completing, setCompleting] = useState<ProductionBatch | null>(null);
  const [editing, setEditing] = useState<ProductionBatch | null>(null);

  const batches = useProductionBatches(filters);
  const remove = useDeleteProductionBatch();

  const openForm = (batch?: ProductionBatch) => {
    setEditing(batch ?? null);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const columns: ColumnsType<ProductionBatch> = [
    {
      title: 'Run',
      key: 'productionBatchNumber',
      width: 170,
      render: (_, batch) => (
        <Typography.Link onClick={() => setDetailId(batch.id)}>
          <Typography.Text code>{batch.productionBatchNumber}</Typography.Text>
        </Typography.Link>
      ),
    },
    {
      title: 'Product',
      key: 'product',
      render: (_, batch) => batch.product?.name ?? EM_DASH,
    },
    {
      title: 'Recipe',
      key: 'recipe',
      render: (_, batch) =>
        batch.recipe ? (
          <Typography.Text>
            {batch.recipe.recipeCode}{' '}
            <Typography.Text type="secondary">v{batch.recipeVersion}</Typography.Text>
          </Typography.Text>
        ) : (
          EM_DASH
        ),
    },
    {
      title: 'Planned',
      key: 'plannedQuantity',
      align: 'right',
      render: (_, batch) => formatQuantity(batch.plannedQuantity, batch.unit),
    },
    {
      title: 'Actual',
      key: 'actualQuantity',
      align: 'right',
      render: (_, batch) => formatQuantity(batch.actualQuantity, batch.unit),
    },
    {
      title: 'Loss',
      key: 'productionLoss',
      align: 'right',
      render: (_, batch) =>
        batch.productionLoss === null ? (
          EM_DASH
        ) : Number(batch.productionLoss) < 0 ? (
          <Typography.Text type="warning">
            {formatQuantity(batch.productionLoss, batch.unit)}
          </Typography.Text>
        ) : (
          formatQuantity(batch.productionLoss, batch.unit)
        ),
    },
    {
      title: 'Consumed',
      key: 'consumptions',
      align: 'center',
      width: 100,
      render: (_, batch) => batch._count?.consumptions ?? 0,
    },
    {
      title: 'Date',
      dataIndex: 'productionDate',
      key: 'productionDate',
      render: (value: string) => formatDate(value),
      sorter: (a, b) => a.productionDate.localeCompare(b.productionDate),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: ProductionStatus) => (
        <Tag color={STATUS_COLOURS[status]}>{label(status)}</Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 180,
      fixed: 'right',
      render: (_, batch) => (
        <Space size={4}>
          <RowActions
            entity="production batch"
            label={batch.productionBatchNumber}
            can="PRODUCTION_BATCH_CREATE"
            onEdit={() => openForm(batch)}
            onDelete={() => remove.mutateAsync(batch.id)}
            deleteBlockedReason={
              (batch._count?.qualityInspections ?? 0) > 0 || (batch._count?.finishedGoodsBatches ?? 0) > 0
                ? 'Cannot delete because this batch has quality inspections or finished goods'
                : undefined
            }
          />
          <Button size="small" onClick={() => setDetailId(batch.id)}>
            View
          </Button>
          {batch.status !== 'COMPLETED' && batch.status !== 'CANCELLED' ? (
            <Can do="PRODUCTION_BATCH_CREATE">
              <Button
                size="small"
                type="primary"
                icon={<CheckOutlined />}
                onClick={() => setCompleting(batch)}
              >
                Complete
              </Button>
            </Can>
          ) : null}
        </Space>
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
        <Select<ProductionStatus>
          allowClear
          style={{ width: '100%' }}
          placeholder="Status"
          value={filters.status}
          onChange={(status) => setFilters((f) => ({ ...f, status }))}
          options={PRODUCTION_STATUSES.map((value) => ({ value, label: label(value) }))}
        />
      </Col>
    </Row>
  );

  return (
    <Card>
      <PageHeader
        title="Production batches"
        subtitle="Manufacturing runs (FRD Section 20). Starting a run consumes raw material and pins the recipe version — those consumption rows are what let a finished pack name the farmers behind it."
        actions={
          <Can do="PRODUCTION_BATCH_CREATE">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm()}>
              Start run
            </Button>
          </Can>
        }
      />

      <DataTable<ProductionBatch>
        rows={batches.data?.data}
        columns={columns}
        rowKey="id"
        isLoading={batches.isLoading}
        isFetching={batches.isFetching}
        error={batches.error}
        onRetry={() => void batches.refetch()}
        toolbar={toolbar}
        emptyText="No production runs yet — an approved recipe and stocked raw material are needed first"
      />

      <ProductionBatchFormModal
        open={formOpen}
        batch={editing}
        onClose={closeForm}
      />
      <ProductionBatchDetailDrawer batchId={detailId} onClose={() => setDetailId(null)} />
      <CompleteModal batch={completing} onClose={() => setCompleting(null)} />
    </Card>
  );
}
