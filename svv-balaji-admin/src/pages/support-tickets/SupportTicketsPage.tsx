import {
  ArrowLeftOutlined,
  BarcodeOutlined,
  CheckCircleOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  CopyOutlined,
  CustomerServiceOutlined,
  DollarOutlined,
  DownOutlined,
  ExportOutlined,
  EyeOutlined,
  FileProtectOutlined,
  PhoneOutlined,
  ReloadOutlined,
  RocketOutlined,
  SearchOutlined,
  SendOutlined,
  ShoppingOutlined,
  SyncOutlined,
  ThunderboltOutlined,
  UpOutlined,
  UserOutlined,
  WhatsAppOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Avatar,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Drawer,
  Dropdown,
  Empty,
  Grid,
  Image,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { apiErrorMessage } from '@shared/api/client';
import type { SupportInboxRow, SupportResolutionAction, SupportTicketProduct, SupportTicketThread } from '@shared/api/supportTickets';
import type { SupportTicketCategory, SupportTicketPriority, SupportTicketStatus } from '@shared/api/types';
import { useCan } from '@shared/auth/useCan';
import {
  SUPPORT_TICKETS_KEY,
  useReplyToTicket,
  useResolveTicket,
  useSupportInbox,
  useSupportThread,
  useUpdateTicket,
} from '@shared/hooks/useSupportTickets';
import { PageHeader } from '../../components/PageHeader';
import { useTicketSocketEvents } from '../../live/adminSocket';

dayjs.extend(relativeTime);

const { Text } = Typography;

const STATUS_META: Record<SupportTicketStatus, { label: string; color: string; dot: string; bg: string }> = {
  OPEN: { label: 'Open', color: 'orange', dot: '#f97316', bg: '#fff7ed' },
  IN_PROGRESS: { label: 'In progress', color: 'blue', dot: '#2563eb', bg: '#eff6ff' },
  RESOLVED: { label: 'Resolved', color: 'green', dot: '#16a34a', bg: '#f0fdf4' },
  CLOSED: { label: 'Closed', color: 'default', dot: '#94a3b8', bg: '#f8fafc' },
};

const PRIORITY_META: Record<SupportTicketPriority, { label: string; color: string }> = {
  HIGH: { label: 'High Priority', color: '#dc2626' },
  MEDIUM: { label: 'Medium Priority', color: '#d97706' },
  LOW: { label: 'Low Priority', color: '#64748b' },
};

const CATEGORY_LABEL: Record<SupportTicketCategory, string> = {
  ORDER_ISSUE: 'Order Issue',
  PAYMENT_REFUND: 'Refund',
  DELIVERY_DELAY: 'Delivery',
  ACCOUNT_GST: 'Account',
  OTHER: 'Support',
};

const QUICK_REPLIES = [
  { key: 'ack', label: 'Acknowledge', text: "Thanks for reaching out! We are checking this immediately and will resolve it shortly." },
  { key: 'photo', label: 'Ask for photo', text: "We're sorry for the inconvenience. Could you please share a photo of the received product so we can expedite your resolution?" },
  { key: 'refund', label: 'Refund initiated', text: 'We have approved and initiated the refund for this order. It will reflect in your account within 24–48 hours.' },
  { key: 'replacement', label: 'Replacement dispatched', text: 'We have scheduled a fresh replacement batch for priority delivery to your address.' },
  { key: 'resolved', label: 'Mark resolved', text: 'This request has been resolved. If you need any further help, feel free to reply right here anytime!' },
];

const PANE_HEIGHT = 'max(560px, calc(100vh - 180px))';
const BORDER = '1px solid #eef2f6';

type StatusTab = 'ALL' | SupportTicketStatus;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?';

/** Parses product name, issue reason, and fallback image from subject */
export function parseTicketDetails(subject: string, ticketProduct?: SupportTicketProduct | null) {
  let productName = ticketProduct?.name || '';
  let issueType = '';
  let reason = '';

  const cleanSubject = subject.replace(/^\[.*?\]\s*/, '').trim();
  const regexWithReason = /^(.*?)\s+for\s+(.*?)\s*\((.*?)\)$/i;
  const match = cleanSubject.match(regexWithReason);

  if (match) {
    issueType = match[1].trim();
    if (!productName) productName = match[2].trim();
    reason = match[3].trim();
  } else {
    const regexWithoutReason = /^(.*?)\s+for\s+(.*)$/i;
    const match2 = cleanSubject.match(regexWithoutReason);
    if (match2) {
      issueType = match2[1].trim();
      if (!productName) productName = match2[2].trim();
    } else {
      issueType = cleanSubject;
    }
  }

  let imageUrl = ticketProduct?.imageUrl;
  if (!imageUrl || imageUrl.includes('null')) {
    const lower = (productName + ' ' + subject).toLowerCase();
    if (lower.includes('spice') || lower.includes('dalchini') || lower.includes('cardamom') || lower.includes('pepper') || lower.includes('clove')) {
      imageUrl = '/images/cat_spices.jpg';
    } else if (lower.includes('atta') || lower.includes('flour') || lower.includes('wheat') || lower.includes('besan') || lower.includes('maida')) {
      imageUrl = '/images/premium_atta.jpg';
    } else if (lower.includes('bhujia') || lower.includes('namkeen') || lower.includes('sev') || lower.includes('mixture')) {
      imageUrl = '/images/aloo_bhujia.jpg';
    } else if (lower.includes('chip') || lower.includes('wafer') || lower.includes('tortilla')) {
      imageUrl = '/images/cat_wafers.jpg';
    } else {
      imageUrl = '/images/cat_spices.jpg';
    }
  }

  return {
    productName: productName || 'Order Product',
    issueType: issueType || 'Support Request',
    reason,
    imageUrl,
    cleanSubject,
  };
}

const RESOLUTION_ACTION_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  REFUND_APPROVED: { label: 'Refund Approved', color: 'green', icon: <DollarOutlined /> },
  REPLACEMENT_DISPATCHED: { label: 'Replacement Dispatched', color: 'blue', icon: <RocketOutlined /> },
  REVERSE_PICKUP: { label: 'Reverse Pickup', color: 'orange', icon: <SyncOutlined /> },
  REJECTED: { label: 'Rejected', color: 'red', icon: <CloseCircleOutlined /> },
};

const formatCurrency = (v: number) => `₹${v.toLocaleString('en-IN')}`;

/** Slide-out Resolution & Inspection Drawer — ported from ComplaintsPage, now uses real data */
function ResolutionDrawer({
  open,
  thread,
  canReply,
  onClose,
}: {
  open: boolean;
  thread: SupportTicketThread | null;
  canReply: boolean;
  onClose: () => void;
}) {
  const { message: msg } = AntApp.useApp();
  const resolve = useResolveTicket();
  const [actionType, setActionType] = useState<SupportResolutionAction | null>(null);
  const [auditNote, setAuditNote] = useState('');
  const [creditAmount, setCreditAmount] = useState(0);
  const [replacementOrderNum, setReplacementOrderNum] = useState('');

  if (!thread) return null;

  const { productName, issueType, reason, imageUrl } = parseTicketDetails(thread.subject, thread.product);
  const orderAmt = thread.orderDetails?.amount ?? thread.product?.price ?? 0;
  const slaHours = Math.max(0, 24 - dayjs().diff(dayjs(thread.createdAt), 'hour', true));
  const slaCritical = slaHours <= 4;
  const alreadyResolved = Boolean(thread.resolutionAction);
  const actionMeta = thread.resolutionAction ? RESOLUTION_ACTION_META[thread.resolutionAction] : null;

  const handleConfirmAction = () => {
    if (!actionType) return;
    resolve.mutate(
      {
        id: thread.id,
        action: actionType,
        refundAmount: actionType === 'REFUND_APPROVED' ? creditAmount : undefined,
        replacementOrderNumber: actionType === 'REPLACEMENT_DISPATCHED' ? replacementOrderNum || undefined : undefined,
        internalAuditNote: auditNote || undefined,
      },
      {
        onSuccess: () => {
          const label = RESOLUTION_ACTION_META[actionType]?.label ?? actionType;
          msg.success(`${thread.ticketNumber} — ${label}`);
          setActionType(null);
          setAuditNote('');
          setReplacementOrderNum('');
          onClose();
        },
        onError: (e) => msg.error(apiErrorMessage(e, 'Could not process resolution')),
      },
    );
  };

  return (
    <>
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileProtectOutlined style={{ color: '#1677ff', fontSize: 17 }} />
            <span style={{ fontWeight: 700, fontSize: 15 }}>Inspection & Resolution</span>
            <Tag color={thread.customer.channel === 'B2B' ? 'purple' : 'blue'} style={{ margin: 0, fontSize: 10.5 }}>
              {thread.customer.channel === 'B2B' ? 'B2B Dispute' : 'B2C Complaint'}
            </Tag>
            <Tag style={{ margin: 0, fontSize: 10.5, color: '#64748b' }}>{thread.ticketNumber}</Tag>
          </div>
        }
        width={720}
        open={open}
        onClose={onClose}
        extra={<Button onClick={onClose}>Close</Button>}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {/* 1. Priority & SLA Banner */}
          <Card
            size="small"
            style={{
              borderRadius: 12,
              background: thread.priority === 'HIGH' ? '#fff7ed' : '#f0fdf4',
              borderColor: thread.priority === 'HIGH' ? '#ffd591' : '#b7eb8f',
            }}
          >
            <Row justify="space-between" align="middle">
              <Col>
                <Space size={8}>
                  <Tag color={thread.priority === 'HIGH' ? 'red' : thread.priority === 'MEDIUM' ? 'orange' : 'blue'}>
                    {PRIORITY_META[thread.priority].label}
                  </Tag>
                  <Tag color="volcano">{issueType}</Tag>
                  {reason ? <Tag color="orange">{reason}</Tag> : null}
                </Space>
              </Col>
              <Col>
                <Space size={6}>
                  <ClockCircleOutlined style={{ color: slaCritical ? '#ff4d4f' : '#fa8c16' }} />
                  <Text strong style={{ color: slaCritical ? '#ff4d4f' : '#fa8c16', fontSize: 13 }}>
                    {slaHours <= 0 ? 'SLA Breached' : `SLA: ${slaHours.toFixed(1)}h remaining`}
                  </Text>
                </Space>
              </Col>
            </Row>
          </Card>

          {/* 2. Customer Profile & Order Summary */}
          <Card size="small" title="1. Customer Profile & Linked Order" style={{ borderRadius: 10 }}>
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="Name">{thread.customer.name}</Descriptions.Item>
              <Descriptions.Item label="Phone">{thread.customer.phone}</Descriptions.Item>
              <Descriptions.Item label="Email">{thread.customer.email ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Channel">
                <Tag color={thread.customer.channel === 'B2B' ? 'purple' : 'cyan'} style={{ margin: 0 }}>
                  {thread.customer.channel}
                </Tag>
              </Descriptions.Item>
              {thread.orderNumber ? (
                <Descriptions.Item label="Order">
                  <Tag color="geekblue" style={{ margin: 0 }}>
                    {thread.orderNumber} ({formatCurrency(orderAmt)})
                  </Tag>
                </Descriptions.Item>
              ) : null}
              {thread.orderDetails?.date ? (
                <Descriptions.Item label="Order Date">
                  {dayjs(thread.orderDetails.date).format('D MMM YYYY')}
                </Descriptions.Item>
              ) : null}
              <Descriptions.Item label="Ticket Created">
                {dayjs(thread.createdAt).format('D MMM YYYY, h:mm A')}
              </Descriptions.Item>
              <Descriptions.Item label="Category">
                <Tag style={{ margin: 0 }}>{CATEGORY_LABEL[thread.category]}</Tag>
              </Descriptions.Item>
            </Descriptions>

            {/* Order Items */}
            {thread.orderDetails?.items && thread.orderDetails.items.length > 0 ? (
              <div style={{ marginTop: 12 }}>
                <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 6, color: '#475569' }}>
                  Order Items:
                </Text>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {thread.orderDetails.items.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 10px',
                        background: '#f8fafc',
                        borderRadius: 8,
                        border: '1px solid #f1f5f9',
                        fontSize: 12,
                      }}
                    >
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.productName}
                          style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', border: '1px solid #e2e8f0' }}
                          onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/images/cat_spices.jpg'; }}
                        />
                      ) : null}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text ellipsis style={{ fontWeight: 600, fontSize: 12 }}>{item.productName}</Text>
                        {item.sku ? <Text type="secondary" style={{ fontSize: 10.5, marginLeft: 4 }}>SKU: {item.sku}</Text> : null}
                      </div>
                      <Text style={{ fontSize: 12, color: '#475569' }}>
                        {item.quantity} × {formatCurrency(item.unitPrice)}
                      </Text>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>

          {/* 3. Evidence Vault */}
          <Card size="small" title="2. Evidence & Customer Statement" style={{ borderRadius: 10 }}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <div>
                <Text strong style={{ fontSize: 12.5, display: 'block', marginBottom: 4 }}>
                  Customer's Initial Statement:
                </Text>
                <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, lineHeight: 1.6 }}>
                  "{thread.description}"
                </div>
              </div>

              {/* Product Thumbnail */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <img
                  src={imageUrl}
                  alt={productName}
                  onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/images/cat_spices.jpg'; }}
                  style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover', border: '1px solid #e2e8f0' }}
                />
                <div>
                  <Text strong style={{ fontSize: 13 }}>{productName}</Text>
                  {thread.product?.sku ? (
                    <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>SKU: {thread.product.sku}</Text>
                  ) : null}
                </div>
              </div>

              {/* Evidence Photos */}
              {thread.evidenceImages.length > 0 ? (
                <div>
                  <Text strong style={{ fontSize: 12.5, display: 'block', marginBottom: 8 }}>
                    Uploaded Photo Evidence ({thread.evidenceImages.length}):
                  </Text>
                  <Image.PreviewGroup>
                    <Space size={12} wrap>
                      {thread.evidenceImages.map((imgUrl, idx) => (
                        <div
                          key={idx}
                          style={{
                            width: 120,
                            height: 100,
                            borderRadius: 8,
                            overflow: 'hidden',
                            border: '1px solid #d9d9d9',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
                          }}
                        >
                          <Image src={imgUrl} width="100%" height="100%" style={{ objectFit: 'cover' }} />
                        </div>
                      ))}
                    </Space>
                  </Image.PreviewGroup>
                </div>
              ) : (
                <Text type="secondary" style={{ fontSize: 12 }}>No photo evidence uploaded yet.</Text>
              )}
            </Space>
          </Card>

          {/* 4. Previous Resolution (if already resolved) */}
          {alreadyResolved && actionMeta ? (
            <Alert
              type={thread.resolutionAction === 'REJECTED' ? 'error' : 'success'}
              showIcon
              icon={actionMeta.icon}
              message={`Resolution: ${actionMeta.label}`}
              description={
                <Space direction="vertical" size={4}>
                  {thread.refundAmount ? <Text>Refund Amount: {formatCurrency(thread.refundAmount)}</Text> : null}
                  {thread.replacementOrderNumber ? <Text>Replacement: {thread.replacementOrderNumber}</Text> : null}
                  {thread.internalAuditNote ? <Text>Note: {thread.internalAuditNote}</Text> : null}
                  {thread.resolvedBy ? (
                    <Text type="secondary" style={{ fontSize: 11.5 }}>
                      Resolved by {thread.resolvedBy.fullName} · {thread.resolvedAt ? dayjs(thread.resolvedAt).format('D MMM, h:mm A') : ''}
                    </Text>
                  ) : null}
                </Space>
              }
            />
          ) : null}

          {/* 5. Resolution Action Buttons (only if not yet resolved and staff has permission) */}
          {!alreadyResolved && canReply ? (
            <>
              <Divider orientation="left" plain style={{ margin: '4px 0' }}>
                Resolution Actions
              </Divider>

              <Row gutter={[12, 12]}>
                <Col span={12}>
                  <Button
                    type="primary"
                    block
                    style={{ background: '#52c41a', borderColor: '#52c41a', borderRadius: 8, height: 42, fontWeight: 700 }}
                    icon={<DollarOutlined />}
                    onClick={() => {
                      setActionType('REFUND_APPROVED');
                      setCreditAmount(orderAmt);
                    }}
                  >
                    Approve Refund
                  </Button>
                </Col>
                <Col span={12}>
                  <Button
                    type="primary"
                    block
                    style={{ background: '#1677ff', borderColor: '#1677ff', borderRadius: 8, height: 42, fontWeight: 700 }}
                    icon={<RocketOutlined />}
                    onClick={() => setActionType('REPLACEMENT_DISPATCHED')}
                  >
                    Send Replacement
                  </Button>
                </Col>
                <Col span={12}>
                  <Button
                    block
                    style={{ background: '#fa8c16', borderColor: '#fa8c16', color: '#fff', borderRadius: 8, height: 42, fontWeight: 700 }}
                    icon={<SyncOutlined />}
                    onClick={() => setActionType('REVERSE_PICKUP')}
                  >
                    Reverse Pickup
                  </Button>
                </Col>
                <Col span={12}>
                  <Button
                    danger
                    block
                    style={{ borderRadius: 8, height: 42, fontWeight: 700 }}
                    icon={<CloseCircleOutlined />}
                    onClick={() => setActionType('REJECTED')}
                  >
                    Reject Grievance
                  </Button>
                </Col>
              </Row>
            </>
          ) : null}
        </Space>
      </Drawer>

      {/* Confirmation Modal */}
      <Modal
        title={
          actionType === 'REFUND_APPROVED'
            ? '💳 Approve Refund / Credit Note'
            : actionType === 'REPLACEMENT_DISPATCHED'
            ? '🚚 Dispatch Replacement Order'
            : actionType === 'REVERSE_PICKUP'
            ? '🔄 Assign Reverse Pickup'
            : '❌ Reject Complaint'
        }
        open={Boolean(actionType)}
        onOk={handleConfirmAction}
        confirmLoading={resolve.isPending}
        onCancel={() => setActionType(null)}
        okText="Confirm Action"
        okButtonProps={{ danger: actionType === 'REJECTED' }}
      >
        <Space direction="vertical" style={{ width: '100%', marginTop: 12 }} size={16}>
          <Alert
            type={actionType === 'REJECTED' ? 'error' : 'info'}
            message={`${thread.ticketNumber} — ${thread.customer.name}`}
            description={thread.orderNumber ? `Order: ${thread.orderNumber} · Amount: ${formatCurrency(orderAmt)}` : 'No linked order'}
          />

          {actionType === 'REFUND_APPROVED' ? (
            <div>
              <Text strong style={{ display: 'block', marginBottom: 4 }}>Refund Amount (₹):</Text>
              <InputNumber
                style={{ width: '100%' }}
                min={1}
                max={orderAmt || 99999}
                value={creditAmount}
                onChange={(val) => setCreditAmount(val || 0)}
                prefix="₹"
              />
            </div>
          ) : null}

          {actionType === 'REPLACEMENT_DISPATCHED' ? (
            <div>
              <Text strong style={{ display: 'block', marginBottom: 4 }}>Replacement Order Number (optional):</Text>
              <Input
                placeholder="e.g. #B2C-REP-9022"
                value={replacementOrderNum}
                onChange={(e) => setReplacementOrderNum(e.target.value)}
              />
            </div>
          ) : null}

          <div>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>Internal Audit Note / Justification:</Text>
            <Input.TextArea
              rows={3}
              placeholder="Provide reason for compliance logs (e.g. Damage verified from photo proof, Credit Note #CN-9041 issued)..."
              value={auditNote}
              onChange={(e) => setAuditNote(e.target.value)}
            />
          </div>
        </Space>
      </Modal>
    </>
  );
}

/** Compact expandable product name with Show more / Show less toggle */
function ExpandableProductName({
  name,
  onNavigate,
}: {
  name: string;
  onNavigate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = name.length > 36;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0, flexWrap: 'wrap' }}>
      <Tooltip title="Click to view product in catalog">
        <span
          role="link"
          tabIndex={0}
          onClick={onNavigate}
          onKeyDown={(e) => (e.key === 'Enter' ? onNavigate() : undefined)}
          style={{
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 13,
            color: '#0f172a',
            transition: 'color 0.15s ease',
            lineHeight: 1.35,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#2563eb')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#0f172a')}
        >
          {isLong && !expanded ? `${name.slice(0, 36)}…` : name}
        </span>
      </Tooltip>
      {isLong ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2,
            padding: '1px 6px',
            fontSize: 10.5,
            fontWeight: 600,
            borderRadius: 4,
            border: '1px solid #cbd5e1',
            background: expanded ? '#e0f2fe' : '#f1f5f9',
            color: expanded ? '#0284c7' : '#475569',
            cursor: 'pointer',
            lineHeight: '14px',
          }}
        >
          {expanded ? (
            <>
              Less <UpOutlined style={{ fontSize: 8 }} />
            </>
          ) : (
            <>
              More <DownOutlined style={{ fontSize: 8 }} />
            </>
          )}
        </button>
      ) : null}
    </span>
  );
}

/** The modern customer support workspace */
export function SupportTicketsPage() {
  const canReply = useCan('SUPPORT_TICKETS_REPLY');
  const screens = Grid.useBreakpoint();
  const wide = Boolean(screens.lg);
  const qc = useQueryClient();
  const [statusTab, setStatusTab] = useState<StatusTab>('ALL');
  const [channel, setChannel] = useState<'ALL' | 'B2B' | 'B2C'>('ALL');
  const [awaitingOnly, setAwaitingOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const inbox = useSupportInbox({
    status: statusTab === 'ALL' ? undefined : statusTab,
    channel: channel === 'ALL' ? undefined : channel,
    search,
  });

  const allTickets = inbox.data?.tickets ?? [];
  const tickets = awaitingOnly ? allTickets.filter((t) => t.awaitingReply) : allTickets;
  const counts = inbox.data?.counts ?? {};
  const total = Object.values(counts).reduce((n, v) => n + (v ?? 0), 0);
  const awaiting = allTickets.filter((t) => t.awaitingReply).length;

  // Real-time instant socket updates: incoming messages from customer appear immediately
  useTicketSocketEvents({
    onMessage: (payload) => {
      if (selectedId && payload.ticketId === selectedId) {
        qc.setQueryData<SupportTicketThread>(
          [...SUPPORT_TICKETS_KEY, 'thread', selectedId],
          (old) => {
            if (!old) return old;
            const exists = old.messages.some(
              (m) =>
                m.id === payload.message.id ||
                (m.body === payload.message.body &&
                  Math.abs(new Date(m.createdAt).getTime() - new Date(payload.message.createdAt).getTime()) < 3000),
            );
            if (exists) return old;
            return {
              ...old,
              messages: [...old.messages, payload.message],
              lastActivityAt: payload.lastActivityAt || new Date().toISOString(),
              status: (payload.status as SupportTicketStatus) || old.status,
            };
          },
        );
      }
      void qc.invalidateQueries({ queryKey: [...SUPPORT_TICKETS_KEY, 'inbox'] });
    },
    onNewTicket: () => {
      void qc.invalidateQueries({ queryKey: [...SUPPORT_TICKETS_KEY, 'inbox'] });
    },
    onTicketUpdated: (payload) => {
      if (selectedId && payload.ticketId === selectedId) {
        qc.setQueryData<SupportTicketThread>(
          [...SUPPORT_TICKETS_KEY, 'thread', selectedId],
          (old) =>
            old
              ? {
                  ...old,
                  status: (payload.status as SupportTicketStatus) || old.status,
                  priority: (payload.priority as SupportTicketPriority) || old.priority,
                  resolvedAt: payload.resolvedAt !== undefined ? payload.resolvedAt : old.resolvedAt,
                  resolvedBy: payload.resolvedBy !== undefined ? payload.resolvedBy : old.resolvedBy,
                }
              : old,
        );
      }
      void qc.invalidateQueries({ queryKey: [...SUPPORT_TICKETS_KEY, 'inbox'] });
    },
  });

  // Keep a ticket selected on wide screens so the conversation pane is never blank
  useEffect(() => {
    if (wide && !selectedId && tickets.length > 0) setSelectedId(tickets[0].id);
  }, [tickets, selectedId, wide]);

  const tabs: Array<{ value: StatusTab; label: string; count: number }> = [
    { value: 'ALL', label: 'All', count: total },
    { value: 'OPEN', label: 'Open', count: counts.OPEN ?? 0 },
    { value: 'IN_PROGRESS', label: 'In progress', count: counts.IN_PROGRESS ?? 0 },
    { value: 'RESOLVED', label: 'Resolved', count: counts.RESOLVED ?? 0 },
    { value: 'CLOSED', label: 'Closed', count: counts.CLOSED ?? 0 },
  ];

  const showList = wide || !selectedId;
  const showThread = wide || Boolean(selectedId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PageHeader
        title="Support & Complaints Hub"
        subtitle="Unified Helpdesk & Dispute Resolution Center — Real-time customer messaging, evidence inspection vault, batch traceability, and instant refund/replacement actions."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 10px',
                borderRadius: 999,
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                color: '#15803d',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: '#22c55e',
                  boxShadow: '0 0 0 2px rgba(34, 197, 94, 0.3)',
                }}
              />
              Live Socket
            </span>
            {awaiting > 0 ? (
              <Tag
                color="red"
                style={{
                  margin: 0,
                  padding: '3px 9px',
                  fontSize: 12,
                  borderRadius: 999,
                  fontWeight: 600,
                }}
              >
                {awaiting} awaiting reply
              </Tag>
            ) : null}
          </div>
        }
      />

      <Card
        style={{
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 6px 16px rgba(0,0,0,0.03)',
          border: '1px solid #e2e8f0',
        }}
        styles={{ body: { padding: 0 } }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: wide ? '410px minmax(0, 1fr)' : '1fr', height: PANE_HEIGHT }}>
          {/* ---- Inbox / List Column ---- */}
          {showList ? (
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, borderRight: wide ? BORDER : undefined, background: '#fff' }}>
              <div style={{ padding: '14px 16px', borderBottom: BORDER, display: 'flex', flexDirection: 'column', gap: 10, background: '#fafbfc' }}>
                <Input
                  allowClear
                  size="middle"
                  prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                  placeholder="Search tickets, products, customers"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ borderRadius: 8 }}
                />
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Select
                    size="middle"
                    style={{ flex: 1, height: 36 }}
                    value={channel}
                    onChange={setChannel}
                    options={[
                      { label: 'All customers', value: 'ALL' },
                      { label: 'B2C shoppers', value: 'B2C' },
                      { label: 'B2B retailers', value: 'B2B' },
                    ]}
                  />
                  <Button
                    size="middle"
                    type={awaitingOnly ? 'primary' : 'default'}
                    danger={awaitingOnly}
                    onClick={() => setAwaitingOnly((v) => !v)}
                    style={{ borderRadius: 8, fontSize: 13, height: 36, padding: '0 14px', fontWeight: 500 }}
                  >
                    Needs reply{awaiting ? ` · ${awaiting}` : ''}
                  </Button>
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: 6,
                    overflowX: 'auto',
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                    paddingBottom: 2,
                    alignItems: 'center',
                  }}
                >
                  {tabs.map((tab) => {
                    const on = statusTab === tab.value;
                    return (
                      <button
                        key={tab.value}
                        type="button"
                        onClick={() => setStatusTab(tab.value)}
                        style={{
                          flexShrink: 0,
                          height: 32,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: `1px solid ${on ? '#2563eb' : '#cbd5e1'}`,
                          background: on ? '#eff6ff' : '#fff',
                          color: on ? '#1d4ed8' : '#334155',
                          borderRadius: 999,
                          padding: '0 12px',
                          fontSize: 12.5,
                          fontWeight: on ? 600 : 500,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          transition: 'all 0.15s ease',
                          boxShadow: on ? '0 1px 2px rgba(37, 99, 235, 0.1)' : '0 1px 2px rgba(0,0,0,0.02)',
                        }}
                      >
                        {tab.label} <span style={{ marginLeft: 4, opacity: on ? 1 : 0.8, fontWeight: on ? 700 : 600 }}>{tab.count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {inbox.isLoading ? (
                  <div style={{ padding: 48, textAlign: 'center' }}>
                    <Spin />
                  </div>
                ) : tickets.length === 0 ? (
                  <Empty
                    style={{ padding: '60px 16px' }}
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                      search || statusTab !== 'ALL' || channel !== 'ALL' || awaitingOnly
                        ? 'No tickets match the selected filters'
                        : 'No support tickets yet'
                    }
                  />
                ) : (
                  tickets.map((t) => (
                    <InboxItem
                      key={t.id}
                      ticket={t}
                      active={t.id === selectedId}
                      onClick={() => setSelectedId(t.id)}
                    />
                  ))
                )}
              </div>
            </div>
          ) : null}

          {/* ---- Conversation / Chat Column ---- */}
          {showThread ? (
            selectedId ? (
              <Conversation
                id={selectedId}
                canReply={canReply}
                onBack={wide ? undefined : () => setSelectedId(null)}
              />
            ) : (
              <div style={{ display: 'grid', placeItems: 'center', background: '#fafbfc' }}>
                <Empty
                  image={<CustomerServiceOutlined style={{ fontSize: 48, color: '#cbd5e1' }} />}
                  description="Select a support ticket to view conversation"
                />
              </div>
            )
          ) : null}
        </div>
      </Card>
    </div>
  );
}

function InboxItem({
  ticket: t,
  active,
  onClick,
}: {
  ticket: SupportInboxRow;
  active: boolean;
  onClick: () => void;
}) {
  const status = STATUS_META[t.status];
  const { productName, imageUrl } = parseTicketDetails(t.subject, t.product);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === 'Enter' ? onClick() : undefined)}
      style={{
        display: 'flex',
        gap: 10,
        padding: '11px 14px',
        borderBottom: BORDER,
        cursor: 'pointer',
        background: active ? '#f0f7ff' : '#fff',
        boxShadow: active ? 'inset 3px 0 0 #2563eb' : undefined,
        transition: 'background 0.15s ease',
        position: 'relative',
      }}
    >
      {/* Product Image Thumbnail or Customer Avatar */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={productName}
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = '/images/cat_spices.jpg';
            }}
            style={{
              width: 38,
              height: 38,
              borderRadius: 8,
              objectFit: 'cover',
              border: '1px solid #e2e8f0',
              background: '#f8fafc',
            }}
          />
        ) : (
          <Avatar
            size={38}
            style={{
              background: t.customer.channel === 'B2B' ? '#dbeafe' : '#ede9fe',
              color: t.customer.channel === 'B2B' ? '#1d4ed8' : '#6d28d9',
              fontWeight: 700,
              borderRadius: 8,
              fontSize: 12,
            }}
          >
            {initials(t.customer.name)}
          </Avatar>
        )}
        {t.awaitingReply ? (
          <span
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#ef4444',
              border: '1.5px solid #fff',
            }}
          />
        ) : null}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
            <Text strong={t.awaitingReply} ellipsis style={{ fontSize: 13, color: '#0f172a', fontWeight: t.awaitingReply ? 700 : 600 }}>
              {t.customer.name}
            </Text>
            <Tag
              color={t.customer.channel === 'B2B' ? 'blue' : 'purple'}
              style={{ margin: 0, fontSize: 9.5, padding: '0 4px', lineHeight: '16px', borderRadius: 4 }}
            >
              {t.customer.channel}
            </Tag>
          </div>
          <Text type="secondary" style={{ fontSize: 10.5, flexShrink: 0 }}>
            {dayjs(t.lastActivityAt).fromNow(true)}
          </Text>
        </div>

        {/* Product / Topic display */}
        <Text
          ellipsis
          style={{
            display: 'block',
            fontSize: 12,
            color: '#334155',
            fontWeight: 500,
            marginTop: 1,
          }}
        >
          {productName}
        </Text>

        {/* Last message snippet */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 1 }}>
          <Text type="secondary" ellipsis style={{ flex: 1, fontSize: 11.5 }}>
            <span style={{ fontWeight: 500, color: '#64748b' }}>
              {t.lastMessage.author === 'STAFF' ? 'You: ' : `${t.customer.name.split(' ')[0]}: `}
            </span>
            {t.lastMessage.preview}
          </Text>
        </div>

        {/* Bottom meta row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 10.5, color: '#64748b' }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: status.dot }} />
          <span>{status.label}</span>
          {t.priority === 'HIGH' ? <span style={{ color: '#dc2626', fontWeight: 600 }}>· High</span> : null}
          {t.orderNumber ? (
            <>
              <span style={{ color: '#cbd5e1' }}>·</span>
              <span style={{ color: '#0284c7' }}>{t.orderNumber}</span>
            </>
          ) : null}
          {t.resolutionAction ? (
            <Tag color={t.resolutionAction === 'REJECTED' ? 'red' : 'green'} style={{ fontSize: 9.5, margin: 0, padding: '0 4px', lineHeight: '15px', borderRadius: 4 }}>
              {RESOLUTION_ACTION_META[t.resolutionAction]?.label ?? 'Resolved'}
            </Tag>
          ) : (t.category === 'ORDER_ISSUE' || t.category === 'PAYMENT_REFUND') && t.status !== 'RESOLVED' && t.status !== 'CLOSED' ? (
            <Tag color="volcano" style={{ fontSize: 9.5, margin: 0, padding: '0 4px', lineHeight: '15px', borderRadius: 4 }}>
              🔴 Needs Action
            </Tag>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Conversation({
  id,
  canReply,
  onBack,
}: {
  id: string;
  canReply: boolean;
  onBack?: () => void;
}) {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const thread = useSupportThread(id);
  const reply = useReplyToTicket();
  const update = useUpdateTicket();
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const [resolveDrawerOpen, setResolveDrawerOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const t = thread.data;

  useEffect(() => setDraft(''), [id]);

  // Smooth auto-scroll to bottom of conversation
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [t?.messages.length, id]);

  const messages = useMemo(() => {
    if (!t) return [];
    return [
      {
        id: 'opening',
        author: 'CUSTOMER' as const,
        body: t.description,
        createdAt: t.createdAt,
        staffName: null,
        isOpening: true,
      },
      ...t.messages.map((m) => ({ ...m, isOpening: false })),
    ];
  }, [t]);

  if (thread.isLoading || !t) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', background: '#fafbfc' }}>
        <Spin size="large" />
      </div>
    );
  }

  const { productName, issueType, reason, imageUrl } = parseTicketDetails(t.subject, t.product);
  const closed = t.status === 'CLOSED';

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    reply.mutate(
      { id: t.id, body },
      {
        onSuccess: () => {
          message.success('Reply sent');
        },
        onError: (e) => {
          setDraft(body);
          message.error(apiErrorMessage(e, 'Could not send the reply'));
        },
      },
    );
  };

  const setStatus = (status: SupportTicketStatus) =>
    update.mutate(
      { id: t.id, status },
      {
        onSuccess: () => message.success(`Marked as ${STATUS_META[status].label}`),
        onError: (e) => message.error(apiErrorMessage(e, 'Could not update')),
      },
    );

  const phone = t.customer.phone.replace(/\D/g, '').slice(-10);
  const profileLink = t.customer.channel === 'B2B' ? `/b2b-customers/${t.customer.id}` : `/b2c-customers/${t.customer.id}`;

  const handleNavigateToProduct = () => {
    if (t.product?.id) {
      navigate(`/products/edit/${t.product.id}`);
    } else {
      navigate(`/products?search=${encodeURIComponent(productName)}`);
    }
  };

  const handleNavigateToOrder = () => {
    if (!t.orderNumber) return;
    if (t.customer.channel === 'B2B') {
      navigate(`/b2b-orders?search=${encodeURIComponent(t.orderNumber)}`);
    } else {
      navigate(`/b2c-orders?search=${encodeURIComponent(t.orderNumber)}`);
    }
  };

  const handleCopyTicket = () => {
    void navigator.clipboard.writeText(t.ticketNumber);
    setCopied(true);
    message.success(`Copied ${t.ticketNumber}`);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, background: '#fff' }}>
      {/* ================= Unified Clean Header (Single Header + Context Strip) ================= */}
      <div style={{ borderBottom: BORDER, background: '#fff' }}>
        {/* Row 1: Customer Info & Status Controls (50px) */}
        <div
          style={{
            padding: '10px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          {/* Left: Customer Name, Channel & Contact Icons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            {onBack ? <Button type="text" size="small" icon={<ArrowLeftOutlined />} onClick={onBack} aria-label="Back" /> : null}

            <Avatar
              size={36}
              style={{
                background: t.customer.channel === 'B2B' ? '#dbeafe' : '#ede9fe',
                color: t.customer.channel === 'B2B' ? '#1d4ed8' : '#6d28d9',
                fontWeight: 700,
                fontSize: 13,
                flexShrink: 0,
              }}
            >
              {initials(t.customer.name)}
            </Avatar>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Text strong style={{ fontSize: 14.5, color: '#0f172a' }}>
                  {t.customer.name}
                </Text>
                <Tag color={t.customer.channel === 'B2B' ? 'blue' : 'purple'} style={{ margin: 0, fontSize: 10, lineHeight: '18px', borderRadius: 4 }}>
                  {t.customer.channel}
                </Tag>
              </div>
              <div style={{ fontSize: 11.5, color: '#64748b' }}>
                {t.customer.customerCode} · {t.customer.phone}
              </div>
            </div>

            {/* Quick Contact Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 6 }}>
              <Tooltip title={`Call ${t.customer.phone}`}>
                <Button
                  type="text"
                  size="small"
                  icon={<PhoneOutlined style={{ fontSize: 13, color: '#475569' }} />}
                  href={`tel:${t.customer.phone}`}
                />
              </Tooltip>
              {phone.length === 10 ? (
                <Tooltip title="WhatsApp">
                  <Button
                    type="text"
                    size="small"
                    icon={<WhatsAppOutlined style={{ color: '#16a34a', fontSize: 14 }} />}
                    href={`https://wa.me/91${phone}`}
                    target="_blank"
                    rel="noreferrer"
                  />
                </Tooltip>
              ) : null}
              <Tooltip title="Customer Profile">
                <Link to={profileLink}>
                  <Button type="text" size="small" icon={<UserOutlined style={{ fontSize: 13, color: '#475569' }} />} />
                </Link>
              </Tooltip>
            </div>
          </div>

          {/* Right: Ticket ID, Priority, Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              role="button"
              tabIndex={0}
              onClick={handleCopyTicket}
              style={{
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11.5,
                color: '#64748b',
                background: '#f1f5f9',
                padding: '3px 8px',
                borderRadius: 6,
                fontWeight: 600,
              }}
            >
              {t.ticketNumber}
              {copied ? <CheckOutlined style={{ color: '#16a34a', fontSize: 10 }} /> : <CopyOutlined style={{ fontSize: 10 }} />}
            </span>

            <Select<SupportTicketPriority>
              size="small"
              value={t.priority}
              disabled={!canReply}
              style={{ width: 125 }}
              onChange={(priority) =>
                update.mutate({ id: t.id, priority }, { onError: (e) => message.error(apiErrorMessage(e, 'Could not update')) })
              }
              options={(Object.keys(PRIORITY_META) as SupportTicketPriority[]).map((p) => ({
                value: p,
                label: (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: PRIORITY_META[p].color }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: PRIORITY_META[p].color }} />
                    {PRIORITY_META[p].label}
                  </span>
                ),
              }))}
            />

            <Select<SupportTicketStatus>
              size="small"
              value={t.status}
              disabled={!canReply}
              style={{ width: 115 }}
              onChange={setStatus}
              options={(Object.keys(STATUS_META) as SupportTicketStatus[]).map((s) => ({
                value: s,
                label: (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_META[s].dot }} />
                    {STATUS_META[s].label}
                  </span>
                ),
              }))}
            />

            <Tooltip title={t.resolutionAction ? 'View resolution details' : 'Open inspection & resolution drawer'}>
              <Button
                size="small"
                type={t.resolutionAction ? 'default' : 'primary'}
                icon={t.resolutionAction ? <CheckCircleOutlined style={{ color: '#16a34a' }} /> : <EyeOutlined />}
                onClick={() => setResolveDrawerOpen(true)}
                style={{
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  background: t.resolutionAction ? '#f0fdf4' : undefined,
                  borderColor: t.resolutionAction ? '#bbf7d0' : undefined,
                  color: t.resolutionAction ? '#16a34a' : undefined,
                }}
              >
                {t.resolutionAction
                  ? (RESOLUTION_ACTION_META[t.resolutionAction]?.label ?? 'Resolved')
                  : 'Inspect & Resolve'}
              </Button>
            </Tooltip>
          </div>
        </div>

        {/* Row 2: Compact Product & Order Context Strip (36px) */}
        <div
          style={{
            padding: '6px 18px',
            background: '#f8fafc',
            borderTop: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            fontSize: 12,
            flexWrap: 'wrap',
          }}
        >
          {/* Left: Product Thumbnail + Title + Issue Tags */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
            <Tooltip title="View product in catalog">
              <div
                role="button"
                tabIndex={0}
                onClick={handleNavigateToProduct}
                onKeyDown={(e) => (e.key === 'Enter' ? handleNavigateToProduct() : undefined)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <img
                  src={imageUrl}
                  alt={productName}
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = '/images/cat_spices.jpg';
                  }}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
            </Tooltip>

            <Tag
              color={issueType.toLowerCase().includes('refund') ? 'red' : 'blue'}
              style={{ margin: 0, fontSize: 10.5, lineHeight: '18px', borderRadius: 4, padding: '0 5px' }}
            >
              {issueType}
            </Tag>

            {reason ? (
              <Tag color="orange" style={{ margin: 0, fontSize: 10.5, lineHeight: '18px', borderRadius: 4, padding: '0 5px' }}>
                {reason}
              </Tag>
            ) : null}

            {/* Product Name with Show more / Show less */}
            <ExpandableProductName name={productName} onNavigate={handleNavigateToProduct} />
          </div>

          {/* Right: Order Tag & Timestamp */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {t.orderNumber ? (
              <Tooltip title="Click to view order details">
                <Tag
                  icon={<ShoppingOutlined />}
                  color="cyan"
                  onClick={handleNavigateToOrder}
                  style={{
                    margin: 0,
                    cursor: 'pointer',
                    fontWeight: 600,
                    borderRadius: 4,
                    fontSize: 11,
                    lineHeight: '18px',
                    padding: '0 6px',
                  }}
                >
                  {t.orderNumber} ↗
                </Tag>
              </Tooltip>
            ) : null}

            <span style={{ fontSize: 11, color: '#94a3b8' }}>
              Raised {dayjs(t.createdAt).format('D MMM, h:mm A')}
            </span>
          </div>
        </div>
      </div>

      {/* ================= Centered Cozy Chat Section (Not Overly Wide) ================= */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '16px 20px',
          background: '#f8fafc',
        }}
      >
        {/* Centered chat column with controlled maximum width */}
        <div style={{ maxWidth: 660, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.map((m, i) => {
            const staff = m.author === 'STAFF';
            const day = dayjs(m.createdAt);
            const newDay = i === 0 || !day.isSame(messages[i - 1].createdAt, 'day');

            return (
              <Fragment key={m.id}>
                {newDay ? (
                  <div style={{ textAlign: 'center', margin: i === 0 ? '4px 0 8px' : '10px 0 10px' }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#64748b',
                        background: '#e2e8f0',
                        padding: '2px 12px',
                        borderRadius: 999,
                      }}
                    >
                      {day.isSame(dayjs(), 'day')
                        ? 'Today'
                        : day.isSame(dayjs().subtract(1, 'day'), 'day')
                        ? 'Yesterday'
                        : day.format('D MMMM YYYY')}
                    </span>
                  </div>
                ) : null}

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: staff ? 'flex-end' : 'flex-start',
                    gap: 3,
                  }}
                >
                  {/* Sender Name label */}
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: staff ? '#2563eb' : '#64748b',
                      padding: '0 4px',
                    }}
                  >
                    {staff ? m.staffName ?? 'Super Admin' : t.customer.name}
                    {m.isOpening ? (
                      <Tag color="cyan" style={{ marginLeft: 6, fontSize: 9.5, lineHeight: '14px', borderRadius: 3, padding: '0 4px' }}>
                        Initial Request
                      </Tag>
                    ) : null}
                  </span>

                  {/* Message bubble - snug, fitted to content, max 75% width */}
                  <div
                    style={{
                      width: 'fit-content',
                      maxWidth: '75%',
                      background: staff ? '#2563eb' : '#ffffff',
                      color: staff ? '#ffffff' : '#0f172a',
                      border: staff ? 'none' : '1px solid #e2e8f0',
                      borderRadius: staff ? '16px 16px 3px 16px' : '16px 16px 16px 3px',
                      padding: '9px 13px',
                      fontSize: 13.5,
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      boxShadow: staff
                        ? '0 2px 8px rgba(37, 99, 235, 0.2)'
                        : '0 1px 3px rgba(15, 23, 42, 0.05)',
                    }}
                  >
                    {m.body}
                  </div>

                  {/* Timestamp */}
                  <span
                    style={{
                      fontSize: 10.5,
                      color: '#94a3b8',
                      padding: '0 4px',
                    }}
                  >
                    {day.format('h:mm A')}
                  </span>
                </div>
              </Fragment>
            );
          })}

          {/* Resolution banner */}
          {t.status === 'RESOLVED' || t.status === 'CLOSED' ? (
            <div style={{ textAlign: 'center', margin: '8px 0' }}>
              <Tag
                color={t.status === 'CLOSED' ? 'default' : 'green'}
                icon={<CheckCircleOutlined />}
                style={{
                  borderRadius: 999,
                  padding: '4px 14px',
                  fontSize: 11.5,
                  fontWeight: 600,
                }}
              >
                {STATUS_META[t.status].label}
                {t.resolvedBy ? ` by ${t.resolvedBy.fullName}` : ''}
                {t.resolvedAt ? ` · ${dayjs(t.resolvedAt).format('D MMM, h:mm A')}` : ''}
              </Tag>
            </div>
          ) : null}
        </div>
      </div>

      {/* ================= Compact Reply Composer ================= */}
      <div style={{ padding: '10px 18px 12px', borderTop: BORDER, background: '#ffffff' }}>
        <div style={{ maxWidth: 660, margin: '0 auto' }}>
          {!canReply ? (
            <Text type="secondary" style={{ fontSize: 12 }}>You have read-only access to this ticket.</Text>
          ) : closed ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '4px 0' }}>
              <div>
                <Text strong style={{ fontSize: 13, color: '#475569' }}>
                  This ticket is marked as Closed.
                </Text>
                <Text type="secondary" style={{ display: 'block', fontSize: 11.5 }}>
                  Reopen the ticket to send follow-up replies to the customer.
                </Text>
              </div>
              <Button
                type="primary"
                size="small"
                icon={<ReloadOutlined />}
                onClick={() => setStatus('IN_PROGRESS')}
                style={{ borderRadius: 6 }}
              >
                Reopen Ticket
              </Button>
            </div>
          ) : (
            <div
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: 10,
                padding: '8px 10px',
                background: '#fff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                transition: 'border-color 0.15s ease',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#2563eb')}
              onBlur={(e) => (e.currentTarget.style.borderColor = '#cbd5e1')}
            >
              <Input.TextArea
                variant="borderless"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={`Reply to ${t.customer.name} (delivered instantly to mobile app)…`}
                autoSize={{ minRows: 2, maxRows: 5 }}
                maxLength={2000}
                style={{ padding: '2px 2px', fontSize: 13.5, lineHeight: 1.5 }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    send();
                  }
                }}
              />

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  marginTop: 6,
                  paddingTop: 6,
                  borderTop: '1px solid #f1f5f9',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Dropdown
                    trigger={['click']}
                    menu={{
                      items: QUICK_REPLIES.map((q) => ({
                        key: q.key,
                        label: (
                          <div style={{ maxWidth: 340, padding: '3px 0' }}>
                            <div style={{ fontWeight: 600, fontSize: 12.5 }}>{q.label}</div>
                            <div style={{ fontSize: 11.5, color: '#64748b', whiteSpace: 'normal', marginTop: 1 }}>{q.text}</div>
                          </div>
                        ),
                      })),
                      onClick: ({ key }) => setDraft(QUICK_REPLIES.find((q) => q.key === key)?.text ?? ''),
                    }}
                  >
                    <Button size="small" type="text" icon={<ThunderboltOutlined style={{ color: '#d97706', fontSize: 12 }} />} style={{ fontSize: 12 }}>
                      Quick Templates <DownOutlined style={{ fontSize: 9 }} />
                    </Button>
                  </Dropdown>

                  {t.status !== 'RESOLVED' ? (
                    <Button
                      size="small"
                      type="text"
                      icon={<CheckCircleOutlined style={{ color: '#16a34a', fontSize: 12 }} />}
                      loading={update.isPending}
                      onClick={() => setStatus('RESOLVED')}
                      style={{ fontSize: 12 }}
                    >
                      Mark Resolved
                    </Button>
                  ) : null}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    <kbd style={{ padding: '1px 4px', background: '#f1f5f9', borderRadius: 3, border: '1px solid #cbd5e1', fontSize: 10.5 }}>Ctrl+Enter</kbd> to send
                  </Text>

                  <Button
                    type="primary"
                    size="small"
                    icon={<SendOutlined />}
                    loading={reply.isPending}
                    disabled={!draft.trim()}
                    onClick={send}
                    style={{
                      borderRadius: 6,
                      padding: '0 14px',
                      fontWeight: 600,
                      background: draft.trim() ? '#2563eb' : undefined,
                    }}
                  >
                    Send
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <ResolutionDrawer
        open={resolveDrawerOpen}
        onClose={() => setResolveDrawerOpen(false)}
        thread={t}
        canReply={canReply}
      />
    </div>
  );
}
