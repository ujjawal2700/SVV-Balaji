import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CustomerServiceOutlined,
  InboxOutlined,
  MessageOutlined,
  PhoneOutlined,
  SearchOutlined,
  SendOutlined,
  ShoppingOutlined,
  UserOutlined,
  WhatsAppOutlined,
} from '@ant-design/icons';
import {
  App as AntApp,
  Badge,
  Button,
  Card,
  Col,
  Empty,
  Input,
  Row,
  Segmented,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiErrorMessage } from '@shared/api/client';
import type { SupportInboxRow } from '@shared/api/supportTickets';
import type { SupportTicketCategory, SupportTicketPriority, SupportTicketStatus } from '@shared/api/types';
import { useCan } from '@shared/auth/useCan';
import { useReplyToTicket, useSupportInbox, useSupportThread, useUpdateTicket } from '@shared/hooks/useSupportTickets';
import { PageHeader } from '../../components/PageHeader';

dayjs.extend(relativeTime);

const { Text } = Typography;

const STATUS_META: Record<SupportTicketStatus, { label: string; color: string }> = {
  OPEN: { label: 'Open', color: 'orange' },
  IN_PROGRESS: { label: 'In progress', color: 'blue' },
  RESOLVED: { label: 'Resolved', color: 'green' },
  CLOSED: { label: 'Closed', color: 'default' },
};

const PRIORITY_META: Record<SupportTicketPriority, { label: string; color: string }> = {
  HIGH: { label: 'High', color: 'red' },
  MEDIUM: { label: 'Medium', color: 'gold' },
  LOW: { label: 'Low', color: 'default' },
};

const CATEGORY_LABEL: Record<SupportTicketCategory, string> = {
  ORDER_ISSUE: 'Order issue',
  PAYMENT_REFUND: 'Payment / refund',
  DELIVERY_DELAY: 'Delivery',
  ACCOUNT_GST: 'Account / GST',
  OTHER: 'Other',
};

const QUICK_REPLIES = [
  "Thanks for reaching out! We're looking into this and will update you shortly.",
  "We're sorry for the trouble. Could you share a photo of the product so we can help faster?",
  'Your refund has been initiated and should reflect in 5–7 working days.',
  "This has been resolved. Please reply here if you need anything else — we're happy to help!",
];

type StatusTab = 'ALL' | SupportTicketStatus;

/** The help desk: every ticket raised from the customer and retailer apps, with a two-way conversation. */
export function SupportTicketsPage() {
  const canReply = useCan('SUPPORT_TICKETS_REPLY');
  const [statusTab, setStatusTab] = useState<StatusTab>('ALL');
  const [channel, setChannel] = useState<'ALL' | 'B2B' | 'B2C'>('ALL');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const inbox = useSupportInbox({
    status: statusTab === 'ALL' ? undefined : statusTab,
    channel: channel === 'ALL' ? undefined : channel,
    search,
  });
  const tickets = inbox.data?.tickets ?? [];
  const counts = inbox.data?.counts ?? {};
  const total = Object.values(counts).reduce((n, v) => n + (v ?? 0), 0);
  const awaiting = tickets.filter((t) => t.awaitingReply).length;

  // Keep a ticket selected on wide screens so the right pane is never empty.
  useEffect(() => {
    if (!selectedId && tickets.length > 0 && window.innerWidth >= 992) setSelectedId(tickets[0].id);
  }, [tickets, selectedId]);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="Support Tickets"
        subtitle="Requests raised by customers and retailers from their apps. Your replies appear in their Help & Support and order pages."
      />

      <Row gutter={[12, 12]}>
        <StatCard icon={<InboxOutlined />} label="Awaiting your reply" value={awaiting} tone="#dc2626" hint="Customer spoke last" />
        <StatCard icon={<ClockCircleOutlined />} label="Open" value={counts.OPEN ?? 0} tone="#ea580c" />
        <StatCard icon={<MessageOutlined />} label="In progress" value={counts.IN_PROGRESS ?? 0} tone="#2563eb" />
        <StatCard icon={<CheckCircleOutlined />} label="Resolved / closed" value={(counts.RESOLVED ?? 0) + (counts.CLOSED ?? 0)} tone="#16a34a" hint={`${total} total`} />
      </Row>

      <Card size="small" style={{ borderRadius: 10 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} md={9}>
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
              placeholder="Ticket no., subject, order no., customer name or phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Col>
          <Col xs={24} md={11}>
            <Segmented<StatusTab>
              block
              value={statusTab}
              onChange={(v) => setStatusTab(v)}
              options={[
                { label: `All (${total})`, value: 'ALL' },
                { label: `Open (${counts.OPEN ?? 0})`, value: 'OPEN' },
                { label: `In progress (${counts.IN_PROGRESS ?? 0})`, value: 'IN_PROGRESS' },
                { label: `Resolved (${counts.RESOLVED ?? 0})`, value: 'RESOLVED' },
                { label: `Closed (${counts.CLOSED ?? 0})`, value: 'CLOSED' },
              ]}
            />
          </Col>
          <Col xs={24} md={4}>
            <Select
              style={{ width: '100%' }}
              value={channel}
              onChange={setChannel}
              options={[
                { label: 'All customers', value: 'ALL' },
                { label: 'B2C customers', value: 'B2C' },
                { label: 'B2B retailers', value: 'B2B' },
              ]}
            />
          </Col>
        </Row>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={9}>
          <Card size="small" style={{ borderRadius: 10 }} bodyStyle={{ padding: 0, maxHeight: 'calc(100vh - 320px)', minHeight: 360, overflowY: 'auto' }}>
            {inbox.isLoading ? (
              <div style={{ padding: 40, textAlign: 'center' }}><Spin /></div>
            ) : tickets.length === 0 ? (
              <Empty style={{ padding: 40 }} description={search || statusTab !== 'ALL' || channel !== 'ALL' ? 'No tickets match these filters' : 'No support tickets yet'} />
            ) : (
              tickets.map((t) => <InboxItem key={t.id} ticket={t} active={t.id === selectedId} onClick={() => setSelectedId(t.id)} />)
            )}
          </Card>
        </Col>
        <Col xs={24} lg={15}>
          {selectedId ? (
            <Conversation id={selectedId} canReply={canReply} />
          ) : (
            <Card style={{ borderRadius: 10, minHeight: 360, display: 'grid', placeItems: 'center' }}>
              <Empty image={<CustomerServiceOutlined style={{ fontSize: 48, color: '#cbd5e1' }} />} description="Select a ticket to read and reply" />
            </Card>
          )}
        </Col>
      </Row>
    </Space>
  );
}

function StatCard({ icon, label, value, tone, hint }: { icon: React.ReactNode; label: string; value: number; tone: string; hint?: string }) {
  return (
    <Col xs={12} md={6}>
      <Card size="small" style={{ borderRadius: 10, borderLeft: `4px solid ${tone}` }}>
        <Space align="start" size={10}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: `${tone}14`, color: tone, display: 'grid', placeItems: 'center', fontSize: 16 }}>{icon}</div>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>{value}</div>
            {hint ? <Text type="secondary" style={{ fontSize: 11 }}>{hint}</Text> : null}
          </div>
        </Space>
      </Card>
    </Col>
  );
}

function InboxItem({ ticket: t, active, onClick }: { ticket: SupportInboxRow; active: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '12px 14px',
        borderBottom: '1px solid #f1f5f9',
        cursor: 'pointer',
        background: active ? '#eff6ff' : t.awaitingReply ? '#fffbeb' : '#fff',
        borderLeft: `3px solid ${active ? '#1677ff' : t.awaitingReply ? '#f59e0b' : 'transparent'}`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <Space size={6} style={{ minWidth: 0 }}>
          {t.awaitingReply ? <Badge status="error" /> : null}
          <Text strong ellipsis style={{ fontSize: 13, maxWidth: 190 }}>{t.customer.name}</Text>
          <Tag color={t.customer.channel === 'B2B' ? 'blue' : 'purple'} style={{ margin: 0, fontSize: 10 }}>{t.customer.channel}</Tag>
        </Space>
        <Text type="secondary" style={{ fontSize: 11, flexShrink: 0 }}>{dayjs(t.lastActivityAt).fromNow()}</Text>
      </div>
      <Text ellipsis style={{ display: 'block', fontSize: 13, marginTop: 2, color: '#1e293b' }}>{t.subject}</Text>
      <Text type="secondary" ellipsis style={{ display: 'block', fontSize: 12 }}>
        {t.lastMessage.author === 'STAFF' ? 'You: ' : ''}
        {t.lastMessage.preview}
      </Text>
      <Space size={4} style={{ marginTop: 6 }} wrap>
        <Tag color={STATUS_META[t.status].color} style={{ margin: 0, fontSize: 10 }}>{STATUS_META[t.status].label}</Tag>
        <Tag color={PRIORITY_META[t.priority].color} style={{ margin: 0, fontSize: 10 }}>{PRIORITY_META[t.priority].label}</Tag>
        <Text type="secondary" style={{ fontSize: 11 }}>{t.ticketNumber}</Text>
        {t.orderNumber ? <Text type="secondary" style={{ fontSize: 11 }}>· {t.orderNumber}</Text> : null}
      </Space>
    </div>
  );
}

function Conversation({ id, canReply }: { id: string; canReply: boolean }) {
  const { message } = AntApp.useApp();
  const thread = useSupportThread(id);
  const reply = useReplyToTicket();
  const update = useUpdateTicket();
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const t = thread.data;

  useEffect(() => setDraft(''), [id]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [t?.messages.length, id]);

  const messages = useMemo(() => {
    if (!t) return [];
    return [
      { id: 'opening', author: 'CUSTOMER' as const, body: t.description, createdAt: t.createdAt, staffName: null },
      ...t.messages,
    ];
  }, [t]);

  if (thread.isLoading || !t) {
    return (
      <Card style={{ borderRadius: 10, minHeight: 360, display: 'grid', placeItems: 'center' }}>
        <Spin />
      </Card>
    );
  }

  const closed = t.status === 'CLOSED';
  const send = () => {
    const body = draft.trim();
    if (!body) return;
    reply.mutate(
      { id: t.id, body },
      {
        onSuccess: () => {
          setDraft('');
          message.success('Reply sent — the customer will see it in their app');
        },
        onError: (e) => message.error(apiErrorMessage(e, 'Could not send the reply')),
      },
    );
  };

  const setStatus = (status: SupportTicketStatus) =>
    update.mutate(
      { id: t.id, status },
      {
        onSuccess: () => message.success(`Ticket marked ${STATUS_META[status].label.toLowerCase()}`),
        onError: (e) => message.error(apiErrorMessage(e, 'Could not update the ticket')),
      },
    );

  const phone = t.customer.phone.replace(/\D/g, '').slice(-10);

  return (
    <Card style={{ borderRadius: 10 }} bodyStyle={{ padding: 0 }}>
      {/* Ticket header */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <Text strong style={{ fontSize: 16, display: 'block' }}>{t.subject}</Text>
            <Space size={6} wrap style={{ marginTop: 4 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>{t.ticketNumber}</Text>
              <Tag style={{ margin: 0 }}>{CATEGORY_LABEL[t.category]}</Tag>
              {t.orderNumber ? (
                <Tag icon={<ShoppingOutlined />} color="geekblue" style={{ margin: 0 }}>{t.orderNumber}</Tag>
              ) : null}
              <Text type="secondary" style={{ fontSize: 12 }}>Raised {dayjs(t.createdAt).format('D MMM YYYY, h:mm A')}</Text>
            </Space>
          </div>
          <Space wrap>
            <Select<SupportTicketPriority>
              size="small"
              value={t.priority}
              disabled={!canReply}
              style={{ width: 110 }}
              onChange={(priority) => update.mutate({ id: t.id, priority }, { onError: (e) => message.error(apiErrorMessage(e, 'Could not update')) })}
              options={(Object.keys(PRIORITY_META) as SupportTicketPriority[]).map((p) => ({ value: p, label: `${PRIORITY_META[p].label} priority` }))}
            />
            <Select<SupportTicketStatus>
              size="small"
              value={t.status}
              disabled={!canReply}
              style={{ width: 130 }}
              onChange={setStatus}
              options={(Object.keys(STATUS_META) as SupportTicketStatus[]).map((s) => ({ value: s, label: STATUS_META[s].label }))}
            />
          </Space>
        </div>

        <div style={{ marginTop: 10, background: '#f8fafc', borderRadius: 8, padding: '8px 12px', display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12.5 }}>
          <span><UserOutlined /> {t.customer.name} <Text type="secondary">({t.customer.customerCode})</Text></span>
          <span><PhoneOutlined /> {t.customer.phone}</span>
          {phone.length === 10 ? (
            <a href={`https://wa.me/91${phone}`} target="_blank" rel="noreferrer" style={{ color: '#16a34a' }}>
              <WhatsAppOutlined /> WhatsApp
            </a>
          ) : null}
          <Link to={t.customer.channel === 'B2B' ? `/b2b-customers/${t.customer.id}` : `/b2c-customers/${t.customer.id}`}>View profile</Link>
        </div>
      </div>

      {/* Messages */}
      <div style={{ padding: '16px 18px', background: '#f8fafc', maxHeight: 'calc(100vh - 470px)', minHeight: 240, overflowY: 'auto' }}>
        {messages.map((m) => {
          const staff = m.author === 'STAFF';
          return (
            <div key={m.id} style={{ display: 'flex', justifyContent: staff ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
              <div style={{ maxWidth: '78%' }}>
                <div
                  style={{
                    background: staff ? '#1677ff' : '#fff',
                    color: staff ? '#fff' : '#0f172a',
                    border: staff ? 'none' : '1px solid #e2e8f0',
                    borderRadius: staff ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    padding: '9px 13px',
                    fontSize: 13.5,
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {m.body}
                </div>
                <Text type="secondary" style={{ fontSize: 11, display: 'block', textAlign: staff ? 'right' : 'left', marginTop: 3 }}>
                  {staff ? m.staffName ?? 'Support team' : t.customer.name} · {dayjs(m.createdAt).format('D MMM, h:mm A')}
                </Text>
              </div>
            </div>
          );
        })}
        {t.status === 'RESOLVED' || t.status === 'CLOSED' ? (
          <div style={{ textAlign: 'center', margin: '8px 0' }}>
            <Tag color={t.status === 'CLOSED' ? 'default' : 'green'}>
              {STATUS_META[t.status].label}
              {t.resolvedBy ? ` by ${t.resolvedBy.fullName}` : ''}
              {t.resolvedAt ? ` · ${dayjs(t.resolvedAt).format('D MMM, h:mm A')}` : ''}
            </Tag>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {/* Reply box */}
      <div style={{ padding: '12px 18px 16px', borderTop: '1px solid #f1f5f9' }}>
        {!canReply ? (
          <Text type="secondary">You can read this ticket but don't have permission to reply.</Text>
        ) : closed ? (
          <Space>
            <Text type="secondary">This ticket is closed.</Text>
            <Button size="small" onClick={() => setStatus('IN_PROGRESS')}>Reopen</Button>
          </Space>
        ) : (
          <>
            <Space size={6} wrap style={{ marginBottom: 8 }}>
              {QUICK_REPLIES.map((q) => (
                <Tooltip key={q} title={q}>
                  <Tag style={{ cursor: 'pointer', margin: 0 }} onClick={() => setDraft(q)}>
                    {q.slice(0, 28)}…
                  </Tag>
                </Tooltip>
              ))}
            </Space>
            <Input.TextArea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Reply to ${t.customer.name}…  (Ctrl+Enter to send)`}
              autoSize={{ minRows: 2, maxRows: 6 }}
              maxLength={2000}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send();
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 8, flexWrap: 'wrap' }}>
              {t.status !== 'RESOLVED' ? (
                <Button icon={<CheckCircleOutlined />} loading={update.isPending} onClick={() => setStatus('RESOLVED')}>
                  Mark resolved
                </Button>
              ) : (
                <span />
              )}
              <Button type="primary" icon={<SendOutlined />} loading={reply.isPending} disabled={!draft.trim()} onClick={send}>
                Send reply
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

