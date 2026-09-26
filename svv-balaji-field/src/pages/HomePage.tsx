import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  EnvironmentOutlined,
  ExperimentOutlined,
  ReadOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Alert, Button, Col, Row, Skeleton, Space, Typography } from 'antd';
import dayjs from 'dayjs';
import type { CSSProperties, ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@shared/auth/useAuth';
import { useCanFn } from '@shared/auth/useCan';
import { useAgreements } from '@shared/hooks/useAgreements';
import { useFarmers } from '@shared/hooks/useFarmers';
import { useFieldVisits } from '@shared/hooks/useFieldVisits';
import { useFieldVisitPlans } from '@shared/hooks/useFieldVisitPlans';
import { useIsMobile } from '@shared/hooks/useIsMobile';
import { useHarvestInspections } from '@shared/hooks/useProcurement';
import { useSeedDistribution } from '@shared/hooks/useSeedDistribution';
import { useTrainingSessions } from '@shared/hooks/useTraining';
import { FieldVisitFormModal } from './FieldVisitFormModal';
import { FieldEmpty } from './pieces';
import { KIND_LABEL, buildSchedule } from './schedule';

/**
 * Area 1: the dashboard and the day's schedule.
 *
 * Two things on one screen, in this order, because they answer different
 * questions and the first one is more urgent:
 *
 *   1. **What needs doing today** — derived from real commitments (see
 *      schedule.ts). Sorted by consequence, not by time, because the executive
 *      decides their own route and what matters is which item blocks somebody
 *      else.
 *   2. **The six areas** — named explicitly, with a count each. An executive
 *      told "record the training" should find a thing called Training rather
 *      than having to work out which of five tab icons hides it.
 *
 * What this deliberately does not show: totals across the branch, charts, or
 * anything the executive cannot act on. This is a worklist on a phone, not a
 * management dashboard — the Branch Manager has one of those at /.
 */
export function FieldHomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const can = useCanFn();

  const [visitOpen, setVisitOpen] = useState(false);

  const farmers = useFarmers({});
  const agreements = useAgreements();
  const visits = useFieldVisits();
  const training = useTrainingSessions();
  const seed = useSeedDistribution();
  const inspections = useHarvestInspections({});
  const plans = useFieldVisitPlans(
    { status: 'PLANNED', expertId: user?.id },
    { enabled: Boolean(user?.id) && can('FIELD_VISIT_VIEW') },
  );

  const loading =
    farmers.isLoading || agreements.isLoading || visits.isLoading || inspections.isLoading;

  const schedule = useMemo(
    () =>
      buildSchedule({
        userId: user?.id,
        farmers: farmers.data?.data ?? [],
        agreements: agreements.data?.data ?? [],
        visits: visits.data?.data ?? [],
        training: training.data?.data ?? [],
        seed: seed.data?.data ?? [],
        inspectedFarmerIds: new Set(
          (inspections.data?.data ?? []).map((inspection) => inspection.farmerId),
        ),
        plans: plans.data?.data ?? [],
      }),
    [user?.id, farmers.data, agreements.data, visits.data, training.data, seed.data, inspections.data, plans.data],
  );

  const overdue = schedule.filter((item) => item.urgency === 'overdue');
  const todayItems = schedule.filter((item) => item.urgency === 'today');

  const myVisitsToday = (visits.data?.data ?? []).filter(
    (visit) =>
      visit.expertId === user?.id && dayjs(visit.visitDate).isSame(dayjs(), 'day'),
  ).length;

  const firstName = user?.fullName?.split(' ')[0] ?? 'there';

  /** The six responsibilities, named with custom styling, icons and background tints. */
  const areaDetails = [
    can('FARMER_VIEW')
      ? {
          key: 'farmers',
          icon: <TeamOutlined />,
          colour: '#3b82f6',
          bgTint: '#eff6ff',
          label: 'Farmers / Suppliers & Land',
          description: 'Profiles, GPS mapping & plots',
          count: farmers.data?.data?.length ?? 0,
          suffix: 'registered',
          shortLabel: 'Farmers',
          path: '/farmers',
        }
      : null,
    can('FIELD_VISIT_VIEW')
      ? {
          key: 'visits',
          icon: <EnvironmentOutlined />,
          colour: '#059669',
          bgTint: '#ecfdf5',
          label: 'Field Visits',
          description: 'Pest status & crop advisory',
          count: visits.data?.data?.length ?? 0,
          suffix: 'logged',
          shortLabel: 'Field visits',
          path: '/visits',
        }
      : null,
    can('SEED_DISTRIBUTION_VIEW')
      ? {
          key: 'seed',
          icon: <ExperimentOutlined />,
          colour: '#0891b2',
          bgTint: '#ecfeff',
          label: 'Seed & Inputs',
          description: 'Batch handouts & agri-inputs',
          count: seed.data?.data?.length ?? 0,
          suffix: 'handouts',
          shortLabel: 'Seed handouts',
          path: '/seed',
        }
      : null,
    can('TRAINING_VIEW')
      ? {
          key: 'training',
          icon: <ReadOutlined />,
          colour: '#8b5cf6',
          bgTint: '#f5f3ff',
          label: 'Training Sessions',
          description: 'Workshops & farmer attendance',
          count: training.data?.data?.length ?? 0,
          suffix: 'sessions',
          shortLabel: 'Training sessions',
          path: '/more/training',
        }
      : null,
  ].filter(Boolean) as Array<{
    key: string;
    icon: ReactNode;
    colour: string;
    bgTint: string;
    label: string;
    description: string;
    count: number;
    suffix: string;
    shortLabel: string;
    path: string;
  }>;

  // Task badge styling helper based on user request:
  // Amber for Incomplete, Blue for Follow-up, Purple for Approvals, etc.
  const getTaskBadge = (item: { kind: string; urgency: string }) => {
    switch (item.kind) {
      case 'incomplete-farmer':
        return { color: '#b45309', bg: '#fef3c7', border: '#fde68a', label: 'Incomplete' };
      case 'follow-up':
        return { color: '#1d4ed8', bg: '#dbeafe', border: '#bfdbfe', label: 'Follow-up' };
      case 'unapproved-farmer':
        return { color: '#7e22ce', bg: '#f3e8ff', border: '#e9d5ff', label: 'Pending Approval' };
      case 'harvest-due':
        return item.urgency === 'overdue'
          ? { color: '#b91c1c', bg: '#fee2e2', border: '#fecaca', label: 'Harvest Overdue' }
          : { color: '#047857', bg: '#d1fae5', border: '#a7f3d0', label: 'Harvest Due' };
      case 'training':
        return { color: '#6d28d9', bg: '#ede9fe', border: '#ddd6fe', label: 'Training Due' };
      case 'planned-visit':
        return item.urgency === 'overdue'
          ? { color: '#b91c1c', bg: '#fee2e2', border: '#fecaca', label: 'Visit Overdue' }
          : { color: '#0f766e', bg: '#ccfbf1', border: '#99f6e4', label: 'Planned Visit' };
      default:
        return { color: '#475569', bg: '#f1f5f9', border: '#e2e8f0', label: KIND_LABEL[item.kind as keyof typeof KIND_LABEL] || 'Task' };
    }
  };

  return (
    <Space direction="vertical" size={isMobile ? 18 : 20} style={{ width: '100%' }}>
      {/* --- Elevated Dark Hero Card --- */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          borderRadius: 16,
          padding: isMobile ? '18px 16px' : '28px 32px',
          color: '#ffffff',
          boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.15), 0 8px 10px -6px rgba(15, 23, 42, 0.1)',
          position: 'relative',
          overflow: 'hidden',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        {/* Subtle decorative background glow */}
        <div
          style={{
            position: 'absolute',
            top: -40,
            right: -40,
            width: 220,
            height: 220,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(16, 185, 129, 0.25) 0%, rgba(16, 185, 129, 0) 70%)',
            pointerEvents: 'none',
          }}
        />

        <Row gutter={[20, 20]} align="middle" justify="space-between">
          <Col xs={24} md={16}>
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '3px 10px',
                    borderRadius: 20,
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: '#34d399',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
                  Field Operations
                </span>
                <span style={{ color: '#94a3b8', fontSize: 13 }}>
                  {dayjs().format('dddd, D MMMM YYYY')}
                </span>
              </div>

              <Typography.Title
                level={isMobile ? 4 : 2}
                style={{ color: '#ffffff', margin: '4px 0 0', fontWeight: 700, letterSpacing: '-0.02em' }}
              >
                {greeting()}, {firstName} 👋
              </Typography.Title>

              <Typography.Text style={{ color: '#94a3b8', fontSize: isMobile ? 13 : 14 }}>
                {myVisitsToday > 0
                  ? `You have logged ${myVisitsToday} field visit${myVisitsToday === 1 ? '' : 's'} today. Great progress!`
                  : 'Here is what needs your attention today.'}
              </Typography.Text>
            </Space>
          </Col>

          {can('FIELD_VISIT_CREATE') ? (
            <Col xs={24} md={8} style={{ display: 'flex', justifyContent: isMobile ? 'stretch' : 'flex-end' }}>
              <Button
                block={isMobile}
                type="primary"
                size="large"
                icon={<EnvironmentOutlined style={{ fontSize: 18 }} />}
                style={{
                  height: isMobile ? 46 : 50,
                  paddingInline: 26,
                  fontWeight: 600,
                  fontSize: 15,
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  border: 'none',
                  borderRadius: 12,
                  boxShadow: '0 4px 14px 0 rgba(16, 185, 129, 0.39)',
                }}
                onClick={() => setVisitOpen(true)}
              >
                Log a Field Visit
              </Button>
            </Col>
          ) : null}
        </Row>
      </div>

      {/* --- Two Column Responsive Layout --- */}
      <Row gutter={[20, isMobile ? 18 : 20]}>
        {/* --- What needs doing: one list, every row is the tap target --- */}
        <Col xs={24} lg={14}>
          <SectionHeading
            title="What needs doing"
            extra={
              <Space size={6}>
                {overdue.length > 0 ? <CountChip tone="danger">{overdue.length} overdue</CountChip> : null}
                {todayItems.length > 0 ? <CountChip tone="warning">{todayItems.length} today</CountChip> : null}
              </Space>
            }
          />
          {loading ? (
            <div style={{ ...panelStyle, padding: 16 }}>
              <Skeleton active paragraph={{ rows: 3 }} title={false} />
            </div>
          ) : schedule.length === 0 ? (
            <FieldEmpty
              icon={<CheckCircleOutlined style={{ color: '#059669' }} />}
              text="All caught up — no inspections due, incomplete farmers or pending sessions."
            />
          ) : (
            <div style={panelStyle}>
              {schedule.slice(0, 8).map((item, index) => {
                const badge = getTaskBadge(item);
                const dot = item.urgency === 'overdue' ? '#ef4444' : item.urgency === 'today' ? '#f59e0b' : '#3b82f6';
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => navigate(item.actionPath)}
                    className="field-tap-row"
                    style={{ ...rowStyle, borderTop: index ? '1px solid #f1f5f9' : 'none' }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14.5, fontWeight: 600, color: '#0f172a' }}>{item.title}</span>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: '1px 7px',
                            borderRadius: 6,
                            background: badge.bg,
                            color: badge.color,
                          }}
                        >
                          {badge.label}
                        </span>
                      </span>
                      <span style={{ display: 'block', fontSize: 12.5, color: '#64748b', marginTop: 2 }}>{item.detail}</span>
                    </span>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: '#059669', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {item.actionLabel} <ArrowRightOutlined style={{ fontSize: 11 }} />
                    </span>
                  </button>
                );
              })}
              {schedule.length > 8 ? (
                <div style={{ borderTop: '1px solid #f1f5f9', padding: '10px 14px', textAlign: 'center' }}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    +{schedule.length - 8} more, by urgency
                  </Typography.Text>
                </div>
              ) : null}
            </div>
          )}
        </Col>

        {/* --- Your work: number tiles on a phone, a list on wider screens --- */}
        <Col xs={24} lg={10}>
          <SectionHeading title="Your work" />
          {isMobile ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {areaDetails.map((area) => (
                <button
                  key={area.key}
                  type="button"
                  onClick={() => navigate(area.path)}
                  className="field-tap-row"
                  style={{ ...panelStyle, padding: 14, textAlign: 'left', cursor: 'pointer' }}
                >
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      background: area.bgTint,
                      color: area.colour,
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 16,
                    }}
                  >
                    {area.icon}
                  </span>
                  <span style={{ display: 'block', fontSize: 22, fontWeight: 700, color: '#0f172a', marginTop: 10, lineHeight: 1.1 }}>
                    {area.count}
                  </span>
                  <span style={{ display: 'block', fontSize: 12.5, color: '#64748b', marginTop: 2 }}>{area.shortLabel}</span>
                </button>
              ))}
            </div>
          ) : (
            <div style={panelStyle}>
              {areaDetails.map((area, index) => (
                <button
                  key={area.key}
                  type="button"
                  onClick={() => navigate(area.path)}
                  className="field-tap-row"
                  style={{ ...rowStyle, gap: 14, padding: '12px 16px', borderTop: index ? '1px solid #f1f5f9' : 'none' }}
                >
                  <span
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: area.bgTint,
                      color: area.colour,
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 18,
                      flexShrink: 0,
                    }}
                  >
                    {area.icon}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{area.label}</span>
                    <span style={{ display: 'block', fontSize: 12, color: '#64748b' }}>{area.description}</span>
                  </span>
                  <span style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span style={{ display: 'block', fontSize: 20, fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>
                      {area.count}
                    </span>
                    <span style={{ fontSize: 11, color: '#94a3b8', textTransform: 'capitalize' }}>{area.suffix}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </Col>
      </Row>

      <FieldVisitFormModal open={visitOpen} onClose={() => setVisitOpen(false)} />
    </Space>
  );
}

function greeting(): string {
  const hour = dayjs().hour();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const panelStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: 14,
  overflow: 'hidden',
};

const rowStyle: CSSProperties = {
  width: '100%',
  border: 'none',
  background: 'none',
  padding: '12px 14px',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  textAlign: 'left',
  cursor: 'pointer',
};

function SectionHeading({ title, extra }: { title: string; extra?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '0 2px 10px' }}>
      <Typography.Text strong style={{ fontSize: 15, color: '#0f172a' }}>
        {title}
      </Typography.Text>
      {extra}
    </div>
  );
}

function CountChip({ tone, children }: { tone: 'danger' | 'warning'; children: ReactNode }) {
  const colours = tone === 'danger' ? { background: '#fef2f2', color: '#b91c1c' } : { background: '#fffbeb', color: '#b45309' };
  return <span style={{ ...colours, fontSize: 11.5, fontWeight: 600, borderRadius: 999, padding: '2px 9px' }}>{children}</span>;
}
