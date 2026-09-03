import {
  BellOutlined,
  CreditCardOutlined,
  CustomerServiceOutlined,
  DeleteOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  GiftOutlined,
  HeartOutlined,
  InfoCircleOutlined,
  LockOutlined,
  LogoutOutlined,
  NotificationOutlined,
  RightOutlined,
  SafetyCertificateOutlined,
  ShoppingOutlined,
  StarOutlined,
  UserOutlined,
  WalletOutlined,
} from '@ant-design/icons';

import { App, Avatar, Badge, Divider, Switch, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const mockUser = {
  name: 'Rahul Sharma',
  phone: '+91 98765 43210',
  email: 'rahul.sharma@email.com',
  avatar: null,
  memberSince: 'Jan 2024',
  totalOrders: 24,
  totalSavings: 1840,
};

interface MenuSection {
  title: string;
  items: {
    key: string;
    label: string;
    subtitle?: string;
    icon: React.ReactNode;
    iconBg: string;
    iconColor: string;
    badge?: string | number;
    toggle?: boolean;
    toggleValue?: boolean;
    onToggle?: (val: boolean) => void;
    route?: string;
    action?: () => void;
  }[];
}

export function ProfilePage() {
  const navigate = useNavigate();
  const { modal, message } = App.useApp();
  const [notifications, setNotifications] = useState(true);
  const [offers, setOffers] = useState(true);

  const handleLogout = () => {
    modal.confirm({
      title: 'Log Out',
      content: 'Are you sure you want to log out?',
      okText: 'Log Out',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: () => message.success('Logged out successfully'),
    });
  };

  const handleDeleteAccount = () => {
    modal.confirm({
      title: 'Delete Account',
      icon: <DeleteOutlined style={{ color: '#dc2626' }} />,
      content: (
        <div>
          <Typography.Text style={{ display: 'block', marginBottom: 8 }}>
            Are you sure you want to permanently delete your account?
          </Typography.Text>
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 12px' }}>
            <Typography.Text style={{ color: '#dc2626', fontSize: 13 }}>
              ⚠️ This will permanently delete all your orders, addresses, and account data. This action <strong>cannot be undone</strong>.
            </Typography.Text>
          </div>
        </div>
      ),
      okText: 'Yes, Delete My Account',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: () => message.error('Account deletion request submitted. You will receive a confirmation email.'),
    });
  };

  const sections: MenuSection[] = [
    {
      title: 'My Activity',
      items: [
        {
          key: 'wallet',
          label: 'Desi Tokri Wallet',
          subtitle: 'Balance: ₹895',
          icon: <WalletOutlined />,
          iconBg: '#fff3ed',
          iconColor: '#f97316',
          route: '/wallet',
        },
        {
          key: 'orders',
          label: 'My Orders',
          subtitle: `${mockUser.totalOrders} orders placed`,
          icon: <ShoppingOutlined />,
          iconBg: '#fff3ed',
          iconColor: '#f97316',
          route: '/orders',
        },
        {
          key: 'wishlist',
          label: 'Wishlist',
          subtitle: '3 saved items',
          icon: <HeartOutlined />,
          iconBg: '#fef2f2',
          iconColor: '#ef4444',
          route: '/wishlist',
        },
        {
          key: 'addresses',
          label: 'Saved Addresses',
          subtitle: '2 saved addresses',
          icon: <EnvironmentOutlined />,
          iconBg: '#eff6ff',
          iconColor: '#3b82f6',
          route: '/addresses',
        },
        {
          key: 'payments',
          label: 'Payment Methods',
          subtitle: 'UPI, Cards & more',
          icon: <CreditCardOutlined />,
          iconBg: '#f0fdf4',
          iconColor: '#16a34a',
          action: () => message.info('Payment methods coming soon!'),
        },
      ],
    },
    {
      title: 'Offers & Rewards',
      items: [
        {
          key: 'coupons',
          label: 'My Coupons',
          subtitle: '2 active coupons',
          icon: <GiftOutlined />,
          iconBg: '#fdf4ff',
          iconColor: '#a855f7',
          badge: '2',
          action: () => message.info('Coupons coming soon!'),
        },
        {
          key: 'reviews',
          label: 'My Reviews',
          subtitle: 'Rate past purchases',
          icon: <StarOutlined />,
          iconBg: '#fffbeb',
          iconColor: '#f59e0b',
          action: () => navigate('/orders'),
        },
      ],
    },
    {
      title: 'Notifications',
      items: [
        {
          key: 'notif',
          label: 'Order Notifications',
          subtitle: 'Delivery updates & alerts',
          icon: <BellOutlined />,
          iconBg: '#fff3ed',
          iconColor: '#f97316',
          toggle: true,
          toggleValue: notifications,
          onToggle: (v) => { setNotifications(v); message.success(v ? 'Notifications enabled' : 'Notifications disabled'); },
        },
        {
          key: 'offers_notif',
          label: 'Offers & Promotions',
          subtitle: 'Deals and discounts',
          icon: <NotificationOutlined />,
          iconBg: '#fdf4ff',
          iconColor: '#a855f7',
          toggle: true,
          toggleValue: offers,
          onToggle: (v) => { setOffers(v); message.success(v ? 'Offer alerts enabled' : 'Offer alerts disabled'); },
        },
      ],
    },
    {
      title: 'Account & Support',
      items: [
        {
          key: 'account',
          label: 'Account Details',
          subtitle: 'Name, email, phone',
          icon: <UserOutlined />,
          iconBg: '#eff6ff',
          iconColor: '#3b82f6',
          action: () => message.info('Edit profile coming soon!'),
        },
        {
          key: 'privacy',
          label: 'Privacy & Security',
          subtitle: 'Password, data settings',
          icon: <LockOutlined />,
          iconBg: '#f0fdf4',
          iconColor: '#16a34a',
          action: () => message.info('Privacy settings coming soon!'),
        },
        {
          key: 'invoices',
          label: 'Invoices & Bills',
          subtitle: 'Download past bills',
          icon: <FileTextOutlined />,
          iconBg: '#f8fafc',
          iconColor: '#64748b',
          action: () => message.info('Invoices coming soon!'),
        },
        {
          key: 'support',
          label: 'Help & Support',
          subtitle: 'FAQs, chat with us',
          icon: <CustomerServiceOutlined />,
          iconBg: '#fffbeb',
          iconColor: '#f59e0b',
          action: () => message.info('Support coming soon!'),
        },
        {
          key: 'about',
          label: 'About App',
          subtitle: 'Version 1.0.0',
          icon: <InfoCircleOutlined />,
          iconBg: '#f8fafc',
          iconColor: '#64748b',
          action: () => message.info('SVV Balaji Customer App v1.0.0'),
        },
        {
          key: 'safe',
          label: 'Safe Shopping Promise',
          subtitle: '100% authentic products',
          icon: <SafetyCertificateOutlined />,
          iconBg: '#f0fdf4',
          iconColor: '#16a34a',
          action: () => message.info('All products are quality-checked and authentic.'),
        },
      ],
    },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f1f3f6', paddingBottom: 80 }}>

      {/* Profile Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
        padding: '32px 20px 24px',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Decorative circles */}
        <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
        <div style={{ position: 'absolute', top: 20, right: 40, width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, position: 'relative' }}>
          <div style={{ position: 'relative' }}>
            <Avatar
              size={72}
              style={{ background: 'rgba(255,255,255,0.25)', fontWeight: 700, fontSize: 28, color: '#fff', border: '3px solid rgba(255,255,255,0.4)' }}
            >
              {mockUser.name.charAt(0)}
            </Avatar>
            <div
              style={{
                position: 'absolute', bottom: 0, right: 0, width: 22, height: 22,
                borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer', border: '2px solid #f97316'
              }}
              onClick={() => message.info('Edit photo coming soon!')}
            >
              <span style={{ fontSize: 10, color: '#f97316' }}>✏️</span>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <Typography.Text strong style={{ color: '#fff', fontSize: 20, display: 'block' }}>{mockUser.name}</Typography.Text>
            <Typography.Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, display: 'block' }}>{mockUser.phone}</Typography.Text>
            <Typography.Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, display: 'block', marginTop: 2 }}>Member since {mockUser.memberSince}</Typography.Text>
          </div>
        </div>

        {/* Stats Row */}
        <div style={{
          display: 'flex', gap: 12, marginTop: 20,
          background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: '14px 16px'
        }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <Typography.Text strong style={{ color: '#fff', fontSize: 20, display: 'block' }}>₹895</Typography.Text>
            <Typography.Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11 }}>Wallet</Typography.Text>
          </div>
          <div style={{ width: 1, background: 'rgba(255,255,255,0.2)' }} />
          <div style={{ flex: 1, textAlign: 'center' }}>
            <Typography.Text strong style={{ color: '#fff', fontSize: 20, display: 'block' }}>{mockUser.totalOrders}</Typography.Text>
            <Typography.Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11 }}>Orders</Typography.Text>
          </div>
          <div style={{ width: 1, background: 'rgba(255,255,255,0.2)' }} />
          <div style={{ flex: 1, textAlign: 'center' }}>
            <Typography.Text strong style={{ color: '#fff', fontSize: 20, display: 'block' }}>₹{mockUser.totalSavings.toLocaleString('en-IN')}</Typography.Text>
            <Typography.Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11 }}>Total Saved</Typography.Text>
          </div>
          <div style={{ width: 1, background: 'rgba(255,255,255,0.2)' }} />
          <div style={{ flex: 1, textAlign: 'center' }}>
            <Typography.Text strong style={{ color: '#fff', fontSize: 20, display: 'block' }}>2</Typography.Text>
            <Typography.Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11 }}>Coupons</Typography.Text>
          </div>
        </div>
      </div>

      {/* Menu Sections */}
      <div style={{ padding: '12px' }}>
        {sections.map((section) => (
          <div key={section.title} style={{ marginBottom: 12 }}>
            <Typography.Text style={{ fontSize: 12, fontWeight: 600, color: '#878787', display: 'block', marginBottom: 6, paddingLeft: 4, letterSpacing: 0.5 }}>
              {section.title.toUpperCase()}
            </Typography.Text>
            <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              {section.items.map((item, idx) => (
                <div key={item.key}>
                  <div
                    onClick={item.toggle ? undefined : (item.route ? () => navigate(item.route!) : item.action)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                      padding: '13px 16px', background: 'none',
                      cursor: item.toggle ? 'default' : 'pointer',
                    }}
                  >
                    {/* Icon */}
                    <div style={{
                      width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                      background: item.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <span style={{ fontSize: 18, color: item.iconColor }}>{item.icon}</span>
                    </div>

                    {/* Label */}
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <Typography.Text strong style={{ fontSize: 14, color: '#212121', display: 'block' }}>{item.label}</Typography.Text>
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
                        {item.badge && (
                          <Badge count={item.badge} style={{ background: '#f97316' }} />
                        )}
                        <RightOutlined style={{ color: '#d1d5db', fontSize: 12 }} />
                      </div>
                    )}
                  </div>
                  {idx < section.items.length - 1 && (
                    <Divider style={{ margin: '0 16px', width: 'auto', minWidth: 'auto' }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Logout */}
        <button
          onClick={handleLogout}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            padding: '14px 16px', background: '#fff', border: '1px solid #fca5a5',
            borderRadius: 12, cursor: 'pointer', marginTop: 4, marginBottom: 8
          }}
        >
          <LogoutOutlined style={{ color: '#dc2626', fontSize: 18 }} />
          <Typography.Text strong style={{ color: '#dc2626', fontSize: 15 }}>Log Out</Typography.Text>
        </button>

        {/* Delete Account */}
        <div
          onClick={handleDeleteAccount}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            padding: '14px 16px', background: '#fef2f2', border: '1px solid #fca5a5',
            borderRadius: 12, cursor: 'pointer', marginBottom: 8
          }}
        >
          <DeleteOutlined style={{ color: '#dc2626', fontSize: 18 }} />
          <Typography.Text strong style={{ color: '#dc2626', fontSize: 15 }}>Delete Account</Typography.Text>
        </div>

        <Typography.Text style={{ display: 'block', textAlign: 'center', fontSize: 12, color: '#c0c0c0', marginTop: 8 }}>
          SVV Balaji • v1.0.0
        </Typography.Text>
      </div>
    </div>
  );
}
