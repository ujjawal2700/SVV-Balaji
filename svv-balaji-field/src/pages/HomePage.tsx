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
import { Alert, Button, Card, Col, Empty, Row, Space, Statistic, Tag, Typography } from 'antd';
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
import { KIND_LABEL, URGENCY_COLOUR, buildSchedule } from './schedule';

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

  /** The six responsibilities, named. Hidden individually by permission. */
  const areas = [
    can('FARMER_VIEW')
      ? {
          key: 'farmers',
          icon: <TeamOutlined />,
          colour: '#1677ff',
          label: 'Farmers & land',
          count: farmers.data?.data?.length ?? 0,
          suffix: 'registered',
          path: '/farmers',
        }
      : null,
    can('FIELD_VISIT_VIEW')
      ? {
          key: 'visits',
          icon: <EnvironmentOutlined />,
          colour: '#389e0d',
          label: 'Field visits',
          count: visits.data?.data?.length ?? 0,
          suffix: 'logged',
          path: '/visits',
        }
      : null,
    can('HARVEST_INSPECTION_VIEW')
      ? {
          key: 'inspections',
          icon: <SafetyCertificateOutlined />,
          colour: '#d48806',
          label: 'Harvest gate',
          count: inspections.data?.data?.length ?? 0,
          suffix: 'inspections',
          path: '/inspections',
        }
      : null,
    can('SEED_DISTRIBUTION_VIEW')
      ? {
          key: 'seed',
          icon: <ExperimentOutlined />,
          colour: '#08979c',
          label: 'Seed & inputs',
          count: seed.data?.data?.length ?? 0,
          suffix: 'handouts',
          path: '/more/seed',
        }
      : null,
    can('TRAINING_VIEW')
      ? {
          key: 'training',
          icon: <ReadOutlined />,
          colour: '#722ed1',
          label: 'Training',
          count: training.data?.data?.length ?? 0,
          suffix: 'sessions',
          path: '/more/training',
        }
      : null,
  ].filter(Boolean) as Array<{
    key: string;
    icon: ReactNode;
    colour: string;
    label: string;
    count: number;
    suffix: string;
    path: string;
  }>;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card styles={{ body: { padding: isMobile ? 16 : 24 } }}>
        <Space direction="vertical" size={4} style={{ width: '100%', marginBottom: 16 }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {greeting()}, {firstName}
          </Typography.Title>
          <Typography.Text type="secondary">
            {dayjs().format('dddd, D MMMM')}
            {myVisitsToday > 0
              ? ` · ${myVisitsToday} visit${myVisitsToday === 1 ? '' : 's'} logged today`
              : ''}
          </Typography.Text>
        </Space>

        {can('FIELD_VISIT_CREATE') ? (
          <Button
            block
            type="primary"
            size="large"
            icon={<EnvironmentOutlined />}
            style={{ height: isMobile ? 56 : 64 }}
            onClick={() => setVisitOpen(true)}
          >
            Log a field visit
          </Button>
        ) : null}
      </Card>

      {/* --- Today's schedule ------------------------------------------------ */}
      <Card
        size="small"
        title={
          <Space size={8}>
            <CalendarOutlined />
            <span>What needs doing</span>
            {overdue.length > 0 ? <Tag color="red">{overdue.length} overdue</Tag> : null}
            {todayItems.length > 0 ? <Tag color="gold">{todayItems.length} today</Tag> : null}
          </Space>
        }
        loading={loading}
      >
        {schedule.length === 0 && !loading ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Space direction="vertical" size={4}>
                <Typography.Text>
                  <CheckCircleOutlined style={{ color: '#52c41a' }} /> Nothing outstanding
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  No harvests waiting on inspection, no farmers left incomplete, no sessions due.
                </Typography.Text>
              </Space>
            }
          />
        ) : (
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            {schedule.slice(0, 8).map((item) => (
              <Card
                key={item.key}
                size="small"
                styles={{ body: { padding: 12 } }}
                style={{
                  borderLeft: `3px solid ${
                    item.urgency === 'overdue'
                      ? '#ff4d4f'
                      : item.urgency === 'today'
                        ? '#faad14'
                        : '#d9d9d9'
                  }`,
                }}
              >
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                  <Space size={6} wrap>
                    <Tag color={URGENCY_COLOUR[item.urgency]}>{KIND_LABEL[item.kind]}</Tag>
                    <Typography.Text strong>{item.title}</Typography.Text>
                  </Space>

                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    {item.detail}
                  </Typography.Text>

                  <Button size="small" onClick={() => navigate(item.actionPath)}>
                    {item.actionLabel} <ArrowRightOutlined />
                  </Button>
                </Space>
              </Card>
            ))}

            {schedule.length > 8 ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {schedule.length - 8} more, sorted below the eight most urgent.
              </Typography.Text>
            ) : null}
          </Space>
        )}
      </Card>

      {/* --- The six areas, named ------------------------------------------- */}
      <Card size="small" title="Your work">
        <Row gutter={[10, 10]}>
          {areas.map((area) => (
            <Col xs={12} md={8} key={area.key}>
              <Card
                size="small"
                hoverable
                onClick={() => navigate(area.path)}
                styles={{ body: { padding: 14 } }}
              >
                <Space direction="vertical" size={2} style={{ width: '100%' }}>
                  <span style={{ color: area.colour, fontSize: 20 }}>{area.icon}</span>
                  <Statistic
                    value={area.count}
                    valueStyle={{ fontSize: 22 }}
                    suffix={
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {area.suffix}
                      </Typography.Text>
                    }
                  />
                  <Typography.Text strong style={{ fontSize: 13 }}>
                    {area.label}
                  </Typography.Text>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>

      {!can('HARVEST_INSPECTION_CREATE') ? (
        <Alert
          type="info"
          showIcon
          message="You cannot record harvest inspections"
          description="A Super Admin grants that under Administration → Roles & Permissions. Until then the harvest gate is read-only for you."
        />
      ) : null}

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
