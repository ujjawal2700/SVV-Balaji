import {
  CalculatorOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  ExperimentOutlined,
  InfoCircleOutlined,
  PercentageOutlined,
  SafetyCertificateOutlined,
  SaveOutlined,
  SettingOutlined,
  ShopOutlined,
  TagOutlined,
  TrophyOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Col,
  Divider,
  InputNumber,
  Row,
  Skeleton,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import type { LoyaltyCalculationBase, LoyaltySettings, UpdateLoyaltySettingsInput } from '@shared/api/loyalty';
import { LOYALTY_CALCULATION_BASE_LABELS } from '@shared/api/loyalty';
import { useCan } from '@shared/auth/useCan';
import { PageHeader } from '@shared/components/PageHeader';
import { useLoyaltySettings, useUpdateLoyaltySettings } from '@shared/hooks/useLoyalty';

interface Draft {
  isActive: boolean;
  earnPercentB2C: number;
  earnPercentB2B: number;
  pointValueInr: number;
  calculationBase: LoyaltyCalculationBase;
  defaultEligible: boolean;
  appliesToDiscountedProducts: boolean;
  minEligibleItemAmount: number | null;
  minEligibleOrderAmount: number | null;
  maxRewardPerOrderInr: number | null;
  pointsExpiryMonths: number | null;
}

const asNumber = (v: string | null) => (v === null ? null : Number(v));

const toDraft = (s: LoyaltySettings): Draft => ({
  isActive: s.isActive,
  earnPercentB2C: Number(s.earnPercentB2C),
  earnPercentB2B: Number(s.earnPercentB2B),
  pointValueInr: Number(s.pointValueInr),
  calculationBase: s.calculationBase,
  defaultEligible: s.defaultEligible,
  appliesToDiscountedProducts: s.appliesToDiscountedProducts,
  minEligibleItemAmount: asNumber(s.minEligibleItemAmount),
  minEligibleOrderAmount: asNumber(s.minEligibleOrderAmount),
  maxRewardPerOrderInr: asNumber(s.maxRewardPerOrderInr),
  pointsExpiryMonths: s.pointsExpiryMonths,
});

const BASE_OPTIONS: {
  key: LoyaltyCalculationBase;
  title: string;
  desc: string;
  badge?: string;
}[] = [
  {
    key: 'EXCLUDING_TAX',
    title: 'Excluding Tax (Net Product Price)',
    desc: 'Percentage applies to taxable line value before GST. Standard accounting practice.',
    badge: 'Recommended',
  },
  {
    key: 'INCLUDING_TAX',
    title: 'Including Tax (Gross Amount)',
    desc: 'Percentage applies to the full customer price including GST.',
  },
];

export function LoyaltySettingsPage() {
  const { message } = AntApp.useApp();
  const canManage = useCan('LOYALTY_MANAGE');
  const settings = useLoyaltySettings();
  const update = useUpdateLoyaltySettings();
  const [draft, setDraft] = useState<Draft | null>(null);

  // Live Simulator State
  const [simAmount, setSimAmount] = useState<number>(2000);

  useEffect(() => {
    if (settings.data) setDraft(toDraft(settings.data));
  }, [settings.data]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  const dirty =
    draft !== null && settings.data !== undefined && JSON.stringify(draft) !== JSON.stringify(toDraft(settings.data));

  const handleReset = () => {
    if (settings.data) setDraft(toDraft(settings.data));
  };

  const handleSave = async () => {
    if (!draft) return;
    const input: UpdateLoyaltySettingsInput = { ...draft, pointsExpiryMonths: draft.pointsExpiryMonths ?? 0 };
    try {
      await update.mutateAsync(input);
      message.success('Loyalty settings saved — applies to orders delivered from now on');
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not save loyalty settings'), 8);
    }
  };

  // Live Simulation Math
  const simB2CReward = draft ? (simAmount * draft.earnPercentB2C) / 100 : 0;
  const simB2BCappedReward = draft?.maxRewardPerOrderInr
    ? Math.min(simB2CReward, draft.maxRewardPerOrderInr)
    : simB2CReward;
  const simB2CPoints = draft && draft.pointValueInr > 0 ? Math.floor(simB2BCappedReward / draft.pointValueInr) : 0;

  const simB2BReward = draft ? (simAmount * draft.earnPercentB2B) / 100 : 0;
  const simB2BPoints = draft && draft.pointValueInr > 0 ? Math.floor(simB2BReward / draft.pointValueInr) : 0;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 80 }}>
      {/* Top Header */}
      <PageHeader
        title="Loyalty Rewards & Cashback"
        subtitle="Customers and retail partners earn loyalty reward points on delivered orders. Points can be redeemed as discount coins on future purchases."
        extra={
          <Space>
            {canManage && dirty && (
              <Button onClick={handleReset} style={{ borderRadius: 8 }}>
                Discard
              </Button>
            )}
            {canManage && (
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={update.isPending}
                disabled={!dirty}
                onClick={() => void handleSave()}
                style={{
                  borderRadius: 8,
                  background: dirty ? '#059669' : undefined,
                  borderColor: dirty ? '#059669' : undefined,
                  boxShadow: dirty ? '0 4px 12px rgba(5, 150, 105, 0.35)' : undefined,
                }}
              >
                Save Changes
              </Button>
            )}
          </Space>
        }
      />

      {settings.isLoading || !draft ? (
        <Card style={{ borderRadius: 16 }}>
          <Skeleton active paragraph={{ rows: 10 }} />
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Executive Overview Hero Banner */}
          <div
            style={{
              background: 'linear-gradient(135deg, #064e3b 0%, #065f46 50%, #047857 100%)',
              borderRadius: 16,
              padding: '24px 28px',
              color: '#ffffff',
              boxShadow: '0 10px 25px -5px rgba(6, 78, 59, 0.3)',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 20,
            }}
          >
            <div style={{ maxWidth: 500 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span
                  style={{
                    background: draft.isActive ? 'rgba(52, 211, 153, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                    border: `1px solid ${draft.isActive ? '#34d399' : '#ef4444'}`,
                    color: draft.isActive ? '#a7f3d0' : '#fca5a5',
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '2px 10px',
                    borderRadius: 20,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: draft.isActive ? '#34d399' : '#ef4444',
                      boxShadow: draft.isActive ? '0 0 8px #34d399' : 'none',
                    }}
                  />
                  {draft.isActive ? 'Loyalty Engine Active' : 'Loyalty Engine Paused'}
                </span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                  Trigger: On Order Delivered
                </span>
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px 0', color: '#ffffff' }}>
                Customer & Retailer Cashback Engine
              </h2>
              <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.5 }}>
                Orders earn a percentage reward once delivered. Points are stored in each customer’s wallet ledger and can be redeemed seamlessly at checkout.
              </p>
            </div>

            {/* Quick Metrics Badges */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  backdropFilter: 'blur(8px)',
                  borderRadius: 12,
                  padding: '12px 18px',
                  border: '1px solid rgba(255,255,255,0.15)',
                  minWidth: 120,
                }}
              >
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', fontWeight: 600 }}>
                  B2C Earning
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#fef08a', marginTop: 2 }}>
                  {draft.earnPercentB2C}%
                </div>
              </div>

              <div
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  backdropFilter: 'blur(8px)',
                  borderRadius: 12,
                  padding: '12px 18px',
                  border: '1px solid rgba(255,255,255,0.15)',
                  minWidth: 120,
                }}
              >
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', fontWeight: 600 }}>
                  B2B Earning
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#a7f3d0', marginTop: 2 }}>
                  {draft.earnPercentB2B}%
                </div>
              </div>

              <div
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  backdropFilter: 'blur(8px)',
                  borderRadius: 12,
                  padding: '12px 18px',
                  border: '1px solid rgba(255,255,255,0.15)',
                  minWidth: 130,
                }}
              >
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Point Value
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#ffffff', marginTop: 4 }}>
                  1 Pt = ₹{draft.pointValueInr}
                </div>
              </div>

              <div
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  backdropFilter: 'blur(8px)',
                  borderRadius: 12,
                  padding: '12px 18px',
                  border: '1px solid rgba(255,255,255,0.15)',
                  minWidth: 120,
                }}
              >
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Expiry
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#ffffff', marginTop: 6 }}>
                  {draft.pointsExpiryMonths ? `${draft.pointsExpiryMonths} Months` : 'Never'}
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Live Reward Simulator */}
          <Card
            style={{
              borderRadius: 16,
              background: 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%)',
              border: '1px solid #bbf7d0',
              boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: '#dcfce7',
                    color: '#16a34a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                  }}
                >
                  <CalculatorOutlined />
                </div>
                <div>
                  <Typography.Text strong style={{ fontSize: 15, color: '#14532d', display: 'block' }}>
                    Live Reward Calculator Simulator
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Test how your current draft percentages and caps compute for sample order amounts.
                  </Typography.Text>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Typography.Text style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>
                  Sample Order Value:
                </Typography.Text>
                <InputNumber
                  size="middle"
                  min={100}
                  step={500}
                  addonBefore="₹"
                  value={simAmount}
                  onChange={(v) => setSimAmount(v ?? 1000)}
                  style={{ width: 140, borderRadius: 8 }}
                />
              </div>
            </div>

            <Divider style={{ margin: '16px 0' }} />

            <Row gutter={[16, 16]}>
              <Col xs={24} sm={12}>
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 12,
                    padding: '14px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <UserOutlined style={{ color: '#059669', fontSize: 18 }} />
                    <div>
                      <Typography.Text strong style={{ fontSize: 13, color: '#1e293b' }}>
                        Customer (B2C at {draft.earnPercentB2C}%)
                      </Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                        Reward value: ₹{simB2BCappedReward.toFixed(2)}
                      </Typography.Text>
                    </div>
                  </div>
                  <Tag color="green" style={{ fontSize: 14, fontWeight: 700, padding: '4px 10px', borderRadius: 8 }}>
                    +{simB2CPoints} Points (🪙 Coins)
                  </Tag>
                </div>
              </Col>

              <Col xs={24} sm={12}>
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 12,
                    padding: '14px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <ShopOutlined style={{ color: '#0284c7', fontSize: 18 }} />
                    <div>
                      <Typography.Text strong style={{ fontSize: 13, color: '#1e293b' }}>
                        Retailer (B2B at {draft.earnPercentB2B}%)
                      </Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                        Reward value: ₹{simB2BReward.toFixed(2)}
                      </Typography.Text>
                    </div>
                  </div>
                  <Tag color="blue" style={{ fontSize: 14, fontWeight: 700, padding: '4px 10px', borderRadius: 8 }}>
                    +{simB2BPoints} Points (🪙 Coins)
                  </Tag>
                </div>
              </Col>
            </Row>
          </Card>

          <Row gutter={[24, 24]}>
            {/* Left Column: Rates, Valuation & Base */}
            <Col xs={24} lg={13}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* 1. Earning Rates */}
                <Card
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <PercentageOutlined style={{ color: '#059669', fontSize: 18 }} />
                      <span style={{ fontWeight: 600, fontSize: 16 }}>1. Channel Earning Percentage</span>
                    </div>
                  }
                  style={{ borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
                >
                  <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 18, fontSize: 13 }}>
                    Specify how much cashback percentage customers and store partners earn on delivered purchases.
                  </Typography.Text>

                  <Row gutter={[16, 16]}>
                    <Col xs={24} sm={12}>
                      <div
                        style={{
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: 12,
                          padding: 16,
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            <UserOutlined style={{ color: '#059669' }} />
                            <Typography.Text strong style={{ fontSize: 14, color: '#1e293b' }}>
                              Customers (B2C)
                            </Typography.Text>
                          </div>
                          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
                            Standard retail buyers on the customer mobile/web app.
                          </Typography.Text>
                        </div>
                        <InputNumber
                          size="large"
                          min={0}
                          max={100}
                          step={0.5}
                          precision={2}
                          addonAfter={<span style={{ fontWeight: 700 }}>%</span>}
                          style={{ width: '100%' }}
                          disabled={!canManage}
                          value={draft.earnPercentB2C}
                          onChange={(v) => set('earnPercentB2C', v ?? 0)}
                        />
                      </div>
                    </Col>

                    <Col xs={24} sm={12}>
                      <div
                        style={{
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: 12,
                          padding: 16,
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            <ShopOutlined style={{ color: '#0284c7' }} />
                            <Typography.Text strong style={{ fontSize: 14, color: '#1e293b' }}>
                              Retailers (B2B)
                            </Typography.Text>
                          </div>
                          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
                            Wholesale partners & verified Kirana store accounts.
                          </Typography.Text>
                        </div>
                        <InputNumber
                          size="large"
                          min={0}
                          max={100}
                          step={0.5}
                          precision={2}
                          addonAfter={<span style={{ fontWeight: 700 }}>%</span>}
                          style={{ width: '100%' }}
                          disabled={!canManage}
                          value={draft.earnPercentB2B}
                          onChange={(v) => set('earnPercentB2B', v ?? 0)}
                        />
                      </div>
                    </Col>
                  </Row>

                  <div
                    style={{
                      marginTop: 16,
                      background: '#f8fafc',
                      borderRadius: 10,
                      border: '1px solid #e2e8f0',
                      padding: '14px 16px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                      <div>
                        <Typography.Text strong style={{ fontSize: 13, color: '#1e293b' }}>
                          Point Currency Valuation (Rupee Exchange)
                        </Typography.Text>
                        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                          1 Loyalty Point is worth how many Indian Rupees (₹).
                        </Typography.Text>
                      </div>
                      <div style={{ minWidth: 160 }}>
                        <InputNumber
                          size="large"
                          min={0.01}
                          step={0.25}
                          precision={2}
                          addonBefore="₹"
                          addonAfter="per Pt"
                          style={{ width: '100%' }}
                          disabled={!canManage}
                          value={draft.pointValueInr}
                          onChange={(v) => set('pointValueInr', v ?? 1)}
                        />
                      </div>
                    </div>
                  </div>
                </Card>

                {/* 2. Calculation Base */}
                <Card
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <TagOutlined style={{ color: '#6366f1', fontSize: 18 }} />
                      <span style={{ fontWeight: 600, fontSize: 16 }}>2. Calculation Base</span>
                    </div>
                  }
                  style={{ borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
                >
                  <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 13 }}>
                    Choose whether the earning percentage applies to the net taxable amount or gross item price.
                  </Typography.Text>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {BASE_OPTIONS.map((opt) => {
                      const isSelected = draft.calculationBase === opt.key;
                      return (
                        <div
                          key={opt.key}
                          onClick={() => {
                            if (!canManage) return;
                            set('calculationBase', opt.key);
                          }}
                          style={{
                            border: `2px solid ${isSelected ? '#059669' : '#e2e8f0'}`,
                            background: isSelected ? '#f0fdf4' : '#ffffff',
                            borderRadius: 12,
                            padding: '14px 16px',
                            cursor: canManage ? 'pointer' : 'default',
                            transition: 'all 0.2s ease',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <Typography.Text strong style={{ fontSize: 14, color: isSelected ? '#065f46' : '#1e293b' }}>
                                {opt.title}
                              </Typography.Text>
                              {opt.badge && (
                                <Tag color="success" style={{ borderRadius: 10, fontSize: 10 }}>
                                  {opt.badge}
                                </Tag>
                              )}
                            </div>
                            <Typography.Text type="secondary" style={{ fontSize: 12, marginTop: 2, display: 'block' }}>
                              {opt.desc}
                            </Typography.Text>
                          </div>

                          <div
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: '50%',
                              border: `2px solid ${isSelected ? '#059669' : '#cbd5e1'}`,
                              background: isSelected ? '#059669' : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {isSelected && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>

                {/* 3. Product & Promotion Eligibility */}
                <Card
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <CheckCircleOutlined style={{ color: '#10b981', fontSize: 18 }} />
                      <span style={{ fontWeight: 600, fontSize: 16 }}>3. Product & Discount Eligibility</span>
                    </div>
                  }
                  style={{ borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div
                      style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: 12,
                        padding: '14px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <Typography.Text strong style={{ fontSize: 14, color: '#1e293b', display: 'block' }}>
                          Default Product Eligibility
                        </Typography.Text>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          Products with no individual rule automatically participate in earning loyalty points.
                        </Typography.Text>
                      </div>
                      <Switch
                        checked={draft.defaultEligible}
                        disabled={!canManage}
                        checkedChildren="ON"
                        unCheckedChildren="OFF"
                        onChange={(v) => set('defaultEligible', v)}
                      />
                    </div>

                    <div
                      style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: 12,
                        padding: '14px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <Typography.Text strong style={{ fontSize: 14, color: '#1e293b', display: 'block' }}>
                          Earn on Discounted / Offer Items
                        </Typography.Text>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          Allow customers to earn points on items already sold below MRP or on clearance schemes.
                        </Typography.Text>
                      </div>
                      <Switch
                        checked={draft.appliesToDiscountedProducts}
                        disabled={!canManage}
                        checkedChildren="ON"
                        unCheckedChildren="OFF"
                        onChange={(v) => set('appliesToDiscountedProducts', v)}
                      />
                    </div>
                  </div>
                </Card>
              </div>
            </Col>

            {/* Right Column: Limits, Expiry & Master Controls */}
            <Col xs={24} lg={11}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* 4. Order Limits & Safety Caps */}
                <Card
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <SafetyCertificateOutlined style={{ color: '#f59e0b', fontSize: 18 }} />
                      <span style={{ fontWeight: 600, fontSize: 16 }}>4. Order Thresholds & Safety Caps</span>
                    </div>
                  }
                  style={{ borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
                >
                  <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 13 }}>
                    Set qualification thresholds and maximum cashback limits to safeguard margins.
                  </Typography.Text>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px' }}>
                      <Typography.Text strong style={{ fontSize: 13, color: '#1e293b', display: 'block', marginBottom: 2 }}>
                        Min Order Value to Qualify
                      </Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
                        Orders below this total earn 0 points. Leave blank for no minimum.
                      </Typography.Text>
                      <InputNumber
                        min={0}
                        precision={0}
                        addonBefore="₹"
                        placeholder="No minimum (e.g. 500)"
                        style={{ width: '100%' }}
                        disabled={!canManage}
                        value={draft.minEligibleOrderAmount}
                        onChange={(v) => set('minEligibleOrderAmount', v)}
                      />
                    </div>

                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px' }}>
                      <Typography.Text strong style={{ fontSize: 13, color: '#1e293b', display: 'block', marginBottom: 2 }}>
                        Min Single Item Value
                      </Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
                        Individual product lines priced below this amount earn 0 points.
                      </Typography.Text>
                      <InputNumber
                        min={0}
                        precision={0}
                        addonBefore="₹"
                        placeholder="No minimum (e.g. 50)"
                        style={{ width: '100%' }}
                        disabled={!canManage}
                        value={draft.minEligibleItemAmount}
                        onChange={(v) => set('minEligibleItemAmount', v)}
                      />
                    </div>

                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Typography.Text strong style={{ fontSize: 13, color: '#1e293b' }}>
                          Max Reward Cap Per Order
                        </Typography.Text>
                        <Tag color="warning" style={{ fontSize: 10, borderRadius: 8 }}>Safety Cap</Tag>
                      </div>
                      <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
                        Maximum rupee cashback a customer can earn on a single order.
                      </Typography.Text>
                      <InputNumber
                        min={0}
                        precision={0}
                        addonBefore="₹"
                        placeholder="No cap (e.g. 500)"
                        style={{ width: '100%' }}
                        disabled={!canManage}
                        value={draft.maxRewardPerOrderInr}
                        onChange={(v) => set('maxRewardPerOrderInr', v)}
                      />
                    </div>
                  </div>
                </Card>

                {/* 5. Points Expiry Lifecycle */}
                <Card
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ClockCircleOutlined style={{ color: '#0ea5e9', fontSize: 18 }} />
                      <span style={{ fontWeight: 600, fontSize: 16 }}>5. Points Expiry Policy</span>
                    </div>
                  }
                  style={{ borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                    <div>
                      <Typography.Text strong style={{ fontSize: 14, color: '#1e293b', display: 'block' }}>
                        Points Expire After
                      </Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {draft.pointsExpiryMonths ? `Points lapse ${draft.pointsExpiryMonths} months after delivery.` : '0 = Points never expire.'}
                      </Typography.Text>
                    </div>

                    <div style={{ width: 140 }}>
                      <InputNumber
                        min={0}
                        max={120}
                        precision={0}
                        addonAfter="Months"
                        style={{ width: '100%' }}
                        disabled={!canManage}
                        value={draft.pointsExpiryMonths ?? 0}
                        onChange={(v) => set('pointsExpiryMonths', v ?? 0)}
                      />
                    </div>
                  </div>
                </Card>

                {/* 6. Master Kill Switch & Audit Policy */}
                <Card
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <SettingOutlined style={{ color: '#64748b', fontSize: 18 }} />
                      <span style={{ fontWeight: 600, fontSize: 16 }}>6. Master Program State</span>
                    </div>
                  }
                  style={{ borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <Typography.Text strong style={{ fontSize: 14, display: 'block', color: '#1e293b' }}>
                        Loyalty Rewards {draft.isActive ? 'Active' : 'Paused'}
                      </Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {draft.isActive
                          ? 'Eligible delivered orders automatically credit points to customer ledgers.'
                          : 'Temporarily stops point accrual on newly delivered orders.'}
                      </Typography.Text>
                    </div>

                    <Switch
                      checked={draft.isActive}
                      disabled={!canManage}
                      checkedChildren="ON"
                      unCheckedChildren="OFF"
                      onChange={(v) => set('isActive', v)}
                      style={{ transform: 'scale(1.1)' }}
                    />
                  </div>

                  <div
                    style={{
                      marginTop: 14,
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: 10,
                      padding: '10px 14px',
                      color: '#475569',
                      fontSize: 12,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <InfoCircleOutlined style={{ color: '#059669' }} />
                    <span>Audit Policy: Changes apply exclusively to future delivered orders. Past ledgers remain permanently sealed and immutable.</span>
                  </div>
                </Card>
              </div>
            </Col>
          </Row>

          {/* Sticky Unsaved Changes Floating Bar */}
          {canManage && dirty && (
            <div
              style={{
                position: 'fixed',
                bottom: 24,
                left: '50%',
                transform: 'translateX(-50%)',
                background: '#1e293b',
                color: '#ffffff',
                padding: '12px 24px',
                borderRadius: 50,
                boxShadow: '0 12px 30px rgba(0,0,0,0.25)',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                zIndex: 1000,
                border: '1px solid rgba(255,255,255,0.15)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#10b981',
                    boxShadow: '0 0 8px #10b981',
                  }}
                />
                <span style={{ fontSize: 13, fontWeight: 500 }}>You have unsaved loyalty changes</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Button size="small" onClick={handleReset} style={{ borderRadius: 20 }}>
                  Reset
                </Button>
                <Button
                  type="primary"
                  size="small"
                  icon={<SaveOutlined />}
                  loading={update.isPending}
                  onClick={() => void handleSave()}
                  style={{
                    borderRadius: 20,
                    background: '#059669',
                    borderColor: '#059669',
                    fontWeight: 600,
                  }}
                >
                  Save Settings
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
