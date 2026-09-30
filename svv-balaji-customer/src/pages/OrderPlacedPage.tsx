import {
  CopyOutlined,
  HomeOutlined,
  ShoppingOutlined,
} from '@ant-design/icons';
import { Button, Divider, Tag, Typography, message } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { checkoutApi } from '../api/checkout';
import { formatInr } from '../utils/money';

export function OrderPlacedPage() {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const navigate = useNavigate();

  const query = useQuery({
    queryKey: ['storefront', 'order', orderNumber],
    queryFn: () => checkoutApi.order(orderNumber!),
    enabled: !!orderNumber,
  });

  const order = query.data;

  const copyOrderNumber = () => {
    if (orderNumber) {
      navigator.clipboard.writeText(orderNumber);
      message.success('Order ID copied to clipboard!');
    }
  };

  // Delivery ETA date display
  const etaText = order?.fulfillment?.etaLabel
    ? order.fulfillment.etaLabel
    : order?.fulfillment?.etaMax
    ? new Date(order.fulfillment.etaMax).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : 'soon';

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'rgba(25, 20, 15, 0.45)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
      {/* Central Modal Card matching reference design */}
      <div
        style={{
          maxWidth: 380,
          width: '100%',
          background: '#fdfbf7',
          borderRadius: 32,
          padding: '32px 24px 28px',
          textAlign: 'center',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.25)',
          border: '1px solid #efe8db',
        }}
      >
        {/* Circle Badge with Party Popper / Confetti Icon */}
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: '50%',
            background: '#0d3b42',
            margin: '0 auto 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 12px 28px rgba(13, 59, 66, 0.35)',
            position: 'relative',
          }}
        >
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#52c41a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5.8 11.3 2 22l10.7-3.8Z" fill="#ffc107" stroke="#ffc107" />
            <path d="M4 3h.01M20 3h.01M12 2h.01M17 7h.01M7 7h.01M12 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
            <circle cx="18" cy="11" r="2" fill="#40a9ff" stroke="none" />
            <circle cx="6" cy="7" r="1.5" fill="#ff7875" stroke="none" />
            <circle cx="15" cy="4" r="1.5" fill="#52c41a" stroke="none" />
            <path d="m11 13 8-8" stroke="#ff4d4f" strokeWidth="2.5" />
            <path d="M14 17l6 2" stroke="#ff9c6e" strokeWidth="2" />
          </svg>
        </div>

        {/* Title & Subtitle */}
        <Typography.Title
          level={3}
          style={{ margin: '0 0 6px', color: '#0f172a', fontWeight: 800, fontSize: 23 }}
        >
          Payment Successful
        </Typography.Title>
        <Typography.Paragraph
          type="secondary"
          style={{ fontSize: 13.5, margin: '0 0 18px', color: '#64748b' }}
        >
          Thanks for your order.
        </Typography.Paragraph>

        {/* Order ID Pill */}
        {orderNumber && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              background: '#f2ece0',
              padding: '6px 14px',
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 600,
              color: '#334155',
              marginBottom: 20,
            }}
          >
            <span>Order ID : <strong style={{ color: '#0f172a' }}>{orderNumber}</strong></span>
            <CopyOutlined onClick={copyOrderNumber} style={{ cursor: 'pointer', color: '#0f766e' }} />
          </div>
        )}

        {/* Order Details Snippet Box */}
        {order && (
          <div
            style={{
              background: '#f4efe4',
              borderRadius: 18,
              padding: '14px 16px',
              textAlign: 'left',
              marginBottom: 24,
              fontSize: 13,
              border: '1px solid #e7dfd0',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: '#64748b' }}>Total Paid</span>
              <strong style={{ fontSize: 17, color: '#0d3b42' }}>{formatInr(order.totals.total)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: '#64748b' }}>Items</span>
              <span style={{ fontWeight: 600, color: '#1e293b' }}>{order.items.length} Product{order.items.length === 1 ? '' : 's'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#64748b' }}>Fulfillment</span>
              <Tag color="green" style={{ margin: 0, fontWeight: 600, borderRadius: 8 }}>
                {order.fulfillment.method === 'LOCAL' ? '⚡ Quick Delivery' : '📦 Standard Courier'}
              </Tag>
            </div>
            <Divider style={{ margin: '10px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
              <span style={{ color: '#64748b' }}>Estimated Delivery</span>
              <span style={{ fontWeight: 600, color: '#047857' }}>{etaText}</span>
            </div>
          </div>
        )}

        {/* Action Buttons: Pill-style matching reference layout */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Button
            type="primary"
            size="large"
            block
            onClick={() => navigate(`/orders/${orderNumber || ''}`)}
            style={{
              background: '#0d3b42',
              borderColor: '#0d3b42',
              height: 50,
              borderRadius: 999,
              fontWeight: 700,
              fontSize: 15,
              boxShadow: '0 6px 18px rgba(13,59,66,0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <ShoppingOutlined style={{ fontSize: 17 }} />
            Track Order
          </Button>

          <Button
            size="large"
            block
            onClick={() => navigate('/')}
            style={{
              height: 48,
              borderRadius: 999,
              fontWeight: 600,
              fontSize: 14.5,
              borderColor: '#e2ddd0',
              background: '#f2ece1',
              color: '#334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <HomeOutlined />
            Back to Home
          </Button>
        </div>
      </div>
    </div>
  );
}

