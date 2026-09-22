import { ArrowLeftOutlined, CarOutlined, CheckCircleFilled, EnvironmentOutlined, PhoneOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Divider, Skeleton, Steps, Tag, Typography } from 'antd';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { checkoutApi, checkoutError } from '../api/checkout';
import { formatInr } from '../utils/money';
import { progressIndex, progressSteps, statusColor, statusLabel } from './orderStatus';

const at = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * One order, live. Status, ETA, the rider or courier, and - for local delivery -
 * the OTP to read out at the door, all straight from the server, refreshed every
 * 15 seconds until the order is closed.
 */
export function OrderTrackingPage() {
  const { orderId: orderNumber } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const justPlaced = Boolean((location.state as { justPlaced?: boolean } | null)?.justPlaced);

  const handleBack = () => {
    if (justPlaced) {
      navigate('/orders', { replace: true });
    } else {
      navigate(-1);
    }
  };

  const order = useQuery({
    queryKey: ['storefront', 'orders', orderNumber],
    queryFn: () => checkoutApi.order(orderNumber as string),
    enabled: Boolean(orderNumber),
    retry: false,
    refetchInterval: (q) => (q.state.data && ['DELIVERED', 'CANCELLED'].includes(q.state.data.status) ? false : 15_000),
  });
  const o = order.data;

  return (
    <div style={{ minHeight: '100vh', background: '#f1f3f6', paddingBottom: 80 }}>
      <header style={{ background: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', position: 'sticky', top: 0, zIndex: 100 }}>
        <button onClick={handleBack} style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: 12 }}><ArrowLeftOutlined style={{ fontSize: 20 }} /></button>
        <Typography.Text strong style={{ fontSize: 16 }}>{orderNumber}</Typography.Text>
      </header>

      <div style={{ padding: 12, maxWidth: 720, margin: '0 auto' }}>
        {order.isLoading ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : order.error ? (
          <Alert type="error" showIcon message={checkoutError(order.error).message} />
        ) : o ? (
          <>
            {justPlaced ? <Alert type="success" showIcon message="Thank you! Your order has been placed." style={{ marginBottom: 12 }} /> : null}

            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Tag color={statusColor(o.status)} style={{ fontSize: 13, padding: '2px 10px' }}>{statusLabel(o.status, o.fulfillment.method)}</Tag>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>Placed {at(o.placedAt)}</Typography.Text>
              </div>
              {o.status === 'CANCELLED' ? (
                <Alert type="error" showIcon message="This order was cancelled" />
              ) : (
                <Steps size="small" current={progressIndex(o.status)} items={progressSteps(o.fulfillment.method).map((s) => ({ title: s.label }))} />
              )}
              {o.status !== 'DELIVERED' && o.status !== 'CANCELLED' && o.fulfillment.etaLabel ? (
                <Typography.Text style={{ display: 'block', marginTop: 12 }}>
                  Expected delivery in about <strong>{o.fulfillment.etaLabel}</strong> of placing
                </Typography.Text>
              ) : null}
              {o.status === 'DELIVERED' && o.deliveredAt ? (
                <Typography.Text style={{ display: 'block', marginTop: 12, color: '#16a34a' }}><CheckCircleFilled /> Delivered {at(o.deliveredAt)}</Typography.Text>
              ) : null}
            </Card>

            {o.deliveryOtp ? (
              <Card>
                <div style={{ textAlign: 'center' }}>
                  <Typography.Text type="secondary"><SafetyCertificateOutlined /> Delivery OTP</Typography.Text>
                  <div style={{ fontSize: 34, letterSpacing: 10, fontWeight: 800, color: '#c2410c', margin: '4px 0' }}>{o.deliveryOtp}</div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>Tell this code to the delivery partner at your door. Don't share it before your order arrives.</Typography.Text>
                </div>
              </Card>
            ) : null}

            {o.rider?.name ? (
              <Card title="Your delivery partner">
                <Typography.Text strong>{o.rider.name}</Typography.Text>
                {o.rider.phone ? <div><Button type="link" icon={<PhoneOutlined />} href={`tel:${o.rider.phone}`} style={{ paddingLeft: 0 }}>{o.rider.phone}</Button></div> : null}
              </Card>
            ) : null}

            {o.shipment ? (
              <Card title="Shipment">
                <Typography.Text style={{ display: 'block' }}><CarOutlined /> {o.shipment.courier} · AWB <strong>{o.shipment.awb}</strong></Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>Status: {o.shipment.status.replace(/_/g, ' ').toLowerCase()}</Typography.Text>
                {o.shipment.trackingUrl ? <div style={{ marginTop: 8 }}><Button type="primary" href={o.shipment.trackingUrl} target="_blank" rel="noreferrer">Track shipment</Button></div> : null}
              </Card>
            ) : null}

            <Card title="Delivery">
              <Typography.Text style={{ display: 'block' }}>
                <Tag color={o.fulfillment.method === 'LOCAL' ? 'green' : 'blue'}>{o.fulfillment.method === 'LOCAL' ? 'Local delivery' : 'Courier'}</Tag> from {o.fulfillment.nodeName}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                <EnvironmentOutlined /> {o.address.fullName} · {o.address.phone}<br />
                {[o.address.line1, o.address.line2, o.address.landmark].filter(Boolean).join(', ')}, {o.address.city}, {o.address.state} {o.address.pincode}
              </Typography.Text>
            </Card>

            <Card title="Items">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {o.items.map((i, idx) => {
                  const fallbackImg = getFallbackImage(i.name);
                  const imgSrc = i.imageUrl || fallbackImg;
                  return (
                    <div
                      key={i.sku ?? `${i.name}-${idx}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        paddingBottom: 8,
                        borderBottom: idx === o.items.length - 1 ? 'none' : '1px solid #f8fafc',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            width: 52,
                            height: 52,
                            borderRadius: 8,
                            overflow: 'hidden',
                            background: '#f8f7f5',
                            border: '1px solid #e2e8f0',
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <img
                            src={imgSrc}
                            alt={i.name ?? 'Product'}
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = fallbackImg;
                            }}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Typography.Text
                            strong
                            style={{
                              fontSize: 13,
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              lineHeight: 1.35,
                              color: '#1e293b',
                            }}
                          >
                            {i.name}
                          </Typography.Text>
                          <Typography.Text type="secondary" style={{ fontSize: 12, marginTop: 2, display: 'block' }}>
                            Qty: <strong>{i.quantity}</strong> {i.quantity > 1 ? `· ${formatInr(i.unitPrice)} each` : ''}
                          </Typography.Text>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: 8 }}>
                        <Typography.Text strong style={{ fontSize: 14, color: '#0f172a' }}>
                          {formatInr(i.total)}
                        </Typography.Text>
                      </div>
                    </div>
                  );
                })}
              </div>
              <Divider style={{ margin: '12px 0 10px' }} />
              <Line label="Subtotal" value={formatInr(o.totals.subtotal)} />
              {o.totals.discount > 0 ? <Line label={o.totals.couponCode ? `Discount (${o.totals.couponCode}${o.totals.loyaltyRedeemedPoints ? ` + ${o.totals.loyaltyRedeemedPoints} pts` : ''})` : 'Loyalty points'} value={`− ${formatInr(o.totals.discount)}`} green /> : null}
              <Line label="GST" value={formatInr(o.totals.tax)} />
              <Line label="Delivery" value={o.totals.deliveryFee === 0 ? 'FREE' : formatInr(o.totals.deliveryFee)} />
              <Divider style={{ margin: '10px 0' }} />
              <Line label="Total" value={formatInr(o.totals.total)} bold />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Payment: {o.payment.mode === 'COD' ? 'Cash on delivery' : o.payment.mode === 'CREDIT' ? 'On account' : 'Paid online'} · {o.payment.status.toLowerCase()}
              </Typography.Text>
            </Card>

            <Card title="Order history">
              {o.timeline.map((t, i) => (
                <div key={`${t.type}-${i}`} style={{ fontSize: 13, marginBottom: 6 }}>
                  <strong>{statusLabel(t.type, o.fulfillment.method) === t.type ? t.type.replace(/_/g, ' ').toLowerCase() : statusLabel(t.type, o.fulfillment.method)}</strong>
                  <span style={{ color: '#64748b' }}> · {at(t.at)}{t.note ? ` · ${t.note}` : ''}</span>
                </div>
              ))}
            </Card>
          </>
        ) : null}
      </div>
    </div>
  );
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      {title ? <Typography.Text strong style={{ fontSize: 15, display: 'block', marginBottom: 8 }}>{title}</Typography.Text> : null}
      {children}
    </div>
  );
}

function Line({ label, value, bold, green }: { label: string; value: string; bold?: boolean; green?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: bold ? 16 : 13, fontWeight: bold ? 700 : 400, color: green ? '#16a34a' : undefined, marginBottom: 4 }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function getFallbackImage(name?: string | null): string {
  if (!name) return '/images/cat_namkeen.jpg';
  const lower = name.toLowerCase();
  if (lower.includes('atta') || lower.includes('flour') || lower.includes('chakki') || lower.includes('maida') || lower.includes('suji') || lower.includes('rava')) {
    return '/images/cat_atta_flour.jpg';
  }
  if (lower.includes('spice') || lower.includes('masala') || lower.includes('cardamom') || lower.includes('pepper') || lower.includes('clove') || lower.includes('dalchini') || lower.includes('haldi') || lower.includes('chilli') || lower.includes('turmeric') || lower.includes('coriander') || lower.includes('cumin') || lower.includes('jeera')) {
    return '/images/cat_spices.jpg';
  }
  if (lower.includes('wafer') || lower.includes('chip') || lower.includes('crisp')) {
    return '/images/cat_wafers.jpg';
  }
  if (lower.includes('bhujia') || lower.includes('aloo')) {
    return '/images/aloo_bhujia.jpg';
  }
  if (lower.includes('namkeen') || lower.includes('mixture') || lower.includes('sev') || lower.includes('snack')) {
    return '/images/cat_namkeen.jpg';
  }
  return '/images/cat_namkeen.jpg';
}
