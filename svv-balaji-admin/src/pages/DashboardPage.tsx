import { Alert, Card, Col, Row, Space, Statistic, Tag, Typography } from 'antd';
import { useAuth } from '../auth/useAuth';
import { useCanFn } from '../auth/useCan';
import { NAV_SECTIONS } from '../layout/navigation';

/**
 * Landing screen.
 *
 * Deliberately honest for now: it reports what the signed-in user can reach and
 * what the panel does not yet do, rather than showing invented figures. Real
 * operational tiles arrive in WS2.6, once there is agreement on which numbers
 * the client actually wants on the front page.
 */
export function DashboardPage() {
  const { user } = useAuth();
  const can = useCanFn();

  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => can(item.permission)),
  })).filter((section) => section.items.length > 0);

  const screenCount = visibleSections.reduce((sum, section) => sum + section.items.length, 0);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <Typography.Title level={4} style={{ marginTop: 0 }}>
          Welcome, {user?.fullName}
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          {user?.branch
            ? `Signed in at ${user.branch.name} (${user.branch.location}).`
            : 'Signed in with organisation-wide access.'}
        </Typography.Paragraph>
      </Card>

      <Row gutter={16}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="Sections available to you" value={visibleSections.length} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="Screens available to you" value={screenCount} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="Backend phases live" value="0–4" suffix="(partial)" />
          </Card>
        </Col>
      </Row>

      <Alert
        type="info"
        showIcon
        message="Panel scaffolding (WS2.1)"
        description={
          <>
            Authentication, session refresh and role-based navigation are working against the live
            API. The screens themselves land from WS2.2 onward — each menu entry currently opens a
            page describing what it will do and which API routes it drives.
          </>
        }
      />

      <Card size="small" title="What you can reach">
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {visibleSections.map((section) => (
            <div key={section.key}>
              <Typography.Text strong>{section.label}</Typography.Text>
              <div style={{ marginTop: 6 }}>
                <Space size={[4, 8]} wrap>
                  {section.items.map((item) => (
                    <Tag key={item.key}>{item.label}</Tag>
                  ))}
                </Space>
              </div>
            </div>
          ))}
        </Space>
      </Card>
    </Space>
  );
}
