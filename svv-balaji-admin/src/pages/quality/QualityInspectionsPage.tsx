import { PlusOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Row, Select, Space, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import {
  INSPECTION_STAGES,
  QUALITY_RESULTS,
  type InspectionStage,
  type QualityInspection,
  type QualityResult,
} from '../../api/types';
import { Can } from '../../components/Can';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { useQualityInspections } from '../../hooks/useQuality';
import { EM_DASH, formatDateTime } from '../../utils/format';
import { QualityInspectionFormModal } from './QualityInspectionFormModal';

const RESULT_COLOURS: Record<QualityResult, string> = {
  PASS: 'green',
  FAIL: 'red',
  REWORK_REQUIRED: 'gold',
};

const label = (value: string) =>
  value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');

export function QualityInspectionsPage() {
  const [filters, setFilters] = useState<{ stage?: InspectionStage; result?: QualityResult }>({});
  const [formOpen, setFormOpen] = useState(false);

  const inspections = useQualityInspections(filters);
  const failures = (inspections.data?.data ?? []).filter((row) => row.result === 'FAIL').length;

  const columns: ColumnsType<QualityInspection> = [
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
      title: 'Stage',
      dataIndex: 'stage',
      key: 'stage',
      width: 150,
      render: (stage: InspectionStage) => <Tag>{label(stage)}</Tag>,
    },
    {
      title: 'Target',
      key: 'target',
      render: (_, row) => {
        const target =
          row.rawMaterialBatch?.batchNumber ??
          row.productionBatch?.productionBatchNumber ??
          row.finishedGoodsBatch?.fgBatchNumber;
        return target ? <Typography.Text code>{target}</Typography.Text> : EM_DASH;
      },
    },
    {
      title: 'Result',
      dataIndex: 'result',
      key: 'result',
      width: 150,
      render: (result: QualityResult) => (
        <Tag color={RESULT_COLOURS[result]}>{label(result)}</Tag>
      ),
    },
    {
      title: 'Remarks',
      dataIndex: 'remarks',
      key: 'remarks',
      ellipsis: true,
      render: (value: string | null) => value ?? EM_DASH,
    },
    {
      title: 'Inspected by',
      key: 'inspectedBy',
      render: (_, row) => row.inspectedBy?.fullName ?? EM_DASH,
    },
  ];

  const toolbar = (
    <Row gutter={[12, 12]}>
      <Col xs={24} md={8}>
        <Select<InspectionStage>
          allowClear
          style={{ width: '100%' }}
          placeholder="Stage"
          value={filters.stage}
          onChange={(stage) => setFilters((f) => ({ ...f, stage }))}
          options={INSPECTION_STAGES.map((value) => ({ value, label: label(value) }))}
        />
      </Col>
      <Col xs={24} md={6}>
        <Select<QualityResult>
          allowClear
          style={{ width: '100%' }}
          placeholder="Result"
          value={filters.result}
          onChange={(result) => setFilters((f) => ({ ...f, result }))}
          options={QUALITY_RESULTS.map((value) => ({ value, label: label(value) }))}
        />
      </Col>
    </Row>
  );

  return (
    <Card>
      <PageHeader
        title="Quality inspections"
        subtitle="Three stages: raw material, in process, finished goods (FRD Section 21)."
        actions={
          <Can do="QUALITY_INSPECT">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
              Record inspection
            </Button>
          </Can>
        }
      />

      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Alert
          type="warning"
          showIcon
          message="These are gates, not notes"
          description="A FAIL at raw-material stage marks that batch REJECTED and it can never enter production. A FAIL at finished-goods stage withdraws QA release, so the batch cannot be stocked, allocated or dispatched. Neither is reversible except by a new, passing inspection."
        />

        {failures > 0 ? (
          <Alert
            type="error"
            showIcon
            message={`${failures} failed inspection${failures === 1 ? '' : 's'} in this view`}
          />
        ) : null}

        <DataTable<QualityInspection>
          rows={inspections.data?.data}
          columns={columns}
          rowKey="id"
          isLoading={inspections.isLoading}
          isFetching={inspections.isFetching}
          error={inspections.error}
          onRetry={() => void inspections.refetch()}
          toolbar={toolbar}
          emptyText="No inspections recorded yet"
        />
      </Space>

      <QualityInspectionFormModal open={formOpen} onClose={() => setFormOpen(false)} />
    </Card>
  );
}
