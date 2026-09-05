import { PlusOutlined } from '@ant-design/icons';
import { Button, Card, Col, Row, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import type { FieldVisit } from '../../api/types';
import { Can } from '../../components/Can';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { FarmerSelect } from '../../components/pickers';
import { useFieldVisits } from '../../hooks/useFieldVisits';
import { EM_DASH, formatDate, formatQuantity } from '../../utils/format';
import { FieldVisitDetailDrawer } from './FieldVisitDetailDrawer';
import { RowActions } from '../../components/RowActions';
import { useDeleteFieldVisit } from '../../hooks/useFieldVisits';
import { FieldVisitFormModal } from './FieldVisitFormModal';

export function FieldVisitsPage() {
  const [farmerId, setFarmerId] = useState<string | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editing, setEditing] = useState<FieldVisit | null>(null);
  const remove = useDeleteFieldVisit();

  const openEdit = (visit: FieldVisit) => {
    setEditing(visit);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const visits = useFieldVisits({ farmerId });

  const columns: ColumnsType<FieldVisit> = [
    {
      title: 'Date',
      dataIndex: 'visitDate',
      key: 'visitDate',
      width: 130,
      render: (value: string) => formatDate(value),
      sorter: (a, b) => a.visitDate.localeCompare(b.visitDate),
    },
    {
      title: 'Farmer / Supplier',
      key: 'farmer',
      render: (_, visit) => (
        <div>
          <Typography.Link onClick={() => setDetailId(visit.id)}>
            {visit.farmer?.fullName ?? EM_DASH}
          </Typography.Link>
          <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
            {visit.farmer?.farmerCode ?? 'pending approval'}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: 'Crop',
      dataIndex: 'cropName',
      key: 'cropName',
      render: (value: string | null) => value ?? EM_DASH,
    },
    {
      title: 'Growth stage',
      dataIndex: 'cropGrowthStage',
      key: 'cropGrowthStage',
      render: (value: string | null) => value ?? EM_DASH,
    },
    {
      title: 'Health',
      dataIndex: 'cropHealth',
      key: 'cropHealth',
      render: (value: string | null) => value ?? EM_DASH,
    },
    {
      title: 'Pests',
      dataIndex: 'pestStatus',
      key: 'pestStatus',
      render: (value: string | null) => value ?? EM_DASH,
    },
    {
      title: 'Predicted yield',
      dataIndex: 'yieldPredictionQty',
      key: 'yieldPredictionQty',
      align: 'right',
      render: (value: string | null) => formatQuantity(value, 'KG'),
    },
    {
      title: 'Remarks / Observations',
      key: 'remarks',
      render: (_, visit) => {
        const remark =
          visit.diseaseObservation ||
          visit.harvestPreparation ||
          visit.fertilizerAdvice ||
          visit.pestControlSuggestions ||
          visit.irrigationAdvice;
        return remark ? (
          <Typography.Paragraph
            ellipsis={{ rows: 2, tooltip: remark }}
            style={{ marginBottom: 0, maxWidth: 220, fontSize: 13 }}
          >
            {remark}
          </Typography.Paragraph>
        ) : (
          EM_DASH
        );
      },
    },
    {
      title: 'Visited by',
      key: 'expert',
      render: (_, visit) => visit.expert?.fullName ?? EM_DASH,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 230,
      fixed: 'right',
      render: (_, visit) => (
        <RowActions
          entity="field visit"
          label={`the visit to ${visit.farmer?.fullName ?? 'this farmer'}`}
          can="FIELD_VISIT_EDIT"
          canDelete="FIELD_VISIT_DELETE"
          onEdit={() => openEdit(visit)}
          onDelete={() => remove.mutateAsync(visit.id)}
        >
          <Button size="small" onClick={() => setDetailId(visit.id)}>
            Open
          </Button>
        </RowActions>
      ),
    },
  ];

  const toolbar = (
    <Row gutter={[12, 12]}>
      <Col xs={24} md={10}>
        <FarmerSelect
          allowClear
          placeholder="Filter by farmer / supplier"
          value={farmerId}
          onChange={setFarmerId}
        />
      </Col>
    </Row>
  );

  return (
    <Card>
      <PageHeader
        title="Field visits"
        subtitle="Crop monitoring — what was observed and what was advised (FRD Section 12). The same records are captured offline by the Agriculture Expert app and sync here."
        actions={
          <Can do="FIELD_VISIT_CREATE">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
              Record visit
            </Button>
          </Can>
        }
      />

      <DataTable<FieldVisit>
        rows={visits.data?.data}
        columns={columns}
        rowKey="id"
        isLoading={visits.isLoading}
        isFetching={visits.isFetching}
        error={visits.error}
        onRetry={() => void visits.refetch()}
        toolbar={toolbar}
        emptyText={farmerId ? 'No visits recorded for this farmer' : 'No field visits recorded yet'}
      />

      <FieldVisitFormModal open={formOpen} visit={editing} onClose={closeForm} />
      <FieldVisitDetailDrawer visitId={detailId} onClose={() => setDetailId(null)} />
    </Card>
  );
}
