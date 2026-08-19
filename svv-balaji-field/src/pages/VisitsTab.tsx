import { CalendarOutlined, EnvironmentOutlined } from '@ant-design/icons';
import { Button, Space, Tag, Typography } from 'antd';
import { useState } from 'react';
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

  const { mineOnly, setMineOnly } = useMineFilter();

  /**
   * The filter goes to the server, not to the array.
   *
   * Filtering here in the browser was only ever correct while every row came
   * back in one response. Once this endpoint is paginated it would narrow a
   * single page - the executive would see three visits having logged nine, and
   * nothing would look wrong.
   */
  const visits = useFieldVisits(mineOnly && user ? { expertId: user.id } : {});

  // Total across everyone, for the "3 of 12" label. Cheap: the same query key
  // machinery caches it, and it is the only way to say what is being hidden.
  const everyone = useFieldVisits();

  const rows = visits.data?.data ?? [];

  const closeForm = () => setFormOpen(false);

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <MineToggle
          mineOnly={mineOnly}
          onChange={setMineOnly}
          total={everyone.data?.data?.length ?? 0}
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
