import { CloudSyncOutlined, DeleteOutlined, RedoOutlined } from '@ant-design/icons';
import { App as AntApp, Button, Space, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useAuth } from '@shared/auth/useAuth';
import { SyncedIcon } from '../offline/OfflineBar';
import { useOutbox, type OutboxItem } from '../offline/outbox';
import { discardItem, retryAllFailed, retryItem, syncNow } from '../offline/sync';
import { FieldEmpty, FieldPageHeader } from './pieces';

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
      <FieldPageHeader
        title="Offline & sync"
        subtitle="Work saved without a connection is kept on this device and sent automatically, in order, once you are back online."
      />

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
          <span
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              display: 'grid',
              placeItems: 'center',
              fontSize: 18,
              flexShrink: 0,
              background: online ? '#ecfdf5' : '#fffbeb',
              color: online ? '#047857' : '#b45309',
            }}
          >
            <CloudSyncOutlined />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Typography.Text strong style={{ display: 'block', fontSize: 15 }}>
              {online ? 'Online' : 'Offline — changes are saved on this device'}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
              {lastSyncAt ? `Last synced ${dayjs(lastSyncAt).format('D MMM, h:mm A')}` : 'Not synced yet on this device'}
            </Typography.Text>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid #f1f5f9' }}>
          <Stat label="Waiting" value={pending.length} color={pending.length ? '#b45309' : '#0f172a'} />
          <Stat label="Not accepted" value={failed.length} color={failed.length ? '#dc2626' : '#0f172a'} divider />
        </div>

        {lastSyncError ? (
          <Typography.Paragraph type="danger" style={{ margin: 0, padding: '0 16px 12px', fontSize: 13 }}>
            {lastSyncError}
          </Typography.Paragraph>
        ) : null}

        {pending.length || failed.length ? (
          <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: '1px solid #f1f5f9' }}>
            <Button type="primary" block icon={<CloudSyncOutlined />} loading={syncing} disabled={!online || !pending.length} onClick={runSync}>
              Sync now
            </Button>
            {failed.length ? (
              <Button block icon={<RedoOutlined />} disabled={!online || syncing} onClick={() => void retryAllFailed()}>
                Retry failed
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {mine.length === 0 ? (
        <FieldEmpty
          icon={<SyncedIcon style={{ color: '#16a34a' }} />}
          text="Everything is synced. Nothing is waiting on this device."
        />
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
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

function Stat({ label, value, color, divider }: { label: string; value: number; color: string; divider?: boolean }) {
  return (
    <div style={{ padding: '12px 16px', borderLeft: divider ? '1px solid #f1f5f9' : undefined }}>
      <div style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#64748b' }}>{label}</div>
    </div>
  );
}
