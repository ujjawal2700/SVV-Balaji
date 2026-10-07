import {
  ArrowLeftOutlined,
  BankOutlined,
  CheckCircleFilled,
  CheckCircleOutlined,
  ClockCircleFilled,
  CloseCircleFilled,
  CopyOutlined,
  CreditCardOutlined,
  FireOutlined,
  GiftOutlined,
  InfoCircleOutlined,
  LinkOutlined,
  MailOutlined,
  QuestionCircleOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
  ShareAltOutlined,
  ShopOutlined,
  StopFilled,
  ThunderboltOutlined,
  UserOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, App as AntApp, Button, Checkbox, Collapse, Empty, Form, Input, Modal, Pagination, Radio, Select, Skeleton, Tag, Tooltip, Typography,
} from 'antd';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { apiErrorMessage } from '../api/client';
import {
  affiliateApi, COMMISSION_STATUS_COLOR, COMMISSION_STATUS_LABEL, type AffiliateMe, type AffiliateProfile, type ApplyBody, type CommissionRow,
  type PayoutDetails,
} from '../api/affiliate';
import { useCustomerAuth } from '../auth/CustomerAuthContext';
import { buildAffiliateLink } from '../utils/affiliateLink';
import { formatInr } from '../utils/money';

const card = { background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' } as const;
const day = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const QUERY_KEY = ['storefront', 'affiliate', 'me'];

const INLINE_STYLES = `
@keyframes dt-pulse-glow {
  0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.45); }
  70% { transform: scale(1.03); box-shadow: 0 0 0 18px rgba(245, 158, 11, 0); }
  100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
}
@keyframes dt-radar-ring {
  0% { transform: scale(0.85); opacity: 0.9; }
  100% { transform: scale(1.6); opacity: 0; }
}
@keyframes dt-float {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-6px); }
}
@keyframes dt-fade-in-up {
  from { opacity: 0; transform: translateY(18px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes dt-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.dt-animated-entrance {
  animation: dt-fade-in-up 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.dt-partner-pass {
  background: linear-gradient(135deg, #064e3b 0%, #065f46 55%, #047857 100%);
  position: relative;
  overflow: hidden;
  border-radius: 20px;
  color: #fff;
  border: 1px solid rgba(251, 191, 36, 0.35);
  box-shadow: 0 20px 35px -10px rgba(6, 78, 59, 0.4);
}
.dt-partner-pass::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 60%);
  pointer-events: none;
}
.dt-pulse-circle {
  animation: dt-pulse-glow 2.5s infinite ease-in-out;
}
.dt-hover-lift {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.dt-hover-lift:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.08);
}
`;

/**
 * Desi Tokri Affiliate Program: apply, then share links and earn a commission
 * on every item bought through them (the rate depends on the category).
 * Everything shown is from GET /storefront/affiliate/me.
 */
export function AffiliatePage() {
  const navigate = useNavigate();
  const { role, initialising } = useCustomerAuth();
  const me = useQuery({ queryKey: QUERY_KEY, queryFn: affiliateApi.me, enabled: role !== 'GUEST' });

  if (initialising) return null;
  // Signed out: the public landing page explains the program and leads back here after sign-in.
  if (role === 'GUEST') return <Navigate to="/affiliate-program" replace />;

  return (
    <div style={{ background: '#f8fafc', minHeight: '100vh', paddingBottom: 48 }}>
      <style>{INLINE_STYLES}</style>
      <header style={{ background: '#fff', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 100 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} aria-label="Back" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Typography.Title level={5} style={{ margin: 0, fontWeight: 700, color: '#0f172a' }}>Affiliate Program</Typography.Title>
          <Tag color="emerald" style={{ color: '#047857', background: '#ecfdf5', borderColor: '#a7f3d0', fontWeight: 600, fontSize: 11, borderRadius: 6 }}>
            Creator Portal
          </Tag>
        </div>
      </header>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '16px 16px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {me.isLoading ? (
          <div style={{ ...card, padding: 24 }}><Skeleton active paragraph={{ rows: 6 }} /></div>
        ) : me.error || !me.data ? (
          <Alert type="error" showIcon message="Could not load the affiliate program. Please try again shortly." />
        ) : (
          <Body data={me.data} />
        )}
      </div>
    </div>
  );
}

function Body({ data }: { data: AffiliateMe }) {
  const a = data.affiliate;
  if (!a) {
    if (!data.program.enabled) return <Alert type="info" showIcon message="The affiliate program is not accepting applications right now." />;
    return (
      <>
        <Intro holdDays={data.program.holdDays} cookieDays={data.program.cookieDays} />
        <ApplyForm terms={data.program.termsText} />
      </>
    );
  }
  if (a.status === 'PENDING') {
    return <PendingReviewAnimated affiliate={a} />;
  }
  if (a.status === 'REJECTED') {
    return (
      <>
        <StatusCard icon={<CloseCircleFilled style={{ color: '#dc2626' }} />} title="Application not approved">
          {a.rejectionReason ? <>Reason: {a.rejectionReason}. </> : null}You can update your details and apply again.
        </StatusCard>
        <ApplyForm terms={data.program.termsText} previous={a} />
      </>
    );
  }
  return <Dashboard data={data} affiliate={a} />;
}

/**
 * Animated Celebration & Application Status Component
 * Replaces the simple plain status card with an interactive, rich partner dashboard.
 */
function PendingReviewAnimated({ affiliate }: { affiliate: AffiliateProfile }) {
  const navigate = useNavigate();
  const { message } = AntApp.useApp();
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    navigator.clipboard?.writeText(affiliate.code);
    setCopied(true);
    message.success('Affiliate code copied to clipboard!');
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="dt-animated-entrance" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top Animated Review Card */}
      <div
        style={{
          ...card,
          padding: '36px 24px 30px',
          textAlign: 'center',
          background: 'linear-gradient(180deg, #fffbeb 0%, #ffffff 40%)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Subtle decorative particles */}
        <div style={{ position: 'absolute', top: 12, left: '15%', width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', opacity: 0.5, animation: 'dt-float 3s infinite ease-in-out' }} />
        <div style={{ position: 'absolute', top: 32, right: '18%', width: 10, height: 10, borderRadius: '50%', background: '#10b981', opacity: 0.5, animation: 'dt-float 4s infinite ease-in-out 1s' }} />
        <div style={{ position: 'absolute', top: 70, left: '8%', width: 6, height: 6, borderRadius: '50%', background: '#3b82f6', opacity: 0.4, animation: 'dt-float 3.5s infinite ease-in-out 0.5s' }} />
        <div style={{ position: 'absolute', top: 85, right: '10%', width: 7, height: 7, borderRadius: '50%', background: '#ec4899', opacity: 0.4, animation: 'dt-float 4.5s infinite ease-in-out 1.5s' }} />

        {/* Central Pulsing Emblem */}
        <div style={{ position: 'relative', width: 88, height: 88, margin: '0 auto 20px' }}>
          <div
            style={{
              position: 'absolute',
              inset: -8,
              borderRadius: '50%',
              background: 'rgba(245, 158, 11, 0.15)',
              animation: 'dt-radar-ring 2.2s cubic-bezier(0, 0.2, 0.8, 1) infinite',
            }}
          />
          <div
            className="dt-pulse-circle"
            style={{
              width: 88,
              height: 88,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
              border: '2px solid #f59e0b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 10px 25px rgba(245, 158, 11, 0.25)',
            }}
          >
            <ClockCircleFilled style={{ fontSize: 44, color: '#d97706' }} />
          </div>
        </div>

        {/* Status Pill Badge */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fef3c7', border: '1px solid #fcd34d', color: '#92400e', padding: '4px 14px', borderRadius: 999, fontSize: 12, fontWeight: 700, marginBottom: 12 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#d97706', display: 'inline-block', boxShadow: '0 0 6px #d97706' }} />
          APPLICATION UNDER REVIEW
        </div>

        <Typography.Title level={3} style={{ margin: '0 0 8px', fontWeight: 800, color: '#0f172a', fontSize: 'clamp(20px, 3.5vw, 24px)' }}>
          We Received Your Application!
        </Typography.Title>
        <Typography.Paragraph style={{ color: '#475569', fontSize: 14.5, maxWidth: 520, margin: '0 auto', lineHeight: 1.6 }}>
          Thank you for applying to partner with Desi Tokri. Our creator onboarding team is currently verifying your profile and payout credentials. Review typically takes within <b>24 hours</b>.
        </Typography.Paragraph>
      </div>

      {/* Luxury Reserved Creator Pass Card */}
      <div className="dt-partner-pass dt-hover-lift" style={{ padding: '24px 26px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, borderBottom: '1px solid rgba(255,255,255,0.18)', paddingBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: '#fde68a', textTransform: 'uppercase' }}>
              SVV BALAJI · DESI TOKRI
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#ffffff', marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
              Creator Partner Pass <SafetyCertificateOutlined style={{ color: '#34d399' }} />
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(6px)', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, color: '#fef3c7', border: '1px solid rgba(255,255,255,0.2)' }}>
            ✦ Reserved For You
          </div>
        </div>

        {/* Code Showcase Box */}
        <div style={{ margin: '20px 0', background: 'rgba(0, 0, 0, 0.22)', backdropFilter: 'blur(8px)', borderRadius: 14, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, border: '1px solid rgba(255,255,255,0.12)' }}>
          <div>
            <div style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Your Reserved Affiliate Code
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: '0.08em', color: '#fef08a', fontFamily: 'monospace', marginTop: 2 }}>
              {affiliate.code}
            </div>
          </div>
          <Button
            type="primary"
            icon={copied ? <CheckCircleOutlined /> : <CopyOutlined />}
            onClick={copyCode}
            style={{
              background: copied ? '#10b981' : '#f59e0b',
              borderColor: copied ? '#10b981' : '#f59e0b',
              color: '#111827',
              fontWeight: 700,
              borderRadius: 10,
              height: 40,
              padding: '0 18px',
            }}
          >
            {copied ? 'Copied!' : 'Copy Code'}
          </Button>
        </div>

        {/* Details Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, paddingTop: 4 }}>
          <div>
            <div style={{ fontSize: 11, color: '#a7f3d0' }}>Applicant Name</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#ffffff', marginTop: 2 }}>{affiliate.fullName}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#a7f3d0' }}>Application Date</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#ffffff', marginTop: 2 }}>{day(affiliate.appliedAt)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#a7f3d0' }}>Payout Target</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#ffffff', marginTop: 2 }}>
              {affiliate.payoutMethod === 'UPI'
                ? `UPI: ${affiliate.payoutUpiId || '—'}`
                : `Bank: ${affiliate.payoutBankName || 'Account'} (${affiliate.payoutAccountNumber ? `•••${affiliate.payoutAccountNumber.slice(-4)}` : 'Verified'})`}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#a7f3d0' }}>Commission Rate</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fef08a', marginTop: 2 }}>Up to 25% on items</div>
          </div>
        </div>
      </div>

      {/* 4-Step Interactive Verification Journey */}
      <div style={{ ...card, padding: 24 }}>
        <Typography.Title level={5} style={{ margin: '0 0 18px', fontWeight: 700, color: '#0f172a' }}>
          Verification &amp; Activation Roadmap
        </Typography.Title>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Step 1 */}
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
              <CheckCircleFilled />
            </div>
            <div>
              <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>1. Application Submitted</div>
              <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 2 }}>Your details and payout destination were securely recorded on {day(affiliate.appliedAt)}.</div>
            </div>
          </div>

          {/* Step 2 */}
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#fef3c7', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0, border: '2px solid #f59e0b' }}>
              <ClockCircleFilled />
            </div>
            <div>
              <div style={{ fontWeight: 700, color: '#92400e', fontSize: 14 }}>2. Partner &amp; Profile Verification (Current Step)</div>
              <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 2 }}>Our admin team is verifying your profile and channels. No further action is required from you.</div>
            </div>
          </div>

          {/* Step 3 */}
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', opacity: 0.75 }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#f1f5f9', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
              3
            </div>
            <div>
              <div style={{ fontWeight: 600, color: '#334155', fontSize: 14 }}>3. Link Generator Activation</div>
              <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 2 }}>Once approved, this page will unlock your tracking link generator for all Desi Tokri products.</div>
            </div>
          </div>

          {/* Step 4 */}
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', opacity: 0.75 }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#f1f5f9', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
              4
            </div>
            <div>
              <div style={{ fontWeight: 600, color: '#334155', fontSize: 14 }}>4. Automatic Monthly Payouts</div>
              <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 2 }}>Earn commissions on each delivered order with automatic payouts deposited directly to your chosen method.</div>
            </div>
          </div>
        </div>
      </div>

      {/* While You Wait Action Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        <div style={{ ...card, padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#047857', fontWeight: 700, fontSize: 15 }}>
              <ShopOutlined style={{ fontSize: 18 }} /> Explore High-Earning Products
            </div>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 8, lineHeight: 1.5 }}>
              Discover farm-pure spices, stone-ground flours, and traditional snacks that followers love and earn top commissions.
            </div>
          </div>
          <Button type="default" style={{ marginTop: 14, borderRadius: 8, fontWeight: 600 }} onClick={() => navigate('/')}>
            Browse Desi Tokri Store
          </Button>
        </div>

        <div style={{ ...card, padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#2563eb', fontWeight: 700, fontSize: 15 }}>
              <QuestionCircleOutlined style={{ fontSize: 18 }} /> Have Questions?
            </div>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 8, lineHeight: 1.5 }}>
              Need to modify your application or ask about commission rates? Our partner support team is here to assist.
            </div>
          </div>
          <Button type="default" style={{ marginTop: 14, borderRadius: 8, fontWeight: 600 }} onClick={() => navigate('/help')}>
            Visit Help &amp; Support
          </Button>
        </div>
      </div>
    </div>
  );
}

function Intro({ holdDays, cookieDays }: { holdDays: number; cookieDays: number }) {
  const navigate = useNavigate();
  return (
    <div
      style={{
        ...card,
        padding: '24px 22px',
        background: 'linear-gradient(135deg, #064e3b 0%, #047857 60%, #065f46 100%)',
        color: '#fff',
        border: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Tag color="gold" style={{ fontWeight: 700, border: 'none', background: '#f59e0b', color: '#111827', borderRadius: 6 }}>
          ✨ PARTNER &amp; EARN
        </Tag>
        <span style={{ fontSize: 12, color: '#a7f3d0' }}>Desi Tokri Creator Network</span>
      </div>
      <Typography.Title level={4} style={{ color: '#fff', margin: '0 0 8px', fontWeight: 800 }}>
        Recommend Pure Desi Staples. Earn Generous Monthly Payouts.
      </Typography.Title>
      <Typography.Paragraph style={{ color: '#ecfdf5', fontSize: 13.5, margin: '0 0 18px', maxWidth: 650, lineHeight: 1.6 }}>
        Share your unique links on Instagram, YouTube, WhatsApp, or your blog. Whenever anyone buys within <b>{cookieDays} days</b>, you earn commission on every eligible item confirmed after the <b>{holdDays}-day</b> return window.
      </Typography.Paragraph>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
        <div style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(4px)', borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 11, color: '#a7f3d0' }}>Max Commission</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#fef08a' }}>Up to 25%</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(4px)', borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 11, color: '#a7f3d0' }}>Tracking Cookie</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#ffffff' }}>{cookieDays} Days</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(4px)', borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 11, color: '#a7f3d0' }}>Payout Channel</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#ffffff' }}>UPI &amp; Bank</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(4px)', borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 11, color: '#a7f3d0' }}>Joining Fee</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#a7f3d0' }}>100% Free</div>
        </div>
      </div>
    </div>
  );
}

function StatusCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div style={{ ...card, padding: 20, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <div style={{ fontSize: 26, lineHeight: 1 }}>{icon}</div>
      <div>
        <Typography.Title level={5} style={{ marginTop: 0 }}>{title}</Typography.Title>
        <Typography.Text style={{ color: '#57534e' }}>{children}</Typography.Text>
      </div>
    </div>
  );
}

/**
 * Payout input fields shared between ApplyForm and PayoutDetailsModal.
 * Enforces immediate field validation:
 * - Account holder name: only letters and spaces, 2 to 100 characters.
 * - Account number: only numbers, 9 to 18 digits.
 * - IFSC: valid 11-character Indian IFSC code format.
 * - Bank name: no numbers, only letters and spaces, 2 to 100 characters.
 * - UPI: valid UPI ID format.
 */
function PayoutFields({ method }: { method: 'UPI' | 'BANK' }) {
  return method === 'UPI' ? (
    <Form.Item
      name="payoutUpiId"
      label={<span style={{ fontWeight: 600, color: '#334155' }}>UPI ID for payouts</span>}
      hasFeedback
      rules={[
        { required: true, message: 'Please enter your UPI ID' },
        {
          pattern: /^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/,
          message: 'Enter a valid UPI ID (e.g. name@okhdfcbank or 9876543210@paytm)',
        },
      ]}
      tooltip="Monthly commissions will be deposited directly to this UPI ID."
    >
      <Input
        prefix={<ThunderboltOutlined style={{ color: '#047857' }} />}
        placeholder="e.g. yourname@okhdfcbank"
        autoComplete="off"
        size="large"
      />
    </Form.Item>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* Account Holder Name */}
      <Form.Item
        name="payoutAccountName"
        label={<span style={{ fontWeight: 600, color: '#334155' }}>Account holder name</span>}
        hasFeedback
        rules={[
          { required: true, message: 'Please enter account holder name' },
          { whitespace: true, message: 'Account holder name cannot be empty' },
          { min: 2, message: 'Account holder name must be at least 2 characters' },
          { max: 100, message: 'Account holder name cannot exceed 100 characters' },
          {
            pattern: /^[a-zA-Z\s]+$/,
            message: 'Account holder name must contain only letters and spaces (no numbers or special characters)',
          },
        ]}
        normalize={(v: string) => (v ? v.replace(/[^a-zA-Z\s]/g, '') : '')}
        extra={<span style={{ fontSize: 12, color: '#64748b' }}>Only letters &amp; spaces (2–100 characters). Must match your bank passbook.</span>}
      >
        <Input
          prefix={<UserOutlined style={{ color: '#047857' }} />}
          placeholder="e.g. Priya Sharma"
          size="large"
          maxLength={100}
        />
      </Form.Item>

      {/* Account Number */}
      <Form.Item
        name="payoutAccountNumber"
        label={<span style={{ fontWeight: 600, color: '#334155' }}>Bank account number</span>}
        hasFeedback
        rules={[
          { required: true, message: 'Please enter bank account number' },
          {
            pattern: /^\d{9,18}$/,
            message: 'Account number must be 9 to 18 digits (numbers only)',
          },
        ]}
        normalize={(v: string) => (v ? v.replace(/\D/g, '').slice(0, 18) : '')}
        extra={<span style={{ fontSize: 12, color: '#64748b' }}>Numbers only (9 to 18 digits).</span>}
      >
        <Input
          prefix={<BankOutlined style={{ color: '#047857' }} />}
          inputMode="numeric"
          autoComplete="off"
          placeholder="e.g. 102938475612"
          size="large"
          maxLength={18}
        />
      </Form.Item>

      {/* IFSC Code */}
      <Form.Item
        name="payoutIfsc"
        label={<span style={{ fontWeight: 600, color: '#334155' }}>IFSC code</span>}
        hasFeedback
        normalize={(v: string) => (v ? v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11) : '')}
        rules={[
          { required: true, message: 'Please enter IFSC code' },
          { len: 11, message: 'IFSC code must be exactly 11 characters' },
          {
            pattern: /^[A-Z]{4}0[A-Z0-9]{6}$/,
            message: 'Invalid IFSC format: 4 letters, 0, then 6 letters/digits (e.g. HDFC0001234)',
          },
        ]}
        extra={<span style={{ fontSize: 12, color: '#64748b' }}>11 characters: e.g. SBIN0001234, HDFC0001234.</span>}
      >
        <Input
          prefix={<SafetyCertificateOutlined style={{ color: '#047857' }} />}
          placeholder="e.g. HDFC0001234"
          size="large"
          maxLength={11}
          style={{ textTransform: 'uppercase', letterSpacing: 1 }}
        />
      </Form.Item>

      {/* Bank Name */}
      <Form.Item
        name="payoutBankName"
        label={<span style={{ fontWeight: 600, color: '#334155' }}>Bank name</span>}
        hasFeedback
        rules={[
          { required: true, message: 'Please enter bank name' },
          { whitespace: true, message: 'Bank name cannot be empty' },
          { min: 2, message: 'Bank name must be at least 2 characters' },
          { max: 100, message: 'Bank name cannot exceed 100 characters' },
          {
            pattern: /^[^0-9]+$/,
            message: 'Bank name cannot contain numbers (letters and spaces only)',
          },
        ]}
        normalize={(v: string) => (v ? v.replace(/[0-9]/g, '') : '')}
        extra={<span style={{ fontSize: 12, color: '#64748b' }}>No numbers allowed (2–100 characters). e.g. State Bank of India.</span>}
      >
        <Input
          prefix={<BankOutlined style={{ color: '#047857' }} />}
          placeholder="e.g. State Bank of India, HDFC Bank"
          size="large"
          maxLength={100}
        />
      </Form.Item>
    </div>
  );
}

/**
 * Modern Creator Application Form with step sections and real-time field validation.
 */
function ApplyForm({ terms, previous }: { terms: string | null; previous?: AffiliateProfile }) {
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm<ApplyBody>();
  const [saving, setSaving] = useState(false);
  const method = Form.useWatch('payoutMethod', form) ?? previous?.payoutMethod ?? 'UPI';

  const submit = async () => {
    try {
      const v = await form.validateFields();
      setSaving(true);
      const res = await affiliateApi.apply({
        ...v,
        pan: v.pan?.toUpperCase() || undefined,
        email: v.email || undefined,
      });
      qc.setQueryData(QUERY_KEY, res);
      message.success('🎉 Application submitted successfully! Welcome to Desi Tokri Partners.');
    } catch (e: any) {
      if (e?.errorFields?.length) {
        message.error('Please resolve the highlighted errors in the form before submitting.');
      } else {
        message.error(apiErrorMessage(e, 'Could not send your application'), 6);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ ...card, padding: '28px 24px' }}>
      <div style={{ marginBottom: 20 }}>
        <Typography.Title level={4} style={{ margin: '0 0 6px', fontWeight: 800, color: '#0f172a' }}>
          {previous ? 'Update & Re-apply' : 'Creator Partner Application'}
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ margin: 0, fontSize: 13.5 }}>
          Fill in your profile and payout details below. All fields validate immediately so you can submit with confidence.
        </Typography.Paragraph>
      </div>

      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        validateTrigger={['onChange', 'onBlur']}
        initialValues={{
          payoutMethod: previous?.payoutMethod ?? 'UPI',
          fullName: previous?.fullName,
          email: previous?.email ?? undefined,
          promotionUrl: previous?.promotionUrl ?? undefined,
          payoutUpiId: previous?.payoutUpiId ?? undefined,
          payoutAccountName: previous?.payoutAccountName ?? undefined,
          payoutAccountNumber: previous?.payoutAccountNumber ?? undefined,
          payoutIfsc: previous?.payoutIfsc ?? undefined,
          payoutBankName: previous?.payoutBankName ?? undefined,
        }}
      >
        {/* Section 1: Partner Details */}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: '18px 18px 8px', marginBottom: 20 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            <UserOutlined style={{ color: '#047857' }} /> 1. Creator Profile Information
          </div>

          <Form.Item
            name="fullName"
            label={<span style={{ fontWeight: 600, color: '#334155' }}>Full name (Account holder)</span>}
            hasFeedback
            rules={[
              { required: true, message: 'Please enter your full name' },
              { whitespace: true, message: 'Full name cannot be empty' },
              { min: 2, message: 'Full name must be at least 2 characters' },
              { max: 100, message: 'Full name cannot exceed 100 characters' },
              {
                pattern: /^[a-zA-Z\s]+$/,
                message: 'Full name must contain only letters and spaces (no numbers or symbols)',
              },
            ]}
            normalize={(v: string) => (v ? v.replace(/[^a-zA-Z\s]/g, '') : '')}
            extra={<span style={{ fontSize: 12, color: '#64748b' }}>Only letters &amp; spaces (2–100 characters). Must match your legal ID.</span>}
          >
            <Input prefix={<UserOutlined style={{ color: '#047857' }} />} autoComplete="name" size="large" maxLength={100} placeholder="e.g. Priya Sharma" />
          </Form.Item>

          <Form.Item
            name="email"
            label={<span style={{ fontWeight: 600, color: '#334155' }}>Email address</span>}
            hasFeedback
            rules={[
              { required: true, message: 'Please enter your email address' },
              { type: 'email', message: 'Enter a valid email address (e.g. name@example.com)' },
              { max: 100, message: 'Email address cannot exceed 100 characters' },
            ]}
            extra={<span style={{ fontSize: 12, color: '#64748b' }}>Used for monthly commission statements &amp; program updates.</span>}
          >
            <Input prefix={<MailOutlined style={{ color: '#047857' }} />} autoComplete="email" size="large" maxLength={100} placeholder="e.g. priya@example.com" />
          </Form.Item>
        </div>

        {/* Section 2: Promotion Channels */}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: '18px 18px 8px', marginBottom: 20 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            <ShareAltOutlined style={{ color: '#047857' }} /> 2. Channels &amp; Promotion Strategy
          </div>

          <Form.Item
            name="promotionUrl"
            label={<span style={{ fontWeight: 600, color: '#334155' }}>Where will you share?</span>}
            extra={<span style={{ fontSize: 12, color: '#64748b' }}>Your Instagram handle, YouTube channel, recipe blog, WhatsApp community, etc.</span>}
          >
            <Input prefix={<LinkOutlined style={{ color: '#047857' }} />} size="large" placeholder="e.g. https://instagram.com/yourhandle or @mykitchen" />
          </Form.Item>

          <Form.Item
            name="audienceSize"
            label={<span style={{ fontWeight: 600, color: '#334155' }}>Estimated audience / followers</span>}
          >
            <Select
              size="large"
              allowClear
              placeholder="Select audience range"
              options={['Under 1k', '1k-10k', '10k-50k', '50k-1L', 'Over 1L'].map((v) => ({ value: v, label: v }))}
            />
          </Form.Item>

          <Form.Item
            name="promotionPlan"
            label={<span style={{ fontWeight: 600, color: '#334155' }}>How will you promote Desi Tokri? (Optional)</span>}
          >
            <Input.TextArea rows={3} maxLength={1000} showCount placeholder="e.g. Traditional recipe reels, pantry recommendation posts, food blogs..." />
          </Form.Item>

          <Form.Item
            name="pan"
            label={<span style={{ fontWeight: 600, color: '#334155' }}>PAN (Optional — required for TDS exemption above annual threshold)</span>}
            hasFeedback
            normalize={(v: string) => v?.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)}
            rules={[{ pattern: /^[A-Z]{5}\d{4}[A-Z]$/, message: 'Valid PAN format: 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F)' }]}
          >
            <Input size="large" maxLength={10} placeholder="e.g. ABCDE1234F" style={{ textTransform: 'uppercase', letterSpacing: 1 }} />
          </Form.Item>
        </div>

        {/* Section 3: Payout Details */}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: '18px 18px 8px', marginBottom: 20 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            <WalletOutlined style={{ color: '#047857' }} /> 3. Payout Method (Where We Send Your Commission)
          </div>

          <Form.Item name="payoutMethod" label={<span style={{ fontWeight: 600, color: '#334155' }}>Receive payouts via</span>}>
            <Radio.Group
              size="large"
              optionType="button"
              buttonStyle="solid"
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}
            >
              <Radio.Button value="UPI" style={{ textAlign: 'center', height: 44, lineHeight: '42px', borderRadius: 10, fontWeight: 600 }}>
                <ThunderboltOutlined /> UPI Transfer
              </Radio.Button>
              <Radio.Button value="BANK" style={{ textAlign: 'center', height: 44, lineHeight: '42px', borderRadius: 10, fontWeight: 600 }}>
                <BankOutlined /> Bank Account
              </Radio.Button>
            </Radio.Group>
          </Form.Item>

          <PayoutFields method={method} />
        </div>

        {/* Terms Box */}
        {terms ? (
          <div style={{ background: '#fafaf9', border: '1px solid #e7e5e4', borderRadius: 10, padding: 14, maxHeight: 150, overflowY: 'auto', whiteSpace: 'pre-wrap', fontSize: 12, marginBottom: 16, color: '#57534e', lineHeight: 1.6 }}>
            <div style={{ fontWeight: 700, marginBottom: 6, color: '#1c1917' }}>Program Terms &amp; Conditions</div>
            {terms}
          </div>
        ) : null}

        <Form.Item
          name="acceptTerms"
          valuePropName="checked"
          rules={[{ validator: (_, v) => (v ? Promise.resolve() : Promise.reject(new Error('Please accept the affiliate program terms to continue'))) }]}
        >
          <Checkbox style={{ fontSize: 13.5 }}>
            I agree to the Desi Tokri affiliate program terms, commission structure, and monthly payout guidelines.
          </Checkbox>
        </Form.Item>

        <Button
          type="primary"
          block
          size="large"
          loading={saving}
          onClick={submit}
          icon={<RocketOutlined />}
          style={{
            height: 48,
            fontSize: 15,
            fontWeight: 700,
            borderRadius: 12,
            background: '#047857',
            borderColor: '#047857',
            boxShadow: '0 4px 14px rgba(4, 120, 87, 0.3)',
          }}
        >
          Submit Partner Application
        </Button>
      </Form>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ ...card, padding: 14, flex: '1 1 140px', minWidth: 0 }}>
      <div style={{ fontSize: 12, color: '#78716c' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#1c1917', marginTop: 2 }}>{value}</div>
      {sub ? <div style={{ fontSize: 12, color: '#a8a29e' }}>{sub}</div> : null}
    </div>
  );
}

function Dashboard({ data, affiliate }: { data: AffiliateMe; affiliate: AffiliateProfile }) {
  const d = data.dashboard!;
  const active = affiliate.status === 'APPROVED';
  const [editing, setEditing] = useState(false);
  const b = d.balances;
  return (
    <>
      {active ? (
        <div style={{ ...card, padding: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <CheckCircleFilled style={{ color: '#16a34a', fontSize: 20 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>You are an approved affiliate</div>
            <div style={{ fontSize: 12, color: '#78716c' }}>Your code: <b>{affiliate.code}</b></div>
          </div>
        </div>
      ) : (
        <Alert type="warning" showIcon icon={<StopFilled />} message="Your affiliate account is suspended"
          description={`${affiliate.suspendedReason ?? ''} Your links are not tracking new visits. Commission you already earned is still paid.`} />
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <Stat label="Clicks" value={d.clicks.toLocaleString('en-IN')} sub={`${d.clicksLast30Days} in the last 30 days`} />
        <Stat label="Successful orders" value={d.successfulOrders.toLocaleString('en-IN')} sub={`${d.conversionRatePercent}% of clicks`} />
        <Stat label="Total earnings" value={formatInr(d.totalEarnings)} sub="after returns" />
      </div>

      <div style={{ ...card, padding: 16 }}>
        <Typography.Title level={5} style={{ marginTop: 0 }}><WalletOutlined /> Your balance</Typography.Title>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
          <Balance label={`On hold (${d.holdDays}-day return window)`} value={b.pending} color="#d97706" />
          <Balance label="Ready for payout" value={b.payable} color="#2563eb" />
          <Balance label="Paid to you" value={b.paid} color="#16a34a" />
          <Balance label="Taken back for returns" value={b.reversed} color="#78716c" />
        </div>
        {b.clawbackDue > 0 ? (
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>
            {formatInr(b.clawbackDue)} for items returned after they were paid will be deducted from your next payout.
          </Typography.Paragraph>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 8, flexWrap: 'wrap' }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Paid to: {affiliate.payoutMethod === 'UPI' ? affiliate.payoutUpiId : `${affiliate.payoutBankName ?? 'Bank'} ${affiliate.payoutAccountNumber ?? ''}`}
          </Typography.Text>
          <Button size="small" onClick={() => setEditing(true)}>Change payout details</Button>
        </div>
      </div>

      {active ? <LinkGenerator code={affiliate.code} /> : null}
      <Commissions />
      <Payouts />
      <PayoutDetailsModal open={editing} onClose={() => setEditing(false)} affiliate={affiliate} />
    </>
  );
}

function Balance({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: '#fafaf9', borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 12, color: '#78716c' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{formatInr(value)}</div>
    </div>
  );
}

function LinkGenerator({ code }: { code: string }) {
  const { message } = AntApp.useApp();
  const [target, setTarget] = useState('');
  const link = useMemo(() => buildAffiliateLink(target, code), [target, code]);
  const copy = (text: string) =>
    navigator.clipboard?.writeText(text).then(() => message.success('Link copied')).catch(() => message.info(text));
  const share = (text: string) => {
    if (navigator.share) void navigator.share({ title: 'Desi Tokri', text: 'Fresh, traceable masalas & staples from Desi Tokri', url: text }).catch(() => undefined);
    else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };
  return (
    <div style={{ ...card, padding: 16 }}>
      <Typography.Title level={5} style={{ marginTop: 0 }}><LinkOutlined /> Link generator</Typography.Title>
      <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
        Open any product or category on Desi Tokri, copy its address and paste it here - or leave it empty to share the home page.
      </Typography.Paragraph>
      <Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder={`${window.location.origin}/product-detail/...`} allowClear />
      {link ? (
        <div style={{ marginTop: 12, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: 12 }}>
          <div style={{ wordBreak: 'break-all', fontFamily: 'monospace', fontSize: 13 }}>{link}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <Button type="primary" icon={<CopyOutlined />} onClick={() => copy(link)}>Copy</Button>
            <Button icon={<ShareAltOutlined />} onClick={() => share(link)}>Share</Button>
          </div>
        </div>
      ) : (
        <Alert style={{ marginTop: 12 }} type="warning" showIcon message="Paste a link to a Desi Tokri page" />
      )}
    </div>
  );
}

function Commissions() {
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['storefront', 'affiliate', 'commissions', page], queryFn: () => affiliateApi.commissions(page, 10) });
  return (
    <div style={{ ...card, padding: 16 }}>
      <Typography.Title level={5} style={{ marginTop: 0 }}>Commission by item</Typography.Title>
      {q.isLoading ? <Skeleton active /> : !q.data?.data.length ? (
        <Empty description="No commission yet - share your link to get started" />
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {q.data.data.map((c) => <CommissionItem key={c.id} c={c} />)}
          </div>
          {q.data.total > q.data.pageSize ? (
            <Pagination style={{ marginTop: 12, textAlign: 'center' }} size="small" current={page} pageSize={q.data.pageSize} total={q.data.total} onChange={setPage} />
          ) : null}
        </>
      )}
    </div>
  );
}

function CommissionItem({ c }: { c: CommissionRow }) {
  return (
    <div style={{ border: '1px solid #f1f5f9', borderRadius: 10, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.productName} × {c.quantity}</div>
          <div style={{ fontSize: 12, color: '#78716c' }}>{c.orderNumber} · {day(c.orderDate)}{c.categoryName ? ` · ${c.categoryName}` : ''}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontWeight: 700 }}>{formatInr(c.netAmount)}</div>
          <Tag color={COMMISSION_STATUS_COLOR[c.status]} style={{ marginInlineEnd: 0 }}>{COMMISSION_STATUS_LABEL[c.status]}</Tag>
        </div>
      </div>
      <div style={{ fontSize: 12, color: '#a8a29e', marginTop: 4 }}>
        {c.ratePercent}% of {formatInr(c.baseAmount)}
        {c.refundedQuantity > 0 ? ` · ${c.refundedQuantity} returned (−${formatInr(c.refundedAmount)})` : ''}
        {c.status === 'PENDING' ? ` · confirms after ${day(c.releaseDate)} once delivered` : ''}
        {c.payoutNumber ? ` · ${c.payoutNumber}` : ''}
      </div>
    </div>
  );
}

function Payouts() {
  const q = useQuery({ queryKey: ['storefront', 'affiliate', 'payouts'], queryFn: affiliateApi.payouts });
  if (!q.data?.length) return null;
  return (
    <div style={{ ...card, padding: 16 }}>
      <Typography.Title level={5} style={{ marginTop: 0 }}>Payouts</Typography.Title>
      {q.data.map((p) => (
        <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9', gap: 8 }}>
          <div>
            <div style={{ fontWeight: 600 }}>{p.payoutNumber}</div>
            <div style={{ fontSize: 12, color: '#78716c' }}>{day(p.paidAt)} · {p.paidTo} · Ref {p.reference}</div>
          </div>
          <div style={{ fontWeight: 700, color: '#16a34a' }}>{formatInr(p.netAmount)}</div>
        </div>
      ))}
    </div>
  );
}

function PayoutDetailsModal({ open, onClose, affiliate }: { open: boolean; onClose: () => void; affiliate: AffiliateProfile }) {
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm<PayoutDetails>();
  const [saving, setSaving] = useState(false);
  const method = Form.useWatch('payoutMethod', form) ?? affiliate.payoutMethod;
  const save = async () => {
    try {
      const v = await form.validateFields();
      setSaving(true);
      qc.setQueryData(QUERY_KEY, await affiliateApi.update(v));
      message.success('Payout details updated successfully');
      onClose();
    } catch (e: any) {
      if (e?.errorFields?.length) {
        message.error('Please check highlighted errors in the payout form');
      } else {
        message.error(apiErrorMessage(e, 'Could not save payout details'), 6);
      }
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open={open} title="Update Payout Details" onCancel={onClose} onOk={save} okText="Save Changes" confirmLoading={saving} destroyOnClose>
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        validateTrigger={['onChange', 'onBlur']}
        initialValues={{
          payoutMethod: affiliate.payoutMethod,
          payoutUpiId: affiliate.payoutUpiId ?? undefined,
          payoutAccountName: affiliate.payoutAccountName ?? undefined,
          payoutAccountNumber: affiliate.payoutAccountNumber ?? undefined,
          payoutIfsc: affiliate.payoutIfsc ?? undefined,
          payoutBankName: affiliate.payoutBankName ?? undefined,
        }}
      >
        <Form.Item name="payoutMethod" label={<span style={{ fontWeight: 600 }}>Get paid by</span>}>
          <Radio.Group
            optionType="button"
            buttonStyle="solid"
            options={[
              { value: 'UPI', label: '⚡ UPI' },
              { value: 'BANK', label: '🏛️ Bank transfer' },
            ]}
          />
        </Form.Item>
        <PayoutFields method={method} />
      </Form>
    </Modal>
  );
}
