import { ArrowLeftOutlined, BellOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Empty, Spin, Skeleton } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { INBOX_KEY, notificationsApi, type InboxItem } from '../api/notifications';
import { useInbox } from '../notifications/useUnreadNotifications';
import { enablePush, pushPermission, type PushState } from '../push';

import { DesktopPageHeader } from '../layout/DesktopPageHeader';
function when(iso: string) {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} h ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

/** Order updates and Desi Tokri messages, including those created while signed out. */
export function NotificationsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const inbox = useInbox();
  const [permission, setPermission] = useState<PushState | null>(null);
  useEffect(() => {
    void pushPermission().then(setPermission);
  }, []);

  const markRead = useMutation({
    mutationFn: (ids?: string[]) => notificationsApi.markRead(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: INBOX_KEY }),
  });

  const open = (n: InboxItem) => {
    if (!n.readAt) markRead.mutate([n.id]);
    if (n.link) navigate(n.link);
  };

  const turnOn = async () => setPermission(await enablePush(notificationsApi.registerDevice, true).catch(() => 'default' as PushState));

  const items = inbox.data?.items ?? [];
  return (
    <>
    <DesktopPageHeader
      title="Notifications"
      subtitle="Order updates, offers and messages from Desi Tokri."
      crumbs={[{ label: 'My Account', to: '/profile' }, { label: 'Notifications' }]}
      actions={
        inbox.data?.unread ? (
          <Button onClick={() => markRead.mutate(undefined)} style={{ borderRadius: 10, fontWeight: 600, color: '#059669', borderColor: '#a7f3d0' }}>
            Mark all read
          </Button>
        ) : undefined
      }
    />
    <div className="store-container dk-readable" style={{ maxWidth: 720, margin: '0 auto', padding: '16px 16px 96px' }}>
      <div className="mobile-flex" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button aria-label="Back" onClick={() => navigate(-1)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 4 }}>
          <ArrowLeftOutlined style={{ fontSize: 18 }} />
        </button>
        <h2 style={{ margin: 0, fontSize: 20, flex: 1 }}>Notifications</h2>
        {inbox.data?.unread ? (
          <Button type="link" onClick={() => markRead.mutate(undefined)} style={{ color: '#059669' }}>
            Mark all read
          </Button>
        ) : null}
      </div>

      {permission === 'default' || permission === 'denied' ? (
        <div
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            borderRadius: 14,
            padding: 14,
            marginBottom: 14,
          }}
        >
          <BellOutlined style={{ fontSize: 22, color: '#059669' }} />
          <div style={{ flex: 1, fontSize: 13, color: '#065f46' }}>
            {permission === 'denied'
              ? 'Notifications are blocked. Allow them in your browser settings to get order updates and offers instantly.'
              : 'Turn on notifications to get order updates and offers instantly, even when the app is closed.'}
          </div>
          {permission === 'default' ? (
            <Button type="primary" style={{ background: '#059669', borderColor: '#059669' }} onClick={() => void turnOn()}>
              Turn on
            </Button>
          ) : null}
        </div>
      ) : null}

      {inbox.isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ background: '#fff', borderRadius: 12, border: '1px solid #ece9e4', padding: 16 }}>
              <Skeleton active avatar={{ size: 40 }} title={{ width: '45%' }} paragraph={{ rows: 1 }} />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <Empty description="No notifications yet" style={{ padding: 48 }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((n) => (
            <div
              key={n.id}
              onClick={() => open(n)}
              style={{
                display: 'flex',
                gap: 12,
                padding: 14,
                borderRadius: 14,
                cursor: n.link || !n.readAt ? 'pointer' : 'default',
                background: n.readAt ? '#ffffff' : '#f0fdf4',
                border: `1px solid ${n.readAt ? '#e2e8f0' : '#bbf7d0'}`,
              }}
            >
              <img src="/images/desi-tokri-emblem.png" alt="Desi Tokri" style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 20 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong style={{ fontSize: 15, color: '#0f172a' }}>{n.title}</strong>
                  {!n.readAt ? (
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: '#16a34a', marginTop: 6, flexShrink: 0 }} />
                  ) : null}
                </div>
                <div style={{ fontSize: 13, color: '#475569', whiteSpace: 'pre-wrap', marginTop: 2 }}>{n.body}</div>
                {n.imageUrl ? <img src={n.imageUrl} alt="" style={{ width: '100%', borderRadius: 10, marginTop: 8 }} /> : null}
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>{when(n.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    </>
  );
}
