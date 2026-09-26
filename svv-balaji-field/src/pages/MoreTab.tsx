import { CloudSyncOutlined, IdcardOutlined, LogoutOutlined, ReadOutlined, RightOutlined, UserOutlined } from '@ant-design/icons';
import { App as AntApp, Avatar, Typography } from 'antd';
import type { CSSProperties, ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ROLE_LABELS } from '@shared/auth/types';
import { useAuth } from '@shared/auth/useAuth';
import { useCanFn } from '@shared/auth/useCan';
import { useIsMobile } from '@shared/hooks/useIsMobile';
import { useTrainingSessions } from '@shared/hooks/useTraining';
import { useSafeLogout } from '../offline/OfflineBar';
import { useOutbox } from '../offline/outbox';

const groupStyle: CSSProperties = {
  background: '#ffffff',
  borderRadius: 14,
  border: '1px solid #e8edf3',
  overflow: 'hidden',
};

/**
 * Phone-only "More" tab, laid out like an app settings screen: who you are,
 * then the field tools that do not fit in the bottom bar, then sign out.
 * Tablet and desktop list these pages in the sidebar instead.
 */
export function FieldMoreTab() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const safeLogout = useSafeLogout();
  const outbox = useOutbox();
  const { message, modal } = AntApp.useApp();
  const can = useCanFn();
  const training = useTrainingSessions();
  const isMobile = useIsMobile();

  const mine = outbox.items.filter((i) => i.userId === user?.id);
  const waiting = mine.length;
  const failed = mine.filter((i) => i.status === 'failed').length;
  const sessions = training.data?.data?.length ?? 0;

  // Tablet and desktop list these pages in the sidebar; More is phone-only.
  if (!isMobile) return <Navigate to="/profile" replace />;


  const signOut = () => {
    modal.confirm({
      title: 'Sign out of Field Operations?',
      content: waiting
        ? `${waiting} change${waiting === 1 ? ' is' : 's are'} still waiting to sync on this device.`
        : 'Everything you recorded has synced. You will need your email and password to sign in again.',
      okText: 'Sign out',
      okButtonProps: { danger: true },
      onOk: async () => {
        await safeLogout({ confirmed: true });
        message.success('Signed out');
      },
    });
  };

  const syncStatus = failed ? (
    <StatusPill tone="danger">{failed} failed</StatusPill>
  ) : waiting ? (
    <StatusPill tone="warning">{waiting} waiting</StatusPill>
  ) : (
    <StatusPill tone="success">All synced</StatusPill>
  );

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 4 }}>
      {/* Account — the whole card opens the profile */}
      <button
        type="button"
        onClick={() => navigate('/profile')}
        className="field-more-row"
        style={{ ...groupStyle, width: '100%', padding: 16, display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', textAlign: 'left' }}
      >
        <Avatar
          size={52}
          style={{ background: '#0f172a', color: '#fff', fontWeight: 700, fontSize: 20, flexShrink: 0 }}
        >
          {user?.fullName?.charAt(0).toUpperCase() || <UserOutlined />}
        </Avatar>
        <div style={{ minWidth: 0, flex: 1 }}>
          <Typography.Text strong ellipsis style={{ display: 'block', fontSize: 16, color: '#0f172a' }}>
            {user?.fullName}
          </Typography.Text>
          <Typography.Text ellipsis style={{ display: 'block', fontSize: 13, color: '#64748b' }}>
            {user?.email}
          </Typography.Text>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            <Chip color="#1d4ed8" background="#eff6ff">
              {user ? ROLE_LABELS[user.role] : ''}
            </Chip>
            {user?.branch ? (
              <Chip color="#047857" background="#ecfdf5">
                {user.branch.name}
              </Chip>
            ) : null}
          </div>
        </div>
        <RightOutlined style={{ fontSize: 12, color: '#cbd5e1', flexShrink: 0 }} />
      </button>

      {/* Field tools */}
      <Section label="Field tools">
        {can('TRAINING_VIEW') ? (
          <Row
            icon={<ReadOutlined />}
            iconColor="#4338ca"
            iconBg="#eef2ff"
            title="Training Sessions"
            subtitle={`${sessions} session${sessions === 1 ? '' : 's'}`}
            onClick={() => navigate('/more/training')}
          />
        ) : null}
        <Row
          icon={<CloudSyncOutlined />}
          iconColor="#b45309"
          iconBg="#fffbeb"
          title="Offline & sync"
          subtitle="Work saved on this device"
          trailing={syncStatus}
          onClick={() => navigate('/more/sync')}
        />
      </Section>

      <Section label="Account">
        <Row
          icon={<IdcardOutlined />}
          iconColor="#0f766e"
          iconBg="#f0fdfa"
          title="My Profile"
          subtitle="Personal details and password"
          onClick={() => navigate('/profile')}
        />
      </Section>

      {/* Session */}
      <div style={groupStyle}>
        <button
          type="button"
          onClick={signOut}
          style={{
            width: '100%',
            border: 'none',
            background: 'none',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            color: '#dc2626',
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <LogoutOutlined /> Sign out
        </button>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Typography.Text
        style={{
          display: 'block',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color: '#94a3b8',
          padding: '0 4px 8px',
        }}
      >
        {label}
      </Typography.Text>
      <div style={groupStyle} className="field-more-group">
        {children}
      </div>
    </div>
  );
}

function Row({
  icon,
  iconColor,
  iconBg,
  title,
  subtitle,
  trailing,
  onClick,
}: {
  icon: ReactNode;
  iconColor: string;
  iconBg: string;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="field-more-row"
      style={{
        width: '100%',
        border: 'none',
        background: 'none',
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <span
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: iconBg,
          color: iconColor,
          display: 'grid',
          placeItems: 'center',
          fontSize: 17,
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{title}</span>
        {subtitle ? <span style={{ display: 'block', fontSize: 12.5, color: '#64748b', marginTop: 1 }}>{subtitle}</span> : null}
      </span>
      {trailing}
      <RightOutlined style={{ fontSize: 12, color: '#cbd5e1', flexShrink: 0 }} />
    </button>
  );
}

function Chip({ children, color, background }: { children: ReactNode; color: string; background: string }) {
  return (
    <span style={{ fontSize: 11.5, fontWeight: 600, color, background, borderRadius: 6, padding: '2px 8px', lineHeight: '18px' }}>
      {children}
    </span>
  );
}

const TONES = {
  success: { color: '#047857', background: '#ecfdf5' },
  warning: { color: '#b45309', background: '#fffbeb' },
  danger: { color: '#b91c1c', background: '#fef2f2' },
};

function StatusPill({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) {
  return (
    <span
      style={{
        ...TONES[tone],
        fontSize: 12,
        fontWeight: 600,
        borderRadius: 999,
        padding: '3px 10px',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {children}
    </span>
  );
}
