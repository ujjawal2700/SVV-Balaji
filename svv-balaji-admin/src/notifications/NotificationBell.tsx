import { BellOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Empty, Popover, Space, Typography } from 'antd';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PUSH_KEYS, pushNotificationsApi, type InboxItem } from '@shared/api/pushNotifications';
import { enablePush, pushPermission, type PushState } from '../push';

dayjs.extend(relativeTime);

/** Header bell: messages sent to this staff member, including ones that arrived while signed out. */
export function NotificationBell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState<PushState | null>(null);

  const inbox = useQuery({
    queryKey: PUSH_KEYS.inbox,
    queryFn: pushNotificationsApi.inbox,
    refetchInterval: 60_000,
  });
  const markRead = useMutation({
    mutationFn: (ids?: string[]) => pushNotificationsApi.markRead(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: PUSH_KEYS.inbox }),
  });

  const onOpen = (next: boolean) => {
    setOpen(next);
    if (next) void pushPermission().then(setPermission);
  };

  const turnOn = async () => {
    const state = await enablePush((t) => pushNotificationsApi.registerDevice(t, 'ADMIN'), true).catch(() => 'default' as PushState);
    setPermission(state);
  };

  const openItem = (n: InboxItem) => {
    if (!n.readAt) markRead.mutate([n.id]);
    if (n.link) {
      setOpen(false);
      navigate(n.link);
    }
  };

  const items = inbox.data?.items ?? [];
  const content = (
    <div style={{ width: 360, maxHeight: 440, overflowY: 'auto' }}>
      {permission === 'default' || permission === 'denied' ? (
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: 10, marginBottom: 8, fontSize: 12 }}>
          {permission === 'denied'
            ? 'Notifications are blocked for this site. Allow them in the browser\'s site settings to get pop-ups.'
            : 'Get these as pop-ups on this device, even when the panel is closed.'}
          {permission === 'default' ? (
            <Button size="small" type="primary" style={{ marginLeft: 8 }} onClick={() => void turnOn()}>
              Turn on
            </Button>
          ) : null}
        </div>
      ) : null}
      {items.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No notifications yet" />
      ) : (
        items.map((n) => (
          <div
            key={n.id}
            onClick={() => openItem(n)}
            style={{
              padding: '10px 8px',
              borderBottom: '1px solid #f1f5f9',
              cursor: 'pointer',
              background: n.readAt ? 'transparent' : '#f0fdf4',
              borderRadius: 6,
              display: 'flex',
              gap: 10,
            }}
          >
            <img src={`${import.meta.env.BASE_URL}svv-balaji.png`} alt="" style={{ width: 32, height: 32, flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <Typography.Text strong={!n.readAt}>{n.title}</Typography.Text>
              <div style={{ fontSize: 12, color: '#475569', whiteSpace: 'pre-wrap' }}>{n.body}</div>
              {n.imageUrl ? <img src={n.imageUrl} alt="" style={{ marginTop: 6, maxWidth: '100%', borderRadius: 6 }} /> : null}
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{dayjs(n.createdAt).fromNow()}</div>
            </div>
          </div>
        ))
      )}
    </div>
  );

  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      open={open}
      onOpenChange={onOpen}
      title={
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <span>Notifications</span>
          {inbox.data?.unread ? (
            <Button type="link" size="small" onClick={() => markRead.mutate(undefined)}>
              Mark all read
            </Button>
          ) : null}
        </Space>
      }
      content={content}
    >
      <Badge count={inbox.data?.unread ?? 0} size="small" offset={[-4, 4]}>
        <Button type="text" aria-label="Notifications" icon={<BellOutlined style={{ fontSize: 18 }} />} />
      </Badge>
    </Popover>
  );
}
