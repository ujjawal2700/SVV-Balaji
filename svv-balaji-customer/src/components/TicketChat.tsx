import { CustomerServiceOutlined, SendOutlined } from '@ant-design/icons';
import { Button, Drawer, Input, Skeleton, Tag, Typography, message } from 'antd';
import { useEffect, useRef, useState } from 'react';
import type { SupportTicketStatus } from '../api/supportTickets';
import { useReplyToSupportTicket, useSupportTicketThread } from '../hooks/useSupportTickets';

const STATUS: Record<SupportTicketStatus, { label: string; color: string }> = {
  OPEN: { label: 'Open', color: 'orange' },
  IN_PROGRESS: { label: 'In progress', color: 'blue' },
  RESOLVED: { label: 'Resolved', color: 'green' },
  CLOSED: { label: 'Closed', color: 'default' },
};

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * A support ticket as a chat: the customer's opening message, every reply from
 * the support team, and a box to answer back. Staff are always shown as
 * "Support team", never by name.
 */
export function TicketChat({ ticketId, accent = '#ea580c', onClose }: { ticketId: string | null; accent?: string; onClose: () => void }) {
  const thread = useSupportTicketThread(ticketId);
  const reply = useReplyToSupportTicket();
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const t = thread.data;

  useEffect(() => setDraft(''), [ticketId]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [t?.messages.length, ticketId]);

  const send = () => {
    const body = draft.trim();
    if (!t || !body) return;
    reply.mutate(
      { id: t.id, body },
      {
        onSuccess: () => setDraft(''),
        onError: (e: unknown) => {
          const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
          message.error(typeof msg === 'string' ? msg : 'Could not send your message');
        },
      },
    );
  };

  const messages = t
    ? [{ id: 'opening', author: 'CUSTOMER' as const, body: t.description, createdAt: t.createdAt }, ...t.messages]
    : [];

  return (
    <Drawer
      open={Boolean(ticketId)}
      onClose={onClose}
      placement="bottom"
      height="88%"
      title={
        t ? (
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>{t.subject}</div>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 400, marginTop: 2 }}>
              {t.ticketNumber}
              {t.orderNumber ? ` · Order ${t.orderNumber}` : ''} · <Tag color={STATUS[t.status].color} style={{ margin: 0, fontSize: 10 }}>{STATUS[t.status].label}</Tag>
            </div>
          </div>
        ) : (
          'Support request'
        )
      }
      styles={{
        content: { borderRadius: '16px 16px 0 0' },
        body: { padding: 0, display: 'flex', flexDirection: 'column', background: '#f8fafc' },
      }}
    >
      {!t ? (
        <div style={{ padding: 16 }}>
          <Skeleton active paragraph={{ rows: 4 }} />
        </div>
      ) : (
        <>
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            {messages.map((m) => {
              const mine = m.author === 'CUSTOMER';
              return (
                <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
                  {!mine ? (
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#e0f2fe', color: '#0369a1', display: 'grid', placeItems: 'center', marginRight: 8, flexShrink: 0 }}>
                      <CustomerServiceOutlined />
                    </div>
                  ) : null}
                  <div style={{ maxWidth: '80%' }}>
                    <div
                      style={{
                        background: mine ? accent : '#fff',
                        color: mine ? '#fff' : '#0f172a',
                        border: mine ? 'none' : '1px solid #e2e8f0',
                        borderRadius: mine ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                        padding: '9px 13px',
                        fontSize: 13.5,
                        lineHeight: 1.5,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {m.body}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3, textAlign: mine ? 'right' : 'left' }}>
                      {mine ? 'You' : 'Support team'} · {when(m.createdAt)}
                    </div>
                  </div>
                </div>
              );
            })}
            {t.messages.every((m) => m.author !== 'STAFF') && t.status !== 'CLOSED' ? (
              <div style={{ textAlign: 'center', fontSize: 12, color: '#64748b', margin: '8px 0' }}>
                Our support team will reply here soon. We'll keep this conversation updated.
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>

          <div style={{ padding: '10px 12px calc(12px + env(safe-area-inset-bottom, 0px))', background: '#fff', borderTop: '1px solid #e2e8f0' }}>
            {t.status === 'CLOSED' ? (
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                This request is closed. Please raise a new one if you still need help.
              </Typography.Text>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <Input.TextArea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={t.status === 'RESOLVED' ? 'Still need help? Reply to reopen…' : 'Type your message…'}
                  autoSize={{ minRows: 1, maxRows: 4 }}
                  maxLength={2000}
                  style={{ borderRadius: 12 }}
                />
                <Button
                  type="primary"
                  shape="circle"
                  size="large"
                  icon={<SendOutlined />}
                  loading={reply.isPending}
                  disabled={!draft.trim()}
                  onClick={send}
                  style={{ background: accent, borderColor: accent, flexShrink: 0 }}
                />
              </div>
            )}
          </div>
        </>
      )}
    </Drawer>
  );
}
