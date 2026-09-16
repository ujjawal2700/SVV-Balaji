import {
  ArrowLeftOutlined,
  CheckCircleFilled,
  CrownFilled,
  GiftOutlined,
  InfoCircleOutlined,
  TrophyFilled,
} from '@ant-design/icons';
import { Button, Divider, Progress, Tag, Typography, message } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCustomerAuth } from '../auth/CustomerAuthContext';
import { useLoyalty } from '../loyalty/useLoyalty';
import { MAX_REDEEM_SHARE_OF_ORDER, MIN_REDEEM_POINTS, POINTS_TO_INR, POINTS_VALID_MONTHS, PRICE_BAND_TABLE, tiersForRole } from '../loyalty/loyaltyRules';

function formatInr(value: number): string {
  return `₹${value.toLocaleString('en-IN')}`;
}

const REDEEM_QUICK_PICKS = [200, 500, 1000, 2000];

/** Worked examples for the "how you earn" table — same rate function the engine uses, just illustrated on round prices. */
const EXAMPLE_PRICES = [79, 199, 450, 750];

export function LoyaltyPage() {
  const navigate = useNavigate();
  const { role } = useCustomerAuth();
  const loyalty = useLoyalty();
  const isRetailer = role === 'RETAILER';
  const [selectedRedeem, setSelectedRedeem] = useState<number | null>(null);

  const brandColor = isRetailer ? '#059669' : '#f97316';
  const brandDark = isRetailer ? '#065f46' : '#c2410c';
  const tiers = tiersForRole(role);

  const handleRedeem = () => {
    if (!selectedRedeem) {
      message.warning('Please select how many points to redeem');
      return;
    }
    const value = loyalty.redeemPoints(selectedRedeem);
    if (value == null) {
      message.error(`Redeem at least ${MIN_REDEEM_POINTS} points, and no more than your balance`);
      return;
    }
    message.success(`${selectedRedeem} points redeemed for ${formatInr(value)} — credited to your wallet (mock)`);
    setSelectedRedeem(null);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f3f6', paddingBottom: 80 }}>
      {/* Header */}
      <header
        style={{
          background: '#fff', padding: '12px 16px',
          display: 'flex', alignItems: 'center',
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

        {/* Tier & Points Hero Card */}
        <div style={{
          background: `linear-gradient(135deg, ${brandColor} 0%, ${brandDark} 100%)`,
          borderRadius: 16, padding: '24px 20px', marginBottom: 12,
          boxShadow: `0 4px 16px ${isRetailer ? 'rgba(5,150,105,0.3)' : 'rgba(249,115,22,0.35)'}`, position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: -24, right: -24, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
          <div style={{ position: 'absolute', bottom: -16, right: 60, width: 70, height: 70, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CrownFilled style={{ color: '#fde68a', fontSize: 18 }} />
              <Typography.Text strong style={{ color: '#fff', fontSize: 14 }}>{loyalty.tier.label}</Typography.Text>
            </div>
            <Tag style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', fontWeight: 600, margin: 0 }}>
              {isRetailer ? 'B2B Loyalty' : 'B2C Loyalty'}
            </Tag>
          </div>

          <Typography.Title level={2} style={{ color: '#fff', margin: '0 0 4px', fontSize: 36, fontWeight: 800 }}>
            {loyalty.points.toLocaleString('en-IN')} <span style={{ fontSize: 18, fontWeight: 600, opacity: 0.85 }}>pts</span>
          </Typography.Title>
          <Typography.Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
            Worth {formatInr(loyalty.pointsValueInr)} • {loyalty.lifetimePoints.toLocaleString('en-IN')} earned lifetime
          </Typography.Text>

          {/* Progress to next tier */}
          <div style={{ marginTop: 18 }}>
            {loyalty.nextTier ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Typography.Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>
                    {loyalty.pointsToNextTier.toLocaleString('en-IN')} pts to {loyalty.nextTier.label}
                  </Typography.Text>
                  <Typography.Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>
                    {Math.round(loyalty.progressToNextTier * 100)}%
                  </Typography.Text>
                </div>
                <Progress
                  percent={Math.round(loyalty.progressToNextTier * 100)}
                  showInfo={false}
                  strokeColor="#fde68a"
                  trailColor="rgba(255,255,255,0.25)"
                  size="small"
                />
              </>
            ) : (
              <Typography.Text style={{ color: '#fde68a', fontSize: 12, fontWeight: 600 }}>
                <TrophyFilled /> You've reached the top tier
              </Typography.Text>
            )}
          </div>
        </div>

        {/* How You Earn Points */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <Typography.Text strong style={{ fontSize: 15, display: 'block', marginBottom: 4 }}>How You Earn Points</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
            Every product earns at a rate set by its price — the more a product costs, the higher the
            rate per ₹100 spent. {isRetailer ? 'Wholesale orders earn at 1.5× the rate, in recognition of order volume, ' : ''}
            and your {loyalty.tier.label} tier adds a {Math.round((loyalty.tier.multiplierBonus - 1) * 100)}% bonus on top.
          </Typography.Text>

          <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #f0f0f0', marginBottom: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#fafaf9', color: '#57534e', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px' }}>Product price</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Points per ₹100</th>
                </tr>
              </thead>
              <tbody>
                {PRICE_BAND_TABLE.map((band, idx) => {
                  const prevMax = idx === 0 ? 0 : PRICE_BAND_TABLE[idx - 1].max + 1;
                  const label = band.max === Infinity ? `Above ₹${prevMax - 1}` : `₹${prevMax} – ₹${band.max}`;
                  return (
                    <tr key={band.pointsPer100} style={{ borderTop: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '8px 12px', color: '#212121' }}>{label}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: brandDark }}>
                        {band.pointsPer100} pts
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Typography.Text strong style={{ fontSize: 12, display: 'block', marginBottom: 6, color: '#57534e' }}>
            Worked examples, at your current rate
          </Typography.Text>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {EXAMPLE_PRICES.map((price) => (
              <div key={price} style={{ flex: '1 1 120px', background: '#fafaf9', border: '1px solid #f0f0f0', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                <Typography.Text style={{ fontSize: 12, color: '#78716c', display: 'block' }}>{formatInr(price)} product</Typography.Text>
                <Typography.Text strong style={{ fontSize: 14, color: brandDark }}>
                  +{loyalty.estimateLinePoints(price)} pts
                </Typography.Text>
              </div>
            ))}
          </div>
        </div>

        {/* Tier Ladder */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <Typography.Text strong style={{ fontSize: 15, display: 'block', marginBottom: 12 }}>
            {isRetailer ? 'Partner Tiers' : 'Membership Tiers'}
          </Typography.Text>
          {tiers.map((t, idx) => {
            const isCurrent = t.key === loyalty.tier.key;
            return (
              <div key={t.key}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: isCurrent ? '10px 12px' : '10px 0', background: isCurrent ? `${brandColor}0d` : 'transparent', borderRadius: 10, border: isCurrent ? `1px solid ${brandColor}40` : 'none' }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                    background: `${t.color}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <CrownFilled style={{ color: t.color, fontSize: 15 }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Typography.Text strong style={{ fontSize: 14 }}>{t.label}</Typography.Text>
                      {isCurrent && <Tag color="green" style={{ margin: 0, fontSize: 10 }}>CURRENT</Tag>}
                    </div>
                    <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                      From {t.minLifetimePoints.toLocaleString('en-IN')} lifetime pts • {Math.round((t.multiplierBonus - 1) * 100)}% bonus
                    </Typography.Text>
                    <Typography.Text style={{ fontSize: 12, color: '#57534e' }}>{t.perks.join(' • ')}</Typography.Text>
                  </div>
                </div>
                {idx < tiers.length - 1 && <Divider style={{ margin: '8px 0' }} />}
              </div>
            );
          })}
        </div>

        {/* Redeem Points */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <Typography.Text strong style={{ fontSize: 15, display: 'block', marginBottom: 12 }}>Redeem Points</Typography.Text>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {REDEEM_QUICK_PICKS.map((pts) => {
              const disabled = pts > loyalty.points;
              return (
                <button
                  key={pts}
                  disabled={disabled}
                  onClick={() => setSelectedRedeem(pts)}
                  style={{
                    padding: '8px 16px', borderRadius: 20, border: `1.5px solid ${selectedRedeem === pts ? brandColor : '#e0e0e0'}`,
                    background: selectedRedeem === pts ? `${brandColor}12` : '#fff',
                    color: disabled ? '#c4c4c4' : selectedRedeem === pts ? brandDark : '#424242',
                    fontWeight: 600, fontSize: 13, cursor: disabled ? 'not-allowed' : 'pointer',
                  }}
                >
                  {pts} pts <span style={{ opacity: 0.7 }}>({formatInr(Math.round(pts * POINTS_TO_INR))})</span>
                </button>
              );
            })}
          </div>
          <Button
            type="primary"
            block
            icon={<GiftOutlined />}
            size="large"
            style={{ background: brandColor, borderColor: brandColor, fontWeight: 600, borderRadius: 8 }}
            onClick={handleRedeem}
          >
            {selectedRedeem ? `Redeem ${selectedRedeem} pts for ${formatInr(Math.round(selectedRedeem * POINTS_TO_INR))}` : 'Select Points to Redeem'}
          </Button>

          <div style={{ marginTop: 14, background: '#fafaf9', border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <InfoCircleOutlined style={{ color: '#78716c', fontSize: 14, marginTop: 2 }} />
            <Typography.Text style={{ fontSize: 12, color: '#57534e', lineHeight: 1.6 }}>
              1 point = {formatInr(POINTS_TO_INR)}. Minimum redemption is {MIN_REDEEM_POINTS} points. Up to{' '}
              {Math.round(MAX_REDEEM_SHARE_OF_ORDER * 100)}% of an order's value can be paid with points at checkout.
              Points are valid for {POINTS_VALID_MONTHS} months from the date they're earned.
            </Typography.Text>
          </div>
        </div>

        {/* Points History */}
        <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ padding: '16px 16px 12px' }}>
            <Typography.Text strong style={{ fontSize: 15 }}>Points History</Typography.Text>
          </div>
          <Divider style={{ margin: 0 }} />

          {loyalty.transactions.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center' }}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>No points activity yet</Typography.Text>
            </div>
          ) : (
            loyalty.transactions.map((txn, idx) => (
              <div key={txn.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px' }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                    background: txn.type === 'EARNED' ? '#f0fdf4' : '#fef2f2',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {txn.type === 'EARNED'
                      ? <TrophyFilled style={{ color: '#16a34a', fontSize: 16 }} />
                      : <GiftOutlined style={{ color: '#dc2626', fontSize: 16 }} />
                    }
                  </div>
                  <div style={{ flex: 1 }}>
                    <Typography.Text strong style={{ fontSize: 14 }}>{txn.title}</Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>{txn.subtitle}</Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{txn.date}</Typography.Text>
                  </div>
                  <Typography.Text strong style={{ fontSize: 15, color: txn.points > 0 ? '#16a34a' : '#dc2626' }}>
                    {txn.points > 0 ? '+' : ''}{txn.points} pts
                  </Typography.Text>
                </div>
                {idx < loyalty.transactions.length - 1 && <Divider style={{ margin: '0 16px', width: 'auto', minWidth: 'auto' }} />}
              </div>
            ))
          )}

          <div style={{ padding: '14px', textAlign: 'center' }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              <CheckCircleFilled style={{ color: '#16a34a', marginRight: 6 }} />
              Points update automatically after every order
            </Typography.Text>
          </div>
        </div>

      </div>
    </div>
  );
}
