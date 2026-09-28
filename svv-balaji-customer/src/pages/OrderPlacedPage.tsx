import {
  CheckCircleFilled,
  CopyOutlined,
  HomeOutlined,
  ShoppingOutlined,
} from '@ant-design/icons';
import { Button, Card, Divider, Tag, Typography, message } from 'antd';
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
      message.success('Order number copied to clipboard!');
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
        background: 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '36px 16px 60px',
      }}
    >
      <div style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
        {/* Top Header */}
        <Typography.Title level={2} style={{ margin: '0 0 10px', color: '#0f172a', fontWeight: 800, fontSize: 26 }}>
          Your order is placed
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ fontSize: 15, margin: '0 0 4px', color: '#475569' }}>
          Thank you for shopping with us
        </Typography.Paragraph>
        <Typography.Text style={{ fontSize: 14, color: '#059669', fontWeight: 600, display: 'block', marginBottom: 24 }}>
          Your order will reach you on {etaText}.
        </Typography.Text>

        {/* Central Illustration (Phone with Green Checkmark matching reference layout) */}
        <div style={{ position: 'relative', margin: '20px auto 32px', width: 220, height: 260 }}>
          {/* Soft Blur Background */}
          <div
            style={{
              position: 'absolute',
              top: '10%',
              left: '5%',
              width: '90%',
              height: '80%',
              background: '#dcfce7',
              borderRadius: '40% 60% 70% 30% / 50% 60% 40% 50%',
              filter: 'blur(10px)',
              zIndex: 1,
            }}
          />

          {/* Smartphone Graphic */}
          <div
            style={{
              position: 'relative',
              zIndex: 2,
              width: 165,
              height: 245,
              margin: '0 auto',
              background: '#0f766e',
              borderRadius: 32,
              padding: 6,
              boxShadow: '0 20px 35px -10px rgba(15, 118, 110, 0.35)',
              border: '3px solid #115e59',
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                background: '#0d9488',
                borderRadius: 26,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Speaker Notch */}
              <div
                style={{
                  position: 'absolute',
                  top: 8,
                  width: 44,
                  height: 5,
                  background: '#0f766e',
                  borderRadius: 3,
                }}
              />

              {/* Big Checkmark Circle */}
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  background: '#22c55e',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 8px 24px rgba(34, 197, 94, 0.45)',
                }}
              >
                <CheckCircleFilled style={{ fontSize: 46, color: '#ffffff' }} />
              </div>
            </div>
          </div>

          {/* Floating leaf accents */}
          <div style={{ position: 'absolute', top: 15, right: 10, zIndex: 3, fontSize: 24 }}>🍃</div>
          <div style={{ position: 'absolute', bottom: 25, left: 5, zIndex: 3, fontSize: 20 }}>🌱</div>
        </div>

        {/* Order Details Snippet Card */}
        {orderNumber && (
          <Card
            style={{
              borderRadius: 16,
              borderColor: '#e2e8f0',
              boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
              textAlign: 'left',
              marginBottom: 28,
            }}
            bodyStyle={{ padding: '16px 20px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                  Order Number
                </Typography.Text>
                <Typography.Text strong style={{ fontSize: 15, color: '#0f172a', letterSpacing: 0.5 }}>
                  #{orderNumber}
                </Typography.Text>
              </div>
              <Button type="text" icon={<CopyOutlined />} onClick={copyOrderNumber} size="small" style={{ color: '#059669' }}>
                Copy
              </Button>
            </div>

            {order && (
              <>
                <Divider style={{ margin: '12px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                  <span style={{ color: '#64748b' }}>Items ({order.items.length})</span>
                  <span style={{ fontWeight: 600, color: '#0f172a' }}>{formatInr(order.totals.total)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, marginTop: 6 }}>
                  <span style={{ color: '#64748b' }}>Fulfillment</span>
                  <Tag color="green" style={{ margin: 0, fontWeight: 600 }}>
                    {order.fulfillment.method === 'LOCAL' ? '⚡ Quick Delivery' : '📦 Standard Shipping'}
                  </Tag>
                </div>
              </>
            )}
          </Card>
        )}

        {/* Action Buttons: Track Order & Home */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Button
            type="primary"
            size="large"
            block
            onClick={() => navigate(`/orders/${orderNumber || ''}`)}
            style={{
              background: '#f97316',
              borderColor: '#f97316',
              height: 52,
              borderRadius: 14,
              fontWeight: 700,
              fontSize: 16,
              boxShadow: '0 4px 14px rgba(249,115,22,0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <ShoppingOutlined style={{ fontSize: 18 }} />
            Track Order
          </Button>

          <Button
            size="large"
            block
            onClick={() => navigate('/')}
            style={{
              height: 50,
              borderRadius: 14,
              fontWeight: 600,
              fontSize: 15,
              borderColor: '#86efac',
              background: '#ecfdf5',
              color: '#047857',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <HomeOutlined />
            Go to Home
          </Button>
        </div>
      </div>
    </div>
  );
}
