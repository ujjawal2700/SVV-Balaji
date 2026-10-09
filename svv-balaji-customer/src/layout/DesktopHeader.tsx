import {
  BarcodeOutlined,
  BellOutlined,
  CompassOutlined,
  CreditCardOutlined,
  DownOutlined,
  EnvironmentOutlined,
  GiftFilled,
  HeartOutlined,
  LogoutOutlined,
  PhoneOutlined,
  QrcodeOutlined,
  ReloadOutlined,
  RightOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  TrophyOutlined,
  TruckOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Badge, Button, Dropdown, Input, type MenuProps, Tag, Typography, Skeleton } from 'antd';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCustomerAuth } from '../auth/CustomerAuthContext';
import { useRetailerCredit } from '../hooks/useRetailerCredit';
import { useCart } from '../cart/useCart';
import { useLoyalty } from '../loyalty/useLoyalty';

import { formatInr } from '../utils/money';
import { useUnreadNotifications } from '../notifications/useUnreadNotifications';
import { LocationPicker } from '../location/LocationPicker';
import { locationLine, useShopperLocation } from '../location/useShopperLocation';


export function DesktopHeader() {
  const shopperLocation = useShopperLocation();
  const [pickingLocation, setPickingLocation] = useState(false);
  const cart = useCart();
  const navigate = useNavigate();
  const { role, customerProfile, retailerProfile, logout, isLoggedIn, initialising } = useCustomerAuth();
  const credit = useRetailerCredit();
  const loyalty = useLoyalty();
  const unreadNotifications = useUnreadNotifications();
  const [searchQuery, setSearchQuery] = useState('');

  const isRetailer = role === 'RETAILER';
  const isCustomer = role === 'CUSTOMER';

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  // Account Menu for Retailer
  const retailerAccountMenu: MenuProps['items'] = [
    {
      key: 'profile-header',
      label: (
        <div style={{ padding: '6px 4px', minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
            <Typography.Text strong style={{ fontSize: 14 }}>
              {retailerProfile?.storeName || 'My Store'}
            </Typography.Text>
            <Tag color="green" style={{ margin: 0, fontSize: 10, fontWeight: 700 }}>KYC VERIFIED</Tag>
          </div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            GST: {retailerProfile?.gstin || '—'}
          </Typography.Text>
          <div
            style={{
              marginTop: 8,
              padding: '8px 10px',
              background: '#f0fdf4',
              borderRadius: 8,
              border: '1px solid #bbf7d0',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: '#166534' }}>Credit Limit:</span>
              <strong style={{ color: '#166534' }}>{credit.hasCredit ? formatInr(credit.limit) : 'Not set'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
              <span style={{ color: '#991b1b' }}>Outstanding:</span>
              <strong style={{ color: '#dc2626' }}>{formatInr(credit.used)}</strong>
            </div>
          </div>
          <Tag color="gold" style={{ margin: '8px 0 0', fontSize: 11 }}>
            {loyalty.points.toLocaleString('en-IN')} loyalty pts
          </Tag>
        </div>
      ),
    },
    { type: 'divider' },
    {
      key: 'orders',
      icon: <TruckOutlined style={{ color: '#2563eb' }} />,
      label: <Link to="/orders">Wholesale Orders &amp; Tracking</Link>,
    },
    {
      key: 'wallet',
      icon: <CreditCardOutlined style={{ color: '#059669' }} />,
      label: <Link to="/wallet">Mandi Ledger &amp; Credit</Link>,
    },
    {
      key: 'loyalty',
      icon: <TrophyOutlined style={{ color: '#d97706' }} />,
      label: <Link to="/loyalty">Wholesaler Rewards</Link>,
    },
    {
      key: 'profile',
      icon: <UserOutlined style={{ color: '#4b5563' }} />,
      label: <Link to="/profile">Store Dashboard Settings</Link>,
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined style={{ color: '#dc2626' }} />,
      label: <span onClick={logout} style={{ color: '#dc2626' }}>Sign Out Account</span>,
    },
  ];

  // Account Menu for Customer
  const customerAccountMenu: MenuProps['items'] = [
    {
      key: 'profile-header',
      label: (
        <div style={{ padding: '6px 4px', minWidth: 200 }}>
          <Typography.Text strong style={{ display: 'block', fontSize: 14 }}>
            {customerProfile?.name ?? ''}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {customerProfile?.phone ?? ''}
          </Typography.Text>
          <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
            <Tag color="gold" style={{ margin: 0, fontSize: 11 }}>
              {loyalty.points.toLocaleString('en-IN')} pts
            </Tag>
          </div>
        </div>
      ),
    },
    { type: 'divider' },
    {
      key: 'orders',
      icon: <TruckOutlined style={{ color: '#2563eb' }} />,
      label: <Link to="/orders">My Orders &amp; Receipts</Link>,
    },
    {
      key: 'loyalty',
      icon: <TrophyOutlined style={{ color: '#d97706' }} />,
      label: <Link to="/loyalty">Desi Rewards</Link>,
    },
    {
      key: 'wishlist',
      icon: <HeartOutlined style={{ color: '#e11d48' }} />,
      label: <Link to="/wishlist">Saved Wishlist</Link>,
    },
    {
      key: 'addresses',
      icon: <ShopOutlined style={{ color: '#0284c7' }} />,
      label: <Link to="/addresses">Saved Addresses</Link>,
    },
    {
      key: 'partner',
      icon: <ShopOutlined style={{ color: '#ea580c' }} />,
      label: (
        <Link to="/register" style={{ color: '#ea580c', fontWeight: 600 }}>
          Become a Partner (Wholesale) &rarr;
        </Link>
      ),
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined style={{ color: '#dc2626' }} />,
      label: <span onClick={logout} style={{ color: '#dc2626' }}>Sign Out</span>,
    },
  ];

  return (
    <header className="desktop-only" style={{ background: '#ffffff', borderBottom: '1px solid #e7e5e4', position: 'sticky', top: 0, zIndex: 100 }}>
      {/* Top utility announcement bar */}
      <div
        style={{
          background: isRetailer ? '#047857' : '#0f766e',
          color: '#ffffff',
          fontSize: 12,
          padding: '6px 0',
          borderBottom: '1px solid rgba(0,0,0,0.1)',
        }}
      >
        <div
          className="store-container"
          style={{
            paddingTop: 0,
            paddingBottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div className="hdr-top-left" style={{ display: 'flex', alignItems: 'center', gap: 16, overflow: 'hidden', whiteSpace: 'nowrap', minWidth: 0 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
              <SafetyCertificateOutlined style={{ color: '#a7f3d0' }} />
              100% Farm-Traceable Agro Foods &amp; Staples
            </span>
            <span style={{ color: '#6ee7b7' }} className="header-location-pill">|</span>
            <span style={{ color: '#ecfdf5' }} className="header-location-pill">
              <TruckOutlined style={{ marginRight: 4 }} /> Same-Day Mill Dispatch
            </span>
          </div>

          <div className="hdr-top-right" style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
            {!isRetailer && (
              <Link
                to="/register"
                style={{
                  color: '#fef08a',
                  textDecoration: 'none',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <ShopOutlined /> Become a Partner / Buy Wholesale
              </Link>
            )}
            {isRetailer && (
              <span style={{ color: '#fef08a', fontWeight: 600 }}>
                🏪 Verified Retailer Partner Mode
              </span>
            )}
            <span style={{ color: '#6ee7b7' }}>|</span>
            <Link
              to="/trace"
              style={{
                color: '#ffffff',
                textDecoration: 'none',
                fontWeight: 500,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <QrcodeOutlined /> Trace QR Batch
            </Link>
            <span className="hdr-phone" style={{ color: '#6ee7b7' }}>|</span>
            <span className="hdr-phone" style={{ color: '#d1fae5', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <PhoneOutlined /> <strong>1800-209-DESI</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Main desktop header bar */}
      <div style={{ padding: '12px 0', borderBottom: '1px solid #f0eee9' }}>
        <div
          className="store-container"
          style={{
            paddingTop: 0,
            paddingBottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 20,
          }}
          data-hdr-main=""
        >
          {/* Logo & Delivering To */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
            <Link
              to="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                textDecoration: 'none',
              }}
            >
              <img
                src="/images/desi-tokri-horizontal.png"
                alt="Desi Tokri"
                className="hdr-logo"
                style={{
                  height: 34,
                  width: 'auto',
                  display: 'block',
                  objectFit: 'contain',
                }}
              />
            </Link>

            {/* Location Pill */}
            <div
              className="header-location-pill"
              role="button"
              tabIndex={0}
              onClick={() => setPickingLocation(true)}
              onKeyDown={(e) => e.key === 'Enter' && setPickingLocation(true)}
              title="Change location"
              style={{
                cursor: 'pointer',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                borderRadius: 20,
                background: '#f8fafc',
                border: '1px solid #e7e5e4',
              }}
            >
              <EnvironmentOutlined style={{ color: '#059669', fontSize: 15 }} />
              <div>
                <span style={{ fontSize: 10, color: '#78716c', display: 'block', lineHeight: 1 }}>Delivering to</span>
                <strong style={{ fontSize: 12, color: shopperLocation ? '#1c1917' : '#ea580c' }}>
                  {shopperLocation ? locationLine(shopperLocation) : 'Set location'} ▾
                </strong>
              </div>
            </div>
            <LocationPicker open={pickingLocation} onClose={() => setPickingLocation(false)} />
          </div>

          {/* Clean Omnibar Search */}
          <div className="hdr-search" style={{ flex: '1 1 280px', maxWidth: 640, minWidth: 160 }}>
            <form onSubmit={handleSearch}>
              <Input
                size="large"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for atta, dal, spices, snacks, edible oils..."
                prefix={<SearchOutlined style={{ color: '#9ca3af', fontSize: 16, marginRight: 6 }} />}
                suffix={
                  <Button
                    type="primary"
                    htmlType="submit"
                    style={{
                      background: '#f97316',
                      borderColor: '#f97316',
                      height: 34,
                      padding: '0 16px',
                      borderRadius: 8,
                      fontWeight: 600,
                      fontSize: 13,
                    }}
                  >
                    Search
                  </Button>
                }
                style={{
                  borderRadius: 12,
                  borderColor: '#e2e8f0',
                  background: '#f8fafc',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  paddingRight: 4,
                  height: 42,
                }}
              />
            </form>
          </div>

          {/* Right Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            {/* User Profile / Retailer Dropdown or Sign In */}
            {initialising ? (
              // Session being restored: hold the account slot instead of flashing "Sign In".
              <Skeleton.Button active style={{ width: 132, height: 42, borderRadius: 10 }} />
            ) : isLoggedIn ? (
              <Dropdown menu={{ items: isRetailer ? retailerAccountMenu : customerAccountMenu }} placement="bottomRight" arrow>
                <Link to="/profile" style={{ textDecoration: 'none' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 12px',
                      borderRadius: 10,
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      cursor: 'pointer',
                      height: 42,
                    }}
                    className="category-pill-hover"
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: isRetailer ? '#ea580c' : '#f97316',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: 12,
                        flexShrink: 0,
                      }}
                    >
                      <UserOutlined />
                    </div>
                    <div className="hdr-account-text" style={{ textAlign: 'left', lineHeight: 1.15 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#1c1917', display: 'block' }}>
                        {isRetailer ? 'Store Profile' : 'My Account'}
                      </span>
                      <span style={{ fontSize: 11, color: '#64748b', maxWidth: 90, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {isRetailer ? retailerProfile?.storeName || 'Store' : customerProfile?.name || 'Customer'}
                      </span>
                    </div>
                    <DownOutlined className="hdr-account-text" style={{ fontSize: 9, color: '#94a3b8', marginLeft: 2 }} />
                  </div>
                </Link>
              </Dropdown>
            ) : (
              <Link to="/login" style={{ textDecoration: 'none' }}>
                <Button
                  style={{
                    borderRadius: 10,
                    fontWeight: 600,
                    height: 42,
                    borderColor: '#f97316',
                    color: '#f97316',
                    padding: '0 16px',
                  }}
                >
                  Sign In
                </Button>
              </Link>
            )}

            {isLoggedIn ? (
              <Link to="/notifications" aria-label="Notifications" style={{ display: 'flex', alignItems: 'center', padding: '0 4px' }}>
                <Badge count={unreadNotifications} size="small" offset={[2, -2]}>
                  <BellOutlined style={{ fontSize: 20, color: '#334155' }} />
                </Badge>
              </Link>
            ) : null}

            {/* Cart Button */}
            <Link to="/cart" style={{ textDecoration: 'none' }}>
              <div
                style={{
                  background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '0 14px 0 10px',
                  height: 42,
                  boxShadow: '0 3px 10px rgba(234, 88, 12, 0.28)',
                  cursor: 'pointer',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  userSelect: 'none',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(234, 88, 12, 0.38)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 3px 10px rgba(234, 88, 12, 0.28)';
                }}
              >
                {/* Cart Icon Container with crisp, non-overlapping floating Badge */}
                <div
                  style={{
                    position: 'relative',
                    width: 32,
                    height: 32,
                    borderRadius: 9,
                    background: 'rgba(255, 255, 255, 0.22)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <ShoppingCartOutlined style={{ fontSize: 17, color: '#ffffff' }} />
                  {cart.count > 0 && (
                    <span
                      style={{
                        position: 'absolute',
                        top: -5,
                        right: -6,
                        minWidth: 17,
                        height: 17,
                        padding: '0 4px',
                        borderRadius: 999,
                        background: '#ffffff',
                        color: '#ea580c',
                        fontSize: 10.5,
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                        lineHeight: 1,
                      }}
                    >
                      {cart.count > 99 ? '99+' : cart.count}
                    </span>
                  )}
                </div>

                {/* Text Content */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    textAlign: 'left',
                    lineHeight: 1.15,
                  }}
                >
                  <span
                    className="hdr-cart-label"
                    style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      color: 'rgba(255, 255, 255, 0.9)',
                      letterSpacing: '0.02em',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    My Cart
                  </span>
                  <span
                    style={{
                      fontSize: 13.5,
                      fontWeight: 800,
                      color: '#ffffff',
                      letterSpacing: '-0.01em',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {cart.indicativeTotal != null && cart.indicativeTotal > 0
                      ? formatInr(cart.indicativeTotal)
                      : '₹0'}
                  </span>
                </div>

                {/* Subtle Right Arrow */}
                <RightOutlined
                  className="hdr-cart-arrow"
                  style={{
                    fontSize: 10,
                    color: 'rgba(255, 255, 255, 0.8)',
                    marginLeft: 2,
                  }}
                />
              </div>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
