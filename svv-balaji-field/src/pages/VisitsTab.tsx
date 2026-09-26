import { CalendarOutlined, EnvironmentOutlined, ScheduleOutlined } from '@ant-design/icons';
import { Button, Segmented, Space, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { FieldVisit } from '@shared/api/types';
import { useAuth } from '@shared/auth/useAuth';
import { useIsMobile } from '@shared/hooks/useIsMobile';
import { useFieldVisits } from '@shared/hooks/useFieldVisits';
import { useFieldVisitPlans } from '@shared/hooks/useFieldVisitPlans';
import { useCan } from '@shared/auth/useCan';
import { formatDate, formatQuantity } from '@shared/utils/format';
import { FieldVisitDetailDrawer } from './FieldVisitDetailDrawer';
import { FieldVisitFormModal } from './FieldVisitFormModal';
import { FieldCard, FieldFab, FieldList, FieldToolbar } from './pieces';
import { MineToggle, useMineFilter } from './MineToggle';
import { PlannedVisitsPanel } from './PlannedVisits';
import { PlanVisitModal } from './PlanVisitModal';
import { PendingTag } from '../offline/OfflineBar';
import { isPendingRecord } from '../offline/adapter';

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
  const [planOpen, setPlanOpen] = useState(false);
  const canPlan = useCan('FIELD_VISIT_CREATE');

  // FRD 12.1 - logged visits (the original list, still the default) or planned ones.
  // Kept in the URL so Home can link straight to ?view=planned.
  const [searchParams, setSearchParams] = useSearchParams();
  const view: 'logged' | 'planned' = searchParams.get('view') === 'planned' ? 'planned' : 'logged';
  const setView = (next: 'logged' | 'planned') =>
    setSearchParams(next === 'planned' ? { view: 'planned' } : {}, { replace: true });

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

  const plansQuery = mineOnly && user ? { expertId: user.id } : {};
  const openPlans = useFieldVisitPlans({ status: 'PLANNED', ...plansQuery });
  const allOpenPlans = useFieldVisitPlans({ status: 'PLANNED' });
  const planCount = openPlans.data?.data?.length ?? 0;

  const closeForm = () => setFormOpen(false);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <FieldToolbar>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Segmented<'logged' | 'planned'>
            value={view}
            onChange={setView}
            options={[
              { label: 'Logged', value: 'logged' },
              { label: `Planned${planCount ? ` (${planCount})` : ''}`, value: 'planned' },
            ]}
          />
          <MineToggle
            mineOnly={mineOnly}
            onChange={setMineOnly}
            total={view === 'planned' ? allOpenPlans.data?.data?.length ?? 0 : everyone.data?.data?.length ?? 0}
            shown={view === 'planned' ? planCount : rows.length}
          />
        </div>
        {!isMobile ? (
          <Space>
            {canPlan ? (
              <Button icon={<ScheduleOutlined />} onClick={() => setPlanOpen(true)}>
                Plan a visit
              </Button>
            ) : null}
            <Button type="primary" icon={<EnvironmentOutlined />} onClick={() => setFormOpen(true)}>
              Log a visit
            </Button>
          </Space>
        ) : null}
      </FieldToolbar>

      {view === 'planned' ? (
        <PlannedVisitsPanel
          query={plansQuery}
          emptyText={
            mineOnly
              ? 'You have no visits planned — tap "Plan a visit" to schedule one'
              : 'No visits planned'
          }
        />
      ) : (
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
                {isPendingRecord(visit) ? <PendingTag /> : null}
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
      )}

      {view === 'planned' && canPlan ? (
        <FieldFab label="Plan a visit" onClick={() => setPlanOpen(true)} />
      ) : (
        <FieldFab label="Log a visit" onClick={() => setFormOpen(true)} />
      )}
      <PlanVisitModal open={planOpen} onClose={() => setPlanOpen(false)} />

      <FieldVisitFormModal open={formOpen} onClose={closeForm} />
      <FieldVisitDetailDrawer visitId={detailId} onClose={() => setDetailId(null)} />
    </Space>
  );
}
