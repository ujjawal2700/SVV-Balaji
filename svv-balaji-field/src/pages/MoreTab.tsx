import {
  ExperimentOutlined,
  LogoutOutlined,
  QuestionCircleOutlined,
  ReadOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { App as AntApp, Avatar, Button, Card, List, Space, Tag, Typography } from 'antd';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROLE_LABELS } from '@shared/auth/types';
import { useAuth } from '@shared/auth/useAuth';
import { useCanFn } from '@shared/auth/useCan';
import { useSeedDistribution } from '@shared/hooks/useSeedDistribution';
import { useTrainingSessions } from '@shared/hooks/useTraining';

/**
 * The two lower-frequency areas, plus the account.
 *
 * A "More" tab is where app navigation quietly turns back into a menu, so this
 * one earns its place by showing counts rather than only labels — an executive
 * glancing at it can see there are two sessions this month without opening
 * anything.
 *
 * An area the user cannot reach is hidden rather than shown disabled. Seed and
 * training are separate permissions, and a Branch Manager using this panel may
 * legitimately hold one and not the other.
 */
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
          icon: <ExperimentOutlined style={{ fontSize: 20, color: '#389e0d' }} />,
          title: 'Seed & agri-inputs',
          description: 'Record what you handed out, to whom, and from which batch.',
          count: seed.data?.data?.length ?? 0,
          countLabel: 'handouts logged',
          path: '/more/seed',
        }
      : null,
    can('TRAINING_VIEW')
      ? {
          key: 'training',
          icon: <ReadOutlined style={{ fontSize: 20, color: '#1677ff' }} />,
          title: 'Training sessions',
          description: 'Run a session at the farm, then record attendance and materials here.',
          count: training.data?.data?.length ?? 0,
          countLabel: 'sessions',
          path: '/more/training',
        }
      : null,
  ].filter(Boolean) as Array<{
    key: string;
    icon: ReactNode;
    title: string;
    description: string;
    count: number;
    countLabel: string;
    path: string;
  }>;

  const signOut = () => {
    modal.confirm({
      title: 'Sign out?',
      content:
        'You will need your email and password to get back in. Anything you have already saved ' +
        'is on the server, not on this phone.',
      okText: 'Sign out',
      onOk: async () => {
        await logout();
        message.success('Signed out');
        // No navigate. Clearing the user is what swaps the router over to the
        // login screen (see App.tsx) - pushing /login as well would race the
        // re-render and can leave a blank frame on a slow phone.
      },
    });
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card styles={{ body: { padding: 0 } }}>
        <List
          itemLayout="horizontal"
          dataSource={areas}
          renderItem={(area) => (
            <List.Item
              onClick={() => navigate(area.path)}
              style={{ padding: '14px 16px', cursor: 'pointer' }}
              extra={<RightOutlined style={{ color: '#bfbfbf' }} />}
            >
              <List.Item.Meta
                avatar={area.icon}
                title={
                  <Space size={8}>
                    <Typography.Text strong>{area.title}</Typography.Text>
                    <Tag>{`${area.count} ${area.countLabel}`}</Tag>
                  </Space>
                }
                description={
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    {area.description}
                  </Typography.Text>
                }
              />
            </List.Item>
          )}
        />
      </Card>

      <Card size="small">
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space size={12}>
            <Avatar size={44}>{user?.fullName?.charAt(0).toUpperCase()}</Avatar>
            <div>
              <Typography.Text strong style={{ display: 'block' }}>
                {user?.fullName}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                {user ? ROLE_LABELS[user.role] : ''}
                {user?.branch ? ` · ${user.branch.name}` : ''}
              </Typography.Text>
            </div>
          </Space>

          <Button block icon={<LogoutOutlined />} onClick={signOut}>
            Sign out
          </Button>
        </Space>
      </Card>

      <Card size="small">
        <Space direction="vertical" size={6}>
          <Typography.Text strong>
            <QuestionCircleOutlined /> This needs a connection
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            Everything you record here is saved to the server as you save it — nothing is held on
            the phone. If you are somewhere with no signal, write it down and enter it when you are
            back in range. Offline capture is possible to add, but it is not built yet, and a form
            that silently fails to save would be worse than one that tells you it cannot.
          </Typography.Text>
        </Space>
      </Card>
    </Space>
  );
}
