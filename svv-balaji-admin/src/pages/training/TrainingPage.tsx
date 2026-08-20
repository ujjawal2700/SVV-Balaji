import { PlusOutlined } from '@ant-design/icons';
import { Badge, Button, Card, Col, Row, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import type { TrainingSession } from '../../api/types';
import { Can } from '../../components/Can';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { BranchSelect } from '../../components/pickers';
import { useTrainingSessions } from '../../hooks/useTraining';
import { EM_DASH, formatDate } from '../../utils/format';
import { TrainingDetailDrawer } from './TrainingDetailDrawer';
import { RowActions } from '../../components/RowActions';
import { useDeleteTrainingSession } from '../../hooks/useTraining';
import { TrainingFormModal } from './TrainingFormModal';

export function TrainingPage() {
  const [branchId, setBranchId] = useState<string | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editing, setEditing] = useState<TrainingSession | null>(null);
  const remove = useDeleteTrainingSession();

  const openEdit = (session: TrainingSession) => {
    setEditing(session);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const sessions = useTrainingSessions({ branchId });

  const columns: ColumnsType<TrainingSession> = [
    {
      title: 'Date',
      dataIndex: 'scheduledDate',
      key: 'scheduledDate',
      width: 130,
      render: (value: string) => formatDate(value),
      sorter: (a, b) => a.scheduledDate.localeCompare(b.scheduledDate),
    },
    {
      title: 'Session',
      key: 'title',
      render: (_, session) => (
        <div>
          <Typography.Link onClick={() => setDetailId(session.id)}>{session.title}</Typography.Link>
          {session.description ? (
            <Typography.Paragraph
              type="secondary"
              ellipsis={{ rows: 1 }}
              style={{ fontSize: 12, marginBottom: 0 }}
            >
              {session.description}
            </Typography.Paragraph>
          ) : null}
        </div>
      ),
    },
    {
      title: 'Branch',
      key: 'branch',
      render: (_, session) => session.branch?.name ?? EM_DASH,
    },
    {
      title: 'Conducted by',
      key: 'conductedBy',
      render: (_, session) => session.conductedBy?.fullName ?? EM_DASH,
    },
    {
      title: 'Attendance',
      key: 'attendances',
      width: 120,
      align: 'center',
      render: (_, session) => (
        <Badge
          count={session._count?.attendances ?? 0}
          showZero
          // Explicit hex rather than 'default' - Badge writes the value
          // straight into a background colour, and an unrecognised keyword
          // renders an invisible dot.
          color={session._count?.attendances ? '#389e0d' : '#bfbfbf'}
        />
      ),
    },
    {
      title: 'Materials',
      key: 'materials',
      width: 110,
      align: 'center',
      render: (_, session) => (
        <Badge count={session._count?.materials ?? 0} showZero color="#1677ff" />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 230,
      fixed: 'right',
      render: (_, session) => {
        // Attendance is the record of which farmers were trained, so the server
        // refuses the delete once any is marked. Saying so on the disabled item
        // is better than a 409 after the confirm dialog.
        const attended = session._count?.attendances ?? 0;
        return (
          <RowActions
            entity="training session"
            label={session.title}
            can="TRAINING_EDIT"
            canDelete="TRAINING_DELETE"
            onEdit={() => openEdit(session)}
            onDelete={() => remove.mutateAsync(session.id)}
            deleteBlockedReason={
              attended > 0
                ? `${attended} farmer${attended === 1 ? '' : 's'} marked present — remove the attendance first, from Open`
                : undefined
            }
          >
            <Button size="small" onClick={() => setDetailId(session.id)}>
              Open
            </Button>
          </RowActions>
        );
      },
    },
  ];

  const toolbar = (
    <Row gutter={[12, 12]}>
      <Col xs={24} md={10}>
        <BranchSelect
          allowClear
          placeholder="Filter by branch"
          value={branchId}
          onChange={setBranchId}
        />
      </Col>
    </Row>
  );

  return (
    <Card>
      <PageHeader
        title="Training"
        subtitle="Sessions, attendance and materials (FRD Section 11). Staff-facing: the executive runs the session at the farm and records it here afterwards — there is no farmer login."
        actions={
          <Can do="TRAINING_CREATE">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
              New session
            </Button>
          </Can>
        }
      />

      <DataTable<TrainingSession>
        rows={sessions.data?.data}
        columns={columns}
        rowKey="id"
        isLoading={sessions.isLoading}
        isFetching={sessions.isFetching}
        error={sessions.error}
        onRetry={() => void sessions.refetch()}
        toolbar={toolbar}
        emptyText="No training sessions recorded yet"
      />

      <TrainingFormModal open={formOpen} session={editing} onClose={closeForm} />
      <TrainingDetailDrawer sessionId={detailId} onClose={() => setDetailId(null)} />
    </Card>
  );
}
