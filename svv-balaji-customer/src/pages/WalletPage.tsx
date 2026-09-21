import { ArrowLeftOutlined, BankOutlined, ShoppingOutlined } from '@ant-design/icons';
import { Button, Progress, Typography } from 'antd';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useCustomerAuth } from '../auth/CustomerAuthContext';
import { useAccountStats } from '../hooks/useAccountStats';
import { formatInr } from '../utils/money';

/**
 * Retailer credit position ("Mandi Ledger & Credit"): the limit staff granted, what is currently
 * outstanding on credit orders, and the retailer's own recent orders. All of it comes from the
 * account - nothing local. Consumers have no rupee wallet; their balance is Desi Rewards.
 */
export function WalletPage() {
  const navigate = useNavigate();
  const { role, retailerProfile, initialising } = useCustomerAuth();
  const stats = useAccountStats();

  if (initialising) return null;
  if (role === 'GUEST') return <Navigate to="/login" replace state={{ from: '/wallet' }} />;
  if (role !== 'RETAILER') return <Navigate to="/loyalty" replace />;

  const limit = retailerProfile?.creditLimit ?? 0;
  const used = retailerProfile?.creditUsed ?? 0;
  const available = Math.max(limit - used, 0);
  const usedPct = limit > 0 ? Math.min(Math.round((used / limit) * 100), 100) : 0;

  return (
    <div style={{ background: '#f1f5f9', minHeight: '100vh', paddingBottom: 40 }}>
      <div style={{ background: '#fff', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #e2e8f0' }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} />
        <Typography.Title level={5} style={{ margin: 0 }}>Mandi Ledger &amp; Credit</Typography.Title>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e2e8f0' }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}><BankOutlined /> Credit available</Typography.Text>
          <Typography.Title level={2} style={{ margin: '4px 0 12px', color: '#15803d' }}>{formatInr(available)}</Typography.Title>
          {limit > 0 ? (
            <>
              <Progress percent={usedPct} showInfo={false} strokeColor="#ea580c" />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b' }}>
                <span>Outstanding {formatInr(used)}</span>
                <span>Limit {formatInr(limit)}</span>
              </div>
            </>
          ) : (
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              No credit limit has been set on your account yet. Orders are prepaid until Desi Tokri enables credit terms.
            </Typography.Text>
          )}
        </div>

        <div style={{ background: '#fff', borderRadius: 12, padding: 16, border: '1px solid #e2e8f0' }}>
          <Typography.Text strong><ShoppingOutlined /> Your recent orders</Typography.Text>
          {stats.orders.length === 0 ? (
            <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0' }}>No orders yet.</Typography.Paragraph>
          ) : (
            stats.orders.slice(0, 10).map((o) => (
              <Link key={o.orderNumber} to={`/orders/${o.orderNumber}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid #f1f5f9', color: 'inherit' }}>
                <span>
                  <Typography.Text strong style={{ fontSize: 13 }}>{o.orderNumber}</Typography.Text>
                  <br />
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    {new Date(o.placedAt).toLocaleDateString('en-IN')} · {o.status}
                  </Typography.Text>
                </span>
                <Typography.Text strong>{formatInr(o.total)}</Typography.Text>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
