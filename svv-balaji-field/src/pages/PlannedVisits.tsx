import {
  CalendarOutlined,
  CloseCircleOutlined,
  EditOutlined,
  EnvironmentOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import { App as AntApp, Button, Input, Modal, Space, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import type { FieldVisitPlan, FieldVisitPlanQuery } from '@shared/api/types';
import { useCan } from '@shared/auth/useCan';
import { useCancelFieldVisitPlan, useFieldVisitPlans } from '@shared/hooks/useFieldVisitPlans';
import { formatDate } from '@shared/utils/format';
import { FieldVisitFormModal } from './FieldVisitFormModal';
import { FieldCard, FieldList } from './pieces';
import { PlanVisitModal } from './PlanVisitModal';
import { PendingTag } from '../offline/OfflineBar';
import { isPendingRecord } from '../offline/adapter';

export type PlanTiming = 'overdue' | 'today' | 'upcoming';

/** Where a planned visit sits relative to today, by calendar day. */
export function planTiming(plannedDate: string): PlanTiming {
  const diff = dayjs(plannedDate).startOf('day').diff(dayjs().startOf('day'), 'day');
  return diff < 0 ? 'overdue' : diff === 0 ? 'today' : 'upcoming';
}

const TIMING_TAG: Record<PlanTiming, { color: string; label: (d: string) => string }> = {
  overdue: {
    color: 'red',
    label: (d) => {
      const n = dayjs().startOf('day').diff(dayjs(d).startOf('day'), 'day');
      return `Overdue ${n} day${n === 1 ? '' : 's'}`;
    },
  },
  today: { color: 'gold', label: () => 'Today' },
  upcoming: {
    color: 'blue',
    label: (d) => {
      const n = dayjs(d).startOf('day').diff(dayjs().startOf('day'), 'day');
      return n === 1 ? 'Tomorrow' : `In ${n} days`;
    },
  },
};

/**
 * FRD 12.1 - open planned visits as cards, with Start / Reschedule / Cancel.
 *
 * "Start visit" opens the ordinary visit form with the plan attached; saving it
 * completes the plan server-side and opens the visit's field report.
 */
export function PlannedVisitsPanel({
  query,
  showFarmer = true,
  emptyText = 'No visits planned. Plan one so it shows up on your Home screen on the day.',
}: {
  query: FieldVisitPlanQuery;
  showFarmer?: boolean;
  emptyText?: string;
}) {
  const { message } = AntApp.useApp();
  const canCreate = useCan('FIELD_VISIT_CREATE');
  const canEdit = useCan('FIELD_VISIT_EDIT');
  const plans = useFieldVisitPlans({ status: 'PLANNED', ...query });
  const cancel = useCancelFieldVisitPlan();

  const [starting, setStarting] = useState<FieldVisitPlan | null>(null);
  const [editing, setEditing] = useState<FieldVisitPlan | null>(null);
  const [cancelling, setCancelling] = useState<FieldVisitPlan | null>(null);
  const [reason, setReason] = useState('');

  const rows = plans.data?.data ?? [];

  const confirmCancel = async () => {
    if (!cancelling) return;
    try {
      await cancel.mutateAsync({ id: cancelling.id, reason: reason.trim() || undefined });
      message.success('Planned visit cancelled');
      setCancelling(null);
      setReason('');
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not cancel the planned visit'));
    }
  };

  return (
    <>
      <FieldList<FieldVisitPlan>
        rows={rows}
        isLoading={plans.isLoading}
        error={plans.error}
        onRetry={() => void plans.refetch()}
        keyOf={(plan) => plan.id}
        emptyText={emptyText}
        renderCard={(plan) => {
          const timing = planTiming(plan.plannedDate);
          const tag = TIMING_TAG[timing];
          return (
            <FieldCard
              title={showFarmer ? plan.farmer?.fullName ?? 'Farmer' : plan.purpose ?? 'Planned visit'}
              tags={
                <>
                  {isPendingRecord(plan) ? <PendingTag /> : null}
                  <Tag color={tag.color} style={{ margin: 0 }}>{tag.label(plan.plannedDate)}</Tag>
                  {plan.cropName ? <Tag style={{ margin: 0 }}>{plan.cropName}</Tag> : null}
                  {showFarmer && plan.purpose ? <Tag color="cyan" style={{ margin: 0 }}>{plan.purpose}</Tag> : null}
                </>
              }
              meta={
                <>
                  <CalendarOutlined /> {formatDate(plan.plannedDate)}
                  {showFarmer && plan.farmer?.village ? (
                    <> · <EnvironmentOutlined /> {plan.farmer.village}</>
                  ) : null}
                  {plan.expert?.fullName ? ` · ${plan.expert.fullName}` : ''}
                  {plan.notes ? (
                    <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ margin: '4px 0 0', fontSize: 12.5 }}>
                      {plan.notes}
                    </Typography.Paragraph>
                  ) : null}
                </>
              }
            >
              <Space wrap size={8} style={{ width: '100%' }}>
                {canCreate ? (
                  <Button
                    type="primary"
                    icon={<PlayCircleOutlined />}
                    onClick={(e) => {
                      e.stopPropagation();
                      setStarting(plan);
                    }}
                  >
                    Start visit
                  </Button>
                ) : null}
                {canEdit ? (
                  <>
                    <Button icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); setEditing(plan); }}>
                      Reschedule
                    </Button>
                    <Button danger type="text" icon={<CloseCircleOutlined />} onClick={(e) => { e.stopPropagation(); setCancelling(plan); }}>
                      Cancel
                    </Button>
                  </>
                ) : null}
              </Space>
            </FieldCard>
          );
        }}
      />

      <FieldVisitFormModal open={Boolean(starting)} plan={starting} onClose={() => setStarting(null)} />
      <PlanVisitModal open={Boolean(editing)} plan={editing} onClose={() => setEditing(null)} />
      <Modal
        open={Boolean(cancelling)}
        title="Cancel this planned visit?"
        okText="Cancel visit"
        okButtonProps={{ danger: true, loading: cancel.isPending }}
        cancelText="Keep it"
        onOk={confirmCancel}
        onCancel={() => { setCancelling(null); setReason(''); }}
        destroyOnClose
      >
        <Typography.Paragraph type="secondary">
          {cancelling?.farmer?.fullName} · {cancelling ? formatDate(cancelling.plannedDate) : ''}. The plan is kept as
          cancelled so the history shows it was dropped.
        </Typography.Paragraph>
        <Input.TextArea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional) — e.g. rain, farmer away" maxLength={500} />
      </Modal>
    </>
  );
}
