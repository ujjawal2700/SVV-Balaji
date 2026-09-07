import {
  BellOutlined,
  CreditCardOutlined,
  DeleteOutlined,
  FileProtectOutlined,
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

export function ProfilePage() {
  const navigate = useNavigate();
  const { role, customerProfile, retailerProfile, logout, switchRole } = useCustomerAuth();
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
          badge: customerProfile?.totalOrders || 0,
          route: '/orders',
        },
        {
          key: 'reorder',
          icon: <SyncOutlined />,
          iconBg: '#faf5ff',
          iconColor: '#9333ea',
          label: 'Order Again / Frequent Purchases',
          subtitle: 'Quick 1-tap reorder from past deliveries',
          route: '/orders',
        },
        {
          key: 'wallet',
          icon: <WalletOutlined />,
          iconBg: '#f0fdf4',
          iconColor: '#16a34a',
          label: 'Desi Wallet',
          subtitle: `₹${customerProfile?.walletBalance || 0} Balance available`,
          route: '/wallet',
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
          subtitle: `${customerProfile?.savedAddressesCount || 1} Saved address`,
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
          subtitle: 'Toll-free 1800-209-DESI',
          action: () => message.info('Customer helpline: 1800-209-DESI'),
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
          badge: retailerProfile?.totalOrders || 1,
          route: '/orders',
        },
        {
          key: 'wallet',
          icon: <WalletOutlined />,
          iconBg: '#f0fdf4',
          iconColor: '#16a34a',
          label: 'B2B Wallet Balance',
          subtitle: `₹${retailerProfile?.walletBalance || 895} Balance available`,
          route: '/wallet',
        },
        {
          key: 'schemes',
          icon: <SafetyCertificateOutlined />,
          iconBg: '#fff7ed',
          iconColor: '#ea580c',
          label: 'Wholesale Schemes & Margins',
          subtitle: '2 Active Mandi Deals',
          action: () => message.info('2 active wholesale schemes on your account'),
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
          subtitle: retailerProfile?.address || 'Primary Shop Delivery Point',
          route: '/addresses',
        },
        {
          key: 'gst',
          icon: <FileProtectOutlined />,
          iconBg: '#f0fdfa',
          iconColor: '#0d9488',
          label: 'Business GSTIN & KYC',
          subtitle: `${retailerProfile?.gstin || '36AABCU9603R1ZM'} · Verified`,
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
          label: 'Distributor Desk Support',
          subtitle: 'Direct manager line +91 1800-BALAJI',
          action: () => message.info('Wholesale support: +91 1800-BALAJI'),
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
            padding: '32px 20px 24px',
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
                    border: '3px solid rgba(255,255,255,0.9)',
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
                    {retailerProfile?.storeName || 'Sri Balaji Provision Store'}
                  </Typography.Text>
                  <Typography.Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, display: 'block', marginTop: 2 }}>
                    Prop: {retailerProfile?.ownerName || 'Ramesh Kumar'} • {retailerProfile?.phone || '+91 98765 43210'}
                  </Typography.Text>
                  <Tag color="gold" style={{ marginTop: 6, fontWeight: 700, borderRadius: 10, fontSize: 11 }}>
                    GST: {retailerProfile?.gstin || '36AABCU9603R1ZM'}
                  </Tag>
                </>
              ) : (
                <>
                  <Typography.Text strong style={{ color: '#ffffff', fontSize: 19, display: 'block', lineHeight: 1.25 }}>
                    {customerProfile?.name || 'Rahul Sharma'}
                  </Typography.Text>
                  <Typography.Text style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, display: 'block', marginTop: 2 }}>
                    {customerProfile?.phone || '+91 98765 43210'}
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
                    ₹{retailerProfile?.walletBalance || 895}
                  </Typography.Text>
                  <Typography.Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11 }}>B2B Wallet</Typography.Text>
                </div>
                <div style={{ width: 1, background: 'rgba(255,255,255,0.25)' }} />
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <Typography.Text strong style={{ color: '#fff', fontSize: 18, display: 'block' }}>
                    {retailerProfile?.totalOrders || 12}
                  </Typography.Text>
                  <Typography.Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11 }}>Orders</Typography.Text>
                </div>
                <div style={{ width: 1, background: 'rgba(255,255,255,0.25)' }} />
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <Typography.Text strong style={{ color: '#fff', fontSize: 18, display: 'block' }}>
                    ₹{(retailerProfile?.totalSavings || 4320).toLocaleString('en-IN')}
                  </Typography.Text>
                  <Typography.Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11 }}>Mandi Saved</Typography.Text>
                </div>
                <div style={{ width: 1, background: 'rgba(255,255,255,0.25)' }} />
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <Typography.Text strong style={{ color: '#fff', fontSize: 18, display: 'block' }}>
                    ₹{((retailerProfile?.creditLimit || 50000) - (retailerProfile?.creditUsed || 14500)).toLocaleString('en-IN')}
                  </Typography.Text>
                  <Typography.Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11 }}>Credit Line</Typography.Text>
                </div>
              </>
            ) : (
              <>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <Typography.Text strong style={{ color: '#fff', fontSize: 18, display: 'block' }}>
                    ₹{customerProfile?.walletBalance || 250}
                  </Typography.Text>
                  <Typography.Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: 500 }}>
                    Desi Wallet
                  </Typography.Text>
                </div>
                <div style={{ width: 1, background: 'rgba(255,255,255,0.25)' }} />
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <Typography.Text strong style={{ color: '#fff', fontSize: 18, display: 'block' }}>
                    {customerProfile?.totalOrders || 4}
                  </Typography.Text>
                  <Typography.Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: 500 }}>
                    My Orders
                  </Typography.Text>
                </div>
                <div style={{ width: 1, background: 'rgba(255,255,255,0.25)' }} />
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <Typography.Text strong style={{ color: '#fff', fontSize: 18, display: 'block' }}>
                    {customerProfile?.couponsCount || 3}
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
                style={{ background: '#ea580c', borderColor: '#ea580c', borderRadius: 8, fontWeight: 600 }}
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

          {/* Quick Demo Role Switcher for easy testing */}
          <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 12, padding: 12, marginBottom: 12, textAlign: 'center' }}>
            <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>
              DEMO ROLE SWITCHER
            </Typography.Text>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                size="small"
                type={!isRetailer ? 'primary' : 'default'}
                style={{ flex: 1, borderRadius: 6, fontSize: 12, background: !isRetailer ? '#f97316' : undefined, borderColor: !isRetailer ? '#f97316' : undefined }}
                onClick={() => switchRole('CUSTOMER')}
              >
                👤 Customer View
              </Button>
              <Button
                size="small"
                type={isRetailer ? 'primary' : 'default'}
                style={{ flex: 1, borderRadius: 6, fontSize: 12, background: isRetailer ? '#ea580c' : undefined, borderColor: isRetailer ? '#ea580c' : undefined }}
                onClick={() => switchRole('RETAILER')}
              >
                🏪 Retailer View
              </Button>
            </div>
          </div>

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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
              <Typography.Title level={2} style={{ margin: 0, color: '#0f172a', fontWeight: 700 }}>
                {isRetailer ? 'Retailer Account Overview' : 'Customer Account Overview'}
              </Typography.Title>
              <Typography.Text style={{ color: '#64748b', fontSize: 14 }}>
                {isRetailer
                  ? 'Manage your store profile, verified GSTIN billing credentials, credit limits, and alerts.'
                  : 'Manage your personal delivery addresses, saved wishlist, and consumer order receipts.'}
              </Typography.Text>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* Demo Mode Toggle */}
              <div style={{ background: '#f1f5f9', borderRadius: 10, padding: 4, display: 'flex', gap: 4 }}>
                <Button
                  size="small"
                  type={!isRetailer ? 'primary' : 'text'}
                  style={{ borderRadius: 6, fontSize: 12, background: !isRetailer ? '#f97316' : undefined }}
                  onClick={() => switchRole('CUSTOMER')}
                >
                  👤 Customer
                </Button>
                <Button
                  size="small"
                  type={isRetailer ? 'primary' : 'text'}
                  style={{ borderRadius: 6, fontSize: 12, background: isRetailer ? '#ea580c' : undefined }}
                  onClick={() => switchRole('RETAILER')}
                >
                  🏪 Retailer
                </Button>
              </div>

              {!isRetailer && (
                <Button
                  type="primary"
                  style={{ background: '#ea580c', borderColor: '#ea580c', borderRadius: 8, fontWeight: 600 }}
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
                    ? retailerProfile?.storeName || 'Sri Balaji Provision Store'
                    : customerProfile?.name || 'Rahul Sharma'}
                </Typography.Title>
                <Typography.Text style={{ color: '#64748b', fontSize: 13, display: 'block' }}>
                  {isRetailer
                    ? `Prop: ${retailerProfile?.ownerName || 'Ramesh Kumar'}`
                    : '👤 Personal Customer Account'}
                </Typography.Text>

                {isRetailer ? (
                  <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center', gap: 8 }}>
                    <Tag color="orange" style={{ borderRadius: 12, fontWeight: 700, padding: '2px 10px' }}>
                      GST: {retailerProfile?.gstin || '36AABCU9603R1ZM'}
                    </Tag>
                  </div>
                ) : (
                  <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center', gap: 6 }}>
                    <Tag color="orange" style={{ borderRadius: 12, fontWeight: 600, padding: '2px 10px' }}>
                      Desi Member since {customerProfile?.memberSince || 'Aug 2024'}
                    </Tag>
                  </div>
                )}

                <Divider style={{ margin: '20px 0' }} />

                <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, color: '#475569' }}>
                  <div>
                    <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>PHONE NUMBER</Typography.Text>
                    <Typography.Text strong style={{ color: '#1e293b' }}>
                      {isRetailer ? retailerProfile?.phone : customerProfile?.phone || '+91 98765 43210'}
                    </Typography.Text>
                  </div>
                  <div>
                    <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>EMAIL ADDRESS</Typography.Text>
                    <Typography.Text strong style={{ color: '#1e293b' }}>
                      {isRetailer ? retailerProfile?.email : customerProfile?.email || 'rahul.sharma@example.com'}
                    </Typography.Text>
                  </div>
                  {isRetailer && (
                    <div>
                      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>DEFAULT DELIVERY HUB</Typography.Text>
                      <Typography.Text strong style={{ color: '#1e293b' }}>
                        {retailerProfile?.address || 'Shop #14, Main Market, Hanamkonda'}
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
              <div style={{ display: 'grid', gridTemplateColumns: isRetailer ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)', gap: 16 }}>
                <div style={{ background: '#fff', borderRadius: 14, padding: '18px 20px', border: '1px solid #e2e8f0' }}>
                  <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 600, display: 'block' }}>
                    DESI WALLET
                  </Typography.Text>
                  <Typography.Text strong style={{ fontSize: 22, color: '#ea580c', display: 'block', marginTop: 4 }}>
                    ₹{isRetailer ? retailerProfile?.walletBalance || 895 : customerProfile?.walletBalance || 250}
                  </Typography.Text>
                  <Link to="/wallet" style={{ fontSize: 12, color: '#ea580c', fontWeight: 600 }}>
                    Recharge Balance &rarr;
                  </Link>
                </div>

                <div style={{ background: '#fff', borderRadius: 14, padding: '18px 20px', border: '1px solid #e2e8f0' }}>
                  <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 600, display: 'block' }}>
                    MY ORDERS
                  </Typography.Text>
                  <Typography.Text strong style={{ fontSize: 22, color: '#0f172a', display: 'block', marginTop: 4 }}>
                    {isRetailer ? retailerProfile?.totalOrders || 12 : customerProfile?.totalOrders || 4}
                  </Typography.Text>
                  <Link to="/orders" style={{ fontSize: 12, color: '#f97316', fontWeight: 600 }}>
                    View Order History &rarr;
                  </Link>
                </div>

                {isRetailer ? (
                  <>
                    <div style={{ background: '#fff', borderRadius: 14, padding: '18px 20px', border: '1px solid #e2e8f0' }}>
                      <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 600, display: 'block' }}>
                        TOTAL SAVINGS
                      </Typography.Text>
                      <Typography.Text strong style={{ fontSize: 22, color: '#16a34a', display: 'block', marginTop: 4 }}>
                        ₹{(retailerProfile?.totalSavings || 4320).toLocaleString('en-IN')}
                      </Typography.Text>
                      <Typography.Text style={{ fontSize: 12, color: '#16a34a', fontWeight: 500 }}>
                        Wholesale Margins
                      </Typography.Text>
                    </div>

                    <div style={{ background: '#fff', borderRadius: 14, padding: '18px 20px', border: '1px solid #e2e8f0' }}>
                      <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 600, display: 'block' }}>
                        CREDIT LINE
                      </Typography.Text>
                      <Typography.Text strong style={{ fontSize: 22, color: '#0f172a', display: 'block', marginTop: 4 }}>
                        ₹{((retailerProfile?.creditLimit || 50000) - (retailerProfile?.creditUsed || 14500)).toLocaleString('en-IN')}
                      </Typography.Text>
                      <Typography.Text style={{ fontSize: 12, color: '#64748b' }}>
                        Limit: ₹50,000
                      </Typography.Text>
                    </div>
                  </>
                ) : (
                  <div style={{ background: '#fff', borderRadius: 14, padding: '18px 20px', border: '1px solid #e2e8f0' }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 600, display: 'block' }}>
                      ACTIVE COUPONS
                    </Typography.Text>
                    <Typography.Text strong style={{ fontSize: 22, color: '#16a34a', display: 'block', marginTop: 4 }}>
                      {customerProfile?.couponsCount || 3} Offers
                    </Typography.Text>
                    <Typography.Text style={{ fontSize: 12, color: '#16a34a', fontWeight: 500 }}>
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
                                <Typography.Text strong style={{ fontSize: 15, display: 'block', color: '#9333ea' }}>
                                  🔄 Order Again / Frequent Items
                                </Typography.Text>
                                <Typography.Text style={{ fontSize: 12, color: '#64748b' }}>
                                  1-tap instant replenishment from prior orders
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
                                        {retailerProfile?.gstin || '36AABCU9603R1ZM'}
                                      </Typography.Text>
                                      <Typography.Text style={{ fontSize: 12, color: '#64748b' }}>
                                        Registered Name: {retailerProfile?.storeName || 'Sri Balaji Provision Store'} · State: Telangana (36)
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
