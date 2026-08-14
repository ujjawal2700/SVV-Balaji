import {
  CalendarOutlined,
  EnvironmentOutlined,
  ExperimentOutlined,
  ReadOutlined,
} from '@ant-design/icons';
import { Alert, Button, Card, Col, Empty, List, Row, Space, Statistic, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FieldVisit, SeedDistribution, TrainingSession } from '../../api/types';
import { useAuth } from '../../auth/useAuth';
import { PageHeader } from '../../components/PageHeader';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useFieldVisits } from '../../hooks/useFieldVisits';
import { useSeedDistribution } from '../../hooks/useSeedDistribution';
import { useTrainingSessions } from '../../hooks/useTraining';
import { EM_DASH, formatDate, formatQuantity } from '../../utils/format';
import { FieldVisitFormModal } from '../field-visits/FieldVisitFormModal';
import { SeedDistributionFormModal } from '../seed-distribution/SeedDistributionFormModal';
import { TrainingFormModal } from '../training/TrainingFormModal';

/**
 * The Agriculture Expert's landing screen.
 *
 * The rest of the panel is organised the way an administrator thinks — one
 * screen per table. This one is organised around a field executive's day,
 * which is three verbs: I visited a farm, I handed out seed, I ran a session.
 * Those are the three buttons, and everything below them is "what have I done
 * lately", not "what exists in the system".
 *
 * It reuses the same form modals as the admin screens rather than growing its
 * own. A second field-visit form would be a second set of validation rules to
 * keep in step with the DTO, and they would not stay in step.
 *
 * On a phone this sits inside FieldLayout, which swaps the sider for bottom
 * tabs. WS3.1 was baselined as a native Flutter app; as of 15 Aug 2026 it is
 * this instead — one codebase, one set of validation rules, no app store.
 *
 * What that trades away is offline capture. A website needs a connection, so
 * this serves the workflow the client actually described: the executive
 * returns to the branch and writes the day up. Capture with no signal would
 * need a service worker and an IndexedDB queue — real work, but additive to
 * this codebase rather than a second one.
 */
export function FieldExecutivePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const [visitOpen, setVisitOpen] = useState(false);
  const [seedOpen, setSeedOpen] = useState(false);
  const [trainingOpen, setTrainingOpen] = useState(false);

  const visits = useFieldVisits();
  const seed = useSeedDistribution();
  const sessions = useTrainingSessions();

  /**
   * "Mine" is filtered client-side because the API has no `expertId` query
   * parameter — it takes `farmerId` only. Filtering here keeps the screen
   * honest without inventing an endpoint; when the list endpoints learn to
   * paginate (A-12) this wants revisiting, because filtering a page rather
   * than the set would quietly under-report.
   */
  const mine = useMemo(() => {
    const all = visits.data?.data ?? [];
    return user ? all.filter((visit) => visit.expertId === user.id) : all;
  }, [visits.data, user]);

  const myRecentVisits = mine.slice(0, 6);

  const thisWeek = useMemo(() => {
    const weekAgo = dayjs().subtract(7, 'day');
    return mine.filter((visit) => dayjs(visit.visitDate).isAfter(weekAgo)).length;
  }, [mine]);

  const mySeed = useMemo(() => {
    const all = seed.data?.data ?? [];
    return user ? all.filter((row) => row.distributedById === user.id) : all;
  }, [seed.data, user]);

  const mySessions = useMemo(() => {
    const all = sessions.data?.data ?? [];
    return user ? all.filter((row) => row.conductedById === user.id) : all;
  }, [sessions.data, user]);

  const upcoming = useMemo(
    () => mySessions.filter((s) => dayjs(s.scheduledDate).isAfter(dayjs().subtract(1, 'day'))),
    [mySessions],
  );

  /** Farmers I have visited, most recently first, de-duplicated. */
  const myFarmers = useMemo(() => {
    const seen = new Map<string, { name: string; code: string | null; last: string }>();
    for (const visit of mine) {
      if (!visit.farmerId || seen.has(visit.farmerId)) continue;
      seen.set(visit.farmerId, {
        name: visit.farmer?.fullName ?? 'Unknown farmer',
        code: visit.farmer?.farmerCode ?? null,
        last: visit.visitDate,
      });
    }
    return [...seen.values()].slice(0, 8);
  }, [mine]);

  const firstName = user?.fullName?.split(' ')[0] ?? 'there';

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card styles={{ body: { padding: isMobile ? 14 : 24 } }}>
        <PageHeader
          title={`Good day, ${firstName}`}
          subtitle="Write up the farms you visited, the seed you handed out and the sessions you ran (FRD Sections 10–12)."
        />

        <Row gutter={[12, 12]}>
          <Col xs={24} md={8}>
            <Button
              block
              size="large"
              type="primary"
              icon={<EnvironmentOutlined />}
              onClick={() => setVisitOpen(true)}
              style={{ height: isMobile ? 56 : 64 }}
            >
              Log a field visit
            </Button>
          </Col>
          <Col xs={24} md={8}>
            <Button
              block
              size="large"
              icon={<ExperimentOutlined />}
              onClick={() => setSeedOpen(true)}
              style={{ height: isMobile ? 56 : 64 }}
            >
              Record a seed handout
            </Button>
          </Col>
          <Col xs={24} md={8}>
            <Button
              block
              size="large"
              icon={<ReadOutlined />}
              onClick={() => setTrainingOpen(true)}
              style={{ height: isMobile ? 56 : 64 }}
            >
              Create a training session
            </Button>
          </Col>
        </Row>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="My visits this week" value={thisWeek} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="My visits, all time" value={mine.length} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Farmers I've seen" value={myFarmers.length} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Sessions ahead" value={upcoming.length} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card
            title="My recent visits"
            size="small"
            extra={
              <Button type="link" size="small" onClick={() => navigate(isMobile ? '/field/visits' : '/field-visits')}>
                See all
              </Button>
            }
          >
            <List<FieldVisit>
              size="small"
              loading={visits.isLoading}
              dataSource={myRecentVisits}
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="Nothing logged yet — start with a field visit above"
                  />
                ),
              }}
              renderItem={(visit) => (
                <List.Item>
                  <List.Item.Meta
                    title={
                      <Space size={8} wrap>
                        <Typography.Text strong>
                          {visit.farmer?.fullName ?? 'Unknown farmer'}
                        </Typography.Text>
                        {visit.cropName ? <Tag>{visit.cropName}</Tag> : null}
                        {visit.cropHealth ? (
                          <Tag color="blue">{visit.cropHealth}</Tag>
                        ) : null}
                      </Space>
                    }
                    description={
                      <Space size={12} wrap>
                        <Typography.Text type="secondary">
                          <CalendarOutlined /> {formatDate(visit.visitDate)}
                        </Typography.Text>
                        {visit.farmer?.farmerCode ? (
                          <Typography.Text code style={{ fontSize: 12 }}>
                            {visit.farmer.farmerCode}
                          </Typography.Text>
                        ) : null}
                        {visit.pestStatus ? (
                          <Typography.Text type="secondary">
                            Pests: {visit.pestStatus}
                          </Typography.Text>
                        ) : null}
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card title="Farmers I look after" size="small">
              <List
                size="small"
                dataSource={myFarmers}
                locale={{
                  emptyText: (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No visits yet" />
                  ),
                }}
                renderItem={(farmer) => (
                  <List.Item>
                    <Space direction="vertical" size={0} style={{ width: '100%' }}>
                      <Typography.Text>{farmer.name}</Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {farmer.code ?? 'Not yet approved'} · last seen {formatDate(farmer.last)}
                      </Typography.Text>
                    </Space>
                  </List.Item>
                )}
              />
            </Card>

            <Card
              title="My recent seed handouts"
              size="small"
              extra={
                <Button type="link" size="small" onClick={() => navigate(isMobile ? '/field/seed' : '/seed-distribution')}>
                  See all
                </Button>
              }
            >
              <List<SeedDistribution>
                size="small"
                loading={seed.isLoading}
                dataSource={mySeed.slice(0, 5)}
                locale={{
                  emptyText: (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing handed out yet" />
                  ),
                }}
                renderItem={(row) => (
                  <List.Item>
                    <Space direction="vertical" size={0} style={{ width: '100%' }}>
                      <Typography.Text>
                        {row.seedName} · {formatQuantity(row.quantity, row.unit)}
                      </Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {row.farmer?.fullName ?? EM_DASH} · {formatDate(row.distributionDate)}
                      </Typography.Text>
                    </Space>
                  </List.Item>
                )}
              />
            </Card>

            <Card
              title="My training sessions"
              size="small"
              extra={
                <Button type="link" size="small" onClick={() => navigate(isMobile ? '/field/training' : '/training')}>
                  See all
                </Button>
              }
            >
              <List<TrainingSession>
                size="small"
                loading={sessions.isLoading}
                dataSource={mySessions.slice(0, 5)}
                locale={{
                  emptyText: (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No sessions yet" />
                  ),
                }}
                renderItem={(session) => (
                  <List.Item>
                    <Space direction="vertical" size={0} style={{ width: '100%' }}>
                      <Typography.Text>{session.title}</Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {formatDate(session.scheduledDate)} ·{' '}
                        {session._count?.attendances ?? 0} attended
                      </Typography.Text>
                    </Space>
                  </List.Item>
                )}
              />
            </Card>
          </Space>
        </Col>
      </Row>

      <Alert
        type="info"
        showIcon
        message="Photos now upload directly"
        description="Open a visit or a session and attach crop photographs, pest damage or an inspection report straight from the device — no more pasting links. Field capture with no signal is the Agriculture Expert app (WS3.1), still to come."
      />

      <FieldVisitFormModal open={visitOpen} onClose={() => setVisitOpen(false)} />
      <SeedDistributionFormModal open={seedOpen} onClose={() => setSeedOpen(false)} />
      <TrainingFormModal open={trainingOpen} onClose={() => setTrainingOpen(false)} />
    </Space>
  );
}
