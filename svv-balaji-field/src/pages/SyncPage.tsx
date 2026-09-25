import { CloudSyncOutlined, DeleteOutlined, RedoOutlined } from '@ant-design/icons';
import { App as AntApp, Button, Empty, Space, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useAuth } from '@shared/auth/useAuth';
import { SyncedIcon } from '../offline/OfflineBar';
import { useOutbox, type OutboxItem } from '../offline/outbox';
import { discardItem, retryAllFailed, retryItem, syncNow } from '../offline/sync';

/**
 * Offline & sync - everything saved on this device that the server has not
 * accepted yet, and why, with the controls to deal with it.
 */
export function FieldSyncPage() {
  const { user } = useAuth();
  const { message, modal } = AntApp.useApp();
  const { items, online, syncing, lastSyncAt, lastSyncError } = useOutbox();
  const mine = items.filter((i) => i.userId === user?.id);
  const failed = mine.filter((i) => i.status === 'failed');
  const pending = mine.filter((i) => i.status === 'pending');

  const runSync = async () => {
    const r = await syncNow();
    if (r.sent || r.failed) message.info(`${r.sent} synced${r.failed ? `, ${r.failed} could not be synced` : ''}`);
  };

  const discard = (item: OutboxItem) =>
    modal.confirm({
      title: 'Discard this change?',
      content: `"${item.label}" will be removed from this device and never sent. This cannot be undone.`,
      okText: 'Discard',
      okButtonProps: { danger: true },
      onOk: () => discardItem(item),
    });

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          <CloudSyncOutlined /> Offline & sync
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ margin: '4px 0 12px' }}>
          Work saved with no connection is kept on this device and sent automatically, in order, as soon as you are back
          online. Photos taken offline upload with the change they belong to.
        </Typography.Paragraph>
        <Space wrap>
          <Tag color={online ? 'green' : 'orange'}>{online ? 'Online' : 'Offline'}</Tag>
          <Tag>{pending.length} waiting</Tag>
          <Tag color={failed.length ? 'red' : undefined}>{failed.length} need attention</Tag>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {lastSyncAt ? `Last synced ${dayjs(lastSyncAt).format('D MMM, h:mm A')}` : 'Not synced yet on this device'}
          </Typography.Text>
        </Space>
        {lastSyncError ? (
          <Typography.Paragraph type="danger" style={{ margin: '8px 0 0', fontSize: 13 }}>
            {lastSyncError}
          </Typography.Paragraph>
        ) : null}
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button type="primary" icon={<CloudSyncOutlined />} loading={syncing} disabled={!online || !pending.length} onClick={runSync}>
            Sync now
          </Button>
          {failed.length ? (
            <Button icon={<RedoOutlined />} disabled={!online || syncing} onClick={() => void retryAllFailed()}>
              Retry all that failed
            </Button>
          ) : null}
        </div>
      </div>

      {mine.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24 }}>
          <Empty
            image={<SyncedIcon style={{ fontSize: 40, color: '#16a34a' }} />}
            description="Everything is synced. Nothing is waiting on this device."
          />
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12 }}>
          {mine.map((item) => (
            <div key={item.seq} style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Typography.Text strong>{item.label}</Typography.Text>
                  {item.status === 'failed' ? <Tag color="red">Not accepted</Tag> : <Tag color="blue">Waiting</Tag>}
                </div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Saved {dayjs(item.createdAt).format('D MMM, h:mm A')}
                  {item.attempts ? ` · ${item.attempts} attempt${item.attempts === 1 ? '' : 's'}` : ''}
                </Typography.Text>
                {item.error ? (
                  <Typography.Paragraph type="danger" style={{ margin: '4px 0 0', fontSize: 13 }}>
                    Server: {item.error}
                  </Typography.Paragraph>
                ) : null}
              </div>
              {item.status === 'failed' ? (
                <Space direction="vertical" size={4}>
                  <Button size="small" icon={<RedoOutlined />} disabled={!online || syncing} onClick={() => void retryItem(item)}>
                    Retry
                  </Button>
                  <Button size="small" danger icon={<DeleteOutlined />} onClick={() => discard(item)}>
                    Discard
                  </Button>
                </Space>
              ) : null}
            </div>
          ))}
        </div>
      )}
      {failed.length ? (
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          A change is "not accepted" when the server refuses it — for example the seed lot ran out, or the farmer was
          changed by someone else meanwhile. Correct the record on its screen and retry, or discard it.
        </Typography.Paragraph>
      ) : null}
    </Space>
  );
}
