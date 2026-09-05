import {
  ArrowRightOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  EnvironmentOutlined,
  ExperimentOutlined,
  ReadOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Alert, Button, Card, Col, Empty, Row, Space, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@shared/auth/useAuth';
import { useCanFn } from '@shared/auth/useCan';
import { useAgreements } from '@shared/hooks/useAgreements';
import { useFarmers } from '@shared/hooks/useFarmers';
import { useFieldVisits } from '@shared/hooks/useFieldVisits';
import { useIsMobile } from '@shared/hooks/useIsMobile';
import { useHarvestInspections } from '@shared/hooks/useProcurement';
import { useSeedDistribution } from '@shared/hooks/useSeedDistribution';
import { useTrainingSessions } from '@shared/hooks/useTraining';
import { FieldVisitFormModal } from './FieldVisitFormModal';
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
      }),
    [user?.id, farmers.data, agreements.data, visits.data, training.data, seed.data, inspections.data],
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
          path: '/visits',
        }
      : null,
    can('HARVEST_INSPECTION_VIEW')
      ? {
          key: 'inspections',
          icon: <SafetyCertificateOutlined />,
          colour: '#d97706',
          bgTint: '#fffbeb',
          label: 'Harvest Gate',
          description: 'Pre-procurement inspections',
          count: inspections.data?.data?.length ?? 0,
          suffix: 'inspections',
          path: '/inspections',
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
          path: '/more/seed',
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
      default:
        return { color: '#475569', bg: '#f1f5f9', border: '#e2e8f0', label: KIND_LABEL[item.kind as keyof typeof KIND_LABEL] || 'Task' };
    }
  };

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      {/* --- Elevated Dark Hero Card --- */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          borderRadius: 16,
          padding: isMobile ? '20px 18px' : '28px 32px',
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
                level={isMobile ? 3 : 2}
                style={{ color: '#ffffff', margin: '4px 0 0', fontWeight: 700, letterSpacing: '-0.02em' }}
              >
                {greeting()}, {firstName} 👋
              </Typography.Title>

              <Typography.Text style={{ color: '#94a3b8', fontSize: 14 }}>
                {myVisitsToday > 0
                  ? `You have logged ${myVisitsToday} field visit${myVisitsToday === 1 ? '' : 's'} today. Great progress!`
                  : "Welcome to your field workspace. Check today's tasks and record your farm visits below."}
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
                  height: 50,
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
      <Row gutter={[20, 20]}>
        {/* --- Left Column: "What needs doing" Task Items --- */}
        <Col xs={24} lg={14}>
          <Card
            bordered={false}
            style={{
              borderRadius: 14,
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04), 0 1px 2px rgba(15, 23, 42, 0.02)',
              border: '1px solid #e2e8f0',
              background: '#ffffff',
            }}
            title={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '4px 0' }}>
                <Space size={8}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: '#f1f5f9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#0f172a',
                    }}
                  >
                    <CalendarOutlined style={{ fontSize: 14 }} />
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>What needs doing</span>
                </Space>

                <Space size={6}>
                  {overdue.length > 0 ? (
                    <Tag style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 6, fontWeight: 600 }}>
                      {overdue.length} overdue
                    </Tag>
                  ) : null}
                  {todayItems.length > 0 ? (
                    <Tag style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', borderRadius: 6, fontWeight: 600 }}>
                      {todayItems.length} today
                    </Tag>
                  ) : null}
                </Space>
              </div>
            }
            loading={loading}
          >
            {schedule.length === 0 && !loading ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <Space direction="vertical" size={4} style={{ padding: '16px 0' }}>
                    <Typography.Text strong style={{ color: '#059669', fontSize: 15 }}>
                      <CheckCircleOutlined /> All Caught Up!
                    </Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                      No harvests waiting on inspection, no incomplete farmers, no pending sessions.
                    </Typography.Text>
                  </Space>
                }
              />
            ) : (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                {schedule.slice(0, 8).map((item) => {
                  const badge = getTaskBadge(item);

                  return (
                    <div
                      key={item.key}
                      style={{
                        padding: '14px 16px',
                        borderRadius: 12,
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderLeft: `4px solid ${
                          item.urgency === 'overdue'
                            ? '#ef4444'
                            : item.urgency === 'today'
                              ? '#f59e0b'
                              : '#3b82f6'
                        }`,
                        transition: 'all 0.2s ease',
                        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.02)',
                      }}
                    >
                      <Row gutter={[12, 12]} align="middle" justify="space-between">
                        <Col xs={24} sm={18}>
                          <Space direction="vertical" size={4} style={{ width: '100%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '2px 8px',
                                  borderRadius: 6,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  background: badge.bg,
                                  color: badge.color,
                                  border: `1px solid ${badge.border}`,
                                }}
                              >
                                {badge.label}
                              </span>
                              <Typography.Text strong style={{ fontSize: 14, color: '#0f172a' }}>
                                {item.title}
                              </Typography.Text>
                            </div>

                            <Typography.Text style={{ fontSize: 13, color: '#64748b' }}>
                              {item.detail}
                            </Typography.Text>
                          </Space>
                        </Col>

                        <Col xs={24} sm={6} style={{ display: 'flex', justifyContent: isMobile ? 'flex-start' : 'flex-end' }}>
                          <Button
                            size="middle"
                            style={{
                              borderRadius: 8,
                              fontWeight: 600,
                              borderColor: '#cbd5e1',
                              color: '#1e293b',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                            onClick={() => navigate(item.actionPath)}
                          >
                            {item.actionLabel} <ArrowRightOutlined style={{ fontSize: 12 }} />
                          </Button>
                        </Col>
                      </Row>
                    </div>
                  );
                })}

                {schedule.length > 8 ? (
                  <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', textAlign: 'center', paddingTop: 4 }}>
                    +{schedule.length - 8} more tasks prioritized by urgency
                  </Typography.Text>
                ) : null}
              </Space>
            )}
          </Card>
        </Col>

        {/* --- Right Column: Horizontal Stat Cards for "Your work & modules" --- */}
        <Col xs={24} lg={10}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card
              bordered={false}
              style={{
                borderRadius: 14,
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04), 0 1px 2px rgba(15, 23, 42, 0.02)',
                border: '1px solid #e2e8f0',
                background: '#ffffff',
              }}
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: '#f1f5f9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#0f172a',
                    }}
                  >
                    <TeamOutlined style={{ fontSize: 14 }} />
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>Your work & modules</span>
                </div>
              }
            >
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                {areaDetails.map((area) => (
                  <div
                    key={area.key}
                    onClick={() => navigate(area.path)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 14px',
                      borderRadius: 12,
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#cbd5e1';
                      e.currentTarget.style.background = '#f8fafc';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#e2e8f0';
                      e.currentTarget.style.background = '#ffffff';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      {/* Pastel-tinted icon container */}
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 10,
                          background: area.bgTint,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: area.colour,
                          fontSize: 20,
                          flexShrink: 0,
                        }}
                      >
                        {area.icon}
                      </div>

                      <div>
                        <Typography.Text strong style={{ fontSize: 14, color: '#0f172a', display: 'block' }}>
                          {area.label}
                        </Typography.Text>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {area.description}
                        </Typography.Text>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: 8 }}>
                      <span style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', display: 'block', lineHeight: 1.2 }}>
                        {area.count}
                      </span>
                      <Typography.Text type="secondary" style={{ fontSize: 11, textTransform: 'capitalize' }}>
                        {area.suffix}
                      </Typography.Text>
                    </div>
                  </div>
                ))}
              </Space>
            </Card>

            {!can('HARVEST_INSPECTION_CREATE') ? (
              <Alert
                type="info"
                showIcon
                message="You cannot record harvest inspections"
                description="A Super Admin grants that under Administration → Roles & Permissions. Until then the harvest gate is read-only for you."
                style={{ borderRadius: 10 }}
              />
            ) : null}
          </Space>
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
