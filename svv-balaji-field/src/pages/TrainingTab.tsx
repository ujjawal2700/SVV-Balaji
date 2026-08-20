import { ArrowLeftOutlined, CalendarOutlined, ReadOutlined, TeamOutlined } from '@ant-design/icons';
import { Badge, Button, Space, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TrainingSession } from '@shared/api/types';
import { useAuth } from '@shared/auth/useAuth';
import { useIsMobile } from '@shared/hooks/useIsMobile';
import { useTrainingSessions } from '@shared/hooks/useTraining';
import { formatDate } from '@shared/utils/format';
import { TrainingDetailDrawer } from './TrainingDetailDrawer';
import { TrainingFormModal } from './TrainingFormModal';
import { FieldCard, FieldFab, FieldList } from './pieces';
import { MineToggle, useMineFilter } from './MineToggle';

export function FieldTrainingTab() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
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
      {/* Page Navigation & Title Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button
            type="text"
            shape="circle"
            icon={<ArrowLeftOutlined style={{ fontSize: 16, color: '#0f172a' }} />}
            onClick={() => navigate('/more')}
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
            }}
          />
          <div>
            <Typography.Title level={4} style={{ margin: 0, color: '#0f172a', fontWeight: 700 }}>
              Training Workshops & Attendance
            </Typography.Title>
            <Typography.Text style={{ color: '#64748b', fontSize: 13 }}>
              Schedule agronomic training sessions and log farmer attendance
            </Typography.Text>
          </div>
        </div>

        {!isMobile && (
          <Button
            type="primary"
            icon={<ReadOutlined />}
            onClick={() => setFormOpen(true)}
            style={{
              borderRadius: 10,
              height: 40,
              fontWeight: 600,
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              border: 'none',
              boxShadow: '0 2px 8px 0 rgba(16, 185, 129, 0.3)',
            }}
          >
            New Session
          </Button>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#fff',
          padding: isMobile ? '12px 14px' : '14px 18px',
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 2px 0 rgba(15, 23, 42, 0.03)',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <MineToggle
          mineOnly={mineOnly}
          onChange={setMineOnly}
          total={everyone.data?.data?.length ?? 0}
          shown={rows.length}
        />
      </div>

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
