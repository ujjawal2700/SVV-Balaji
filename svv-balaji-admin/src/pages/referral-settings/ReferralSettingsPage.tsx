import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  EyeOutlined,
  GiftOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SaveOutlined,
  SettingOutlined,
  ShopOutlined,
  ThunderboltOutlined,
  UserAddOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  App as AntApp,
  Badge,
  Button,
  Card,
  Col,
  Divider,
  Drawer,
  Empty,
  Input,
  InputNumber,
  Row,
  Skeleton,
  Space,
  Switch,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import type { ReferralFaqItem, ReferralRewardTrigger } from '@shared/api/types';
import { REFERRAL_REWARD_TRIGGERS, REFERRAL_REWARD_TRIGGER_LABELS } from '@shared/api/types';
import { useCan } from '@shared/auth/useCan';
import { PageHeader } from '@shared/components/PageHeader';
import { useReferralSettings, useUpdateReferralSettings } from '@shared/hooks/useReferralSettings';
import { useUpdateWalletSettings, useWalletSettings } from '@shared/hooks/useWallet';

interface Draft {
  referrerRewardCoins: number;
  refereeRewardCoins: number;
  rewardTrigger: ReferralRewardTrigger;
  isActive: boolean;
  customerFaqs: ReferralFaqItem[];
  retailerFaqs: ReferralFaqItem[];
  redemptionEnabled: boolean;
  pointValueInr: number;
  maxRedemptionPercent: number;
  minRedeemPoints: number;
  pointsExpiryMonths: number | null;
}

const TRIGGER_DETAILS: Record<
  ReferralRewardTrigger,
  { title: string; desc: string; icon: string; badge?: string }
> = {
  FIRST_DELIVERY: {
    title: 'First Order Delivery',
    desc: 'Coins are credited only when the friend’s first order is successfully delivered. Safest against return fraud.',
    icon: '📦',
    badge: 'Recommended',
  },
  FIRST_ORDER: {
    title: 'First Successful Order Placed',
    desc: 'Coins are credited as soon as the friend completes checkout and places their very first order.',
    icon: '🛒',
  },
  ACCOUNT_VERIFICATION: {
    title: 'Account Verification',
    desc: 'Coins are awarded after user completes phone OTP & business/profile verification.',
    icon: '🛡️',
  },
  REGISTRATION: {
    title: 'Instant Registration (Signup)',
    desc: 'Coins are awarded immediately upon registration & mobile signup, before any order is placed.',
    icon: '👤',
  },
};

function getTriggerInfo(trigger?: ReferralRewardTrigger) {
  if (trigger && TRIGGER_DETAILS[trigger]) {
    return TRIGGER_DETAILS[trigger];
  }
  return {
    title: trigger ? REFERRAL_REWARD_TRIGGER_LABELS[trigger] || trigger : 'First Delivery',
    desc: 'Coins are credited automatically when condition is met.',
    icon: '⚡',
  };
}

export function ReferralSettingsPage() {
  const { message } = AntApp.useApp();
  const canManage = useCan('REFERRAL_SETTINGS_MANAGE');

  const settings = useReferralSettings();
  const update = useUpdateReferralSettings();
  const walletSettings = useWalletSettings();
  const updateWallet = useUpdateWalletSettings();
  const canManageWallet = useCan('WALLET_MANAGE');

  const [draft, setDraft] = useState<Draft | null>(null);
  const [activeTab, setActiveTab] = useState<'customer' | 'retailer'>('customer');
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!settings.data) return;
    setDraft({
      referrerRewardCoins: settings.data.referrerRewardCoins,
      refereeRewardCoins: settings.data.refereeRewardCoins,
      rewardTrigger: settings.data.rewardTrigger,
      isActive: settings.data.isActive,
      customerFaqs: settings.data.customerFaqs || [],
      retailerFaqs: settings.data.retailerFaqs || [],
      redemptionEnabled: settings.data.redemptionEnabled,
      pointValueInr: settings.data.pointValueInr,
      maxRedemptionPercent: settings.data.maxRedemptionPercent,
      minRedeemPoints: settings.data.minRedeemPoints,
      pointsExpiryMonths: settings.data.pointsExpiryMonths,
    });
  }, [settings.data]);

  const dirty =
    draft !== null &&
    settings.data !== undefined &&
    (draft.referrerRewardCoins !== settings.data.referrerRewardCoins ||
      draft.refereeRewardCoins !== settings.data.refereeRewardCoins ||
      draft.rewardTrigger !== settings.data.rewardTrigger ||
      draft.isActive !== settings.data.isActive ||
      draft.redemptionEnabled !== settings.data.redemptionEnabled ||
      draft.pointValueInr !== settings.data.pointValueInr ||
      draft.maxRedemptionPercent !== settings.data.maxRedemptionPercent ||
      draft.minRedeemPoints !== settings.data.minRedeemPoints ||
      draft.pointsExpiryMonths !== settings.data.pointsExpiryMonths ||
      JSON.stringify(draft.customerFaqs) !== JSON.stringify(settings.data.customerFaqs || []) ||
      JSON.stringify(draft.retailerFaqs) !== JSON.stringify(settings.data.retailerFaqs || []));

  const handleReset = () => {
    if (!settings.data) return;
    setDraft({
      referrerRewardCoins: settings.data.referrerRewardCoins,
      refereeRewardCoins: settings.data.refereeRewardCoins,
      rewardTrigger: settings.data.rewardTrigger,
      isActive: settings.data.isActive,
      customerFaqs: settings.data.customerFaqs || [],
      retailerFaqs: settings.data.retailerFaqs || [],
      redemptionEnabled: settings.data.redemptionEnabled,
      pointValueInr: settings.data.pointValueInr,
      maxRedemptionPercent: settings.data.maxRedemptionPercent,
      minRedeemPoints: settings.data.minRedeemPoints,
      pointsExpiryMonths: settings.data.pointsExpiryMonths,
    });
  };

  const handleSave = async () => {
    if (!draft) return;
    try {
      await update.mutateAsync(draft);
      message.success('Referral settings and dynamic FAQs saved successfully');
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not save referral settings'), 8);
    }
  };

  const handleUpdateFaq = (
    type: 'customer' | 'retailer',
    index: number,
    field: 'question' | 'answer',
    value: string,
  ) => {
    setDraft((d) => {
      if (!d) return d;
      const list = type === 'customer' ? [...d.customerFaqs] : [...d.retailerFaqs];
      list[index] = { ...list[index], [field]: value };
      return type === 'customer' ? { ...d, customerFaqs: list } : { ...d, retailerFaqs: list };
    });
  };

  const handleAddFaq = (type: 'customer' | 'retailer') => {
    setDraft((d) => {
      if (!d) return d;
      const list = type === 'customer' ? [...d.customerFaqs] : [...d.retailerFaqs];
      list.push({ question: '', answer: '' });
      return type === 'customer' ? { ...d, customerFaqs: list } : { ...d, retailerFaqs: list };
    });
  };

  const handleRemoveFaq = (type: 'customer' | 'retailer', index: number) => {
    setDraft((d) => {
      if (!d) return d;
      const list = type === 'customer' ? [...d.customerFaqs] : [...d.retailerFaqs];
      list.splice(index, 1);
      return type === 'customer' ? { ...d, customerFaqs: list } : { ...d, retailerFaqs: list };
    });
  };

  const handleMoveFaq = (type: 'customer' | 'retailer', index: number, direction: 'up' | 'down') => {
    setDraft((d) => {
      if (!d) return d;
      const list = type === 'customer' ? [...d.customerFaqs] : [...d.retailerFaqs];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= list.length) return d;
      const item = list.splice(index, 1)[0];
      list.splice(targetIndex, 0, item);
      return type === 'customer' ? { ...d, customerFaqs: list } : { ...d, retailerFaqs: list };
    });
  };

  const renderFaqEditor = (type: 'customer' | 'retailer') => {
    const list = type === 'customer' ? draft?.customerFaqs || [] : draft?.retailerFaqs || [];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: '12px 16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: type === 'customer' ? '#e0e7ff' : '#fef3c7',
                color: type === 'customer' ? '#4338ca' : '#b45309',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
              }}
            >
              {type === 'customer' ? <UserOutlined /> : <ShopOutlined />}
            </div>
            <div>
              <Typography.Text strong style={{ display: 'block', fontSize: 14 }}>
                {type === 'customer' ? 'B2C Customer FAQs' : 'B2B Retailer / Kirana Partner FAQs'}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {type === 'customer'
                  ? 'Configured questions appear in the Customer Refer & Earn (/refer) accordion.'
                  : 'Configured questions appear on the B2B Store Partner referral section.'}
              </Typography.Text>
            </div>
          </div>
          <Button
            type="primary"
            ghost
            icon={<PlusOutlined />}
            disabled={!canManage}
            onClick={() => handleAddFaq(type)}
            style={{ borderRadius: 8 }}
          >
            Add Question
          </Button>
        </div>

        {list.length === 0 ? (
          <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              background: '#f8fafc',
              border: '2px dashed #cbd5e1',
              borderRadius: 12,
            }}
          >
            <QuestionCircleOutlined style={{ fontSize: 36, color: '#94a3b8', marginBottom: 12 }} />
            <Typography.Text strong style={{ display: 'block', fontSize: 15, color: '#334155' }}>
              No custom FAQs configured yet
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 16 }}>
              The storefront will dynamically generate standard rules based on your coin & trigger settings.
            </Typography.Text>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={!canManage}
              onClick={() => handleAddFaq(type)}
            >
              Create First FAQ
            </Button>
          </div>
        ) : (
          list.map((item, index) => (
            <div
              key={index}
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: '16px 18px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      background: '#4f46e5',
                      color: '#ffffff',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 6,
                      letterSpacing: '0.05em',
                    }}
                  >
                    Q{index + 1}
                  </span>
                  <Typography.Text strong style={{ fontSize: 13, color: '#475569' }}>
                    FAQ Item #{index + 1}
                  </Typography.Text>
                </div>

                {canManage && (
                  <Space size={4}>
                    <Tooltip title="Move up">
                      <Button
                        type="text"
                        size="small"
                        icon={<ArrowUpOutlined />}
                        disabled={index === 0}
                        onClick={() => handleMoveFaq(type, index, 'up')}
                      />
                    </Tooltip>
                    <Tooltip title="Move down">
                      <Button
                        type="text"
                        size="small"
                        icon={<ArrowDownOutlined />}
                        disabled={index === list.length - 1}
                        onClick={() => handleMoveFaq(type, index, 'down')}
                      />
                    </Tooltip>
                    <Tooltip title="Delete FAQ">
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleRemoveFaq(type, index)}
                      />
                    </Tooltip>
                  </Space>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <Typography.Text style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>
                    Question:
                  </Typography.Text>
                  <Input
                    placeholder="e.g., How do I get my 50 referral coins?"
                    value={item.question}
                    disabled={!canManage}
                    onChange={(e) => handleUpdateFaq(type, index, 'question', e.target.value)}
                    style={{ borderRadius: 8, fontWeight: 500 }}
                  />
                </div>
                <div>
                  <Typography.Text style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>
                    Answer:
                  </Typography.Text>
                  <Input.TextArea
                    placeholder="Provide a clear and concise explanation for the customer..."
                    value={item.answer}
                    disabled={!canManage}
                    rows={2}
                    autoSize={{ minRows: 2, maxRows: 6 }}
                    onChange={(e) => handleUpdateFaq(type, index, 'answer', e.target.value)}
                    style={{ borderRadius: 8 }}
                  />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 80 }}>
      {/* Top Header */}
      <PageHeader
        title="Referral & Reward Program"
        subtitle="Manage dual-sided referral coin economics, anti-fraud trigger rules, status kill switch, and dynamic storefront FAQs."
        extra={
          <Space>
            <Button
              icon={<EyeOutlined />}
              onClick={() => setPreviewOpen(true)}
              style={{ borderRadius: 8 }}
            >
              Live Store Preview
            </Button>
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
                  background: dirty ? '#4f46e5' : undefined,
                  borderColor: dirty ? '#4f46e5' : undefined,
                  boxShadow: dirty ? '0 4px 12px rgba(79, 70, 229, 0.35)' : undefined,
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
          {/* Executive Overview Banner */}
          <div
            style={{
              background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)',
              borderRadius: 16,
              padding: '24px 28px',
              color: '#ffffff',
              boxShadow: '0 10px 25px -5px rgba(49, 46, 129, 0.3)',
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
                    background: draft.isActive ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                    border: `1px solid ${draft.isActive ? '#22c55e' : '#ef4444'}`,
                    color: draft.isActive ? '#4ade80' : '#f87171',
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
                      background: draft.isActive ? '#22c55e' : '#ef4444',
                      boxShadow: draft.isActive ? '0 0 8px #22c55e' : 'none',
                    }}
                  />
                  {draft.isActive ? 'Program Live & Active' : 'Program Paused'}
                </span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                  Auto-synced with Customer App
                </span>
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px 0', color: '#ffffff' }}>
                Refer & Earn Economics
              </h2>
              <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
                When an existing user invites a friend, both parties receive reward coins credited according to your rules below.
              </p>
            </div>

            {/* Quick Metrics Pills */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
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
                  Inviter Reward
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#fbbf24', marginTop: 2 }}>
                  {draft.referrerRewardCoins} <span style={{ fontSize: 13, fontWeight: 500, color: '#fef08a' }}>Coins</span>
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
                  Friend Reward
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#34d399', marginTop: 2 }}>
                  {draft.refereeRewardCoins} <span style={{ fontSize: 13, fontWeight: 500, color: '#a7f3d0' }}>Coins</span>
                </div>
              </div>

              <div
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  backdropFilter: 'blur(8px)',
                  borderRadius: 12,
                  padding: '12px 18px',
                  border: '1px solid rgba(255,255,255,0.15)',
                  minWidth: 160,
                }}
              >
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Reward Trigger
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#ffffff', marginTop: 6, whiteSpace: 'nowrap' }}>
                  {getTriggerInfo(draft.rewardTrigger).icon} {getTriggerInfo(draft.rewardTrigger).title}
                </div>
              </div>
            </div>
          </div>

          <Row gutter={[24, 24]}>
            {/* Left Column: Reward Amounts & Trigger Rules */}
            <Col xs={24} lg={14}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* 1. Coin Distribution Cards */}
                <Card
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <GiftOutlined style={{ color: '#4f46e5', fontSize: 18 }} />
                      <span style={{ fontWeight: 600, fontSize: 16 }}>1. Coin Allocation Per Referral</span>
                    </div>
                  }
                  style={{ borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
                >
                  <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 18, fontSize: 13 }}>
                    Set how many loyalty coins are granted to both parties once a referral qualifies.
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                            <span style={{ fontSize: 16 }}>👤</span>
                            <Typography.Text strong style={{ fontSize: 14, color: '#1e293b' }}>
                              Referrer (Inviter)
                            </Typography.Text>
                          </div>
                          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
                            The existing user whose link/code was shared.
                          </Typography.Text>
                        </div>
                        <div>
                          <InputNumber
                            size="large"
                            min={0}
                            step={10}
                            precision={0}
                            addonAfter={<span style={{ fontWeight: 600, color: '#d97706' }}>🪙 Coins</span>}
                            style={{ width: '100%' }}
                            disabled={!canManage}
                            value={draft.referrerRewardCoins}
                            onChange={(value) =>
                              setDraft((d) => (d ? { ...d, referrerRewardCoins: value ?? 0 } : d))
                            }
                          />
                        </div>
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                            <span style={{ fontSize: 16 }}>🎉</span>
                            <Typography.Text strong style={{ fontSize: 14, color: '#1e293b' }}>
                              Referee (Friend / New User)
                            </Typography.Text>
                          </div>
                          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
                            The new customer/retailer who entered the code.
                          </Typography.Text>
                        </div>
                        <div>
                          <InputNumber
                            size="large"
                            min={0}
                            step={10}
                            precision={0}
                            addonAfter={<span style={{ fontWeight: 600, color: '#059669' }}>🪙 Coins</span>}
                            style={{ width: '100%' }}
                            disabled={!canManage}
                            value={draft.refereeRewardCoins}
                            onChange={(value) =>
                              setDraft((d) => (d ? { ...d, refereeRewardCoins: value ?? 0 } : d))
                            }
                          />
                        </div>
                      </div>
                    </Col>
                  </Row>

                  {/* Summary Callout */}
                  <div
                    style={{
                      marginTop: 16,
                      background: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      borderRadius: 10,
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 13,
                      color: '#166534',
                    }}
                  >
                    <InfoCircleOutlined style={{ color: '#16a34a', fontSize: 15 }} />
                    <span>
                      Total payout per successful invite:{' '}
                      <strong>{draft.referrerRewardCoins + draft.refereeRewardCoins} Coins</strong> ({draft.referrerRewardCoins} to inviter + {draft.refereeRewardCoins} to friend).
                    </span>
                  </div>
                </Card>

                {/* 2. Reward Trigger Cards */}
                <Card
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ThunderboltOutlined style={{ color: '#f59e0b', fontSize: 18 }} />
                      <span style={{ fontWeight: 600, fontSize: 16 }}>2. Reward Release Condition (Trigger)</span>
                    </div>
                  }
                  style={{ borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
                >
                  <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 13 }}>
                    Specify exactly when reward coins are automatically credited to their balances.
                  </Typography.Text>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {REFERRAL_REWARD_TRIGGERS.map((triggerKey) => {
                      const info = getTriggerInfo(triggerKey);
                      const isSelected = draft.rewardTrigger === triggerKey;

                      return (
                        <div
                          key={triggerKey}
                          onClick={() => {
                            if (!canManage) return;
                            setDraft((d) => (d ? { ...d, rewardTrigger: triggerKey } : d));
                          }}
                          style={{
                            border: `2px solid ${isSelected ? '#4f46e5' : '#e2e8f0'}`,
                            background: isSelected ? '#f5f3ff' : '#ffffff',
                            borderRadius: 12,
                            padding: '14px 16px',
                            cursor: canManage ? 'pointer' : 'default',
                            transition: 'all 0.2s ease',
                            display: 'flex',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            gap: 12,
                          }}
                        >
                          <div style={{ display: 'flex', gap: 12 }}>
                            <div
                              style={{
                                fontSize: 22,
                                width: 40,
                                height: 40,
                                borderRadius: 8,
                                background: isSelected ? '#e0e7ff' : '#f1f5f9',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              {info.icon}
                            </div>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Typography.Text strong style={{ fontSize: 14, color: isSelected ? '#312e81' : '#1e293b' }}>
                                  {info.title}
                                </Typography.Text>
                                {info.badge && (
                                  <Tag color="success" style={{ borderRadius: 10, fontSize: 10 }}>
                                    {info.badge}
                                  </Tag>
                                )}
                              </div>
                              <Typography.Text type="secondary" style={{ fontSize: 12, marginTop: 2, display: 'block' }}>
                                {info.desc}
                              </Typography.Text>
                            </div>
                          </div>

                          <div
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: '50%',
                              border: `2px solid ${isSelected ? '#4f46e5' : '#cbd5e1'}`,
                              background: isSelected ? '#4f46e5' : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              marginTop: 2,
                            }}
                          >
                            {isSelected && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>

                {/* 2a. Wallet Redemption Mode (referral + loyalty together) */}
                <Card
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <SafetyCertificateOutlined style={{ color: '#7c3aed', fontSize: 18 }} />
                      <span style={{ fontWeight: 600, fontSize: 16 }}>Wallet Redemption Mode</span>
                    </div>
                  }
                  style={{ borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
                >
                  <Typography.Text type="secondary" style={{ fontSize: 12.5, display: 'block', marginBottom: 12 }}>
                    A customer's wallet holds both referral coins and loyalty coins. Choose whether the two are
                    redeemed at checkout separately (each with its own cap) or as one combined balance (the
                    stricter of the two caps applies).
                  </Typography.Text>
                  <Space size={12}>
                    <Button
                      type={walletSettings.data?.redemptionMode === 'SEPARATE' ? 'primary' : 'default'}
                      disabled={!canManageWallet || updateWallet.isPending}
                      onClick={() =>
                        updateWallet.mutate(
                          { redemptionMode: 'SEPARATE' },
                          {
                            onSuccess: () => message.success('Wallet set to separate redemption'),
                            onError: (error) => message.error(apiErrorMessage(error, 'Could not update wallet mode')),
                          },
                        )
                      }
                    >
                      Redeem Separately
                    </Button>
                    <Button
                      type={walletSettings.data?.redemptionMode === 'COMBINED' ? 'primary' : 'default'}
                      disabled={!canManageWallet || updateWallet.isPending}
                      onClick={() =>
                        updateWallet.mutate(
                          { redemptionMode: 'COMBINED' },
                          {
                            onSuccess: () => message.success('Wallet set to combined redemption'),
                            onError: (error) => message.error(apiErrorMessage(error, 'Could not update wallet mode')),
                          },
                        )
                      }
                    >
                      Redeem Combined
                    </Button>
                  </Space>
                </Card>

                {/* 2b. Redemption Configuration */}
                <Card
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ThunderboltOutlined style={{ color: '#f59e0b', fontSize: 18 }} />
                      <span style={{ fontWeight: 600, fontSize: 16 }}>Redemption at Checkout</span>
                    </div>
                  }
                  style={{ borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div>
                      <Typography.Text strong style={{ fontSize: 14, display: 'block', color: '#1e293b' }}>
                        Allow referral coins to be redeemed
                      </Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        While off, coins can still be earned and viewed but never spent at checkout.
                      </Typography.Text>
                    </div>
                    <Switch
                      checked={draft.redemptionEnabled}
                      disabled={!canManage}
                      checkedChildren="ON"
                      unCheckedChildren="OFF"
                      onChange={(checked) => setDraft((d) => (d ? { ...d, redemptionEnabled: checked } : d))}
                    />
                  </div>

                  <Row gutter={[16, 16]}>
                    <Col xs={24} sm={12}>
                      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
                        Coin value (INR per coin)
                      </Typography.Text>
                      <InputNumber
                        min={0.01}
                        step={0.1}
                        style={{ width: '100%' }}
                        disabled={!canManage}
                        value={draft.pointValueInr}
                        onChange={(value) => setDraft((d) => (d ? { ...d, pointValueInr: value ?? 1 } : d))}
                      />
                    </Col>
                    <Col xs={24} sm={12}>
                      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
                        Max % of order payable via referral coins
                      </Typography.Text>
                      <InputNumber
                        min={0}
                        max={100}
                        style={{ width: '100%' }}
                        disabled={!canManage}
                        value={draft.maxRedemptionPercent}
                        onChange={(value) => setDraft((d) => (d ? { ...d, maxRedemptionPercent: value ?? 0 } : d))}
                      />
                    </Col>
                    <Col xs={24} sm={12}>
                      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
                        Minimum coins to redeem
                      </Typography.Text>
                      <InputNumber
                        min={0}
                        style={{ width: '100%' }}
                        disabled={!canManage}
                        value={draft.minRedeemPoints}
                        onChange={(value) => setDraft((d) => (d ? { ...d, minRedeemPoints: value ?? 0 } : d))}
                      />
                    </Col>
                    <Col xs={24} sm={12}>
                      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
                        Coin expiry (months, blank = never)
                      </Typography.Text>
                      <InputNumber
                        min={1}
                        style={{ width: '100%' }}
                        disabled={!canManage}
                        value={draft.pointsExpiryMonths ?? undefined}
                        onChange={(value) => setDraft((d) => (d ? { ...d, pointsExpiryMonths: value ?? null } : d))}
                      />
                    </Col>
                  </Row>
                </Card>

                {/* 3. Program Status / Switch */}
                <Card
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <SettingOutlined style={{ color: '#0ea5e9', fontSize: 18 }} />
                      <span style={{ fontWeight: 600, fontSize: 16 }}>3. Master Program Status</span>
                    </div>
                  }
                  style={{ borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <Typography.Text strong style={{ fontSize: 14, display: 'block', color: '#1e293b' }}>
                        Referral Program {draft.isActive ? 'Active' : 'Paused'}
                      </Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {draft.isActive
                          ? 'Referral codes can be shared and entered at checkout/signup.'
                          : 'Temporarily halts new code usage and pauses pending coin payouts.'}
                      </Typography.Text>
                    </div>

                    <Switch
                      checked={draft.isActive}
                      disabled={!canManage}
                      checkedChildren="ON"
                      unCheckedChildren="OFF"
                      onChange={(checked) => setDraft((d) => (d ? { ...d, isActive: checked } : d))}
                      style={{ transform: 'scale(1.1)' }}
                    />
                  </div>

                  {!draft.isActive && (
                    <div
                      style={{
                        marginTop: 14,
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderRadius: 8,
                        padding: '10px 14px',
                        color: '#991b1b',
                        fontSize: 12,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <InfoCircleOutlined style={{ color: '#ef4444' }} />
                      <span>Warning: While paused, customers attempting to enter referral codes will be informed the campaign is on hold.</span>
                    </div>
                  )}
                </Card>
              </div>
            </Col>

            {/* Right Column: Dynamic FAQ Manager */}
            <Col xs={24} lg={10}>
              <Card
                title={
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <QuestionCircleOutlined style={{ color: '#8b5cf6', fontSize: 18 }} />
                      <span style={{ fontWeight: 600, fontSize: 16 }}>4. Dynamic Storefront FAQs</span>
                    </div>
                    <Tag color="purple" style={{ borderRadius: 12, fontWeight: 600 }}>
                      {(draft.customerFaqs?.length || 0) + (draft.retailerFaqs?.length || 0)} Total
                    </Tag>
                  </div>
                }
                style={{ borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', height: '100%' }}
              >
                <Tabs
                  activeKey={activeTab}
                  onChange={(k) => setActiveTab(k as 'customer' | 'retailer')}
                  items={[
                    {
                      key: 'customer',
                      label: (
                        <span>
                          <UserOutlined /> Customer (B2C){' '}
                          <Badge
                            count={draft.customerFaqs?.length || 0}
                            style={{ backgroundColor: activeTab === 'customer' ? '#4f46e5' : '#94a3b8' }}
                          />
                        </span>
                      ),
                      children: renderFaqEditor('customer'),
                    },
                    {
                      key: 'retailer',
                      label: (
                        <span>
                          <ShopOutlined /> Retailer (B2B){' '}
                          <Badge
                            count={draft.retailerFaqs?.length || 0}
                            style={{ backgroundColor: activeTab === 'retailer' ? '#4f46e5' : '#94a3b8' }}
                          />
                        </span>
                      ),
                      children: renderFaqEditor('retailer'),
                    },
                  ]}
                />
              </Card>
            </Col>
          </Row>

          {/* Sticky Unsaved Changes Bar */}
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
                    background: '#f59e0b',
                    boxShadow: '0 0 8px #f59e0b',
                  }}
                />
                <span style={{ fontSize: 13, fontWeight: 500 }}>You have unsaved changes</span>
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
                    background: '#4f46e5',
                    borderColor: '#4f46e5',
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

      {/* Live Storefront Mockup Drawer */}
      <Drawer
        title="Live Storefront Refer & Earn Preview"
        placement="right"
        width={480}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      >
        {draft && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              This is a live mockup of what customers see on the Customer Storefront (`/refer`) based on your current settings.
            </Typography.Text>

            {/* Mock Hero Box */}
            <div
              style={{
                background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 60%, #3b82f6 100%)',
                borderRadius: 16,
                padding: 20,
                color: '#fff',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  padding: '3px 10px',
                  borderRadius: 20,
                  display: 'inline-block',
                  fontSize: 11,
                  fontWeight: 600,
                  marginBottom: 10,
                }}
              >
                SVV BALAJI REWARD PROGRAM
              </div>
              <h3 style={{ margin: '0 0 6px 0', color: '#fff', fontSize: 20, fontWeight: 800 }}>
                Refer & Earn {draft.referrerRewardCoins} Coins
              </h3>
              <p style={{ margin: 0, fontSize: 12, opacity: 0.9 }}>
                Invite friends! They get {draft.refereeRewardCoins} Coins & you get {draft.referrerRewardCoins} Coins!
              </p>

              <div
                style={{
                  background: '#ffffff',
                  color: '#1e293b',
                  borderRadius: 10,
                  padding: '10px 14px',
                  marginTop: 14,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                <span>BALAJI-VIP99</span>
                <span style={{ color: '#2563eb', fontSize: 12, cursor: 'pointer' }}>COPY</span>
              </div>
            </div>

            {/* How it works mock */}
            <div style={{ background: '#f8fafc', borderRadius: 12, padding: 14, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#334155' }}>
                Reward Logic Rule
              </div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                Trigger: <strong>{getTriggerInfo(draft.rewardTrigger).title}</strong>
              </div>
            </div>

            {/* Dynamic FAQs mock */}
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#334155' }}>
                Storefront FAQs ({draft.customerFaqs.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {draft.customerFaqs.map((faq, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: 8,
                      padding: '10px 12px',
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>
                      {faq.question || 'Untitled Question'}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                      {faq.answer || 'No answer provided yet'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
