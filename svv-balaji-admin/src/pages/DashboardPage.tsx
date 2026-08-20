import { useEffect, useState } from 'react';
import {
  Card,
  Col,
  Row,
  Space,
  Statistic,
  Typography,
  Timeline,
  Spin,
  Button,
} from 'antd';
import {
  TeamOutlined,
  UserAddOutlined,
  FileDoneOutlined,
  DatabaseOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { dashboardApi, DashboardSummary } from '@shared/api/dashboard';

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardApi
      .getSummary()
      .then((data) => setSummary(data))
      .catch((err) => console.error('Failed to load dashboard summary', err))
      .finally(() => setLoading(false));
  }, []);

  const renderMetricCard = (
    title: string,
    value: number | string,
    icon: React.ReactNode,
    color1: string,
    color2: string
  ) => (
    <Card
      style={{
        borderRadius: 16,
        background: `linear-gradient(135deg, ${color1} 0%, ${color2} 100%)`,
        color: '#fff',
        border: 'none',
        boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
        height: '100%',
      }}
      bodyStyle={{ padding: '24px' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Typography.Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 16, fontWeight: 500 }}>
            {title}
          </Typography.Text>
          <Typography.Title level={2} style={{ color: '#fff', margin: 0, marginTop: 8 }}>
            {value}
          </Typography.Title>
        </div>
        <div
          style={{
            fontSize: 32,
            opacity: 0.8,
            background: 'rgba(255,255,255,0.2)',
            padding: 12,
            borderRadius: 12,
          }}
        >
          {icon}
        </div>
      </div>
    </Card>
  );

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <Space direction="vertical" size={24} style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <Typography.Title level={3} style={{ margin: 0, fontWeight: 600 }}>
              Welcome back, {user?.fullName}
            </Typography.Title>
            <Typography.Text type="secondary" style={{ fontSize: 16 }}>
              {user?.branch
                ? `Here's what's happening at ${user.branch.name} today.`
                : 'Here is your organisation-wide overview.'}
            </Typography.Text>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 100, textAlign: 'center' }}>
            <Spin size="large" />
          </div>
        ) : (
          <>
            <Row gutter={[24, 24]}>
              <Col xs={24} sm={12} lg={6}>
                {renderMetricCard(
                  'Active Farmers',
                  summary?.metrics.activeFarmers || 0,
                  <TeamOutlined />,
                  '#1890ff',
                  '#0050b3'
                )}
              </Col>
              <Col xs={24} sm={12} lg={6}>
                {renderMetricCard(
                  'Pending Approvals',
                  summary?.metrics.pendingFarmers || 0,
                  <UserAddOutlined />,
                  '#faad14',
                  '#d48806'
                )}
              </Col>
              <Col xs={24} sm={12} lg={6}>
                {renderMetricCard(
                  'Active Agreements',
                  summary?.metrics.activeAgreements || 0,
                  <FileDoneOutlined />,
                  '#52c41a',
                  '#389e0d'
                )}
              </Col>
              <Col xs={24} sm={12} lg={6}>
                {renderMetricCard(
                  'Total Inventory (KG)',
                  summary?.metrics.totalStockInventory.toLocaleString() || '0',
                  <DatabaseOutlined />,
                  '#722ed1',
                  '#531dab'
                )}
              </Col>
            </Row>

            <Row gutter={[24, 24]}>
              <Col xs={24} lg={16}>
                <Card
                  title={<span style={{ fontSize: 18, fontWeight: 600 }}>Recent Activity</span>}
                  style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
                  bodyStyle={{ padding: '24px 24px 0 24px' }}
                >
                  {summary?.timeline && summary.timeline.length > 0 ? (
                    <Timeline>
                      {summary.timeline.map((event) => (
                        <Timeline.Item
                          key={event.id}
                          color={event.type === 'VERIFICATION' ? 'blue' : 'purple'}
                        >
                          <Typography.Text strong style={{ display: 'block', fontSize: 15 }}>
                            {event.title}
                          </Typography.Text>
                          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
                            {event.description}
                          </Typography.Text>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {new Date(event.timestamp).toLocaleString()}
                          </Typography.Text>
                        </Timeline.Item>
                      ))}
                    </Timeline>
                  ) : (
                    <Typography.Text type="secondary">No recent activity found.</Typography.Text>
                  )}
                </Card>
              </Col>

              <Col xs={24} lg={8}>
                <Card
                  title={<span style={{ fontSize: 18, fontWeight: 600 }}>Quick Actions</span>}
                  style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', height: '100%' }}
                >
                  <Space direction="vertical" style={{ width: '100%' }} size={12}>
                    <Button
                      block
                      size="large"
                      style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                      onClick={() => navigate('/farmers')}
                    >
                      <span>Manage Farmers</span>
                      <RightOutlined style={{ color: '#bfbfbf' }} />
                    </Button>
                    <Button
                      block
                      size="large"
                      style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                      onClick={() => navigate('/agreements')}
                    >
                      <span>Review Agreements</span>
                      <RightOutlined style={{ color: '#bfbfbf' }} />
                    </Button>
                    <Button
                      block
                      size="large"
                      style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                      onClick={() => navigate('/warehouse-stock')}
                    >
                      <span>Check Inventory</span>
                      <RightOutlined style={{ color: '#bfbfbf' }} />
                    </Button>
                  </Space>
                </Card>
              </Col>
            </Row>
          </>
        )}
      </Space>
    </div>
  );
}
