import { CalendarOutlined, ReadOutlined, TeamOutlined } from '@ant-design/icons';
import { Badge, Button, Space, Tag } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import type { TrainingSession } from '@shared/api/types';
import { useAuth } from '@shared/auth/useAuth';
import { useTrainingSessions } from '@shared/hooks/useTraining';
import { formatDate } from '@shared/utils/format';
import { TrainingDetailDrawer } from './TrainingDetailDrawer';
import { TrainingFormModal } from './TrainingFormModal';
import { FieldCard, FieldFab, FieldList, FieldPageHeader, FieldToolbar } from './pieces';
import { MineToggle, useMineFilter } from './MineToggle';
import { PendingTag } from '../offline/OfflineBar';
import { isPendingRecord } from '../offline/adapter';

export function FieldTrainingTab() {
  const { user } = useAuth();
  const [formOpen, setFormOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { mineOnly, setMineOnly } = useMineFilter();

  // Server-side - see the note in VisitsTab.
  const sessions = useTrainingSessions(mineOnly && user ? { conductedById: user.id } : {});
  const everyone = useTrainingSessions();

  const rows = sessions.data?.data ?? [];

  const closeForm = () => setFormOpen(false);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <FieldPageHeader
        title="Training Sessions"
        subtitle="Farmer workshops and attendance"
        actions={
          <Button type="primary" icon={<ReadOutlined />} onClick={() => setFormOpen(true)}>
            New session
          </Button>
        }
      />

      <FieldToolbar>
        <MineToggle
          mineOnly={mineOnly}
          onChange={setMineOnly}
          total={everyone.data?.data?.length ?? 0}
          shown={rows.length}
        />
      </FieldToolbar>

      <FieldList<TrainingSession>
        rows={rows}
        isLoading={sessions.isLoading}
        error={sessions.error}
        onRetry={() => void sessions.refetch()}
        keyOf={(row) => row.id}
        emptyText={mineOnly ? 'You have not run a session yet' : 'No training sessions yet'}
        renderCard={(session) => {
          const attended = session._count?.attendances ?? 0;
          const upcoming = dayjs(session.scheduledDate).isAfter(dayjs().subtract(1, 'day'));

          return (
            <FieldCard
              title={session.title}
              // Attendance is marked from the detail view, which is the reason
              // to open a session at all after it has been created.
              onOpen={() => setDetailId(session.id)}
              extra={
                <Badge
                  count={attended}
                  showZero
                  overflowCount={999}
                  color={attended > 0 ? '#389e0d' : '#bfbfbf'}
                  title={`${attended} marked present`}
                />
              }
              tags={
                <>
                  {isPendingRecord(session) ? <PendingTag /> : null}
                  {upcoming ? <Tag color="blue">Upcoming</Tag> : <Tag>Done</Tag>}
                  {session.branch?.name ? <Tag>{session.branch.name}</Tag> : null}
                  {attended === 0 && !upcoming ? (
                    <Tag color="gold">Attendance not marked</Tag>
                  ) : null}
                </>
              }
              meta={
                <>
                  <CalendarOutlined /> {formatDate(session.scheduledDate)}
                  {' · '}
                  <TeamOutlined /> {attended} attended
                  {!mineOnly && session.conductedBy?.fullName
                    ? ` · ${session.conductedBy.fullName}`
                    : ''}
                </>
              }
            />
          );
        }}
      />

      <FieldFab label="New session" onClick={() => setFormOpen(true)} />

      <TrainingFormModal open={formOpen} onClose={closeForm} />
      <TrainingDetailDrawer sessionId={detailId} onClose={() => setDetailId(null)} />
    </Space>
  );
}
