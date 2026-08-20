import {
  ExperimentOutlined,
  InfoCircleOutlined,
  LogoutOutlined,
  ReadOutlined,
  RightOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { App as AntApp, Avatar, Button, Card, List, Space, Tag, Typography } from 'antd';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROLE_LABELS } from '@shared/auth/types';
import { useAuth } from '@shared/auth/useAuth';
import { useCanFn } from '@shared/auth/useCan';
import { useSeedDistribution } from '@shared/hooks/useSeedDistribution';
import { useTrainingSessions } from '@shared/hooks/useTraining';

export function FieldMoreTab() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { message, modal } = AntApp.useApp();
  const can = useCanFn();

  const seed = useSeedDistribution();
  const training = useTrainingSessions();

  const areas = [
    can('SEED_DISTRIBUTION_VIEW')
      ? {
          key: 'seed',
          icon: <ExperimentOutlined />,
          iconBg: '#ecfdf5',
          iconColor: '#059669',
          title: 'Seed & Agri-Inputs',
          description: 'Record input distributions, recipient farmers, and supplier batch numbers.',
          count: seed.data?.data?.length ?? 0,
          countLabel: 'handouts logged',
          path: '/more/seed',
        }
      : null,
    can('TRAINING_VIEW')
      ? {
          key: 'training',
          icon: <ReadOutlined />,
          iconBg: '#e0e7ff',
          iconColor: '#4338ca',
          title: 'Training Sessions',
          description: 'Schedule farmer workshops, track attendance, and log curriculum notes.',
          count: training.data?.data?.length ?? 0,
          countLabel: 'sessions',
          path: '/more/training',
        }
      : null,
  ].filter(Boolean) as Array<{
    key: string;
    icon: ReactNode;
    iconBg: string;
    iconColor: string;
    title: string;
    description: string;
    count: number;
    countLabel: string;
    path: string;
  }>;

  const signOut = () => {
    modal.confirm({
      title: 'Sign out of Field Operations?',
      content:
        'You will need your email and password to log in again. All recorded data is securely synced to the server.',
      okText: 'Sign out',
      okButtonProps: { danger: true },
      onOk: async () => {
        await logout();
        message.success('Signed out successfully');
      },
    });
  };

  return (
    <div style={{ maxWidth: 768, margin: '0 auto', width: '100%', paddingBottom: 24 }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {/* Section Header */}
        <div style={{ marginBottom: 4 }}>
          <Typography.Title level={4} style={{ margin: 0, color: '#0f172a', fontWeight: 700 }}>
            Operations & Settings
          </Typography.Title>
          <Typography.Text style={{ color: '#64748b', fontSize: 13 }}>
            Manage agricultural input logs, training workshops, and your field session
          </Typography.Text>
        </div>

        {/* Module Action Rows */}
        <Card
          styles={{ body: { padding: 0 } }}
          style={{
            borderRadius: 14,
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px 0 rgba(15, 23, 42, 0.04)',
            overflow: 'hidden',
          }}
        >
          <List
            itemLayout="horizontal"
            dataSource={areas}
            renderItem={(area, index) => (
              <List.Item
                onClick={() => navigate(area.path)}
                style={{
                  padding: '16px 20px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  borderBottom: index < areas.length - 1 ? '1px solid #f1f5f9' : 'none',
                }}
                className="hover:bg-slate-50"
                extra={
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: '#f8fafc',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#94a3b8',
                      marginLeft: 12,
                    }}
                  >
                    <RightOutlined style={{ fontSize: 12 }} />
                  </div>
                }
              >
                <List.Item.Meta
                  avatar={
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 10,
                        background: area.iconBg,
                        color: area.iconColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 19,
                        flexShrink: 0,
                      }}
                    >
                      {area.icon}
                    </div>
                  }
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Typography.Text strong style={{ fontSize: 15, color: '#0f172a' }}>
                        {area.title}
                      </Typography.Text>
                      <Tag
                        style={{
                          margin: 0,
                          borderRadius: 999,
                          border: 'none',
                          background: '#f1f5f9',
                          color: '#334155',
                          fontWeight: 600,
                          fontSize: 11,
                          padding: '1px 10px',
                        }}
                      >
                        {`${area.count} ${area.countLabel}`}
                      </Tag>
                    </div>
                  }
                  description={
                    <Typography.Text style={{ color: '#64748b', fontSize: 13, display: 'block', marginTop: 2 }}>
                      {area.description}
                    </Typography.Text>
                  }
                />
              </List.Item>
            )}
          />
        </Card>

        {/* User Profile & Account Actions */}
        <Card
          style={{
            borderRadius: 14,
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px 0 rgba(15, 23, 42, 0.04)',
          }}
          styles={{ body: { padding: '18px 20px' } }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <Avatar
                size={48}
                style={{
                  background: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: 18,
                  boxShadow: '0 2px 8px rgba(15, 23, 42, 0.15)',
                }}
              >
                {user?.fullName?.charAt(0).toUpperCase() || <UserOutlined />}
              </Avatar>
              <div style={{ flex: 1 }}>
                <Typography.Text strong style={{ fontSize: 15, color: '#0f172a', display: 'block' }}>
                  {user?.fullName}
                </Typography.Text>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                  <Tag
                    color="blue"
                    style={{
                      margin: 0,
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '0 8px',
                    }}
                  >
                    {user ? ROLE_LABELS[user.role] : ''}
                  </Tag>
                  {user?.branch && (
                    <Typography.Text style={{ color: '#64748b', fontSize: 12 }}>
                      {user.branch.name}
                    </Typography.Text>
                  )}
                </div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 14 }}>
              <Button
                block
                icon={<LogoutOutlined />}
                onClick={signOut}
                style={{
                  height: 40,
                  borderRadius: 10,
                  fontWeight: 600,
                  color: '#dc2626',
                  background: '#fef2f2',
                  border: '1px solid #fee2e2',
                  transition: 'all 0.2s ease',
                }}
              >
                Sign out
              </Button>
            </div>
          </div>
        </Card>

        {/* Connectivity & Offline Notice Banner */}
        <div
          style={{
            borderRadius: 14,
            border: '1px solid #fef3c7',
            background: 'linear-gradient(135deg, #fffbeb 0%, #fefce8 100%)',
            padding: '16px 18px',
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
            boxShadow: '0 1px 2px 0 rgba(217, 119, 6, 0.04)',
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: '#fde68a',
              color: '#b45309',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              flexShrink: 0,
              marginTop: 2,
            }}
          >
            <InfoCircleOutlined />
          </div>
          <div>
            <Typography.Text strong style={{ fontSize: 14, color: '#92400e', display: 'block', marginBottom: 2 }}>
              Active Internet Connection Required
            </Typography.Text>
            <Typography.Text style={{ color: '#78350f', fontSize: 13, lineHeight: 1.5, display: 'block' }}>
              All field inspections, seed handouts, and farmer onboarding logs are instantly synced to the central
              cloud database. If you are operating in low-connectivity areas, keep written notes and submit the records once you are back in network range.
            </Typography.Text>
          </div>
        </div>
      </Space>
    </div>
  );
}
