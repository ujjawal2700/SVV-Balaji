import {
  ArrowLeftOutlined,
  BankOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  GlobalOutlined,
  IdcardOutlined,
  LinkOutlined,
  MailOutlined,
  PhoneOutlined,
  RollbackOutlined,
  ShoppingOutlined,
  StopOutlined,
  TeamOutlined,
  UserOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App as AntApp, Button, Card, Col, Input, Modal, Result, Row, Space, Spin, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AFFILIATE_STATUS_COLOR, affiliatesApi, FRAUD_REASON_LABEL, type AttributionRow, type PayoutRow } from '@shared/api/affiliates';
import { apiErrorMessage } from '@shared/api/client';
import { useCan } from '@shared/auth/useCan';
import { EM_DASH, formatCurrency, formatDate, formatDateTime } from '@shared/utils/format';
import { InfoRow, StatCard } from '../customers/detailPageParts';
import { CommissionLedger } from './AffiliatesPage';

const { Text, Paragraph } = Typography;

/**
 * One affiliate on its own page (like an order or a customer): who they are,
 * where they promote, how they are paid, what they have earned, and the
 * review actions - approve / reject an application, suspend / reactivate.
 */
export function AffiliateDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const canReview = useCan('AFFILIATES_REVIEW');
  const canSeePayouts = useCan('AFFILIATE_PAYOUTS_VIEW');
  const [busy, setBusy] = useState(false);
  const [reasonFor, setReasonFor] = useState<'reject' | 'suspend' | null>(null);
  const [reason, setReason] = useState('');

  const detail = useQuery({ queryKey: ['affiliates', 'detail', id], queryFn: () => affiliatesApi.detail(id), enabled: !!id });
  const orders = useQuery({ queryKey: ['affiliates', 'attributions', 'by', id], queryFn: () => affiliatesApi.attributions({ affiliateId: id }), enabled: !!id });
  const payouts = useQuery({ queryKey: ['affiliates', 'payouts', id], queryFn: () => affiliatesApi.payouts(id), enabled: !!id && canSeePayouts });

  const act = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      message.success(done);
      void qc.invalidateQueries({ queryKey: ['affiliates'] });
      setReasonFor(null);
      setReason('');
    } catch (e) {
      message.error(apiErrorMessage(e, 'Could not update the affiliate'), 6);
    } finally {
      setBusy(false);
    }
  };

  if (detail.isLoading) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }
  const a = detail.data;
  if (!a) {
    return (
      <Card style={{ marginTop: 24, borderRadius: 16 }}>
        <Result
          status="404"
          title="Affiliate not found"
          subTitle={detail.error ? apiErrorMessage(detail.error, '') : undefined}
          extra={<Button type="primary" icon={<ArrowLeftOutlined />} onClick={() => navigate('/affiliates')}>Back to affiliates</Button>}
        />
      </Card>
    );
  }

  const d = a.dashboard;
  const payoutText =
    a.payoutMethod === 'UPI'
      ? a.payoutUpiId ?? EM_DASH
      : [a.payoutBankName ?? 'Bank', a.payoutAccountName, a.payoutAccountNumber, a.payoutIfsc].filter(Boolean).join(' · ');

  const orderColumns: ColumnsType<AttributionRow> = [
    { title: 'When', dataIndex: 'createdAt', render: formatDateTime },
    {
      title: 'Order', key: 'order',
      render: (_, r) => (
        <div>
          <Link to={`/b2c-orders/${r.orderId}`}><Text strong>{r.orderNumber}</Text></Link>
          <div style={{ fontSize: 12, color: '#78716c' }}>{formatCurrency(r.orderTotal)} · {r.orderStatus}</div>
        </div>
      ),
    },
    { title: 'Buyer', key: 'buyer', render: (_, r) => `${r.customerName} (${r.customerCode})` },
    { title: 'Commission', dataIndex: 'commissionTotal', align: 'right', render: formatCurrency },
    {
      title: 'Result', key: 'res',
      render: (_, r) =>
        r.fraudReasons.length ? (
          <Space wrap size={4}>{r.fraudReasons.map((x) => <Tag key={x} color="red">{FRAUD_REASON_LABEL[x] ?? x}</Tag>)}</Space>
        ) : (
          <Tag color="green">{r.status}</Tag>
        ),
    },
  ];

  const payoutColumns: ColumnsType<PayoutRow> = [
    { title: 'Payout', dataIndex: 'payoutNumber', render: (v: string) => <Text strong>{v}</Text> },
    { title: 'Paid on', dataIndex: 'paidAt', render: formatDateTime },
    { title: 'Items', dataIndex: 'commissionCount', align: 'right' },
    { title: 'Gross', dataIndex: 'grossAmount', align: 'right', render: formatCurrency },
    { title: 'Clawback', dataIndex: 'clawbackAmount', align: 'right', render: (v: number) => (v ? `−${formatCurrency(v)}` : EM_DASH) },
    { title: 'Net paid', dataIndex: 'netAmount', align: 'right', render: (v: number) => <Text strong>{formatCurrency(v)}</Text> },
    { title: 'To · reference', key: 'ref', render: (_, p) => <div>{p.paidTo}<div style={{ fontSize: 12, color: '#78716c' }}>{p.reference}</div></div> },
  ];

  return (
    <div style={{ padding: '16px 8px 32px 8px', maxWidth: 1400, margin: '0 auto' }}>
      <Space direction="vertical" size={20} style={{ width: '100%' }}>
        {/* Header */}
        <div className="page-card" style={{ padding: '16px 24px' }}>
          <Row gutter={[16, 16]} align="middle" justify="space-between">
            <Col>
              <Space size={16} align="center">
                <Button
                  shape="circle"
                  icon={<ArrowLeftOutlined style={{ fontSize: 16, color: '#475569' }} />}
                  onClick={() => navigate('/affiliates')}
                  style={{ background: '#f8fafc', border: '1px solid #e2e8f0', width: 42, height: 42 }}
                />
                <div
                  style={{
                    width: 52, height: 52, borderRadius: 14, background: '#047857', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700,
                  }}
                >
                  {a.fullName.charAt(0).toUpperCase()}
                </div>
                <Space direction="vertical" size={2}>
                  <Space align="center" size={10} wrap>
                    <Text className="page-title">{a.fullName}</Text>
                    <Tag style={{ margin: 0 }}>{a.code}</Tag>
                    <Tag color={AFFILIATE_STATUS_COLOR[a.status]} style={{ margin: 0 }}>{a.status}</Tag>
                  </Space>
                  <Text type="secondary" className="page-meta">
                    APPLIED {formatDate(a.appliedAt).toUpperCase()}
                    {a.reviewedAt ? ` • REVIEWED ${formatDate(a.reviewedAt).toUpperCase()}` : ''}
                  </Text>
                </Space>
              </Space>
            </Col>
            {canReview ? (
              <Col>
                <Space wrap>
                  {a.status === 'PENDING' ? (
                    <>
                      <Button danger icon={<StopOutlined />} onClick={() => setReasonFor('reject')} style={{ borderRadius: 8 }}>Reject</Button>
                      <Button type="primary" icon={<CheckCircleOutlined />} loading={busy} style={{ borderRadius: 8, fontWeight: 600 }}
                        onClick={() => act(() => affiliatesApi.approve(a.id), `${a.fullName} approved - their links now earn`)}>
                        Approve
                      </Button>
                    </>
                  ) : null}
                  {a.status === 'APPROVED' ? (
                    <Button danger icon={<StopOutlined />} onClick={() => setReasonFor('suspend')} style={{ borderRadius: 8 }}>Suspend</Button>
                  ) : null}
                  {a.status === 'SUSPENDED' ? (
                    <Button type="primary" icon={<RollbackOutlined />} loading={busy} style={{ borderRadius: 8 }}
                      onClick={() => act(() => affiliatesApi.reactivate(a.id), 'Reactivated - their links track again')}>
                      Reactivate
                    </Button>
                  ) : null}
                </Space>
              </Col>
            ) : null}
          </Row>
        </div>

        {a.status === 'PENDING' ? (
          <Alert type="warning" showIcon message="Application waiting for review"
            description="Check where they promote and their payout details, then approve (their links start earning) or reject with a reason they will see." />
        ) : null}
        {a.rejectionReason ? <Alert type="error" showIcon message="Rejected" description={a.rejectionReason} /> : null}
        {a.status === 'SUSPENDED' && a.suspendedReason ? (
          <Alert type="error" showIcon message="Suspended - links do not track" description={`${a.suspendedReason}. Commission already earned is still owed and paid.`} />
        ) : null}

        <Row gutter={[20, 20]}>
          {/* Left: who and how they are paid */}
          <Col xs={24} lg={7}>
            <Space direction="vertical" size={20} style={{ width: '100%' }}>
              <Card bodyStyle={{ padding: '24px 20px' }} className="page-card">
                <Space direction="vertical" size={20} style={{ width: '100%' }}>
                  <Text className="page-section-label">PROFILE</Text>
                  <InfoRow icon={<PhoneOutlined style={{ fontSize: 16 }} />} label="PHONE" value={a.phone} />
                  <InfoRow icon={<MailOutlined style={{ fontSize: 16 }} />} label="EMAIL" value={a.email ?? EM_DASH} />
                  <InfoRow icon={<UserOutlined style={{ fontSize: 16 }} />} label="SHOPPER ACCOUNT" value={a.customerId ? 'Yes - own purchases never earn' : 'No'} />
                  <InfoRow icon={<IdcardOutlined style={{ fontSize: 16 }} />} label="PAN" value={a.pan ?? EM_DASH} />
                </Space>
              </Card>

              <Card bodyStyle={{ padding: '24px 20px' }} className="page-card">
                <Space direction="vertical" size={20} style={{ width: '100%' }}>
                  <Text className="page-section-label">PROMOTION</Text>
                  <InfoRow
                    icon={<GlobalOutlined style={{ fontSize: 16 }} />}
                    label="PROMOTES ON"
                    value={a.promotionUrl ? <a href={a.promotionUrl} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>{a.promotionUrl}</a> : EM_DASH}
                  />
                  <InfoRow icon={<TeamOutlined style={{ fontSize: 16 }} />} label="AUDIENCE" value={a.audienceSize ?? EM_DASH} />
                  <div>
                    <Text className="page-field-label">PLAN</Text>
                    <Paragraph style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{a.promotionPlan ?? EM_DASH}</Paragraph>
                  </div>
                </Space>
              </Card>

              <div className="page-dark-card">
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                  <Text style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase' }}>
                    PAYOUT · {a.payoutMethod === 'UPI' ? 'UPI' : 'BANK TRANSFER'}
                  </Text>
                  <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: 600, wordBreak: 'break-all' }}>
                    {a.payoutMethod === 'UPI' ? <WalletOutlined style={{ marginRight: 8 }} /> : <BankOutlined style={{ marginRight: 8 }} />}
                    {payoutText}
                  </Text>
                </Space>
              </div>
            </Space>
          </Col>

          {/* Right: numbers and history */}
          <Col xs={24} lg={17}>
            <Space direction="vertical" size={20} style={{ width: '100%' }}>
              <Row gutter={[16, 16]}>
                <Col xs={12} sm={8} xl={4}><StatCard icon={<LinkOutlined style={{ fontSize: 18 }} />} tone="blue" label="CLICKS" value={d.clicks} /></Col>
                <Col xs={12} sm={8} xl={4}><StatCard icon={<ShoppingOutlined style={{ fontSize: 18 }} />} tone="green" label="ORDERS" value={d.successfulOrders} /></Col>
                <Col xs={12} sm={8} xl={4}><StatCard icon={<ClockCircleOutlined style={{ fontSize: 18 }} />} tone="amber" label="ON HOLD" value={formatCurrency(d.balances.pending)} /></Col>
                <Col xs={12} sm={8} xl={4}><StatCard icon={<WalletOutlined style={{ fontSize: 18 }} />} tone="pink" label="PAYABLE NOW" value={formatCurrency(d.balances.payable)} /></Col>
                <Col xs={12} sm={8} xl={4}><StatCard icon={<CheckCircleOutlined style={{ fontSize: 18 }} />} tone="slate" label="PAID" value={formatCurrency(d.balances.paid)} /></Col>
                <Col xs={12} sm={8} xl={4}><StatCard icon={<RollbackOutlined style={{ fontSize: 18 }} />} tone="red" label="TAKEN BACK" value={formatCurrency(d.balances.reversed)} /></Col>
              </Row>

              <Card className="page-card" bodyStyle={{ padding: '8px 24px 24px' }}>
                <Tabs
                  items={[
                    { key: 'commissions', label: 'Commission per item', children: <CommissionLedger affiliateId={a.id} bare /> },
                    {
                      key: 'orders',
                      label: `Orders (${orders.data?.length ?? 0})`,
                      children: (
                        <Table rowKey="id" size="middle" loading={orders.isLoading} dataSource={orders.data ?? []} columns={orderColumns}
                          scroll={{ x: 800 }} pagination={{ pageSize: 20, hideOnSinglePage: true }} locale={{ emptyText: 'No orders through their links yet' }} />
                      ),
                    },
                    ...(canSeePayouts
                      ? [{
                          key: 'payouts',
                          label: `Payouts (${payouts.data?.length ?? 0})`,
                          children: (
                            <Table rowKey="id" size="middle" loading={payouts.isLoading} dataSource={payouts.data ?? []} columns={payoutColumns}
                              scroll={{ x: 800 }} pagination={{ pageSize: 20, hideOnSinglePage: true }} locale={{ emptyText: 'Nothing paid yet' }} />
                          ),
                        }]
                      : []),
                  ]}
                />
              </Card>
            </Space>
          </Col>
        </Row>
      </Space>

      <Modal
        open={reasonFor !== null}
        title={reasonFor === 'reject' ? 'Reject application' : 'Suspend affiliate'}
        okText={reasonFor === 'reject' ? 'Reject' : 'Suspend'}
        okButtonProps={{ danger: true, disabled: reason.trim().length < 3, loading: busy }}
        onCancel={() => setReasonFor(null)}
        onOk={() => act(
          () => (reasonFor === 'reject' ? affiliatesApi.reject(a.id, reason) : affiliatesApi.suspend(a.id, reason)),
          reasonFor === 'reject' ? 'Application rejected' : 'Affiliate suspended - links stop tracking',
        )}
      >
        <Text type="secondary">{reasonFor === 'reject' ? 'The applicant sees this reason and can apply again.' : 'Commission already earned is still owed and paid.'}</Text>
        <Input.TextArea rows={3} style={{ marginTop: 8 }} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Reason" />
      </Modal>
    </div>
  );
}
