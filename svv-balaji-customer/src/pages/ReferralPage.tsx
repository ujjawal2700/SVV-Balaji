import {
  ArrowLeftOutlined,
  CheckCircleFilled,
  CheckOutlined,
  ClockCircleFilled,
  CopyOutlined,
  CrownFilled,
  GiftOutlined,
  InfoCircleOutlined,
  QuestionCircleOutlined,
  RightOutlined,
  ShareAltOutlined,
  ShoppingOutlined,
  TeamOutlined,
  TrophyOutlined,
  UserAddOutlined,
  WalletOutlined,
  WhatsAppOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  Card,
  Collapse,
  Divider,
  Empty,
  Modal,
  Skeleton,
  Spin,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { storefrontAuthApi } from '../api/storefrontAuth';
import type { CustomerReferralSummaryResponse, ReferralProgramResponse } from '../api/types';
import { useCustomerAuth } from '../auth/CustomerAuthContext';
import { useLoyalty } from '../loyalty/useLoyalty';

const TRIGGER_DESCRIPTIONS: Record<string, { label: string; condition: string }> = {
  REGISTRATION: {
    label: 'On Registration',
    condition: 'Credited instantly when your friend creates their account.',
  },
  ACCOUNT_VERIFICATION: {
    label: 'On Account Verification',
    condition: 'Credited once your friend verifies their mobile number or KYC is approved.',
  },
  FIRST_ORDER: {
    label: 'On First Order Placed',
    condition: 'Credited when your friend places and confirms their very first order.',
  },
  FIRST_DELIVERY: {
    label: 'On First Order Delivered',
    condition: 'Credited when your friend receives their first delivery safely at their doorstep.',
  },
};

export function ReferralPage() {
  const navigate = useNavigate();
  const { role, customerProfile, retailerProfile } = useCustomerAuth();
  const loyalty = useLoyalty();

  const isRetailer = role === 'RETAILER';
  const isGuest = role === 'GUEST';

  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [programLoading, setProgramLoading] = useState(true);
  const [program, setProgram] = useState<ReferralProgramResponse>({
    isActive: true,
    referrerRewardCoins: 100,
    refereeRewardCoins: 50,
    rewardTrigger: 'FIRST_ORDER',
  });

  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summary, setSummary] = useState<CustomerReferralSummaryResponse | null>(null);

  // Fetch program rules & active configuration
  useEffect(() => {
    let mounted = true;
    storefrontAuthApi
      .getReferralProgram()
      .then((res) => {
        if (mounted && res) setProgram(res);
      })
      .catch(() => {
        // Fallback to project defaults
      })
      .finally(() => {
        if (mounted) setProgramLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Fetch customer's own referral metrics & history
  useEffect(() => {
    if (isGuest) return;
    let mounted = true;
    setSummaryLoading(true);
    storefrontAuthApi
      .getMyReferralSummary()
      .then((res) => {
        if (mounted && res) setSummary(res);
      })
      .catch(() => {
        // Non-critical fallback
      })
      .finally(() => {
        if (mounted) setSummaryLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [isGuest]);

  const activeReferralCode =
    summary?.referralCode ||
    (isRetailer ? retailerProfile?.referralCode : customerProfile?.referralCode) ||
    '';

  const inviteLink = activeReferralCode
    ? `${window.location.origin}/${isRetailer ? 'retailers/register' : 'login'}?ref=${activeReferralCode}`
    : `${window.location.origin}/login`;

  const brandPrimary = isRetailer ? '#059669' : '#ea580c';
  const brandDark = isRetailer ? '#065f46' : '#c2410c';
  const brandBgGradient = isRetailer
    ? 'linear-gradient(135deg, #065f46 0%, #047857 50%, #0d9488 100%)'
    : 'linear-gradient(135deg, #ea580c 0%, #f97316 50%, #fb923c 100%)';

  const triggerInfo =
    TRIGGER_DESCRIPTIONS[program.rewardTrigger] || TRIGGER_DESCRIPTIONS.FIRST_ORDER;

  const handleCopyCode = () => {
    if (!activeReferralCode) {
      message.info('Your referral code is being generated. Please sign in or refresh.');
      return;
    }
    void navigator.clipboard?.writeText(activeReferralCode).then(() => {
      setCopiedCode(true);
      message.success(`Referral code ${activeReferralCode} copied to clipboard!`);
      setTimeout(() => setCopiedCode(false), 2500);
    });
  };

  const handleCopyLink = () => {
    if (!activeReferralCode) {
      message.info('Your referral link is being generated. Please sign in or refresh.');
      return;
    }
    void navigator.clipboard?.writeText(inviteLink).then(() => {
      setCopiedLink(true);
      message.success('Invite link copied! Share it with friends and family.');
      setTimeout(() => setCopiedLink(false), 2500);
    });
  };

  const handleWhatsAppShare = () => {
    if (!activeReferralCode) {
      message.info('Please sign in to share your referral code.');
      return;
    }

    const shareText = isRetailer
      ? `Namaste! 🌾 Join SVV Balaji wholesale mandi direct platform. Register your store with my partner referral code *${activeReferralCode}* to get mandi bulk rates, GST billing, and ₹${program.refereeRewardCoins} welcome reward coins! Join here: ${inviteLink}`
      : `Hey! 🛒 I order fresh, authentic grocery staples & pantry items directly from SVV Balaji / Desi Tokri. Use my referral code *${activeReferralCode}* when signing up to get *₹${program.refereeRewardCoins} worth Reward Coins* on your first purchase! Register here: ${inviteLink}`;

    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    window.open(whatsappUrl, '_blank');
  };

  const handleNativeShare = () => {
    if (!navigator.share) {
      handleCopyLink();
      return;
    }
    const shareText = isRetailer
      ? `Register your retail shop on SVV Balaji with code ${activeReferralCode} for exclusive wholesale pricing and welcome reward coins!`
      : `Shop 100% natural, farm-sourced staples on Desi Tokri. Use code ${activeReferralCode} to get ${program.refereeRewardCoins} welcome coins!`;

    navigator
      .share({
        title: 'Join SVV Balaji Desi Tokri & Earn Rewards',
        text: shareText,
        url: inviteLink,
      })
      .catch(() => {
        // User cancelled share
      });
  };

  const totalFriendsCount = summary?.totalReferred ?? (summary?.referrals.length || 0);
  const successfulCount = summary?.successfulReferrals ?? 0;
  const coinsEarned = summary?.totalCoinsEarned ?? (successfulCount * program.referrerRewardCoins);

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', paddingBottom: 80 }}>
      {/* ========================================================================= */}
      {/* 📱 HEADER NAVIGATION                                                      */}
      {/* ========================================================================= */}
      <header
        style={{
          background: '#ffffff',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #e2e8f0',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 4,
              color: '#334155',
            }}
            aria-label="Back"
          >
            <ArrowLeftOutlined style={{ fontSize: 18 }} />
          </button>
          <div>
            <Typography.Text strong style={{ fontSize: 17, color: '#0f172a' }}>
              Refer & Earn
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 11.5, display: 'block', lineHeight: 1.1 }}>
              {isRetailer ? 'Invite Store Partners' : 'Invite Friends & Family'}
            </Typography.Text>
          </div>
        </div>

        <Link
          to="/loyalty"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: isRetailer ? '#ecfdf5' : '#fff7ed',
            padding: '6px 12px',
            borderRadius: 20,
            textDecoration: 'none',
            border: `1px solid ${isRetailer ? '#a7f3d0' : '#fed7aa'}`,
          }}
        >
          <TrophyOutlined style={{ color: brandPrimary, fontSize: 14 }} />
          <Typography.Text strong style={{ color: brandPrimary, fontSize: 12.5 }}>
            {loyalty.points.toLocaleString('en-IN')} Coins
          </Typography.Text>
        </Link>
      </header>

      {/* Main Container */}
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '16px 16px 40px' }}>
        {/* Desktop Breadcrumb */}
        <div className="desktop-only" style={{ marginBottom: 16 }}>
          <Breadcrumb
            items={[
              { title: <Link to="/">Home</Link> },
              { title: <Link to="/profile">My Account</Link> },
              { title: 'Refer & Earn' },
            ]}
          />
        </div>

        {/* ========================================================================= */}
        {/* 🎁 HERO BANNER                                                            */}
        {/* ========================================================================= */}
        <div
          style={{
            background: brandBgGradient,
            borderRadius: 20,
            padding: '28px 24px',
            color: '#ffffff',
            position: 'relative',
            overflow: 'hidden',
            boxShadow: `0 10px 25px -5px ${isRetailer ? 'rgba(5, 150, 105, 0.35)' : 'rgba(234, 88, 12, 0.35)'}`,
            marginBottom: 20,
          }}
        >
          {/* Ambient decorative elements */}
          <div
            style={{
              position: 'absolute',
              top: -40,
              right: -40,
              width: 160,
              height: 160,
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.1)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: -20,
              left: -20,
              width: 100,
              height: 100,
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.08)',
            }}
          />

          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.2)', padding: '4px 12px', borderRadius: 20, marginBottom: 12 }}>
              <GiftOutlined style={{ fontSize: 13, color: '#fef08a' }} />
              <Typography.Text style={{ color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 0.4 }}>
                {isRetailer ? 'B2B WHOLESALE REFERRAL' : 'DESI TOKRI REFERRAL PROGRAM'}
              </Typography.Text>
            </div>

            <Typography.Title level={2} style={{ color: '#ffffff', margin: '0 0 8px', fontSize: 26, fontWeight: 800, lineHeight: 1.25 }}>
              Earn {program.referrerRewardCoins} Coins for Every Friend!
            </Typography.Title>

            <Typography.Text style={{ color: 'rgba(255,255,255,0.92)', fontSize: 14, display: 'block', maxWidth: 640, lineHeight: 1.5 }}>
              Share your unique referral code with friends. When they sign up and complete their qualification, you get{' '}
              <strong style={{ color: '#fef08a' }}>{program.referrerRewardCoins} Desi Coins (₹{program.referrerRewardCoins})</strong> and they get{' '}
              <strong style={{ color: '#fef08a' }}>{program.refereeRewardCoins} Coins (₹{program.refereeRewardCoins})</strong>.
            </Typography.Text>

            {/* Program Trigger Pill */}
            <div style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.18)', padding: '6px 14px', borderRadius: 10 }}>
              <ClockCircleFilled style={{ color: '#fef08a', fontSize: 13 }} />
              <Typography.Text style={{ color: '#ffffff', fontSize: 12 }}>
                Reward Milestone: <strong>{triggerInfo.label}</strong> ({triggerInfo.condition})
              </Typography.Text>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 🎟️ REFERRAL CODE & SHARING ACTION CARD                                     */}
        {/* ========================================================================= */}
        <Card
          bordered={false}
          style={{
            borderRadius: 18,
            boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
            marginBottom: 24,
            background: '#ffffff',
            border: '1px solid #e2e8f0',
          }}
          bodyStyle={{ padding: '24px 20px' }}
        >
          {isGuest ? (
            <div style={{ textAlign: 'center', padding: '16px 8px' }}>
              <Avatar size={56} icon={<UserAddOutlined />} style={{ background: '#fff7ed', color: '#ea580c', marginBottom: 12 }} />
              <Typography.Title level={4} style={{ margin: '0 0 6px', fontWeight: 700 }}>
                Sign in to Get Your Referral Code
              </Typography.Title>
              <Typography.Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 16 }}>
                Log in with your registered mobile OTP to unlock your personalized shareable invite link and track your earnings.
              </Typography.Text>
              <Button
                type="primary"
                size="large"
                style={{
                  background: brandPrimary,
                  borderColor: brandPrimary,
                  borderRadius: 10,
                  fontWeight: 700,
                  padding: '0 32px',
                }}
                onClick={() => navigate('/login')}
              >
                Sign In / Register Now &rarr;
              </Button>
            </div>
          ) : (
            <div>
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.8, display: 'block', marginBottom: 6 }}>
                  YOUR EXCLUSIVE REFERRAL CODE
                </Typography.Text>

                {activeReferralCode ? (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 12,
                      background: isRetailer ? '#f0fdf4' : '#fff7ed',
                      border: `2px dashed ${isRetailer ? '#10b981' : '#f97316'}`,
                      borderRadius: 14,
                      padding: '12px 28px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    onClick={handleCopyCode}
                  >
                    <Typography.Text
                      style={{
                        fontSize: 24,
                        fontWeight: 800,
                        color: brandDark,
                        letterSpacing: 2,
                        fontFamily: 'monospace',
                      }}
                    >
                      {activeReferralCode}
                    </Typography.Text>
                    <Button
                      type="text"
                      icon={copiedCode ? <CheckOutlined style={{ color: '#16a34a' }} /> : <CopyOutlined style={{ color: brandPrimary }} />}
                      style={{ padding: 0 }}
                    />
                  </div>
                ) : (
                  <Skeleton.Button active style={{ width: 220, height: 48, borderRadius: 14 }} />
                )}

                <div style={{ marginTop: 8 }}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {copiedCode ? '✓ Copied to clipboard!' : 'Tap to copy your code'}
                  </Typography.Text>
                </div>
              </div>

              {/* Action Buttons Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <Button
                  type="primary"
                  size="large"
                  icon={<WhatsAppOutlined style={{ fontSize: 18 }} />}
                  style={{
                    background: '#25D366',
                    borderColor: '#25D366',
                    borderRadius: 10,
                    fontWeight: 700,
                    height: 46,
                  }}
                  onClick={handleWhatsAppShare}
                  block
                >
                  Share via WhatsApp
                </Button>

                <Button
                  size="large"
                  icon={copiedLink ? <CheckOutlined style={{ color: '#16a34a' }} /> : <CopyOutlined />}
                  style={{
                    borderRadius: 10,
                    fontWeight: 600,
                    height: 46,
                    borderColor: copiedLink ? '#16a34a' : '#cbd5e1',
                  }}
                  onClick={handleCopyLink}
                  block
                >
                  {copiedLink ? 'Link Copied!' : 'Copy Invite Link'}
                </Button>

                {typeof navigator !== 'undefined' && 'share' in navigator && (
                  <Button
                    size="large"
                    icon={<ShareAltOutlined />}
                    style={{
                      borderRadius: 10,
                      fontWeight: 600,
                      height: 46,
                    }}
                    onClick={handleNativeShare}
                    block
                  >
                    More Sharing Options
                  </Button>
                )}
              </div>
            </div>
          )}
        </Card>

        {/* ========================================================================= */}
        {/* 📊 REFERRAL PERFORMANCE STATS (FOR LOGGED IN USERS)                       */}
        {/* ========================================================================= */}
        {!isGuest && (
          <div style={{ marginBottom: 24 }}>
            <Typography.Title level={4} style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>
              Your Referral Statistics
            </Typography.Title>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              {/* Total Invited */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 14,
                  padding: '16px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Avatar size={30} icon={<TeamOutlined />} style={{ background: '#eff6ff', color: '#2563eb' }} />
                  <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>
                    TOTAL INVITED
                  </Typography.Text>
                </div>
                <Typography.Text strong style={{ fontSize: 22, color: '#0f172a', display: 'block' }}>
                  {summaryLoading ? <Spin size="small" /> : totalFriendsCount}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 11.5 }}>
                  Friends joined with your code
                </Typography.Text>
              </div>

              {/* Successful Referrals */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 14,
                  padding: '16px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Avatar size={30} icon={<CheckCircleFilled />} style={{ background: '#ecfdf5', color: '#059669' }} />
                  <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>
                    QUALIFIED
                  </Typography.Text>
                </div>
                <Typography.Text strong style={{ fontSize: 22, color: '#059669', display: 'block' }}>
                  {summaryLoading ? <Spin size="small" /> : successfulCount}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 11.5 }}>
                  Rewards credited to wallet
                </Typography.Text>
              </div>

              {/* Total Coins Earned */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 14,
                  padding: '16px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Avatar size={30} icon={<CrownFilled />} style={{ background: '#fffbeb', color: '#d97706' }} />
                  <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>
                    COINS EARNED
                  </Typography.Text>
                </div>
                <Typography.Text strong style={{ fontSize: 22, color: '#d97706', display: 'block' }}>
                  {summaryLoading ? <Spin size="small" /> : coinsEarned.toLocaleString('en-IN')}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 11.5 }}>
                  Worth ₹{coinsEarned.toLocaleString('en-IN')} on orders
                </Typography.Text>
              </div>

              {/* Wallet / Loyalty Balance */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 14,
                  padding: '16px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Avatar size={30} icon={<WalletOutlined />} style={{ background: '#fdf4ff', color: '#a21caf' }} />
                  <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>
                    ACTIVE BALANCE
                  </Typography.Text>
                </div>
                <Typography.Text strong style={{ fontSize: 22, color: '#0f172a', display: 'block' }}>
                  {loyalty.points.toLocaleString('en-IN')} pts
                </Typography.Text>
                <Link to="/loyalty" style={{ fontSize: 11.5, color: brandPrimary, fontWeight: 600 }}>
                  View coin ledger &rarr;
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 🔄 HOW IT WORKS (3-STEP FLOW)                                              */}
        {/* ========================================================================= */}
        <Card
          bordered={false}
          style={{
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            marginBottom: 24,
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          }}
          bodyStyle={{ padding: '20px' }}
        >
          <Typography.Title level={4} style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px', color: '#0f172a' }}>
            How Refer & Earn Works
          </Typography.Title>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            {/* Step 1 */}
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: isRetailer ? '#ecfdf5' : '#fff7ed',
                  color: brandPrimary,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: 15,
                  flexShrink: 0,
                  border: `1.5px solid ${isRetailer ? '#a7f3d0' : '#fed7aa'}`,
                }}
              >
                1
              </div>
              <div>
                <Typography.Text strong style={{ fontSize: 14, color: '#1e293b', display: 'block', marginBottom: 2 }}>
                  Share Your Code or Link
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12.5, lineHeight: 1.4, display: 'block' }}>
                  Send your referral code or direct invite link to friends, relatives, or fellow shop owners via WhatsApp or SMS.
                </Typography.Text>
              </div>
            </div>

            {/* Step 2 */}
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: isRetailer ? '#ecfdf5' : '#fff7ed',
                  color: brandPrimary,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: 15,
                  flexShrink: 0,
                  border: `1.5px solid ${isRetailer ? '#a7f3d0' : '#fed7aa'}`,
                }}
              >
                2
              </div>
              <div>
                <Typography.Text strong style={{ fontSize: 14, color: '#1e293b', display: 'block', marginBottom: 2 }}>
                  Friend Signs Up
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12.5, lineHeight: 1.4, display: 'block' }}>
                  Your friend registers their account and enters your code in the optional referral box during sign-up.
                </Typography.Text>
              </div>
            </div>

            {/* Step 3 */}
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: isRetailer ? '#ecfdf5' : '#fff7ed',
                  color: brandPrimary,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: 15,
                  flexShrink: 0,
                  border: `1.5px solid ${isRetailer ? '#a7f3d0' : '#fed7aa'}`,
                }}
              >
                3
              </div>
              <div>
                <Typography.Text strong style={{ fontSize: 14, color: '#1e293b', display: 'block', marginBottom: 2 }}>
                  Both Earn Rewards!
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12.5, lineHeight: 1.4, display: 'block' }}>
                  You receive <strong>{program.referrerRewardCoins} Coins</strong> and your friend receives <strong>{program.refereeRewardCoins} Coins</strong> automatically {triggerInfo.condition.toLowerCase()}
                </Typography.Text>
              </div>
            </div>
          </div>
        </Card>

        {/* ========================================================================= */}
        {/* 👥 REFERRAL ACTIVITY LIST                                                  */}
        {/* ========================================================================= */}
        {!isGuest && (
          <Card
            bordered={false}
            style={{
              borderRadius: 16,
              border: '1px solid #e2e8f0',
              marginBottom: 24,
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            }}
            bodyStyle={{ padding: '20px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <Typography.Title level={4} style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#0f172a' }}>
                Invited Friends & Progress
              </Typography.Title>
              {summary?.referrals && summary.referrals.length > 0 && (
                <Tag color="orange" style={{ fontWeight: 600, borderRadius: 10 }}>
                  {summary.referrals.length} Joined
                </Tag>
              )}
            </div>

            {summaryLoading ? (
              <Skeleton active paragraph={{ rows: 3 }} />
            ) : !summary?.referrals || summary.referrals.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 12px' }}>
                <Avatar size={48} icon={<TeamOutlined />} style={{ background: '#f1f5f9', color: '#94a3b8', marginBottom: 10 }} />
                <Typography.Text strong style={{ fontSize: 14, color: '#475569', display: 'block' }}>
                  No referrals yet
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12.5, display: 'block', maxWidth: 360, margin: '4px auto 14px' }}>
                  Share your code with friends to start earning Desi Reward Coins on every successful sign-up.
                </Typography.Text>
                <Button
                  type="primary"
                  icon={<WhatsAppOutlined />}
                  style={{ background: '#25D366', borderColor: '#25D366', borderRadius: 8, fontWeight: 600 }}
                  onClick={handleWhatsAppShare}
                >
                  Invite Your First Friend
                </Button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {summary.referrals.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 14px',
                      background: '#f8fafc',
                      borderRadius: 12,
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <Avatar
                        style={{
                          background: item.status === 'QUALIFIED' ? '#ecfdf5' : '#fffbeb',
                          color: item.status === 'QUALIFIED' ? '#059669' : '#d97706',
                          fontWeight: 700,
                        }}
                      >
                        {item.refereeName[0] || 'F'}
                      </Avatar>
                      <div>
                        <Typography.Text strong style={{ fontSize: 13.5, color: '#1e293b', display: 'block' }}>
                          {item.refereeName}
                        </Typography.Text>
                        <Typography.Text type="secondary" style={{ fontSize: 11.5 }}>
                          Joined on {new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </Typography.Text>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      {item.status === 'QUALIFIED' ? (
                        <div>
                          <Tag color="green" style={{ fontWeight: 700, margin: 0 }}>
                            +{program.referrerRewardCoins} Coins
                          </Tag>
                          <Typography.Text style={{ fontSize: 11, color: '#16a34a', display: 'block', marginTop: 2 }}>
                            Credited ✓
                          </Typography.Text>
                        </div>
                      ) : (
                        <div>
                          <Tag color="gold" style={{ fontWeight: 600, margin: 0 }}>
                            Pending
                          </Tag>
                          <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 2 }}>
                            Awaiting milestone
                          </Typography.Text>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* ========================================================================= */}
        {/* ❓ FREQUENTLY ASKED QUESTIONS & PROGRAM RULES (DYNAMIC FROM ADMIN)        */}
        {/* ========================================================================= */}
        <Card
          bordered={false}
          style={{
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          }}
          bodyStyle={{ padding: '20px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <Typography.Title level={4} style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#0f172a' }}>
              Referral Program FAQs
            </Typography.Title>
            <Tag color={isRetailer ? 'green' : 'orange'} style={{ borderRadius: 10, fontWeight: 600 }}>
              {isRetailer ? 'B2B Partner FAQs' : 'Customer FAQs'}
            </Tag>
          </div>

          {programLoading ? (
            <Skeleton active paragraph={{ rows: 4 }} />
          ) : (
            <Collapse
              ghost
              expandIconPosition="end"
              items={(
                (isRetailer ? program.retailerFaqs : program.customerFaqs) || [
                  {
                    question: 'Where do I find my reward coins once earned?',
                    answer: 'All referral reward coins are directly credited to your Desi Rewards balance. You can view your points and past earnings breakdown anytime under Desi Rewards in your profile.',
                  },
                  {
                    question: 'How much are referral coins worth?',
                    answer: '1 Desi Coin = ₹1 INR. You can apply your coins during checkout to deduct the amount from your eligible orders.',
                  },
                  {
                    question: 'When does my reward get credited?',
                    answer: `Per our active program policy (${triggerInfo.label}), rewards are credited automatically ${triggerInfo.condition.toLowerCase()}`,
                  },
                  {
                    question: 'How many coins will my friend and I get?',
                    answer: `You receive ${program.referrerRewardCoins} Coins (₹${program.referrerRewardCoins}) and your friend receives ${program.refereeRewardCoins} Coins (₹${program.refereeRewardCoins})!`,
                  },
                  {
                    question: 'Can I refer myself using multiple phone numbers?',
                    answer: 'Self-referrals (matching phone number or registered email address) are blocked by our audit system to prevent misuse.',
                  },
                ]
              ).map((faq, index) => ({
                key: String(index + 1),
                label: <span style={{ fontWeight: 600, color: '#1e293b' }}>{faq.question}</span>,
                children: (
                  <Typography.Text type="secondary" style={{ fontSize: 13, lineHeight: 1.6 }}>
                    {faq.answer}
                  </Typography.Text>
                ),
              }))}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
