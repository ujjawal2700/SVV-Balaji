import { ArrowLeftOutlined, ClockCircleOutlined, CrownFilled, GiftOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { Button, Divider, Skeleton, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import type { LoyaltyHistoryItem } from '../api/loyalty';
import { useCustomerAuth } from '../auth/CustomerAuthContext';
import { useLoyalty } from '../loyalty/useLoyalty';

const inr = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function describe(item: LoyaltyHistoryItem): { title: string; subtitle: string } {
  switch (item.type) {
    case 'LOYALTY_EARN':
      return {
        title: item.orderNumber ? `Earned on order ${item.orderNumber}` : 'Points earned',
        subtitle: item.expiresAt ? `Expires ${day(item.expiresAt)}` : 'Credited when the order was delivered',
      };
    case 'LOYALTY_REVERSAL':
      return { title: `Reversed${item.orderNumber ? ` on ${item.orderNumber}` : ''}`, subtitle: 'An item from this order was returned' };
    case 'LOYALTY_EXPIRY':
      return { title: 'Points expired', subtitle: 'Not used before the expiry date' };
    case 'LOYALTY_REDEMPTION':
      return { title: `Points used${item.orderNumber ? ` on ${item.orderNumber}` : ''}`, subtitle: 'Spent at checkout' };
    case 'LOYALTY_REDEMPTION_REFUND':
      return { title: `Points returned${item.orderNumber ? ` from ${item.orderNumber}` : ''}`, subtitle: 'The order was cancelled' };
    case 'REFERRAL_REDEMPTION':
      return { title: `Referral coins used${item.orderNumber ? ` on ${item.orderNumber}` : ''}`, subtitle: 'Spent at checkout' };
    case 'REFERRAL_REDEMPTION_REFUND':
      return { title: `Referral coins returned${item.orderNumber ? ` from ${item.orderNumber}` : ''}`, subtitle: 'The order was cancelled' };
    case 'REFERRAL_REFERRER_REWARD':
      return { title: 'Referral reward', subtitle: 'A friend you referred joined' };
    case 'REFERRAL_REFEREE_REWARD':
      return { title: 'Welcome reward', subtitle: 'For joining through a referral' };
    default:
      return { title: 'Adjustment', subtitle: item.note ?? 'Applied by SVV Balaji support' };
  }
}

export function LoyaltyPage() {
  const navigate = useNavigate();
  const { role } = useCustomerAuth();
  const loyalty = useLoyalty();
  const isRetailer = role === 'RETAILER';
  const guest = role === 'GUEST';

  const brandColor = isRetailer ? '#059669' : '#f97316';
  const brandDark = isRetailer ? '#065f46' : '#c2410c';
  const program = loyalty.program;

  // The rules, in words, straight from what Super Admin configured.
  const rules: string[] = program
    ? [
        `You earn ${program.earnPercent}% of the eligible value of each order${
          program.calculationBase === 'INCLUDING_TAX' ? ' (including GST)' : ' (before GST)'
        }, after coupon and coin discounts, credited once the order is delivered.`,
        `1 point is worth ${inr(program.pointValueInr)}.`,
        'Only eligible products count. Delivery charges never earn points.',
        program.appliesToDiscountedProducts
          ? 'Discounted products earn points too.'
          : 'Products sold below their MRP do not earn points.',
        ...(program.minEligibleItemAmount ? [`An item earns only if its line value is at least ${inr(program.minEligibleItemAmount)}.`] : []),
        ...(program.minEligibleOrderAmount ? [`Orders need at least ${inr(program.minEligibleOrderAmount)} of eligible items to earn.`] : []),
        ...(program.maxRewardPerOrderInr ? [`A single order can earn up to ${inr(program.maxRewardPerOrderInr)} in rewards.`] : []),
        program.expiryMonths ? `Points expire ${program.expiryMonths} months after delivery.` : 'Your points do not expire.',
        'If you return an item, the points it earned are taken back.',
      ]
    : [];

  return (
    <div style={{ minHeight: '100vh', background: '#f1f3f6', paddingBottom: 80 }}>
      <header
        style={{
          background: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center',
          boxShadow: '0 1px 4px rgba(0,0,0,0.05)', position: 'sticky', top: 0, zIndex: 100,
        }}
      >
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: 12 }}>
          <ArrowLeftOutlined style={{ fontSize: 20 }} />
        </button>
        <Typography.Text strong style={{ fontSize: 16 }}>
          {isRetailer ? 'Wholesaler Rewards' : 'Desi Rewards'}
        </Typography.Text>
      </header>

      <div style={{ padding: '12px', maxWidth: 720, margin: '0 auto' }}>
        {/* Balance */}
        <div
          style={{
            background: `linear-gradient(135deg, ${brandColor} 0%, ${brandDark} 100%)`,
            borderRadius: 16, padding: '24px 20px', marginBottom: 12,
            boxShadow: `0 4px 16px ${isRetailer ? 'rgba(5,150,105,0.3)' : 'rgba(249,115,22,0.35)'}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CrownFilled style={{ color: '#fde68a', fontSize: 18 }} />
              <Typography.Text strong style={{ color: '#fff', fontSize: 14 }}>Your points</Typography.Text>
            </div>
            <Tag style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', fontWeight: 600, margin: 0 }}>
              {isRetailer ? 'B2B Loyalty' : 'B2C Loyalty'}
            </Tag>
          </div>

          {guest ? (
            <>
              <Typography.Title level={3} style={{ color: '#fff', margin: '0 0 8px' }}>Sign in to see your points</Typography.Title>
              <Button onClick={() => navigate('/login')}>Sign in</Button>
            </>
          ) : loyalty.isLoading ? (
            <Skeleton active paragraph={false} title={{ width: 160 }} />
          ) : (
            <>
              <Typography.Title level={2} style={{ color: '#fff', margin: '0 0 4px', fontSize: 36, fontWeight: 800 }}>
                {loyalty.points.toLocaleString('en-IN')} <span style={{ fontSize: 18, fontWeight: 600, opacity: 0.85 }}>pts</span>
              </Typography.Title>
              <Typography.Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, display: 'block' }}>
                Worth {inr(loyalty.pointsValueInr)} • {loyalty.lifetimePoints.toLocaleString('en-IN')} earned so far
              </Typography.Text>
              {loyalty.referralCoins > 0 ? (
                <Typography.Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                  {loyalty.loyaltyPoints.toLocaleString('en-IN')} loyalty points + {loyalty.referralCoins.toLocaleString('en-IN')} referral coins
                </Typography.Text>
              ) : null}
            </>
          )}
        </div>

        {loyalty.expiringSoon ? (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '10px 14px', marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
            <ClockCircleOutlined style={{ color: '#d97706' }} />
            <Typography.Text style={{ color: '#92400e', fontSize: 13 }}>
              {loyalty.expiringSoon.points} points expire on {day(loyalty.expiringSoon.on)}
            </Typography.Text>
          </div>
        ) : null}

        {!guest && !loyalty.isLoading && !loyalty.enabled ? (
          <div style={{ background: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, display: 'flex', gap: 10 }}>
            <InfoCircleOutlined style={{ color: '#64748b', marginTop: 3 }} />
            <Typography.Text type="secondary">
              Rewards are not being earned right now. Points you already hold are safe.
            </Typography.Text>
          </div>
        ) : null}

        {/* How it works */}
        {rules.length > 0 ? (
          <div style={{ background: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <Typography.Text strong style={{ fontSize: 15, display: 'block', marginBottom: 8 }}>
              <GiftOutlined style={{ color: brandColor }} /> How you earn
            </Typography.Text>
            <ul style={{ margin: 0, paddingLeft: 18, color: '#475569', fontSize: 13, lineHeight: 1.7 }}>
              {rules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* History */}
        {!guest ? (
          <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px 6px' }}>
              <Typography.Text strong style={{ fontSize: 15 }}>Points history</Typography.Text>
            </div>
            {loyalty.history.length === 0 ? (
              <div style={{ padding: '8px 16px 20px' }}>
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                  No points yet. Points appear here once an order is delivered.
                </Typography.Text>
              </div>
            ) : (
              loyalty.history.map((item, idx) => {
                const { title, subtitle } = describe(item);
                return (
                  <div key={item.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 16px' }}>
                      <div>
                        <Typography.Text strong style={{ fontSize: 13, display: 'block' }}>{title}</Typography.Text>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {subtitle} · {day(item.createdAt)}
                        </Typography.Text>
                      </div>
                      <Typography.Text strong style={{ color: item.points < 0 ? '#dc2626' : '#16a34a', whiteSpace: 'nowrap' }}>
                        {item.points > 0 ? `+${item.points}` : item.points}
                      </Typography.Text>
                    </div>
                    {idx < loyalty.history.length - 1 && <Divider style={{ margin: '0 16px', width: 'auto', minWidth: 'auto' }} />}
                  </div>
                );
              })
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
