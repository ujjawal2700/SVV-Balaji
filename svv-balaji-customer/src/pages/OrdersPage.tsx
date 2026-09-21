import { ArrowLeftOutlined, CarOutlined, ShopOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Skeleton, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { checkoutApi } from '../api/checkout';
import { useCustomerAuth } from '../auth/CustomerAuthContext';
import { formatInr } from '../utils/money';
import { statusLabel, statusColor } from './orderStatus';

const when = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** The customer's real orders, newest first, refreshed while any is still in progress. */
export function OrdersPage() {
  const navigate = useNavigate();
  const { role } = useCustomerAuth();
  const orders = useQuery({
    queryKey: ['storefront', 'orders'],
    queryFn: checkoutApi.orders,
    enabled: role !== 'GUEST',
    refetchInterval: (q) => (q.state.data?.some((o) => !['DELIVERED', 'CANCELLED'].includes(o.status)) ? 20_000 : false),
  });

  return (
    <div style={{ minHeight: '100vh', background: '#f1f3f6', paddingBottom: 80 }}>
      <header style={{ background: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', position: 'sticky', top: 0, zIndex: 100 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: 12 }}><ArrowLeftOutlined style={{ fontSize: 20 }} /></button>
        <Typography.Text strong style={{ fontSize: 16 }}>My Orders</Typography.Text>
      </header>

      <div style={{ padding: 12, maxWidth: 720, margin: '0 auto' }}>
        {role === 'GUEST' ? (
          <div style={{ background: '#fff', borderRadius: 12, padding: 20 }}>
            <Typography.Text>Sign in to see your orders.</Typography.Text>
            <div style={{ marginTop: 12 }}><Button type="primary" onClick={() => navigate('/login')}>Sign in</Button></div>
          </div>
        ) : orders.isLoading ? (
          <Skeleton active />
        ) : (orders.data ?? []).length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 12, padding: 20 }}>
            <Typography.Text type="secondary">No orders yet.</Typography.Text>
            <div style={{ marginTop: 12 }}><Button type="primary" onClick={() => navigate('/')}>Start shopping</Button></div>
          </div>
        ) : (
          orders.data!.map((o) => (
            <div
              key={o.orderNumber}
              onClick={() => navigate(`/orders/${o.orderNumber}`)}
              style={{ background: '#fff', borderRadius: 12, padding: 16, marginBottom: 10, cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Typography.Text strong>{o.orderNumber}</Typography.Text>
                <Tag color={statusColor(o.status)}>{statusLabel(o.status, o.fulfillmentMethod)}</Tag>
              </div>
              <Typography.Text type="secondary" style={{ display: 'block', fontSize: 13 }}>
                {o.items.filter(Boolean).join(', ')}{o.itemCount > o.items.length ? ` +${o.itemCount - o.items.length} more` : ''}
              </Typography.Text>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, color: '#64748b' }}>
                <span>{when(o.placedAt)} · {o.fulfillmentMethod === 'LOCAL' ? <><ShopOutlined /> Local delivery</> : <><CarOutlined /> Courier</>}</span>
                <strong style={{ color: '#0f172a' }}>{formatInr(o.total)}</strong>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
