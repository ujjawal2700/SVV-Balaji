import {
  ArrowRightOutlined,
  FileProtectOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Alert, Button, Card, Col, Progress, Row, Space, Statistic, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { useCan } from '../../auth/useCan';
import { PageHeader } from '../../components/PageHeader';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useAgreements } from '../../hooks/useAgreements';
import { useFarmers } from '../../hooks/useFarmers';
import { AgreementFormModal } from '../agreements/AgreementFormModal';
import { FarmerFormModal } from '../farmers/FarmerFormModal';
import { farmerGaps } from './readiness';

/**
 * The onboarding executive's landing screen.
 *
 * Organised around the pipeline rather than the tables, because onboarding is a
 * funnel with one gate in it: registered -> approved -> agreement signed. A
 * farmer stuck before the gate is invisible to the rest of the system, so the
 * numbers here are counts of things that are stuck, not counts of things that
 * exist.
 */
export function OnboardingHomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const canApprove = useCan('FARMER_APPROVE');

  const [farmerOpen, setFarmerOpen] = useState(false);
  const [agreementOpen, setAgreementOpen] = useState(false);

  const farmers = useFarmers({});
  const agreements = useAgreements();

  const stats = useMemo(() => {
    const all = farmers.data?.data ?? [];
    const pending = all.filter((f) => f.status === 'PENDING_VERIFICATION');
    const approved = all.filter((f) => Boolean(f.farmerCode));
    const incomplete = all.filter((f) =>
      farmerGaps(f).some((gap) => gap.severity === 'blocking'),
    );

    // Approved farmers with no agreement are the quiet gap: they can be
    // inspected and collected from, but with no agreed rate a collection has
    // nothing to fall back on if the weighbridge does not enter one.
    const withAgreement = new Set((agreements.data?.data ?? []).map((a) => a.farmerId));
    const approvedNoAgreement = approved.filter((f) => !withAgreement.has(f.id));

    return {
      total: all.length,
      pending: pending.length,
      approved: approved.length,
      incomplete: incomplete.length,
      approvedNoAgreement: approvedNoAgreement.length,
      percentApproved: all.length ? Math.round((approved.length / all.length) * 100) : 0,
    };
  }, [farmers.data, agreements.data]);

  const firstName = user?.fullName?.split(' ')[0] ?? 'there';

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card styles={{ body: { padding: isMobile ? 14 : 24 } }}>
        <PageHeader
          title={`Good day, ${firstName}`}
          subtitle="Register farmers / suppliers, complete their details, and get them approved — approval is what issues the traceability code (FRD 7–9)."
        />

        <Row gutter={[12, 12]}>
          <Col xs={24} md={12}>
            <Button
              block
              size="large"
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setFarmerOpen(true)}
              style={{ height: isMobile ? 56 : 64 }}
            >
              Register a farmer / supplier
            </Button>
          </Col>
          <Col xs={24} md={12}>
            <Button
              block
              size="large"
              icon={<FileProtectOutlined />}
              onClick={() => setAgreementOpen(true)}
              style={{ height: isMobile ? 56 : 64 }}
            >
              Record an agreement
            </Button>
          </Col>
        </Row>
      </Card>

      {stats.pending > 0 ? (
        <Alert
          type="warning"
          showIcon
          icon={<SafetyCertificateOutlined />}
          message={`${stats.pending} farmer / supplier${stats.pending === 1 ? '' : 's'} waiting for approval`}
          description={
            canApprove
              ? 'Until approved, none of them can be inspected or collected from.'
              : 'You can complete their details; a Super Admin does the final approval.'
          }
          action={
            <Button size="small" type="primary" onClick={() => navigate('/onboarding/approvals')}>
              Open queue
            </Button>
          }
        />
      ) : null}

      {stats.incomplete > 0 ? (
        <Alert
          type="error"
          showIcon
          icon={<WarningOutlined />}
          message={`${stats.incomplete} farmer / supplier${stats.incomplete === 1 ? '' : 's'} without bank details`}
          description="A collection from these farmers will work out what they are owed with nowhere to send it. Much easier to capture now than at the weighbridge."
          action={
            <Button size="small" onClick={() => navigate('/onboarding/farmers')}>
              Fix
            </Button>
          }
        />
      ) : null}

      <Card size="small" title="Onboarding pipeline">
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div>
            <Progress
              percent={stats.percentApproved}
              status={stats.pending > 0 ? 'active' : 'success'}
            />
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              {stats.approved} of {stats.total} registered farmers / suppliers hold a traceability code
            </Typography.Text>
          </div>

          <Row gutter={[12, 12]}>
            <Col xs={12} md={6}>
              <Statistic title="Registered" value={stats.total} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic
                title="Awaiting approval"
                value={stats.pending}
                valueStyle={stats.pending > 0 ? { color: '#d48806' } : undefined}
              />
            </Col>
            <Col xs={12} md={6}>
              <Statistic
                title="Approved"
                value={stats.approved}
                valueStyle={{ color: '#389e0d' }}
              />
            </Col>
            <Col xs={12} md={6}>
              <Statistic
                title="No agreement"
                value={stats.approvedNoAgreement}
                valueStyle={stats.approvedNoAgreement > 0 ? { color: '#d48806' } : undefined}
              />
            </Col>
          </Row>

          {stats.approvedNoAgreement > 0 ? (
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              {stats.approvedNoAgreement} approved farmer
              {stats.approvedNoAgreement === 1 ? ' has' : 's have'} no agreement. They can still be
              collected from, but the weighbridge will have no agreed rate to fall back on.{' '}
              <Typography.Link onClick={() => navigate('/onboarding/agreements')}>
                Record one <ArrowRightOutlined />
              </Typography.Link>
            </Typography.Text>
          ) : null}
        </Space>
      </Card>

      <FarmerFormModal open={farmerOpen} onClose={() => setFarmerOpen(false)} />
      <AgreementFormModal open={agreementOpen} onClose={() => setAgreementOpen(false)} />
    </Space>
  );
}
