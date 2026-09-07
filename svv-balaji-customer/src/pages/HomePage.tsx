import {
  BarcodeOutlined,
  BellOutlined,
  CheckCircleFilled,
  CreditCardOutlined,
  EnvironmentOutlined,
  FireFilled,
  GiftFilled,
  MinusOutlined,
  PlusOutlined,
  QrcodeOutlined,
  ReloadOutlined,
  RightOutlined,
  SafetyCertificateFilled,
  SearchOutlined,
  ShopOutlined,
  ShoppingOutlined,
  ThunderboltFilled,
  TruckFilled,
  UserOutlined,
} from '@ant-design/icons';
import { Badge, Button, Carousel, Input, InputNumber, Typography } from 'antd';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCustomerAuth } from '../auth/CustomerAuthContext';
import { useCart } from '../cart/useCart';
import {
  bestOfBasics,
  buyAgainProducts,
  categories,
  popularProducts,
  schemes,
} from '../mock/homeMockData';

function formatInr(value: number): string {
  return `₹${value.toLocaleString('en-IN')}`;
}

export function HomePage() {
  const cart = useCart();
  const navigate = useNavigate();
  const { role, customerProfile, retailerProfile } = useCustomerAuth();
  const isRetailer = role === 'RETAILER';
  const [traceInput, setTraceInput] = useState('');

  const handleTraceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (traceInput.trim()) {
      navigate(`/trace/${traceInput.trim()}`);
    } else {
      navigate('/trace');
    }
  };

  return (
    <div>
      {/* ========================================================================= */}
      {/* 1. MOBILE-ONLY GREETING & SEARCH HEADER (PREMIUM FLIPKART/BLINKIT STYLE) */}
      {/* ========================================================================= */}
      <header
        className="store-safe-top mobile-only"
        style={{
          background: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
        }}
      >
        <div
          className="store-container"
          style={{
            paddingTop: 28,
            paddingBottom: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
          }}
        >
          {/* Logo & Greeting / Delivery Address */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
            <Link
              to="/"
              style={{
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#fafaf9',
                padding: '4px 6px',
                borderRadius: 14,
                border: '1px solid #f1f5f9',
                flexShrink: 0,
              }}
            >
              <img
                src="/images/desi-tokri-cropped.png"
                alt="Desi Tokri"
                style={{ width: 56, height: 56, objectFit: 'contain' }}
              />
            </Link>

            <div style={{ flex: 1, minWidth: 0 }}>
              {isRetailer ? (
                <>
                  <Typography.Title level={4} style={{ margin: 0, color: '#065f46', lineHeight: 1.25, fontSize: 17, fontWeight: 700 }}>
                    Good Morning, {retailerProfile?.storeName || 'Sri Balaji Store'}
                  </Typography.Title>
                  <div className="brand-title-font" style={{ fontSize: 11, color: '#b45309', fontWeight: 700, letterSpacing: '1px', marginTop: 4 }}>
                    GST: {retailerProfile?.gstin || '36AABCU9603R1ZM'} • Mandi Wholesale
                  </div>
                </>
              ) : (
                <Link to="/addresses" style={{ textDecoration: 'none', display: 'block' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <EnvironmentOutlined style={{ color: '#ea580c', fontSize: 16 }} />
                    <Typography.Text strong style={{ fontSize: 16, color: '#0f172a', lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      Deliver to Central Hub, Sec 18 ▾
                    </Typography.Text>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ background: '#ecfdf5', color: '#047857', fontWeight: 700, padding: '2px 8px', borderRadius: 6, fontSize: 11 }}>
                      ⚡ 24 Mins
                    </span>
                    <span style={{ color: '#cbd5e1' }}>•</span>
                    <span style={{ fontWeight: 500 }}>100% Farm Traceable</span>
                  </div>
                </Link>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <Link
              to="/trace"
              style={{
                background: '#f0fdf4',
                color: '#15803d',
                border: '1px solid #bbf7d0',
                borderRadius: 12,
                padding: '9px 14px',
                fontSize: 13,
                fontWeight: 600,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
              }}
            >
              <QrcodeOutlined style={{ fontSize: 15 }} /> Trace
            </Link>
            <Badge dot offset={[-4, 4]} color="#ef4444">
              <button
                aria-label="Notifications"
                onClick={() => navigate(isRetailer ? '/profile' : '/profile')}
                style={{
                  border: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s',
                }}
              >
                <BellOutlined style={{ fontSize: 20, color: '#334155' }} />
              </button>
            </Badge>
          </div>
        </div>

        {/* Mobile Search input */}
        <div className="store-container" style={{ paddingTop: 0, paddingBottom: 20 }}>
          <Input
            size="large"
            placeholder="Search for atta, rice, dal, spices, namkeen..."
            prefix={<SearchOutlined style={{ color: '#94a3b8', fontSize: 18, marginRight: 6 }} />}
            suffix={<BarcodeOutlined style={{ color: '#059669', fontSize: 20 }} />}
            style={{
              borderRadius: 16,
              height: 52,
              fontSize: 14,
              border: '1px solid #e2e8f0',
              background: '#f8fafc',
              boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
            }}
            onPressEnter={(e) => {
              const val = (e.target as HTMLInputElement).value;
              if (val.trim()) navigate(`/products/atta-dal?q=${encodeURIComponent(val.trim())}`);
            }}
          />
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. MAIN CONTAINER (ADAPTS FOR BOTH MOBILE AND DESKTOP)                     */}
      {/* ========================================================================= */}
      <div className="store-container" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        
        {/* ======================================================================= */}
        {/* DESKTOP HERO SECTION: BANNER SLIDER (LEFT) + QUICK WIDGETS (RIGHT)      */}
        {/* ======================================================================= */}
        <div className="desktop-only">
          <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 24, alignItems: 'stretch' }}>
            {/* Left: Large Desktop Promo Carousel */}
            <div style={{ borderRadius: 20, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
              <Carousel autoplay effect="fade" dotPosition="bottom">
                <div>
                  <div
                    style={{
                      height: 320,
                      background: 'linear-gradient(135deg, #065f46 0%, #047857 50%, #059669 100%)',
                      color: '#fff',
                      padding: '36px 44px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      position: 'relative',
                    }}
                  >
                    <div style={{ maxWidth: '60%', zIndex: 2 }}>
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          background: 'rgba(255,255,255,0.2)',
                          backdropFilter: 'blur(4px)',
                          padding: '4px 12px',
                          borderRadius: 20,
                          fontSize: 12,
                          fontWeight: 700,
                          color: '#fef08a',
                          marginBottom: 12,
                        }}
                      >
                        <SafetyCertificateFilled /> 100% FARM-TRACEABLE STAPLES
                      </div>
                      <Typography.Title level={2} style={{ color: '#fff', margin: '0 0 10px', fontSize: 32, fontWeight: 800, lineHeight: 1.15 }}>
                        Direct From Verified Mandis to Your Store
                      </Typography.Title>
                      <Typography.Text style={{ color: '#d1fae5', fontSize: 15, display: 'block', marginBottom: 24, lineHeight: 1.4 }}>
                        Pure Sharbati Atta, cold-pressed oils, and ground spices with verifiable batch QR provenance.
                      </Typography.Text>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <Button
                          type="primary"
                          size="large"
                          style={{ background: '#f59e0b', borderColor: '#f59e0b', color: '#1c1917', fontWeight: 700, borderRadius: 10 }}
                          onClick={() => navigate('/products/atta-flour')}
                        >
                          Explore Catalog
                        </Button>
                        <Button
                          size="large"
                          style={{ background: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.3)', color: '#fff', fontWeight: 600, borderRadius: 10 }}
                          onClick={() => navigate('/trace')}
                        >
                          Trace A Batch
                        </Button>
                      </div>
                    </div>
                    <img
                      src="/images/welcome_3d.jpg"
                      alt="Welcome to Desi Tokri"
                      style={{
                        height: 220,
                        width: 220,
                        objectFit: 'cover',
                        borderRadius: 24,
                        border: '6px solid rgba(255,255,255,0.2)',
                        boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      height: 320,
                      background: 'linear-gradient(135deg, #9a3412 0%, #c2410c 50%, #ea580c 100%)',
                      color: '#fff',
                      padding: '36px 44px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ maxWidth: '60%', zIndex: 2 }}>
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          background: 'rgba(255,255,255,0.2)',
                          backdropFilter: 'blur(4px)',
                          padding: '4px 12px',
                          borderRadius: 20,
                          fontSize: 12,
                          fontWeight: 700,
                          color: '#ffedd5',
                          marginBottom: 12,
                        }}
                      >
                        <FireFilled /> MEGA WHOLESALE SAVINGS
                      </div>
                      <Typography.Title level={2} style={{ color: '#fff', margin: '0 0 10px', fontSize: 32, fontWeight: 800, lineHeight: 1.15 }}>
                        Festive Retailer Schemes Live Now
                      </Typography.Title>
                      <Typography.Text style={{ color: '#fed7aa', fontSize: 15, display: 'block', marginBottom: 24 }}>
                        Enjoy up to 20% margin discounts + Buy 10 Get 1 free on selected spices and pulses.
                      </Typography.Text>
                      <Button
                        type="primary"
                        size="large"
                        style={{ background: '#ffffff', borderColor: '#ffffff', color: '#c2410c', fontWeight: 800, borderRadius: 10 }}
                        onClick={() => navigate('/products/atta-flour')}
                      >
                        Claim Active Schemes
                      </Button>
                    </div>
                    <img
                      src="/images/cat_spices.jpg"
                      alt="Festival Schemes"
                      style={{
                        height: 220,
                        width: 220,
                        objectFit: 'cover',
                        borderRadius: 24,
                        border: '6px solid rgba(255,255,255,0.2)',
                        boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
                      }}
                    />
                  </div>
                </div>
              </Carousel>
            </div>

            {/* Right: Dual Interactive Quick Widgets */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Widget 1: Instant QR Batch Trace */}
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: 18,
                  padding: '20px 22px',
                  border: '1px solid #e7e5e4',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: '#ecfdf5',
                          color: '#059669',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 16,
                        }}
                      >
                        <QrcodeOutlined />
                      </div>
                      <Typography.Text strong style={{ fontSize: 15, color: '#065f46' }}>
                        Trace Batch Provenance
                      </Typography.Text>
                    </div>
                    <span style={{ fontSize: 11, color: '#059669', background: '#f0fdf4', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
                      Live QR
                    </span>
                  </div>
                  <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
                    Enter the printed batch code on any Desi Tokri pack to view farm origin, lab test &amp; milling dates.
                  </Typography.Text>
                </div>

                <form onSubmit={handleTraceSubmit}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Input
                      placeholder="e.g. BATCH-2026-0814"
                      value={traceInput}
                      onChange={(e) => setTraceInput(e.target.value)}
                      prefix={<BarcodeOutlined style={{ color: '#9ca3af' }} />}
                      style={{ borderRadius: 8 }}
                    />
                    <Button
                      type="primary"
                      htmlType="submit"
                      style={{ background: '#059669', borderColor: '#059669', borderRadius: 8, fontWeight: 600 }}
                    >
                      Verify
                    </Button>
                  </div>
                </form>
              </div>

              {/* Widget 2: Role-Aware Quick Card */}
              {isRetailer ? (
                <div
                  style={{
                    background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                    color: '#ffffff',
                    borderRadius: 18,
                    padding: '20px 22px',
                    boxShadow: '0 4px 14px rgba(15, 23, 42, 0.15)',
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div>
                        <span style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Retailer Account Position
                        </span>
                        <Typography.Text strong style={{ color: '#ffffff', display: 'block', fontSize: 15 }}>
                          {retailerProfile?.storeName || 'Sri Balaji Provision Store'}
                        </Typography.Text>
                      </div>
                      <CreditCardOutlined style={{ color: '#38bdf8', fontSize: 20 }} />
                    </div>

                    <div style={{ display: 'flex', gap: 24, marginTop: 6 }}>
                      <div>
                        <span style={{ fontSize: 11, color: '#cbd5e1', display: 'block' }}>Credit Limit</span>
                        <strong style={{ fontSize: 16, color: '#34d399' }}>{formatInr(retailerProfile?.creditLimit || 50000)}</strong>
                      </div>
                      <div>
                        <span style={{ fontSize: 11, color: '#cbd5e1', display: 'block' }}>Outstanding</span>
                        <strong style={{ fontSize: 16, color: '#f87171' }}>{formatInr(retailerProfile?.creditUsed || 14500)}</strong>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                    <Button
                      block
                      style={{ background: '#3b82f6', borderColor: '#3b82f6', color: '#fff', fontWeight: 600, borderRadius: 8 }}
                      onClick={() => navigate('/orders')}
                    >
                      Repeat Order
                    </Button>
                    <Button
                      style={{ background: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.2)', color: '#fff', borderRadius: 8 }}
                      onClick={() => navigate('/wallet')}
                    >
                      Ledger
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
                    color: '#ffffff',
                    borderRadius: 18,
                    padding: '20px 22px',
                    boxShadow: '0 4px 14px rgba(234, 88, 12, 0.2)',
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: '#ffedd5', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>
                        Kirana &amp; B2B Wholesale
                      </span>
                      <ShopOutlined style={{ color: '#ffedd5', fontSize: 22 }} />
                    </div>
                    <Typography.Title level={4} style={{ color: '#ffffff', margin: '2px 0 6px 0', fontSize: 17, fontWeight: 800 }}>
                      Buy Wholesale / Direct Mill Supply
                    </Typography.Title>
                    <Typography.Text style={{ color: '#fed7aa', fontSize: 12, display: 'block', lineHeight: 1.4 }}>
                      Get up to 20% margin, GST input tax invoices, and 15-day credit lines for your retail store.
                    </Typography.Text>
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <Button
                      block
                      type="primary"
                      style={{ background: '#ffffff', borderColor: '#ffffff', color: '#ea580c', fontWeight: 700, borderRadius: 8, height: 38 }}
                      onClick={() => navigate('/register')}
                    >
                      Register Business &rarr;
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Desktop Trust Pillars Banner */}
          <div
            style={{
              marginTop: 24,
              background: '#ffffff',
              borderRadius: 14,
              border: '1px solid #e7e5e4',
              padding: '16px 24px',
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 20,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <CheckCircleFilled style={{ color: '#059669', fontSize: 22 }} />
              <div>
                <strong style={{ fontSize: 13, color: '#1c1917', display: 'block' }}>100% Farm-Traceable</strong>
                <span style={{ fontSize: 11, color: '#78716c' }}>QR on every pack</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <TruckFilled style={{ color: '#2563eb', fontSize: 22 }} />
              <div>
                <strong style={{ fontSize: 13, color: '#1c1917', display: 'block' }}>Same-Day Delivery</strong>
                <span style={{ fontSize: 11, color: '#78716c' }}>Direct mill dispatch</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <ThunderboltFilled style={{ color: '#f59e0b', fontSize: 22 }} />
              <div>
                <strong style={{ fontSize: 13, color: '#1c1917', display: 'block' }}>Wholesale Margins</strong>
                <span style={{ fontSize: 11, color: '#78716c' }}>Special schemes &amp; slabs</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <SafetyCertificateFilled style={{ color: '#7c3aed', fontSize: 22 }} />
              <div>
                <strong style={{ fontSize: 13, color: '#1c1917', display: 'block' }}>Certified Standards</strong>
                <span style={{ fontSize: 11, color: '#78716c' }}>FSSAI &amp; Agmark tested</span>
              </div>
            </div>
          </div>
        </div>

        {/* ======================================================================= */}
        {/* MOBILE HERO CAROUSEL                                                    */}
        {/* ======================================================================= */}
        <div className="mobile-only" style={{ borderRadius: 16, overflow: 'hidden' }}>
          <Carousel autoplay dotPosition="bottom">
            <div>
              <div style={{ height: 160, background: 'linear-gradient(135deg, #166534 0%, #15803d 100%)', color: '#fff', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ flex: 1, paddingRight: 16 }}>
                  <Typography.Title level={3} style={{ color: '#fff', margin: 0, fontSize: 18 }}>Welcome to Desi Tokri</Typography.Title>
                  <Typography.Text style={{ color: '#dcfce7', fontSize: 12, marginTop: 4, display: 'block' }}>Farm fresh groceries at your fingertips.</Typography.Text>
                </div>
                <img src="/images/welcome_3d.jpg" alt="Welcome" style={{ height: 90, width: 90, objectFit: 'cover', borderRadius: '50%', border: '3px solid rgba(255,255,255,0.2)', flexShrink: 0 }} />
              </div>
            </div>
            <div>
              <div style={{ height: 160, background: 'linear-gradient(135deg, #c2410c 0%, #ea580c 100%)', color: '#fff', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ flex: 1, paddingRight: 16 }}>
                  <Typography.Title level={3} style={{ color: '#fff', margin: 0, fontSize: 18 }}>Mega Savings Festival</Typography.Title>
                  <Typography.Text style={{ color: '#ffedd5', fontSize: 12, marginTop: 4, display: 'block' }}>Up to 50% off on all staples today.</Typography.Text>
                </div>
                <img src="/images/cat_spices.jpg" alt="Festival" style={{ height: 90, width: 90, objectFit: 'cover', borderRadius: '50%', border: '3px solid rgba(255,255,255,0.2)', flexShrink: 0 }} />
              </div>
            </div>
            <div>
              <div style={{ height: 160, background: 'linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 100%)', color: '#fff', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ flex: 1, paddingRight: 16 }}>
                  <Typography.Title level={3} style={{ color: '#fff', margin: 0, fontSize: 18 }}>Free Delivery</Typography.Title>
                  <Typography.Text style={{ color: '#dbeafe', fontSize: 12, marginTop: 4, display: 'block' }}>On your first 3 orders with Desi Tokri.</Typography.Text>
                </div>
                <img src="/images/aloo_bhujia.jpg" alt="Delivery" style={{ height: 90, width: 90, objectFit: 'cover', borderRadius: '50%', border: '3px solid rgba(255,255,255,0.2)', flexShrink: 0 }} />
              </div>
            </div>
          </Carousel>
        </div>

        {/* ======================================================================= */}
        {/* 3. SHOP BY CATEGORY (MOBILE SLIDER + DESKTOP WIDE GRID)                 */}
        {/* ======================================================================= */}
        <section>
          <SectionHeader title="Shop by Category" to="/categories" subtitle="Fresh & unadulterated directly from mandis" />

          {/* Mobile horizontal slider */}
          <div className="mobile-only">
            <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 4 }} className="hide-scrollbar">
              {categories.map((category) => (
                <Link
                  key={category.id}
                  to={`/products/${category.id}`}
                  style={{
                    flex: '0 0 auto',
                    width: 84,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 8,
                    textDecoration: 'none',
                  }}
                >
                  <div
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: 18,
                      background: category.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    <img src={category.image} alt={category.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <Typography.Text style={{ fontSize: 12, fontWeight: 500, color: '#44403c', textAlign: 'center' }}>
                    {category.name}
                  </Typography.Text>
                </Link>
              ))}
            </div>
          </div>

          {/* Desktop wide category grid */}
          <div className="desktop-only">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 18 }}>
              {categories.map((category) => (
                <Link
                  key={category.id}
                  to={`/products/${category.id}`}
                  className="product-card-hover"
                  style={{
                    background: '#ffffff',
                    borderRadius: 16,
                    border: '1px solid #e7e5e4',
                    padding: '18px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textDecoration: 'none',
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      width: 90,
                      height: 90,
                      borderRadius: 18,
                      background: category.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 12,
                      overflow: 'hidden',
                      boxShadow: '0 4px 10px rgba(0,0,0,0.04)',
                    }}
                  >
                    <img src={category.image} alt={category.name} style={{ width: '80%', height: '80%', objectFit: 'contain' }} />
                  </div>
                  <Typography.Text strong style={{ fontSize: 14, color: '#1c1917', marginBottom: 4 }}>
                    {category.name}
                  </Typography.Text>
                  <span style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>
                    {category.subcategories?.length || 4} Varieties &rarr;
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ======================================================================= */}
        {/* 4. TODAY'S SCHEMES & WHOLESALE OFFERS                                   */}
        {/* ======================================================================= */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FireFilled style={{ color: '#f97316', fontSize: 20 }} />
              <Typography.Title level={4} style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                Today&apos;s Active Schemes &amp; Offers
              </Typography.Title>
            </div>
            <Link to="/products/atta-flour" style={{ fontSize: 13, color: '#059669', fontWeight: 600 }}>
              View All Schemes &rarr;
            </Link>
          </div>

          {/* Mobile horizontal scroller */}
          <div className="mobile-only">
            <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }} className="hide-scrollbar">
              {schemes.map((scheme) => (
                <div
                  key={scheme.id}
                  style={{
                    flex: '0 0 auto',
                    width: 270,
                    borderRadius: 14,
                    padding: 18,
                    background: scheme.background,
                    color: scheme.foreground,
                  }}
                >
                  <Typography.Text
                    style={{
                      color: scheme.badgeFg,
                      fontSize: 9,
                      fontWeight: 800,
                      letterSpacing: 0.5,
                      background: scheme.badgeBg,
                      padding: '2px 6px',
                      borderRadius: 4,
                      textTransform: 'uppercase',
                    }}
                  >
                    {scheme.tag}
                  </Typography.Text>
                  <Typography.Title level={4} style={{ color: scheme.foreground, margin: '10px 0 2px', fontWeight: 700, fontSize: 17 }}>
                    {scheme.title}
                  </Typography.Title>
                  <Typography.Text style={{ color: scheme.subtitleFg, fontSize: 13, fontWeight: 500 }}>
                    {scheme.subtitle}
                  </Typography.Text>
                  <div style={{ marginTop: 14 }}>
                    <Button
                      block
                      style={{
                        background: scheme.btnBg,
                        color: scheme.btnFg,
                        fontWeight: 700,
                        border: 'none',
                        borderRadius: 8,
                      }}
                      onClick={() => navigate('/products/atta-flour')}
                    >
                      {scheme.cta}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Desktop 3-column schemes grid */}
          <div className="desktop-only">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
              {schemes.map((scheme) => (
                <div
                  key={scheme.id}
                  className="product-card-hover"
                  style={{
                    borderRadius: 16,
                    padding: '24px 22px',
                    background: scheme.background,
                    color: scheme.foreground,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span
                        style={{
                          color: scheme.badgeFg,
                          fontSize: 10,
                          fontWeight: 800,
                          letterSpacing: 0.5,
                          background: scheme.badgeBg,
                          padding: '3px 8px',
                          borderRadius: 6,
                          textTransform: 'uppercase',
                        }}
                      >
                        {scheme.tag}
                      </span>
                      <span style={{ fontSize: 11, opacity: 0.8, color: scheme.foreground }}>⚡ Limited Time</span>
                    </div>
                    <Typography.Title level={4} style={{ color: scheme.foreground, margin: '14px 0 6px', fontWeight: 800, fontSize: 20 }}>
                      {scheme.title}
                    </Typography.Title>
                    <Typography.Text style={{ color: scheme.subtitleFg, fontSize: 14, fontWeight: 500, lineHeight: 1.4, display: 'block' }}>
                      {scheme.subtitle}
                    </Typography.Text>
                  </div>

                  <div style={{ marginTop: 20 }}>
                    <Button
                      block
                      size="large"
                      style={{
                        background: scheme.btnBg,
                        color: scheme.btnFg,
                        fontWeight: 700,
                        border: 'none',
                        borderRadius: 10,
                      }}
                      onClick={() => navigate('/products/atta-flour')}
                    >
                      {scheme.cta} &rarr;
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ======================================================================= */}
        {/* 5. BEST OF THE BASICS (DAILY STAPLES)                                    */}
        {/* ======================================================================= */}
        <section>
          <SectionHeader
            title="Best of the Basics"
            to="/products/atta-flour"
            subtitle="Farm-fresh flour, namkeen, spices &amp; kitchen essentials"
          />

          {/* Mobile horizontal scroll */}
          <div className="mobile-only">
            <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }} className="hide-scrollbar">
              {bestOfBasics.map((product) => (
                <div
                  key={product.id}
                  style={{
                    flex: '0 0 auto',
                    width: 140,
                    borderRadius: 14,
                    padding: 10,
                    background: '#ffffff',
                    border: '1px solid #e7e5e4',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <Link to={`/product-detail/${product.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ height: 85, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8, background: '#f8f7f5', borderRadius: 8 }}>
                      <img src={product.image} alt={product.name} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', mixBlendMode: 'multiply' }} />
                    </div>
                    <Typography.Text style={{ fontSize: 12, fontWeight: 700, color: '#292524', lineHeight: 1.2, height: 28, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {product.name}
                    </Typography.Text>
                    <Typography.Text style={{ fontSize: 11, color: '#78716c', marginTop: 2 }}>
                      {product.weight}
                    </Typography.Text>
                  </Link>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                    <Typography.Text style={{ fontSize: 14, fontWeight: 800, color: '#1c1917' }}>
                      {formatInr(product.price)}
                    </Typography.Text>
                    <button
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: '#f97316',
                        color: '#ffffff',
                        border: 'none',
                        display: 'grid',
                        placeItems: 'center',
                        cursor: 'pointer',
                      }}
                      onClick={() =>
                        cart.add({
                          productId: product.id,
                          productName: product.name,
                          unit: product.weight,
                          displayUnitPrice: product.price,
                          imageUrl: product.image,
                          mrp: product.mrp,
                        })
                      }
                    >
                      <PlusOutlined style={{ fontSize: 13, fontWeight: 'bold' }} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Desktop 6-column product grid */}
          <div className="desktop-only">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 16 }}>
              {bestOfBasics.map((product) => {
                const cartLine = cart.lines.find((line) => line.productId === product.id);
                return (
                  <div
                    key={product.id}
                    className="product-card-hover"
                    style={{
                      borderRadius: 14,
                      background: '#ffffff',
                      border: '1px solid #e7e5e4',
                      padding: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Link to={`/product-detail/${product.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column' }}>
                      <div
                        style={{
                          height: 120,
                          borderRadius: 10,
                          background: '#f8f7f5',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginBottom: 10,
                          padding: 8,
                        }}
                      >
                        <img src={product.image} alt={product.name} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', mixBlendMode: 'multiply' }} />
                      </div>
                      <Typography.Text strong style={{ fontSize: 13, lineHeight: 1.25, height: 32, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', color: '#1c1917' }}>
                        {product.name}
                      </Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 11, marginTop: 2 }}>
                        {product.weight}
                      </Typography.Text>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '8px 0 10px' }}>
                        <Typography.Text strong style={{ fontSize: 16, color: '#c2410c' }}>
                          {formatInr(product.price)}
                        </Typography.Text>
                        {product.mrp && (
                          <Typography.Text delete type="secondary" style={{ fontSize: 12 }}>
                            {formatInr(product.mrp)}
                          </Typography.Text>
                        )}
                      </div>
                    </Link>

                    <div>
                      {cartLine ? (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: '#fff7ed',
                            borderRadius: 8,
                            padding: '2px 4px',
                            border: '1px solid #fed7aa',
                          }}
                        >
                          <Button
                            size="small"
                            type="text"
                            icon={<MinusOutlined />}
                            onClick={() => cart.setQuantity(product.id, cartLine.quantity - 1)}
                          />
                          <InputNumber
                            size="small"
                            min={1}
                            value={cartLine.quantity}
                            controls={false}
                            onChange={(value) => cart.setQuantity(product.id, value ?? 1)}
                            style={{ width: 36, textAlign: 'center' }}
                          />
                          <Button
                            size="small"
                            type="text"
                            icon={<PlusOutlined />}
                            onClick={() => cart.setQuantity(product.id, cartLine.quantity + 1)}
                          />
                        </div>
                      ) : (
                        <Button
                          block
                          style={{ background: '#f97316', borderColor: '#f97316', color: '#fff', fontWeight: 600, borderRadius: 8 }}
                          onClick={() =>
                            cart.add({
                              productId: product.id,
                              productName: product.name,
                              unit: product.weight,
                              displayUnitPrice: product.price,
                              imageUrl: product.image,
                              mrp: product.mrp,
                            })
                          }
                        >
                          Add to Cart
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ======================================================================= */}
        {/* 6. PRICE RANGE QUICK BANNERS                                            */}
        {/* ======================================================================= */}
        {/* 6. STARTING FROM PRICE DEALS / CATEGORY SLABS                           */}
        {/* ======================================================================= */}
        <div>
          <div className="price-deals-scroll hide-scrollbar">
            {[
              { label: 'Starting from', price: 25, sub: 'Salt, Spices & masalas', bg: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)', emoji: '🧂' },
              { label: 'Starting from', price: 79, sub: 'Namkeens & snacks', bg: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)', emoji: '🍟' },
              { label: 'Starting from', price: 199, sub: 'Atta, Flour & grains', bg: 'linear-gradient(135deg, #059669 0%, #047857 100%)', emoji: '🌾' },
              { label: 'Starting from', price: 499, sub: 'Premium cold pressed oils', bg: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', emoji: '⭐' },
            ].map(({ label, price, sub, bg, emoji }) => (
              <div
                key={price}
                onClick={() => navigate(`/products/atta-dal?maxPrice=${price * 10}`)}
                className="price-deal-card category-pill-hover"
                style={{
                  background: bg,
                  borderRadius: 16,
                  padding: '16px 16px',
                  cursor: 'pointer',
                  position: 'relative',
                  overflow: 'hidden',
                  color: '#ffffff',
                }}
              >
                <div style={{ position: 'absolute', bottom: -10, right: -10, fontSize: 54, opacity: 0.2 }}>{emoji}</div>
                <Typography.Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.9)', display: 'block', marginBottom: 2 }}>{label}</Typography.Text>
                <Typography.Text strong style={{ fontSize: 24, color: '#fff', display: 'block', lineHeight: 1.1 }}>₹{price}</Typography.Text>
                <Typography.Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)', display: 'block', marginTop: 6, lineHeight: 1.25 }}>{sub}</Typography.Text>
              </div>
            ))}
          </div>
        </div>

        {/* ======================================================================= */}
        {/* 7. POPULAR PRODUCTS / BEST SELLERS                                      */}
        {/* ======================================================================= */}
        <section>
          <SectionHeader title="Popular Products" to="/products/atta-flour" subtitle="Highest demand products among local grocery retailers" />

          {/* Grid adapts: 2 columns on mobile, 4 columns on desktop */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 16,
            }}
          >
            {popularProducts.map((product) => {
              const cartLine = cart.lines.find((line) => line.productId === product.id);
              return (
                <div
                  key={product.id}
                  className="product-card-hover"
                  style={{
                    border: '1px solid #e7e5e4',
                    borderRadius: 16,
                    background: '#ffffff',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <Link to={`/product-detail/${product.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ position: 'relative' }}>
                      <ProductThumb image={product.image} square />
                      {product.badge && (
                        <Typography.Text
                          style={{
                            position: 'absolute',
                            top: 10,
                            left: 10,
                            background: '#dcfce7',
                            color: '#166534',
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: 6,
                          }}
                        >
                          {product.badge}
                        </Typography.Text>
                      )}
                    </div>
                    <div style={{ padding: '14px 14px 0' }}>
                      <Typography.Text strong style={{ display: 'block', fontSize: 14, color: '#1c1917', lineHeight: 1.3 }}>
                        {product.name}
                      </Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {product.variant}
                      </Typography.Text>
                      <div style={{ margin: '6px 0 10px', display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <Typography.Text strong style={{ fontSize: 16, color: '#c2410c' }}>
                          {formatInr(product.price)}
                        </Typography.Text>
                        {product.mrp && (
                          <Typography.Text delete type="secondary" style={{ fontSize: 12 }}>
                            {formatInr(product.mrp)}
                          </Typography.Text>
                        )}
                      </div>
                    </div>
                  </Link>

                  <div style={{ padding: '0 14px 14px' }}>
                    {cartLine ? (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: '#fff7ed',
                          borderRadius: 10,
                          padding: '3px 6px',
                          border: '1px solid #fed7aa',
                        }}
                      >
                        <Button
                          size="small"
                          type="text"
                          icon={<MinusOutlined />}
                          onClick={() => cart.setQuantity(product.id, cartLine.quantity - 1)}
                        />
                        <InputNumber
                          size="small"
                          min={1}
                          value={cartLine.quantity}
                          controls={false}
                          onChange={(value) => cart.setQuantity(product.id, value ?? 1)}
                          style={{ width: 44, textAlign: 'center' }}
                        />
                        <Button
                          size="small"
                          type="text"
                          icon={<PlusOutlined />}
                          onClick={() => cart.setQuantity(product.id, cartLine.quantity + 1)}
                        />
                      </div>
                    ) : (
                      <Button
                        block
                        style={{ background: '#f97316', borderColor: '#f97316', color: '#fff', fontWeight: 600, borderRadius: 10, height: 40 }}
                        onClick={() =>
                          cart.add({
                            productId: product.id,
                            productName: product.name,
                            unit: product.variant,
                            displayUnitPrice: product.price,
                            imageUrl: product.image,
                            mrp: product.mrp,
                          })
                        }
                      >
                        Add to Cart
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ======================================================================= */}
        {/* 8. BUY AGAIN / REPEAT ORDERS                                            */}
        {/* ======================================================================= */}
        <section>
          <SectionHeader title="Buy Again / Reorder" to="/orders" subtitle="Previously ordered staples ready for one-click replenishment" />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: 14,
            }}
          >
            {buyAgainProducts.map((product) => {
              const cartLine = cart.lines.find((line) => line.productId === product.id);
              return (
                <div
                  key={product.id}
                  className="product-card-hover"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: 14,
                    border: '1px solid #e7e5e4',
                    borderRadius: 16,
                    background: '#ffffff',
                  }}
                >
                  <Link to={`/product-detail/${product.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
                    <ProductThumb image={product.image} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Typography.Text strong style={{ display: 'block', fontSize: 13, color: '#1c1917' }} ellipsis>
                        {product.name}
                      </Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                        Last ordered: {product.lastOrdered}
                      </Typography.Text>
                      <div style={{ marginTop: 2 }}>
                        <Typography.Text strong style={{ fontSize: 15, color: '#c2410c' }}>
                          {formatInr(product.price)}
                        </Typography.Text>
                        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                          {' '}
                          / {product.unit}
                        </Typography.Text>
                      </div>
                    </div>
                  </Link>
                  <Button
                    type="primary"
                    style={{ background: '#f97316', borderColor: '#f97316', borderRadius: 8, fontWeight: 600 }}
                    onClick={() =>
                      cart.add(
                        {
                          productId: product.id,
                          productName: product.name,
                          unit: product.unit,
                          displayUnitPrice: product.price,
                          imageUrl: product.image,
                          mrp: product.mrp,
                        },
                        cartLine ? 0 : 1,
                      )
                    }
                    disabled={Boolean(cartLine)}
                  >
                    {cartLine ? 'Added' : 'Reorder'}
                  </Button>
                </div>
              );
            })}
          </div>
        </section>

        {/* ======================================================================= */}
        {/* 9. BOTTOM ACCOUNT / PARTNER SUMMARY                                     */}
        {/* ======================================================================= */}
        {isRetailer ? (
          <div
            style={{
              background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
              border: '1px solid #bbf7d0',
              borderRadius: 18,
              padding: '24px 28px',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Verified Retailer Account
                </span>
                <Typography.Title level={4} style={{ margin: '2px 0 0', color: '#065f46', fontSize: 18 }}>
                  {retailerProfile?.storeName || 'Sri Balaji Provision Store'}
                </Typography.Title>
                <Typography.Text style={{ fontSize: 12, color: '#15803d' }}>
                  GST: {retailerProfile?.gstin || '36AABCU9603R1ZM'} | Dedicated B2B Wholesale Supply
                </Typography.Text>
              </div>
              <Button
                type="primary"
                style={{ background: '#059669', borderColor: '#059669', fontWeight: 600, borderRadius: 8 }}
                onClick={() => navigate('/wallet')}
              >
                View Full Ledger &amp; Statements &rarr;
              </Button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, background: '#ffffff', padding: '16px 20px', borderRadius: 12, border: '1px solid #dcfce7' }}>
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                  Available Credit Limit
                </Typography.Text>
                <Typography.Text strong style={{ fontSize: 18, color: '#059669' }}>
                  {formatInr(retailerProfile?.creditLimit || 50000)}
                </Typography.Text>
              </div>
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                  Current Outstanding Balance
                </Typography.Text>
                <Typography.Text strong style={{ fontSize: 18, color: '#dc2626' }}>
                  {formatInr(retailerProfile?.creditUsed || 14500)}
                </Typography.Text>
              </div>
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                  Payment Terms
                </Typography.Text>
                <Typography.Text strong style={{ fontSize: 18, color: '#1e3a8a' }}>
                  Net 15 Days
                </Typography.Text>
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
              border: '1px solid #fed7aa',
              borderRadius: 18,
              padding: '24px 28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 16,
            }}
          >
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#ea580c', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Kirana &amp; B2B Wholesale Supply
              </span>
              <Typography.Title level={4} style={{ margin: '4px 0 2px', color: '#9a3412', fontSize: 18 }}>
                Own a Grocery Store or Supermarket?
              </Typography.Title>
              <Typography.Text style={{ fontSize: 13, color: '#c2410c' }}>
                Get direct mill supply, up to 20% wholesale margin, GST invoices, and ₹50,000 credit line.
              </Typography.Text>
            </div>
            <Button
              type="primary"
              style={{ background: '#ea580c', borderColor: '#ea580c', fontWeight: 600, borderRadius: 8, height: 40 }}
              onClick={() => navigate('/register')}
            >
              Become a Partner &rarr;
            </Button>
          </div>
        )}

      </div>
    </div>
  );
}

function SectionHeader({ title, to, subtitle }: { title: string; to?: string; subtitle?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        marginBottom: 16,
        gap: 12,
      }}
    >
      <div>
        <Typography.Title level={4} style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1c1917' }}>
          {title}
        </Typography.Title>
        {subtitle && (
          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 2 }}>
            {subtitle}
          </Typography.Text>
        )}
      </div>
      {to && (
        <Link to={to} style={{ fontSize: 13, color: '#059669', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          View All <RightOutlined style={{ fontSize: 10 }} />
        </Link>
      )}
    </div>
  );
}

function ProductThumb({ image, square }: { image: string; square?: boolean }) {
  return (
    <div
      style={{
        width: square ? '100%' : 64,
        height: square ? 150 : 64,
        borderRadius: square ? 0 : 12,
        background: '#f8f7f5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        overflow: 'hidden',
        padding: square ? 12 : 6,
      }}
    >
      <img src={image} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', mixBlendMode: 'multiply' }} />
    </div>
  );
}
