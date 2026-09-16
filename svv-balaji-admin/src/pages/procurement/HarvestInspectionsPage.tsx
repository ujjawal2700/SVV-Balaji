import { PlusOutlined } from '@ant-design/icons';
import { Button, Card, Col, Row, Select, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import {
  INSPECTION_RESULTS,
  type HarvestInspection,
  type InspectionResult,
} from '../../api/types';
import { Can } from '../../components/Can';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { FarmerSelect } from '../../components/pickers';
import { useHarvestInspections } from '../../hooks/useProcurement';
import { EM_DASH, formatDate } from '../../utils/format';
import { RowActions } from '../../components/RowActions';
import { useDeleteHarvestInspection } from '../../hooks/useProcurement';
import { HarvestInspectionFormModal } from './HarvestInspectionFormModal';

const RESULT_COLOURS: Record<InspectionResult, string> = {
  APPROVED: 'green',
  REJECTED: 'red',
  HOLD_FOR_REINSPECTION: 'gold',
};

const RESULT_LABELS: Record<InspectionResult, string> = {
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  HOLD_FOR_REINSPECTION: 'Hold',
};

const pct = (value: string | null) => (value === null ? EM_DASH : `${value}%`);

export function HarvestInspectionsPage() {
  const [filters, setFilters] = useState<{ farmerId?: string; result?: InspectionResult }>({});
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<HarvestInspection | null>(null);
  const remove = useDeleteHarvestInspection();

  const openEdit = (inspection: HarvestInspection) => {
    setEditing(inspection);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const inspections = useHarvestInspections(filters);

  const columns: ColumnsType<HarvestInspection> = [
    {
      title: 'Date',
      dataIndex: 'inspectionDate',
      key: 'inspectionDate',
      width: 130,
      render: (value: string) => formatDate(value),
      sorter: (a, b) => a.inspectionDate.localeCompare(b.inspectionDate),
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
      title: 'Moisture',
      dataIndex: 'moistureLevel',
      key: 'moistureLevel',
      align: 'right',
      render: pct,
    },
    {
      title: 'Foreign matter',
      dataIndex: 'foreignMatter',
      key: 'foreignMatter',
      align: 'right',
      render: pct,
    },
    {
      title: 'Result',
      dataIndex: 'result',
      key: 'result',
      width: 120,
      render: (result: InspectionResult) => (
        <Tag color={RESULT_COLOURS[result]}>{RESULT_LABELS[result]}</Tag>
      ),
    },
    {
      title: 'Collected',
      key: 'collection',
      width: 170,
      render: (_, row) => {
        if (row.collection) {
          return (
            <Tooltip title="A harvest is collected exactly once">
              <Typography.Text code>{row.collection.receiptNumber}</Typography.Text>
            </Tooltip>
          );
        }
        if (row.result !== 'APPROVED') {
          return (
            <Tooltip title="Only an APPROVED inspection can be collected">
              <Typography.Text type="secondary">Blocked</Typography.Text>
            </Tooltip>
          );
        }
        return <Tag color="blue">Awaiting collection</Tag>;
      },
    },
    {
      title: 'Inspected by',
      key: 'inspectedBy',
      render: (_, row) => row.inspectedBy?.fullName ?? EM_DASH,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      fixed: 'right',
      render: (_, row) => {
        // Once collected, the result is what allowed that collection and the
        // crop name is carried onto its batch. The list already knows, so the
        // screen can say so rather than waiting for the server to refuse.
        const collected = row.collection
          ? `Already collected on receipt ${row.collection.receiptNumber} — delete that collection first`
          : undefined;

        return (
          <RowActions
            entity="inspection"
            label={`the ${row.cropName} inspection`}
            can="HARVEST_INSPECTION_EDIT"
            canDelete="HARVEST_INSPECTION_DELETE"
            onEdit={row.collection ? undefined : () => openEdit(row)}
            onDelete={() => remove.mutateAsync(row.id)}
            deleteBlockedReason={collected}
          />
        );
      },
    },
  ];

  const awaiting = (inspections.data?.data ?? []).filter(
    (row) => row.result === 'APPROVED' && !row.collection,
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
        <Select<InspectionResult>
          allowClear
          style={{ width: '100%' }}
          placeholder="Result"
          value={filters.result}
          onChange={(result) => setFilters((f) => ({ ...f, result }))}
          options={INSPECTION_RESULTS.map((value) => ({ value, label: RESULT_LABELS[value] }))}
        />
      </Col>
    </Row>
  );

  return (
    <Card>
      <PageHeader
        title="Harvest inspections"
        subtitle={
          awaiting > 0
            ? `${awaiting} approved harvest${awaiting === 1 ? '' : 's'} awaiting collection. Only an APPROVED inspection can be collected.`
            : 'Pre-harvest quality checks. The result is a gate: only an approved harvest can be collected.'
        }
        actions={
          <Can do="HARVEST_INSPECTION_CREATE">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
              Record inspection
            </Button>
          </Can>
        }
      />

      <DataTable<HarvestInspection>
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

      <HarvestInspectionFormModal open={formOpen} inspection={editing} onClose={closeForm} />
    </Card>
  );
}
