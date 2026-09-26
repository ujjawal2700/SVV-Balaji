import {
  BellOutlined,
  CreditCardOutlined,
  DeleteOutlined,
  FileProtectOutlined,
  GiftOutlined,
  HeartOutlined,
  HistoryOutlined,
  InfoCircleOutlined,
  LockOutlined,
  LogoutOutlined,
  QuestionCircleOutlined,
  RightOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  ShopOutlined,
  ShoppingOutlined,
  SyncOutlined,
  TrophyOutlined,
  UserOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import {
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  Card,
  Divider,
  Modal,
  Switch,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCustomerAuth, type UserRole } from '../auth/CustomerAuthContext';
import { useLoyalty } from '../loyalty/useLoyalty';
import { useAccountStats } from '../hooks/useAccountStats';

export function ProfilePage() {
  const navigate = useNavigate();
  const { role, customerProfile, retailerProfile, logout } = useCustomerAuth();
  const loyalty = useLoyalty();
  const stats = useAccountStats();
  const [whatsappAlerts, setWhatsappAlerts] = useState(true);

  const handleLogout = () => {
    Modal.confirm({
      title: 'Log out of your account?',
      content: 'You will need to sign in again with your registered mobile OTP.',
      okText: 'Log Out',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: () => {
        logout();
        message.success('Logged out successfully');
        navigate('/login');
      },
    });
  };

  const handleDeleteAccount = () => {
    Modal.confirm({
      title: 'Delete Account Request',
      content: 'This will initiate account deactivation. Your wallet balance and pending orders must be settled first.',
      okText: 'Request Deletion',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: () => {
        message.info('Account deletion request submitted to Desi Tokri Admin.');
      },
    });
  };

  const isRetailer = role === 'RETAILER';
  const isGuest = role === 'GUEST';

  const referralCode = (isRetailer ? retailerProfile?.referralCode : customerProfile?.referralCode) ?? null;

  const handleShareReferral = () => {
    if (!referralCode) {
      message.info('Your referral code is still being set up — check back in a moment.');
      return;
    }
    const link = `${window.location.origin}/${isRetailer ? 'retailers/register' : 'login'}?ref=${referralCode}`;
    void navigator.clipboard
      ?.writeText(link)
      .then(() => message.success(`Referral link copied — your code is ${referralCode}`))
      .catch(() => message.success(`Your referral code is ${referralCode}`));
  };

  // Customer consumer menu items
  const customerSections = [
    {
      title: 'My Orders & Cart',
      items: [
        {
          key: 'orders',
          icon: <ShoppingOutlined />,
          iconBg: '#eff6ff',
          iconColor: '#2563eb',
          label: 'My Orders',
          subtitle: 'Track live delivery & past receipts',
          badge: stats.orderCount,
          route: '/orders',
        },
        {
          key: 'loyalty',
          icon: <TrophyOutlined />,
          iconBg: '#fffbeb',
          iconColor: '#d97706',
          label: 'Desi Rewards',
          subtitle: `${loyalty.points.toLocaleString('en-IN')} pts • worth ₹${loyalty.pointsValueInr.toLocaleString('en-IN')}`,
          route: '/loyalty',
        },
        {
          key: 'watchlist',
          icon: <HeartOutlined />,
          iconBg: '#fff1f2',
          iconColor: '#e11d48',
          label: 'My Wishlist & Saved',
          subtitle: 'Saved items for quick purchase',
          route: '/wishlist',
        },
        {
          key: 'refer',
          icon: <GiftOutlined />,
          iconBg: '#fdf4ff',
          iconColor: '#a21caf',
          label: 'Refer & Earn',
          subtitle: referralCode ? `Your code: ${referralCode} • Earn 100 coins` : 'Share your code with friends',
          route: '/refer',
        },
      ],
    },
    {
      title: 'Account & Settings',
      items: [
        {
          key: 'addresses',
          icon: <ShopOutlined />,
          iconBg: '#fefce8',
          iconColor: '#ca8a04',
          label: 'Delivery Addresses',
          subtitle: `${stats.addressCount} Saved address`,
          route: '/addresses',
        },
        {
          key: 'whatsapp',
          icon: <BellOutlined />,
          iconBg: '#ecfdf5',
          iconColor: '#059669',
          label: 'WhatsApp Order Updates',
          subtitle: 'Instant dispatch alerts on your mobile',
          toggle: true,
          toggleValue: whatsappAlerts,
          onToggle: (val: boolean) => {
            setWhatsappAlerts(val);
            message.success(val ? 'WhatsApp alerts enabled' : 'WhatsApp alerts disabled');
          },
        },
        {
          key: 'help',
          icon: <QuestionCircleOutlined />,
          iconBg: '#eff6ff',
          iconColor: '#3b82f6',
          label: 'Help & Customer Support',
          subtitle: 'Toll-free helpline, WhatsApp desk & FAQs',
          route: '/help',
        },
      ],
    },
  ];

  // Retailer B2B menu items
  const retailerSections = [
    {
      title: 'Orders & Savings',
      items: [
        {
          key: 'orders',
          icon: <ShoppingOutlined />,
          iconBg: '#eff6ff',
          iconColor: '#2563eb',
          label: 'Wholesale Orders',
          subtitle: 'Track active bulk consignments',
          badge: stats.orderCount,
          route: '/orders',
        },
        {
          key: 'wallet',
          icon: <WalletOutlined />,
          iconBg: '#f0fdf4',
          iconColor: '#16a34a',
          label: 'B2B Wallet Balance',
          subtitle: `₹${0} Balance available`,
          route: '/wallet',
        },
        {
          key: 'schemes',
          icon: <SafetyCertificateOutlined />,
          iconBg: '#fff7ed',
          iconColor: '#ea580c',
          label: 'Wholesale Schemes & Margins',
          subtitle: 'Current offers on the storefront',
          route: '/',
        },
        {
          key: 'loyalty',
          icon: <TrophyOutlined />,
          iconBg: '#fffbeb',
          iconColor: '#d97706',
          label: 'Wholesaler Rewards',
          subtitle: `${loyalty.points.toLocaleString('en-IN')} pts • worth ₹${loyalty.pointsValueInr.toLocaleString('en-IN')}`,
          route: '/loyalty',
        },
        {
          key: 'reorder',
          icon: <SyncOutlined />,
          iconBg: '#faf5ff',
          iconColor: '#9333ea',
          label: 'Frequent Orders Reorder',
          subtitle: 'Quick 1-tap stock replenishment',
          route: '/orders',
        },
        {
          key: 'refer',
          icon: <GiftOutlined />,
          iconBg: '#fdf4ff',
          iconColor: '#a21caf',
          label: 'Refer a Store Partner',
          subtitle: referralCode ? `Your code: ${referralCode} • Earn 100 coins` : 'Share your code with other retailers',
          route: '/refer',
        },
      ],
    },
    {
      title: 'Business & Compliance',
      items: [
        {
          key: 'addresses',
          icon: <ShopOutlined />,
          iconBg: '#fefce8',
          iconColor: '#ca8a04',
          label: 'Store Dispatch Points',
          subtitle: retailerProfile?.address || '—',
          route: '/addresses',
        },
        {
          key: 'gst',
          icon: <FileProtectOutlined />,
          iconBg: '#f0fdfa',
          iconColor: '#0d9488',
          label: 'Business GSTIN & KYC',
          subtitle: `${retailerProfile?.gstin || '—'} · Verified`,
          action: () => message.success('KYC & GSTIN are verified'),
        },
      ],
    },
    {
      title: 'Settings & Support',
      items: [
        {
          key: 'whatsapp',
          icon: <BellOutlined />,
          iconBg: '#ecfdf5',
          iconColor: '#059669',
          label: 'WhatsApp Dispatch Alerts',
          subtitle: 'Receive digital invoice and OTP on WhatsApp',
          toggle: true,
          toggleValue: whatsappAlerts,
          onToggle: (val: boolean) => {
            setWhatsappAlerts(val);
            message.success(val ? 'WhatsApp alerts enabled' : 'WhatsApp alerts disabled');
          },
        },
        {
          key: 'help',
          icon: <QuestionCircleOutlined />,
          iconBg: '#eff6ff',
          iconColor: '#3b82f6',
          label: 'Help & Customer Support',
          subtitle: 'Wholesale helpdesk, dispatch lines & trade FAQs',
          route: '/help',
        },
      ],
    },
  ];

  const activeSections = isRetailer ? retailerSections : customerSections;

  return (
    <div>
      {/* ========================================================================= */}
      {/* 📱 MOBILE VIEW (< 768px): DISTINCT CUSTOMER VS RETAILER PROFILE HERO      */}
      {/* ========================================================================= */}
      <div className="mobile-only" style={{ minHeight: '100vh', background: '#f1f3f6', paddingBottom: 80 }}>
        {/* Profile Hero with Role-Specific Visual Identity */}
        <div
          style={{
            background: isRetailer
              ? 'linear-gradient(135deg, #065f46 0%, #047857 50%, #0f766e 100%)'
              : 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
            // Reaches the top edge (the shell skips its top gap here), so it clears the notch itself.
            padding: 'calc(32px + env(safe-area-inset-top)) 20px 24px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Decorative ambient circles */}
          <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
          <div style={{ position: 'absolute', top: 20, right: 40, width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, position: 'relative' }}>
            <div style={{ position: 'relative' }}>
              {isRetailer ? (
                /* Retailer / Store Avatar */
                <Avatar
                  size={74}
                  style={{
                    background: '#ffffff',
                    color: '#065f46',
                    fontSize: 32,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '3px solid #34d399',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                  }}
                >
                  <ShopOutlined style={{ fontSize: 36, color: '#065f46' }} />
                </Avatar>
              ) : (
                /* Customer / Personal Shopper Avatar */
                <Avatar
                  size={74}
                  style={{
                    background: '#ffffff',
                    color: '#ea580c',
                    fontSize: 32,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '3px solid rgba(255,255,255,0.95)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                  }}
                >
                  <UserOutlined style={{ fontSize: 36, color: '#ea580c' }} />
                </Avatar>
              )}

              {isRetailer && (
                <Tag
                  color="green"
                  style={{
                    position: 'absolute',
                    bottom: -4,
                    right: -6,
                    borderRadius: 10,
                    fontSize: 10,
                    padding: '0 6px',
                    fontWeight: 700,
                    border: '2px solid #fff',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  }}
                >
                  KYC ✓
                </Tag>
              )}
            </div>

            <div style={{ flex: 1 }}>
              {isRetailer ? (
                <>
                  <Typography.Text strong style={{ color: '#ffffff', fontSize: 18, display: 'block', lineHeight: 1.25 }}>
                    {retailerProfile?.storeName || 'My Store'}
                  </Typography.Text>
                  <Typography.Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, display: 'block', marginTop: 2 }}>
                    Prop: {retailerProfile?.ownerName || '—'} • {retailerProfile?.phone || '—'}
                  </Typography.Text>
                  <Tag color="gold" style={{ marginTop: 6, fontWeight: 700, borderRadius: 10, fontSize: 11 }}>
                    GST: {retailerProfile?.gstin || '—'}
                  </Tag>
                </>
              ) : (
                <>
                  <Typography.Text strong style={{ color: '#ffffff', fontSize: 19, display: 'block', lineHeight: 1.25 }}>
                    {customerProfile?.name || 'Customer'}
                  </Typography.Text>
                  <Typography.Text style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, display: 'block', marginTop: 2 }}>
                    {customerProfile?.phone || '—'}
                  </Typography.Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <span
                      style={{
                        background: 'rgba(255,255,255,0.22)',
                        color: '#fff',
                        fontWeight: 600,
                        fontSize: 11,
                        padding: '2px 8px',
                        borderRadius: 12,
                        backdropFilter: 'blur(4px)',
                      }}
                    >
                      👤 Personal Customer Account
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Stats Row */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginTop: 20,
              background: 'rgba(255,255,255,0.18)',
              borderRadius: 14,
              padding: '12px 14px',
              backdropFilter: 'blur(6px)',
              border: '1px solid rgba(255,255,255,0.2)',
            }}
          >
            {isRetailer ? (
              <>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <Typography.Text strong style={{ color: '#fff', fontSize: 18, display: 'block' }}>
                    {loyalty.points.toLocaleString('en-IN')}
                  </Typography.Text>
                  <Typography.Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11 }}>Reward Pts</Typography.Text>
                </div>
                <div style={{ width: 1, background: 'rgba(255,255,255,0.25)' }} />
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <Typography.Text strong style={{ color: '#fff', fontSize: 18, display: 'block' }}>
                    {stats.orderCount}
                  </Typography.Text>
                  <Typography.Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11 }}>Orders</Typography.Text>
                </div>
                <div style={{ width: 1, background: 'rgba(255,255,255,0.25)' }} />
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <Typography.Text strong style={{ color: '#fff', fontSize: 18, display: 'block' }}>
                    ₹{(retailerProfile?.creditUsed || 0).toLocaleString('en-IN')}
                  </Typography.Text>
                  <Typography.Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11 }}>Outstanding</Typography.Text>
                </div>
                <div style={{ width: 1, background: 'rgba(255,255,255,0.25)' }} />
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <Typography.Text strong style={{ color: '#fff', fontSize: 18, display: 'block' }}>
                    ₹{((retailerProfile?.creditLimit || 0) - (retailerProfile?.creditUsed || 0)).toLocaleString('en-IN')}
                  </Typography.Text>
                  <Typography.Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11 }}>Credit Line</Typography.Text>
                </div>
              </>
            ) : (
              <>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <Typography.Text strong style={{ color: '#fff', fontSize: 18, display: 'block' }}>
                    {loyalty.points.toLocaleString('en-IN')}
                  </Typography.Text>
                  <Typography.Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: 500 }}>
                    Reward Points
                  </Typography.Text>
                </div>
                <div style={{ width: 1, background: 'rgba(255,255,255,0.25)' }} />
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <Typography.Text strong style={{ color: '#fff', fontSize: 18, display: 'block' }}>
                    {stats.orderCount}
                  </Typography.Text>
                  <Typography.Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: 500 }}>
                    My Orders
                  </Typography.Text>
                </div>
                <div style={{ width: 1, background: 'rgba(255,255,255,0.25)' }} />
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <Typography.Text strong style={{ color: '#fff', fontSize: 18, display: 'block' }}>
                    {stats.couponCount}
                  </Typography.Text>
                  <Typography.Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: 500 }}>
                    Active Offers
                  </Typography.Text>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 🌟 'Become a Partner / Buy Wholesale' Callout Card for Customers */}
        {!isRetailer && (
          <div style={{ padding: '12px 12px 0' }}>
            <div
              style={{
                background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
                borderRadius: 14,
                border: '1px solid #fed7aa',
                padding: '16px',
                boxShadow: '0 2px 8px rgba(249, 115, 22, 0.08)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#ea580c', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ShopOutlined style={{ fontSize: 20 }} />
                </div>
                <div>
                  <Typography.Text strong style={{ color: '#9a3412', fontSize: 15, display: 'block' }}>
                    Are you a Kirana / Retailer?
                  </Typography.Text>
                  <Typography.Text style={{ color: '#c2410c', fontSize: 12 }}>
                    Get Mandi-Direct Wholesale Rates & GST Invoices
                  </Typography.Text>
                </div>
              </div>

              <Typography.Text style={{ color: '#7c2d12', fontSize: 12, display: 'block', marginBottom: 12, lineHeight: 1.4 }}>
                Register your business to unlock bulk case rates, up to 20% margin, and instant ₹50,000 credit line.
              </Typography.Text>

              <Button
                type="primary"
                block
                style={{ background: '#ea580c', borderColor: '#ea580c', borderRadius: 8, fontWeight: 600, height: 40 }}
                onClick={() => navigate('/register')}
              >
                Become a Partner / Buy Wholesale &rarr;
              </Button>
            </div>
          </div>
        )}

        {/* Menu Sections */}
        <div style={{ padding: '12px' }}>
          {activeSections.map((section) => (
            <div key={section.title} style={{ marginBottom: 12 }}>
              <Typography.Text style={{ fontSize: 12, fontWeight: 600, color: '#878787', display: 'block', marginBottom: 6, paddingLeft: 4, letterSpacing: 0.5 }}>
                {section.title.toUpperCase()}
              </Typography.Text>
              <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                {section.items.map((item, idx) => (
                  <div key={item.key}>
                    <div
                      onClick={item.toggle ? undefined : item.route ? () => navigate(item.route!) : item.action}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        padding: '13px 16px',
                        background: 'none',
                        cursor: item.toggle ? 'default' : 'pointer',
                      }}
                    >
                      {/* Icon */}
                      <div
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 10,
                          flexShrink: 0,
                          background: item.iconBg,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <span style={{ fontSize: 18, color: item.iconColor }}>{item.icon}</span>
                      </div>

                      {/* Label */}
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <Typography.Text strong style={{ fontSize: 14, color: '#212121', display: 'block' }}>
                          {item.label}
                        </Typography.Text>
                        {item.subtitle && (
                          <Typography.Text style={{ fontSize: 12, color: '#878787' }}>{item.subtitle}</Typography.Text>
                        )}
                      </div>

                      {/* Right side */}
                      {item.toggle ? (
                        <Switch
                          size="small"
                          checked={item.toggleValue}
                          onChange={item.onToggle}
                          style={{ background: item.toggleValue ? '#f97316' : undefined }}
                        />
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {item.badge ? <Badge count={item.badge} style={{ background: '#f97316' }} /> : null}
                          <RightOutlined style={{ color: '#d1d5db', fontSize: 12 }} />
                        </div>
                      )}
                    </div>
                    {idx < section.items.length - 1 && <Divider style={{ margin: '0 16px', width: 'auto', minWidth: 'auto' }} />}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Logout */}
          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: '14px 16px',
              background: '#fff',
              border: '1px solid #fca5a5',
              borderRadius: 12,
              cursor: 'pointer',
              marginTop: 4,
              marginBottom: 8,
            }}
          >
            <LogoutOutlined style={{ color: '#dc2626', fontSize: 18 }} />
            <Typography.Text strong style={{ color: '#dc2626', fontSize: 15 }}>
              Log Out
            </Typography.Text>
          </button>

          {/* Delete Account */}
          <div
            onClick={handleDeleteAccount}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: '14px 16px',
              background: '#fef2f2',
              border: '1px solid #fca5a5',
              borderRadius: 12,
              cursor: 'pointer',
              marginBottom: 8,
            }}
          >
            <DeleteOutlined style={{ color: '#dc2626', fontSize: 18 }} />
            <Typography.Text strong style={{ color: '#dc2626', fontSize: 15 }}>
              Delete Account
            </Typography.Text>
          </div>

          <Typography.Text style={{ display: 'block', textAlign: 'center', fontSize: 12, color: '#a8a29e', marginTop: 8 }}>
            Desi Tokri • SVV Balaji v1.0.0
          </Typography.Text>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 💻 DESKTOP VIEW (>= 768px): CLEAN RESPONSIVE PROFILE (CUSTOMER/RETAILER)   */}
      {/* ========================================================================= */}
      <div className="desktop-only" style={{ background: '#f8fafc', minHeight: '80vh', padding: '24px 0 60px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px' }}>
          {/* Breadcrumb */}
          <Breadcrumb
            items={[
              { title: <Link to="/">Home</Link> },
              { title: 'My Account' },
              { title: isRetailer ? 'Retailer Dashboard' : 'Customer Profile' },
            ]}
            style={{ marginBottom: 20 }}
          />

          {/* Page Heading with Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <Typography.Title level={3} style={{ margin: 0, color: '#0f172a', fontWeight: 700, fontSize: 20 }}>
                {isRetailer ? 'Retailer Account Overview' : 'Customer Account Overview'}
              </Typography.Title>
              <Typography.Text style={{ color: '#64748b', fontSize: 13 }}>
                {isRetailer
                  ? 'Manage your store profile, verified GSTIN billing credentials, credit limits, and alerts.'
                  : 'Manage your personal delivery addresses, saved wishlist, and consumer order receipts.'}
              </Typography.Text>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {!isRetailer && (
                <Button
                  type="primary"
                  size="middle"
                  style={{ background: '#ea580c', borderColor: '#ea580c', borderRadius: 8, fontWeight: 600, fontSize: 12, height: 34 }}
                  onClick={() => navigate('/register')}
                >
                  Become a Partner / Buy Wholesale
                </Button>
              )}
            </div>
          </div>

          {/* 2-Column Desktop Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 28, alignItems: 'start' }}>
            {/* Left Card */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Profile Card */}
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: 16,
                  border: '1px solid #e2e8f0',
                  padding: 24,
                  textAlign: 'center',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                }}
              >
                <div style={{ position: 'relative', width: 88, height: 88, margin: '0 auto 16px' }}>
                  {isRetailer ? (
                    <Avatar
                      size={88}
                      style={{
                        background: '#f0fdf4',
                        color: '#065f46',
                        border: '3px solid #34d399',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(6, 95, 70, 0.1)',
                      }}
                    >
                      <ShopOutlined style={{ fontSize: 42, color: '#065f46' }} />
                    </Avatar>
                  ) : (
                    <Avatar
                      size={88}
                      style={{
                        background: '#fff7ed',
                        color: '#ea580c',
                        border: '3px solid #fdba74',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(234, 88, 12, 0.1)',
                      }}
                    >
                      <UserOutlined style={{ fontSize: 42, color: '#ea580c' }} />
                    </Avatar>
                  )}

                  {isRetailer && (
                    <Tag
                      color="green"
                      style={{ position: 'absolute', bottom: -2, right: -4, borderRadius: 10, fontSize: 11, padding: '1px 7px', fontWeight: 700, border: '2px solid #fff' }}
                    >
                      KYC ✓
                    </Tag>
                  )}
                </div>

                <Typography.Title level={4} style={{ margin: '0 0 4px 0', color: '#0f172a', fontWeight: 700 }}>
                  {isRetailer
                    ? retailerProfile?.storeName || 'My Store'
                    : customerProfile?.name || 'Customer'}
                </Typography.Title>
                <Typography.Text style={{ color: '#64748b', fontSize: 13, display: 'block' }}>
                  {isRetailer
                    ? `Prop: ${retailerProfile?.ownerName || '—'}`
                    : '👤 Personal Customer Account'}
                </Typography.Text>

                {isRetailer ? (
                  <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center', gap: 8 }}>
                    <Tag color="green" style={{ borderRadius: 12, fontWeight: 700, padding: '2px 10px' }}>
                      GST: {retailerProfile?.gstin || '—'}
                    </Tag>
                  </div>
                ) : (
                  <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center', gap: 6 }}>
                    <Tag color="orange" style={{ borderRadius: 12, fontWeight: 600, padding: '2px 10px' }}>
                      Desi Member since {customerProfile?.memberSince || '—'}
                    </Tag>
                  </div>
                )}

                <Divider style={{ margin: '20px 0' }} />

                <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, color: '#475569' }}>
                  <div>
                    <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>PHONE NUMBER</Typography.Text>
                    <Typography.Text strong style={{ color: '#1e293b' }}>
                      {isRetailer ? retailerProfile?.phone : customerProfile?.phone || '—'}
                    </Typography.Text>
                  </div>
                  <div>
                    <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>EMAIL ADDRESS</Typography.Text>
                    <Typography.Text strong style={{ color: '#1e293b' }}>
                      {isRetailer ? retailerProfile?.email : customerProfile?.email || '—'}
                    </Typography.Text>
                  </div>
                  {isRetailer && (
                    <div>
                      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>DEFAULT DELIVERY HUB</Typography.Text>
                      <Typography.Text strong style={{ color: '#1e293b' }}>
                        {retailerProfile?.address || '—'}
                      </Typography.Text>
                    </div>
                  )}
                </div>

                <Divider style={{ margin: '20px 0' }} />

                <Button
                  danger
                  block
                  icon={<LogoutOutlined />}
                  style={{ borderRadius: 8, height: 40, fontWeight: 600 }}
                  onClick={handleLogout}
                >
                  Sign Out Account
                </Button>
              </div>

              {/* B2B Upgrade Promotion (for Customers) */}
              {!isRetailer && (
                <div
                  style={{
                    background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
                    borderRadius: 16,
                    border: '1px solid #fed7aa',
                    padding: '20px',
                  }}
                >
                  <Typography.Text strong style={{ color: '#9a3412', display: 'block', fontSize: 15, marginBottom: 4 }}>
                    🏪 Own a Grocery Store?
                  </Typography.Text>
                  <Typography.Text style={{ color: '#c2410c', fontSize: 12, display: 'block', marginBottom: 14 }}>
                    Upgrade to a B2B Partner Account for wholesale mandi bulk pricing, GST bills & credit line.
                  </Typography.Text>
                  <Button
                    type="primary"
                    block
                    style={{ background: '#ea580c', borderColor: '#ea580c', borderRadius: 8, fontWeight: 600 }}
                    onClick={() => navigate('/register')}
                  >
                    Become a Partner &rarr;
                  </Button>
                </div>
              )}
            </div>

            {/* Right Content */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {/* 4 Stats Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: isRetailer ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)', gap: 14 }}>
                <div style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', border: '1px solid #e2e8f0' }}>
                  <Typography.Text type="secondary" style={{ fontSize: 11, fontWeight: 600, display: 'block' }}>
                    {isRetailer ? 'REWARD POINTS' : 'DESI REWARDS'}
                  </Typography.Text>
                  <Typography.Text strong style={{ fontSize: 18, color: '#16a34a', display: 'block', marginTop: 2 }}>
                    {loyalty.points.toLocaleString('en-IN')} pts
                  </Typography.Text>
                  <Link to="/loyalty" style={{ fontSize: 11.5, color: '#ea580c', fontWeight: 600 }}>
                    View rewards &rarr;
                  </Link>
                </div>

                <div style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', border: '1px solid #e2e8f0' }}>
                  <Typography.Text type="secondary" style={{ fontSize: 11, fontWeight: 600, display: 'block' }}>
                    MY ORDERS
                  </Typography.Text>
                  <Typography.Text strong style={{ fontSize: 18, color: '#0f172a', display: 'block', marginTop: 2 }}>
                    {isRetailer ? stats.orderCount : stats.orderCount}
                  </Typography.Text>
                  <Link to="/orders" style={{ fontSize: 11.5, color: '#ea580c', fontWeight: 600 }}>
                    View Order History &rarr;
                  </Link>
                </div>

                {isRetailer ? (
                  <>
                    <div style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', border: '1px solid #e2e8f0' }}>
                      <Typography.Text type="secondary" style={{ fontSize: 11, fontWeight: 600, display: 'block' }}>
                        TOTAL SAVINGS
                      </Typography.Text>
                      <Typography.Text strong style={{ fontSize: 18, color: '#16a34a', display: 'block', marginTop: 2 }}>
                        ₹{(retailerProfile?.totalSavings || 0).toLocaleString('en-IN')}
                      </Typography.Text>
                      <Typography.Text style={{ fontSize: 11, color: '#16a34a', fontWeight: 500 }}>
                        Wholesale Margins
                      </Typography.Text>
                    </div>

                    <div style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', border: '1px solid #e2e8f0' }}>
                      <Typography.Text type="secondary" style={{ fontSize: 11, fontWeight: 600, display: 'block' }}>
                        CREDIT LINE
                      </Typography.Text>
                      <Typography.Text strong style={{ fontSize: 18, color: '#0f172a', display: 'block', marginTop: 2 }}>
                        ₹{((retailerProfile?.creditLimit || 0) - (retailerProfile?.creditUsed || 0)).toLocaleString('en-IN')}
                      </Typography.Text>
                      <Typography.Text style={{ fontSize: 11, color: '#64748b' }}>
                        Limit: ₹50,000
                      </Typography.Text>
                    </div>
                  </>
                ) : (
                  <div style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', border: '1px solid #e2e8f0' }}>
                    <Typography.Text type="secondary" style={{ fontSize: 11, fontWeight: 600, display: 'block' }}>
                      ACTIVE COUPONS
                    </Typography.Text>
                    <Typography.Text strong style={{ fontSize: 18, color: '#16a34a', display: 'block', marginTop: 2 }}>
                      {stats.couponCount} Offers
                    </Typography.Text>
                    <Typography.Text style={{ fontSize: 11, color: '#16a34a', fontWeight: 500 }}>
                      Apply at Checkout
                    </Typography.Text>
                  </div>
                )}
              </div>

              {/* Account Tabs */}
              <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 24 }}>
                <Tabs
                  defaultActiveKey="activity"
                  items={[
                    {
                      key: 'activity',
                      label: <span style={{ fontWeight: 600, fontSize: 14 }}>Activity & Orders</span>,
                      children: (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                            <div
                              onClick={() => navigate('/orders')}
                              style={{
                                border: '1px solid #e2e8f0',
                                borderRadius: 12,
                                padding: 16,
                                cursor: 'pointer',
                                background: '#f8fafc',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                transition: 'all 0.2s ease',
                              }}
                              className="card-hover-shadow"
                            >
                              <div>
                                <Typography.Text strong style={{ fontSize: 15, display: 'block' }}>
                                  📦 Order Tracking & Invoices
                                </Typography.Text>
                                <Typography.Text style={{ fontSize: 12, color: '#64748b' }}>
                                  Check live delivery status and past order receipts
                                </Typography.Text>
                              </div>
                              <RightOutlined style={{ color: '#94a3b8' }} />
                            </div>

                            <div
                              onClick={() => navigate('/addresses')}
                              style={{
                                border: '1px solid #e2e8f0',
                                borderRadius: 12,
                                padding: 16,
                                cursor: 'pointer',
                                background: '#f8fafc',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                transition: 'all 0.2s ease',
                              }}
                              className="card-hover-shadow"
                            >
                              <div>
                                <Typography.Text strong style={{ fontSize: 15, display: 'block' }}>
                                  🏡 Saved Delivery Addresses
                                </Typography.Text>
                                <Typography.Text style={{ fontSize: 12, color: '#64748b' }}>
                                  Manage home and store delivery destinations
                                </Typography.Text>
                              </div>
                              <RightOutlined style={{ color: '#94a3b8' }} />
                            </div>

                            <div
                              onClick={() => navigate('/wishlist')}
                              style={{
                                border: '1px solid #e2e8f0',
                                borderRadius: 12,
                                padding: 16,
                                cursor: 'pointer',
                                background: '#f8fafc',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                transition: 'all 0.2s ease',
                              }}
                              className="card-hover-shadow"
                            >
                              <div>
                                <Typography.Text strong style={{ fontSize: 15, display: 'block' }}>
                                  ❤️ Saved Wishlist & Favorites
                                </Typography.Text>
                                <Typography.Text style={{ fontSize: 12, color: '#64748b' }}>
                                  Quick access to your curated staple items
                                </Typography.Text>
                              </div>
                              <RightOutlined style={{ color: '#94a3b8' }} />
                            </div>

                            <div
                              onClick={() => navigate('/refer')}
                              style={{
                                border: '1px solid #fbcfe8',
                                borderRadius: 12,
                                padding: 16,
                                cursor: 'pointer',
                                background: 'linear-gradient(135deg, #fdf4ff 0%, #fae8ff 100%)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                transition: 'all 0.2s ease',
                              }}
                              className="card-hover-shadow"
                            >
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <Typography.Text strong style={{ fontSize: 15, display: 'block', color: '#a21caf' }}>
                                    🎁 Refer & Earn Rewards
                                  </Typography.Text>
                                  <Tag color="purple" style={{ borderRadius: 8, fontSize: 10, fontWeight: 700 }}>
                                    Earn 100 Coins
                                  </Tag>
                                </div>
                                <Typography.Text style={{ fontSize: 12, color: '#701a75' }}>
                                  Invite friends & fellow shop partners to earn coins on orders
                                </Typography.Text>
                              </div>
                              <RightOutlined style={{ color: '#c084fc' }} />
                            </div>

                            <div
                              onClick={() => navigate('/help')}
                              style={{
                                border: '1px solid #bfdbfe',
                                borderRadius: 12,
                                padding: 16,
                                cursor: 'pointer',
                                background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                transition: 'all 0.2s ease',
                              }}
                              className="card-hover-shadow"
                            >
                              <div>
                                <Typography.Text strong style={{ fontSize: 15, display: 'block', color: '#1d4ed8' }}>
                                  🎧 Help & Customer Support
                                </Typography.Text>
                                <Typography.Text style={{ fontSize: 12, color: '#1e40af' }}>
                                  Toll-free helpline, WhatsApp desk, live order help & FAQs
                                </Typography.Text>
                              </div>
                              <RightOutlined style={{ color: '#3b82f6' }} />
                            </div>
                          </div>

                          <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 18, marginTop: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                              <div>
                                <Typography.Text strong style={{ fontSize: 15 }}>
                                  Notification Preferences
                                </Typography.Text>
                                <Typography.Text style={{ fontSize: 12, color: '#64748b', display: 'block' }}>
                                  Receive order dispatch notifications and digital invoices on WhatsApp
                                </Typography.Text>
                              </div>
                              <Switch
                                checked={whatsappAlerts}
                                onChange={(val) => {
                                  setWhatsappAlerts(val);
                                  message.success(val ? 'WhatsApp alerts enabled' : 'WhatsApp alerts disabled');
                                }}
                                style={{ background: whatsappAlerts ? '#f97316' : undefined }}
                              />
                            </div>
                          </div>
                        </div>
                      ),
                    },
                    ...(isRetailer
                      ? [
                          {
                            key: 'business',
                            label: <span style={{ fontWeight: 600, fontSize: 14 }}>KYC & Business Documents</span>,
                            children: (
                              <div style={{ paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div>
                                      <Tag color="green" style={{ fontWeight: 600, marginBottom: 4 }}>
                                        VERIFIED GSTIN
                                      </Tag>
                                      <Typography.Text strong style={{ fontSize: 16, display: 'block' }}>
                                        {retailerProfile?.gstin || '—'}
                                      </Typography.Text>
                                      <Typography.Text style={{ fontSize: 12, color: '#64748b' }}>
                                        Registered Name: {retailerProfile?.storeName || 'My Store'}
                                      </Typography.Text>
                                    </div>
                                    <Button style={{ borderRadius: 8 }}>View Certificate</Button>
                                  </div>
                                </div>
                              </div>
                            ),
                          },
                        ]
                      : []),
                  ]}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
