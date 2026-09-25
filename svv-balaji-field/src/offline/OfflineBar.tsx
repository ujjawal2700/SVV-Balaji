import { CheckCircleOutlined, CloudSyncOutlined, DisconnectOutlined, ExclamationCircleOutlined, SyncOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { App as AntApp } from 'antd';
import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@shared/auth/useAuth';
import { useOutbox } from './outbox';
import { clearQueryCache } from './persist';
import { syncNow } from './sync';
import { warmUp } from './warmup';

/**
 * The one line that tells the field expert where their work stands:
 *
 *   offline, N saved on this device  - amber, always visible while offline
 *   syncing N                         - blue
 *   N could not sync                  - red, opens the Sync screen
 *   nothing to say                    - hidden
 *
 * Also warms the device up (warmup.ts) whenever it has signal.
 */
export function OfflineBar() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const { user } = useAuth();
  const { items, online, syncing } = useOutbox();
  const mine = items.filter((i) => i.userId === user?.id);
  const pending = mine.filter((i) => i.status === 'pending').length;
  const failed = mine.filter((i) => i.status === 'failed').length;

  useEffect(() => {
    if (user && online) warmUp(client, user);
  }, [user, online, client]);

  let tone: { bg: string; fg: string; border: string } | null = null;
  let icon = null;
  let text = '';
  if (!online) {
    tone = { bg: '#fffbeb', fg: '#92400e', border: '#fde68a' };
    icon = <DisconnectOutlined />;
    text = pending
      ? `Offline — ${pending} change${pending === 1 ? '' : 's'} saved on this device. They sync automatically when you are back online.`
      : 'Offline — you can keep working. Changes are saved on this device and sync when you are back online.';
  } else if (syncing) {
    tone = { bg: '#eff6ff', fg: '#1e40af', border: '#bfdbfe' };
    icon = <SyncOutlined spin />;
    text = `Syncing ${pending} change${pending === 1 ? '' : 's'}…`;
  } else if (failed) {
    tone = { bg: '#fef2f2', fg: '#991b1b', border: '#fecaca' };
    icon = <ExclamationCircleOutlined />;
    text = `${failed} change${failed === 1 ? '' : 's'} could not be synced — tap to review.`;
  } else if (pending) {
    tone = { bg: '#eff6ff', fg: '#1e40af', border: '#bfdbfe' };
    icon = <CloudSyncOutlined />;
    text = `${pending} change${pending === 1 ? '' : 's'} waiting to sync — tap to sync now.`;
  }
  if (!tone) return null;

  return (
    <button
      type="button"
      onClick={() => (failed || !online ? navigate('/more/sync') : void syncNow())}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        textAlign: 'left',
        padding: '8px 12px',
        marginBottom: 12,
        borderRadius: 10,
        background: tone.bg,
        color: tone.fg,
        border: `1px solid ${tone.border}`,
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
      }}
    >
      {icon}
      <span style={{ flex: 1 }}>{text}</span>
    </button>
  );
}

/** "Waiting to sync" marker for a record saved on the device. */
export function PendingTag() {
  return (
    <span
      title="Saved on this device — waiting to sync"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        background: '#fffbeb',
        color: '#92400e',
        border: '1px solid #fde68a',
      }}
    >
      <CloudSyncOutlined style={{ fontSize: 11 }} /> Waiting to sync
    </span>
  );
}

/** Small "all synced" confirmation used on the Sync screen. */
export const SyncedIcon = CheckCircleOutlined;

/**
 * Sign-out that does not lose work. With changes still waiting, the expert is
 * told and asked; the changes stay on the device (tagged to them) and sync the
 * next time they sign in. The saved screens' data is wiped either way.
 */
export function useSafeLogout() {
  const { user, logout } = useAuth();
  const { items } = useOutbox();
  const { modal } = AntApp.useApp();
  const client = useQueryClient();
  const waiting = items.filter((i) => i.userId === user?.id).length;

  /** `confirmed`: the caller already told the user about waiting changes. */
  return useCallback(async (opts?: { confirmed?: boolean }) => {
    const doLogout = async () => {
      await clearQueryCache(user?.id);
      client.clear();
      await logout();
    };
    if (!waiting || opts?.confirmed) return doLogout();
    await new Promise<void>((resolve) => {
      modal.confirm({
        title: `${waiting} change${waiting === 1 ? ' has' : 's have'} not synced yet`,
        content:
          'Sign out anyway? They stay on this device and sync the next time you sign in here. ' +
          'If you can, connect first and let them sync.',
        okText: 'Sign out',
        cancelText: 'Stay signed in',
        onOk: async () => {
          await doLogout();
          resolve();
        },
        onCancel: () => resolve(),
      });
    });
  }, [waiting, user?.id, client, logout, modal]);
}
