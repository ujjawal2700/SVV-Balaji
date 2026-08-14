import { CalendarOutlined, EnvironmentOutlined } from '@ant-design/icons';
import { Button, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import type { FieldVisit } from '@shared/api/types';
import { useAuth } from '@shared/auth/useAuth';
import { useIsMobile } from '@shared/hooks/useIsMobile';
import { useFieldVisits } from '@shared/hooks/useFieldVisits';
import { formatDate, formatQuantity } from '@shared/utils/format';
import { FieldVisitDetailDrawer } from './FieldVisitDetailDrawer';
import { FieldVisitFormModal } from './FieldVisitFormModal';
import { FieldCard, FieldFab, FieldList } from './pieces';
import { MineToggle, useMineFilter } from './MineToggle';

/** Green through red, matching how an agronomist would read the word. */
const HEALTH_COLOURS: Record<string, string> = {
  excellent: 'green',
  good: 'green',
  healthy: 'green',
  average: 'gold',
  fair: 'gold',
  moderate: 'gold',
  poor: 'red',
  bad: 'red',
  diseased: 'red',
};

const healthColour = (health: string | null) =>
  health ? (HEALTH_COLOURS[health.trim().toLowerCase()] ?? 'blue') : undefined;

export function FieldVisitsTab() {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [formOpen, setFormOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const visits = useFieldVisits();
  const { mineOnly, setMineOnly } = useMineFilter();

  const rows = useMemo(() => {
    const all = visits.data?.data ?? [];
    return mineOnly && user ? all.filter((visit) => visit.expertId === user.id) : all;
  }, [visits.data, mineOnly, user]);

  const closeForm = () => setFormOpen(false);

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <MineToggle
          mineOnly={mineOnly}
          onChange={setMineOnly}
          total={visits.data?.data?.length ?? 0}
          shown={rows.length}
        />
        {!isMobile ? (
          <Button type="primary" icon={<EnvironmentOutlined />} onClick={() => setFormOpen(true)}>
            Log a visit
          </Button>
        ) : null}
      </div>

      <FieldList<FieldVisit>
        rows={rows}
        isLoading={visits.isLoading}
        error={visits.error}
        onRetry={() => void visits.refetch()}
        keyOf={(visit) => visit.id}
        emptyText={
          mineOnly
            ? 'You have not logged a visit yet — tap the button to write one up'
            : 'No field visits recorded yet'
        }
        renderCard={(visit) => (
          <FieldCard
            title={visit.farmer?.fullName ?? 'Unknown farmer'}
            onOpen={() => setDetailId(visit.id)}
            tags={
              <>
                {visit.cropName ? <Tag>{visit.cropName}</Tag> : null}
                {visit.cropHealth ? (
                  <Tag color={healthColour(visit.cropHealth)}>{visit.cropHealth}</Tag>
                ) : null}
                {visit.cropGrowthStage ? <Tag color="cyan">{visit.cropGrowthStage}</Tag> : null}
              </>
            }
            meta={
              <>
                <CalendarOutlined /> {formatDate(visit.visitDate)}
                {visit.farmer?.farmerCode ? ` · ${visit.farmer.farmerCode}` : ''}
                {!mineOnly && visit.expert?.fullName ? ` · ${visit.expert.fullName}` : ''}
              </>
            }
          >
            {visit.pestStatus || visit.diseaseObservation ? (
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                {visit.pestStatus ? `Pests: ${visit.pestStatus}` : null}
                {visit.pestStatus && visit.diseaseObservation ? ' · ' : null}
                {visit.diseaseObservation ? `Disease: ${visit.diseaseObservation}` : null}
              </Typography.Text>
            ) : null}
            {visit.yieldPredictionQty ? (
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                Predicted yield: {formatQuantity(visit.yieldPredictionQty)}
              </Typography.Text>
            ) : null}
          </FieldCard>
        )}
      />

      <FieldFab label="Log a visit" onClick={() => setFormOpen(true)} />

      <FieldVisitFormModal open={formOpen} onClose={closeForm} />
      <FieldVisitDetailDrawer visitId={detailId} onClose={() => setDetailId(null)} />
    </Space>
  );
}
