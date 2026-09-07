import {
  BarcodeOutlined,
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
  SafetyCertificateOutlined,
  SearchOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  TruckOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Badge, Button, Dropdown, Input, type MenuProps, Tag, Typography } from 'antd';
import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useCustomerAuth } from '../auth/CustomerAuthContext';
import { useCart } from '../cart/useCart';
import { categories } from '../mock/homeMockData';

function formatInr(value: number): string {
  return `₹${value.toLocaleString('en-IN')}`;
}

export function DesktopHeader() {
  const cart = useCart();
  const navigate = useNavigate();
  const { role, customerProfile, retailerProfile, logout, isLoggedIn } = useCustomerAuth();
  const [searchQuery, setSearchQuery] = useState('');

  const isRetailer = role === 'RETAILER';
  const isCustomer = role === 'CUSTOMER';

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/products/atta-dal?q=${encodeURIComponent(searchQuery.trim())}`);
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
              {retailerProfile?.storeName || 'Sri Balaji Provision Store'}
            </Typography.Text>
            <Tag color="green" style={{ margin: 0, fontSize: 10, fontWeight: 700 }}>KYC VERIFIED</Tag>
          </div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            GST: {retailerProfile?.gstin || '36AABCU9603R1ZM'}
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
              <strong style={{ color: '#166534' }}>{formatInr(retailerProfile?.creditLimit || 50000)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
              <span style={{ color: '#991b1b' }}>Outstanding:</span>
              <strong style={{ color: '#dc2626' }}>{formatInr(retailerProfile?.creditUsed || 14500)}</strong>
            </div>
          </div>
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
            {customerProfile?.name || 'Rahul Sharma'}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {customerProfile?.phone || '+91 98765 43210'}
          </Typography.Text>
          <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
            <Tag color="orange" style={{ margin: 0, fontSize: 11 }}>
              Wallet: ₹{customerProfile?.walletBalance || 250}
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

  const categoriesMenu: MenuProps['items'] = categories.map((cat) => ({
    key: cat.id,
    label: (
      <Link to={`/products/${cat.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
        <img src={cat.image} alt={cat.name} style={{ width: 24, height: 24, objectFit: 'contain' }} />
        <span>{cat.name}</span>
      </Link>
    ),
  }));

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, overflow: 'hidden', whiteSpace: 'nowrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
              <SafetyCertificateOutlined style={{ color: '#a7f3d0' }} />
              100% Farm-Traceable Agro Foods &amp; Staples
            </span>
            <span style={{ color: '#6ee7b7' }} className="header-location-pill">|</span>
            <span style={{ color: '#ecfdf5' }} className="header-location-pill">
              <TruckOutlined style={{ marginRight: 4 }} /> Same-Day Mill Dispatch
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
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
            <span style={{ color: '#6ee7b7' }}>|</span>
            <span style={{ color: '#d1fae5', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
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
              style={{
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
                <strong style={{ fontSize: 12, color: '#1c1917' }}>Central Hub, Sec 18</strong>
              </div>
            </div>
          </div>

          {/* Clean Omnibar Search */}
          <div style={{ flex: '1 1 280px', maxWidth: 640, minWidth: 200 }}>
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
            {isLoggedIn ? (
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
                    <div style={{ textAlign: 'left', lineHeight: 1.15 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#1c1917', display: 'block' }}>
                        {isRetailer ? 'Store Profile' : 'My Account'}
                      </span>
                      <span style={{ fontSize: 11, color: '#64748b', maxWidth: 90, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {isRetailer ? retailerProfile?.storeName || 'Store' : customerProfile?.name || 'Customer'}
                      </span>
                    </div>
                    <DownOutlined style={{ fontSize: 9, color: '#94a3b8', marginLeft: 2 }} />
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

            {/* Cart Button */}
            <Link to="/cart" style={{ textDecoration: 'none' }}>
              <Button
                type="primary"
                size="large"
                style={{
                  background: '#f97316',
                  borderColor: '#f97316',
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '0 16px',
                  fontWeight: 700,
                  height: 42,
                }}
              >
                <Badge count={cart.count} size="small" offset={[2, -2]}>
                  <ShoppingCartOutlined style={{ fontSize: 18, color: '#ffffff' }} />
                </Badge>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.1 }}>
                  <span style={{ fontSize: 10, opacity: 0.9 }}>My Cart</span>
                  <span style={{ fontSize: 13, fontWeight: 800 }}>
                    {cart.indicativeTotal != null ? formatInr(cart.indicativeTotal) : '₹0'}
                  </span>
                </span>
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Category Strip & Quick Navigation */}
      <div style={{ background: '#ffffff', padding: '6px 0', borderBottom: '1px solid #f0eee9' }}>
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
          {/* Categories Dropdown & Quick links */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, overflowX: 'auto', scrollbarWidth: 'none' }}>
            <Dropdown menu={{ items: categoriesMenu }} placement="bottomLeft">
              <Button
                type="default"
                style={{
                  borderRadius: 8,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  borderColor: '#d6d3d1',
                  background: '#f5f5f4',
                  color: '#1c1917',
                  fontSize: 13,
                  height: 32,
                }}
              >
                <span>🛒 Categories</span>
                <DownOutlined style={{ fontSize: 10 }} />
              </Button>
            </Dropdown>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, whiteSpace: 'nowrap' }}>
              {categories.map((cat) => (
                <NavLink
                  key={cat.id}
                  to={`/products/${cat.id}`}
                  style={({ isActive }) => ({
                    textDecoration: 'none',
                    fontSize: 13,
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? '#ea580c' : '#4b5563',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 0',
                    borderBottom: isActive ? '2px solid #ea580c' : '2px solid transparent',
                    whiteSpace: 'nowrap',
                  })}
                >
                  <img src={cat.image} alt={cat.name} style={{ width: 16, height: 16, objectFit: 'contain' }} />
                  <span>{cat.name}</span>
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
