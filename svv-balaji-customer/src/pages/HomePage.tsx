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
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStorefrontBanners } from '@shared/hooks/useBanners';
import { useStorefrontSchemes } from '@shared/hooks/useSchemes';
import { useStorefrontHomeSections } from '@shared/hooks/useHomeSections';
import { api as storefrontApi } from '../api/client';
import { useCustomerAuth } from '../auth/CustomerAuthContext';
import { useCart } from '../cart/useCart';
import { toShelfProduct, useCatalogueProducts, type ShelfProduct } from '../hooks/useCatalogue';
import type { StorefrontHomeSection } from '@shared/api/types';
import { useCategoryTree } from '../hooks/useCategoryTree';
import { useRetailerCredit } from '../hooks/useRetailerCredit';
// Order history is still mock (no storefront order backend yet). Only its
// "what and how much was last ordered" survives - names, prices and images are
// re-read from the live catalogue below, so an admin edit reaches this shelf too.
import { buyAgainProducts as buyAgainHistory } from '../mock/homeMockData';
import { formatInr } from '../utils/money';
import { RatingBadge } from '../components/ProductReviews';
import { useUnreadNotifications } from '../notifications/useUnreadNotifications';
import { LocationPicker } from '../location/LocationPicker';
import { locationLine, useShopperLocation } from '../location/useShopperLocation';


interface HeroSlide {
  id: string;
  badgeText?: string | null;
  title: string;
  description: string;
  imageUrl: string;
  ctaTextPrimary: string;
  ctaLinkPrimary: string;
  ctaTextSecondary?: string | null;
  ctaLinkSecondary?: string | null;
  background: string;
}

/** Shown only while no HOMEPAGE banner has been published from Admin > Banner Management yet. */
const FALLBACK_HERO_SLIDES: HeroSlide[] = [
  {
    id: 'fallback-1',
    badgeText: '100% FARM-TRACEABLE STAPLES',
    title: 'Direct From Verified Mandis to Your Store',
    description: 'Pure Sharbati Atta, cold-pressed oils, and ground spices with verifiable batch QR provenance.',
    imageUrl: '/images/welcome_3d.jpg',
    ctaTextPrimary: 'Explore Catalog',
    ctaLinkPrimary: '/products/atta-flour',
    ctaTextSecondary: 'Trace A Batch',
    ctaLinkSecondary: '/trace',
    background: 'linear-gradient(135deg, #065f46 0%, #047857 50%, #059669 100%)',
  },
  {
    id: 'fallback-2',
    badgeText: 'MEGA WHOLESALE SAVINGS',
    title: 'Festive Retailer Schemes Live Now',
    description: 'Bulk case packs at wholesale tier prices for registered retailers. See Schemes & Offers for what is running today.',
    imageUrl: '/images/cat_spices.jpg',
    ctaTextPrimary: 'Claim Active Schemes',
    ctaLinkPrimary: '/products/atta-flour',
    background: 'linear-gradient(135deg, #9a3412 0%, #c2410c 50%, #ea580c 100%)',
  },
];

export function HomePage() {
  const cart = useCart();
  const navigate = useNavigate();
  const { role, customerProfile, retailerProfile, isLoggedIn } = useCustomerAuth();
  const unreadNotifications = useUnreadNotifications();
  const credit = useRetailerCredit();
  const isRetailer = role === 'RETAILER';
  const [traceInput, setTraceInput] = useState('');
  const shopperLocation = useShopperLocation();
  const [pickingLocation, setPickingLocation] = useState(false);
  // A retailer with no location yet is asked once per visit; the browser's own
  // permission prompt only appears if they tap "Use my current location".
  useEffect(() => {
    if (!isRetailer || shopperLocation) return;
    try {
      if (sessionStorage.getItem('svv.locationAsked')) return;
      sessionStorage.setItem('svv.locationAsked', '1');
    } catch {
      // storage blocked: still ask, just not remembered
    }
    setPickingLocation(true);
  }, [isRetailer, shopperLocation]);
  const categories = useCategoryTree();

  // Product shelves come from Admin > Homepage Sections (below); the whole
  // catalogue is still read here to re-price the Buy Again history.
  const wholeCatalogue = useCatalogueProducts({ limit: 100 }).products;
  const buyAgain = buyAgainHistory.flatMap((entry) => {
    const live = wholeCatalogue.find((p) => p.slug === entry.id || p.id === entry.id);
    return live ? [{ ...live, lastOrdered: entry.lastOrdered }] : [];
  });

  const { data: publishedBanners } = useStorefrontBanners(
    'HOMEPAGE',
    isRetailer ? 'B2B' : 'B2C',
    storefrontApi,
  );
  // Deliberately no mock fallback here: an empty result is Super Admin
  // choosing to hide the "Today's Schemes & Offers" section, not a loading
  // gap, so the section renders nothing rather than substituting placeholder
  // content. See shared/hooks/useSchemes.ts.
  const { data: schemes = [] } = useStorefrontSchemes(isRetailer ? 'B2B' : 'B2C', storefrontApi);
  const { data: managedSections = [] } = useStorefrontHomeSections(isRetailer ? 'B2B' : 'B2C', storefrontApi);
  const heroSlides: HeroSlide[] =
    publishedBanners && publishedBanners.length > 0
      ? publishedBanners.map((banner) => ({
          id: banner.id,
          badgeText: banner.badgeText,
          title: banner.title,
          description: banner.description,
          imageUrl: banner.imageUrl,
          ctaTextPrimary: banner.ctaTextPrimary,
          ctaLinkPrimary: banner.ctaLinkPrimary,
          ctaTextSecondary: banner.ctaTextSecondary,
          ctaLinkSecondary: banner.ctaLinkSecondary,
          background: banner.backgroundColor,
        }))
      : FALLBACK_HERO_SLIDES;

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
          className="store-container home-mobile-header"
        >
          {/* Logo & Greeting / Delivery Address */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <Link
              to="/"
              className="home-logo-box"
              style={{
                textDecoration: 'none',
              }}
            >
              <img
                src="/images/desi-tokri-cropped.png"
                alt="Desi Tokri"
                className="home-logo-img"
              />
            </Link>

            <div style={{ flex: 1, minWidth: 0 }}>
              {isRetailer ? (
                <>
                  <Typography.Title
                    level={4}
                    style={{
                      margin: 0,
                      color: '#065f46',
                      lineHeight: 1.2,
                      fontSize: 14,
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {retailerProfile?.storeName || 'My Store'}
                  </Typography.Title>
                  <button
                    type="button"
                    onClick={() => setPickingLocation(true)}
                    aria-label="Change location"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, padding: 0, border: 'none', background: 'none',
                      cursor: 'pointer', maxWidth: '100%', minWidth: 0,
                    }}
                  >
                    <EnvironmentOutlined style={{ color: '#ea580c', fontSize: 12, flexShrink: 0 }} />
                    <span
                      style={{
                        fontSize: 12, fontWeight: 600, color: shopperLocation ? '#334155' : '#ea580c',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}
                    >
                      {shopperLocation ? locationLine(shopperLocation) : 'Set your location'}
                    </span>
                    <span style={{ fontSize: 10, color: '#64748b', flexShrink: 0 }}>▾</span>
                  </button>
                </>
              ) : (
                <div role="button" tabIndex={0} onClick={() => setPickingLocation(true)} onKeyDown={(e) => e.key === 'Enter' && setPickingLocation(true)}
                  style={{ display: 'block', minWidth: 0, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                    <EnvironmentOutlined style={{ color: '#ea580c', fontSize: 13, flexShrink: 0 }} />
                    <Typography.Text
                      strong
                      style={{
                        fontSize: 13,
                        color: '#0f172a',
                        lineHeight: 1.25,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: 'block',
                      }}
                    >
                      {shopperLocation ? `Deliver to ${locationLine(shopperLocation)}` : 'Set delivery location'} ▾
                    </Typography.Text>
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: '#64748b',
                      marginTop: 2,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                    }}
                  >
                    <span
                      style={{
                        background: '#ecfdf5',
                        color: '#047857',
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: 4,
                        fontSize: 10,
                        flexShrink: 0,
                        lineHeight: 1.3,
                      }}
                    >
                      ⚡ 24 Mins
                    </span>
                    <span className="home-header-badge-extra" style={{ color: '#cbd5e1' }}>•</span>
                    <span
                      className="home-header-badge-extra"
                      style={{
                        fontWeight: 500,
                        fontSize: 10,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      100% Farm Traceable
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <Link
              to="/trace"
              className="home-trace-btn"
              title="Trace Batch QR"
            >
              <QrcodeOutlined style={{ fontSize: 15 }} />
              <span className="home-trace-text">Trace</span>
            </Link>
            <Badge count={unreadNotifications} size="small" offset={[-3, 3]} color="#ef4444">
              <button
                aria-label="Notifications"
                className="home-bell-btn"
                onClick={() => navigate(isLoggedIn ? '/notifications' : '/login')}
              >
                <BellOutlined style={{ fontSize: 17, color: '#334155' }} />
              </button>
            </Badge>
          </div>
        </div>

        <LocationPicker open={pickingLocation} onClose={() => setPickingLocation(false)} />

        {/* Mobile Search input */}
        <div className="store-container home-search-container" style={{ paddingTop: 0, paddingBottom: 14 }}>
          <Input
            size="middle"
            placeholder="Search atta, dal, rice, spices..."
            prefix={<SearchOutlined style={{ color: '#94a3b8', fontSize: 16, marginRight: 6 }} />}
            suffix={<BarcodeOutlined style={{ color: '#059669', fontSize: 18 }} />}
            className="home-search-input"
            style={{
              borderRadius: 12,
              height: 44,
              fontSize: 13,
              border: '1px solid #e2e8f0',
              background: '#f8fafc',
              boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
            }}
            readOnly
            onClick={() => navigate('/search')}
            onFocus={() => navigate('/search')}
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
                {heroSlides.map((slide) => (
                  <div key={slide.id}>
                    <div
                      style={{
                        height: 320,
                        background: slide.background,
                        color: '#fff',
                        padding: '36px 44px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        position: 'relative',
                      }}
                    >
                      <div style={{ maxWidth: '60%', zIndex: 2 }}>
                        {slide.badgeText && (
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
                            <SafetyCertificateFilled /> {slide.badgeText}
                          </div>
                        )}
                        <Typography.Title level={2} style={{ color: '#fff', margin: '0 0 10px', fontSize: 32, fontWeight: 800, lineHeight: 1.15 }}>
                          {slide.title}
                        </Typography.Title>
                        <Typography.Text style={{ color: '#d1fae5', fontSize: 15, display: 'block', marginBottom: 24, lineHeight: 1.4 }}>
                          {slide.description}
                        </Typography.Text>
                        <div style={{ display: 'flex', gap: 12 }}>
                          <Button
                            type="primary"
                            size="large"
                            style={{ background: '#f59e0b', borderColor: '#f59e0b', color: '#1c1917', fontWeight: 700, borderRadius: 10 }}
                            onClick={() => navigate(slide.ctaLinkPrimary)}
                          >
                            {slide.ctaTextPrimary}
                          </Button>
                          {slide.ctaTextSecondary && slide.ctaLinkSecondary && (
                            <Button
                              size="large"
                              style={{ background: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.3)', color: '#fff', fontWeight: 600, borderRadius: 10 }}
                              onClick={() => navigate(slide.ctaLinkSecondary as string)}
                            >
                              {slide.ctaTextSecondary}
                            </Button>
                          )}
                        </div>
                      </div>
                      <img
                        src={slide.imageUrl}
                        alt={slide.title}
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
                ))}
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
                      placeholder="e.g. FG-20260807-001"
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
                          {retailerProfile?.storeName || 'My Store'}
                        </Typography.Text>
                      </div>
                      <CreditCardOutlined style={{ color: '#38bdf8', fontSize: 20 }} />
                    </div>

                    <div style={{ display: 'flex', gap: 24, marginTop: 6 }}>
                      <div>
                        <span style={{ fontSize: 11, color: '#cbd5e1', display: 'block' }}>Credit Limit</span>
                        <strong style={{ fontSize: 16, color: '#34d399' }}>{credit.hasCredit ? formatInr(credit.limit) : 'Not set'}</strong>
                      </div>
                      <div>
                        <span style={{ fontSize: 11, color: '#cbd5e1', display: 'block' }}>Outstanding</span>
                        <strong style={{ fontSize: 16, color: '#f87171' }}>{formatInr(credit.used)}</strong>
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
                      Wholesale tier pricing on bulk packs, and credit terms for your store once your account is approved.
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
        <div className="mobile-only home-mobile-carousel" style={{ borderRadius: 14, overflow: 'hidden' }}>
          <Carousel autoplay dotPosition="bottom">
            {heroSlides.map((slide) => (
              <div key={slide.id}>
                <div
                  onClick={() => navigate(slide.ctaLinkPrimary)}
                  className="home-carousel-slide"
                  style={{ background: slide.background, color: '#fff' }}
                >
                  <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                    <Typography.Title
                      level={4}
                      className="home-carousel-title"
                      style={{ color: '#fff', margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.25 }}
                    >
                      {slide.title}
                    </Typography.Title>
                    <Typography.Text
                      className="home-carousel-desc"
                      style={{
                        color: 'rgba(255,255,255,0.85)',
                        fontSize: 11,
                        marginTop: 4,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        lineHeight: 1.3,
                      }}
                    >
                      {slide.description}
                    </Typography.Text>
                  </div>
                  <img
                    src={slide.imageUrl}
                    alt={slide.title}
                    className="home-carousel-img"
                  />
                </div>
              </div>
            ))}
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
        {/* Managed via Admin > Schemes & Offers. Hidden entirely (no fallback)     */}
        {/* when Super Admin has unpublished every scheme.                         */}
        {/* ======================================================================= */}
        {schemes.length > 0 && (
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
                      background: scheme.backgroundColor,
                      color: scheme.textColor,
                    }}
                  >
                    <Typography.Text
                      style={{
                        color: scheme.badgeTextColor,
                        fontSize: 9,
                        fontWeight: 800,
                        letterSpacing: 0.5,
                        background: scheme.badgeColor,
                        padding: '2px 6px',
                        borderRadius: 4,
                        textTransform: 'uppercase',
                      }}
                    >
                      {scheme.tag}
                    </Typography.Text>
                    <Typography.Title level={4} style={{ color: scheme.textColor, margin: '10px 0 2px', fontWeight: 700, fontSize: 17 }}>
                      {scheme.title}
                    </Typography.Title>
                    <Typography.Text style={{ color: scheme.textColor, fontSize: 13, fontWeight: 500 }}>
                      {scheme.subtitle}
                    </Typography.Text>
                    <div style={{ marginTop: 14 }}>
                      <Button
                        block
                        style={{
                          background: scheme.buttonColor,
                          color: scheme.buttonTextColor,
                          fontWeight: 700,
                          border: 'none',
                          borderRadius: 8,
                        }}
                        onClick={() => navigate(scheme.ctaLink)}
                      >
                        {scheme.ctaText}
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
                      background: scheme.backgroundColor,
                      color: scheme.textColor,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span
                          style={{
                            color: scheme.badgeTextColor,
                            fontSize: 10,
                            fontWeight: 800,
                            letterSpacing: 0.5,
                            background: scheme.badgeColor,
                            padding: '3px 8px',
                            borderRadius: 6,
                            textTransform: 'uppercase',
                          }}
                        >
                          {scheme.tag}
                        </span>
                        <span style={{ fontSize: 11, opacity: 0.8, color: scheme.textColor }}>⚡ Limited Time</span>
                      </div>
                      <Typography.Title level={4} style={{ color: scheme.textColor, margin: '14px 0 6px', fontWeight: 800, fontSize: 20 }}>
                        {scheme.title}
                      </Typography.Title>
                      <Typography.Text style={{ color: scheme.textColor, fontSize: 14, fontWeight: 500, lineHeight: 1.4, display: 'block' }}>
                        {scheme.subtitle}
                      </Typography.Text>
                    </div>

                    <div style={{ marginTop: 20 }}>
                      <Button
                        block
                        size="large"
                        style={{
                          background: scheme.buttonColor,
                          color: scheme.buttonTextColor,
                          fontWeight: 700,
                          border: 'none',
                          borderRadius: 10,
                        }}
                        onClick={() => navigate(scheme.ctaLink)}
                      >
                        {scheme.ctaText} &rarr;
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ======================================================================= */}
        {/* SUPER ADMIN MANAGED SECTIONS (Admin > Homepage Sections)                */}
        {/* "Best of the Basics", the price strip and "Popular Products" used to be */}
        {/* hard-coded here; they are seeded rows now, so admin can edit, reorder  */}
        {/* or hide them. The API drops empty sections, so there is no fallback.   */}
        {/* ======================================================================= */}
        {managedSections.map((sec) => (
          <ManagedSection key={sec.id} section={sec} isRetailer={isRetailer} />
        ))}

        {/* ======================================================================= */}
        {/* 8. BUY AGAIN / REPEAT ORDERS                                            */}
        {/* ======================================================================= */}
        {buyAgain.length > 0 && (
        <section>
          <SectionHeader title="Buy Again / Reorder" to="/orders" subtitle="Previously ordered staples ready for one-click replenishment" />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: 14,
            }}
          >
            {buyAgain.map((product) => {
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
                  <Link to={`/product-detail/${product.slug}`} style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
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
                          {product.price !== null ? formatInr(product.price) : 'N/A'}
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
                    onClick={() => {
                      const moq = isRetailer ? ((product as any).moqB2B ?? 1) : 1;
                      cart.add(
                        {
                          productId: product.id,
                          productName: product.name,
                          unit: product.unit,
                          displayUnitPrice: product.price,
                          imageUrl: product.image,
                          mrp: product.mrp,
                          moqB2B: (product as any).moqB2B ?? 1,
                          minOrderQuantity: (product as any).minOrderQuantity ?? 1,
                        },
                        cartLine ? 0 : moq,
                      );
                    }}
                    disabled={Boolean(cartLine)}
                  >
                    {cartLine ? 'Added' : 'Reorder'}
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
        )}

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
                  {retailerProfile?.storeName || 'My Store'}
                </Typography.Title>
                <Typography.Text style={{ fontSize: 12, color: '#15803d' }}>
                  GST: {retailerProfile?.gstin || '—'} | Dedicated B2B Wholesale Supply
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
                  Credit Limit
                </Typography.Text>
                <Typography.Text strong style={{ fontSize: 18, color: '#059669' }}>
                  {credit.hasCredit ? formatInr(credit.limit) : 'Not set'}
                </Typography.Text>
              </div>
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                  Current Outstanding Balance
                </Typography.Text>
                <Typography.Text strong style={{ fontSize: 18, color: '#dc2626' }}>
                  {formatInr(credit.used)}
                </Typography.Text>
              </div>
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                  Payment Terms
                </Typography.Text>
                <Typography.Text strong style={{ fontSize: 18, color: '#1e3a8a' }}>
                  {credit.termsLabel}
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
                Get direct mill supply at wholesale tier prices, with credit terms set for your store once it is approved.
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

/** One admin-managed homepage section, drawn by its kind and layout. */
function ManagedSection({ section, isRetailer }: { section: StorefrontHomeSection; isRetailer: boolean }) {
  const navigate = useNavigate();
  const subtitle = section.subtitle ?? undefined;

  if (section.kind === 'PRICE_DEALS') {
    return (
      <section>
        <SectionHeader title={section.title} subtitle={subtitle} />
        <div className="price-deals-scroll hide-scrollbar">
          {section.tiles.map((tile, i) => {
            const to = tile.categorySlug
              ? tile.parentCategorySlug
                ? `/products/${tile.parentCategorySlug}?sub=${tile.categorySlug}`
                : `/products/${tile.categorySlug}`
              : '/categories';
            return (
              <div
                key={i}
                role="link"
                tabIndex={0}
                onClick={() => navigate(to)}
                onKeyDown={(e) => e.key === 'Enter' && navigate(to)}
                className="price-deal-card category-pill-hover"
                style={{
                  background: PRICE_TILE_GRADIENTS[tile.color] ?? PRICE_TILE_GRADIENTS.orange,
                  borderRadius: 16,
                  padding: '16px 16px',
                  cursor: 'pointer',
                  position: 'relative',
                  overflow: 'hidden',
                  color: '#ffffff',
                }}
              >
                <div style={{ position: 'absolute', bottom: -10, right: -10, fontSize: 54, opacity: 0.2 }}>{tile.emoji}</div>
                <Typography.Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.9)', display: 'block', marginBottom: 2 }}>{tile.label}</Typography.Text>
                <Typography.Text strong style={{ fontSize: 24, color: '#fff', display: 'block', lineHeight: 1.1 }}>{formatInr(tile.price)}</Typography.Text>
                <Typography.Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)', display: 'block', marginTop: 6, lineHeight: 1.25 }}>{tile.subtitle}</Typography.Text>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  const products = section.products.map(toShelfProduct);
  return (
    <section>
      <SectionHeader title={section.title} subtitle={subtitle} />
      {section.layout === 'GRID' ? (
        <GridCards products={products} isRetailer={isRetailer} />
      ) : (
        <ShelfCards products={products} isRetailer={isRetailer} />
      )}
    </section>
  );
}

const PRICE_TILE_GRADIENTS: Record<string, string> = {
  purple: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
  orange: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
  green: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
  blue: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
  red: 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)',
  teal: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
};

/** Compact cards: horizontal scroll on mobile, 6 across on desktop. */
function ShelfCards({ products, isRetailer }: { products: ShelfProduct[]; isRetailer: boolean }) {
  const cart = useCart();
  return (
    <>
    {/* Mobile horizontal scroll */}
    <div className="mobile-only">
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }} className="hide-scrollbar">
        {products.map((product) => (
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
            <Link to={`/product-detail/${product.slug}`} style={{ textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column' }}>
              <div style={{ height: 85, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8, background: '#f8f7f5', borderRadius: 8 }}>
                <img src={product.image} alt={product.name} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', mixBlendMode: 'multiply' }} />
              </div>
              <Typography.Text style={{ fontSize: 12, fontWeight: 700, color: '#292524', lineHeight: 1.2, height: 28, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {product.name}
              </Typography.Text>
              {product.rating && product.reviewCount ? (
                <div style={{ marginTop: 3 }}>
                  <RatingBadge rating={product.rating} count={product.reviewCount} />
                </div>
              ) : null}
              <Typography.Text style={{ fontSize: 11, color: '#78716c', marginTop: 2 }}>
                {product.weight}
              </Typography.Text>
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
              <Typography.Text style={{ fontSize: 14, fontWeight: 800, color: '#1c1917' }}>
                {product.price !== null ? formatInr(product.price) : 'N/A'}
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
                  }, isRetailer ? ((product as any).moqB2B ?? 1) : 1)
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
        {products.map((product) => {
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
              <Link to={`/product-detail/${product.slug}`} style={{ textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column' }}>
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
                {product.rating && product.reviewCount ? (
                  <div style={{ marginTop: 3 }}>
                    <RatingBadge rating={product.rating} count={product.reviewCount} />
                  </div>
                ) : null}
                <Typography.Text type="secondary" style={{ fontSize: 11, marginTop: 2 }}>
                  {product.weight}
                </Typography.Text>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '8px 0 10px' }}>
                  <Typography.Text strong style={{ fontSize: 16, color: '#c2410c' }}>
                    {product.price !== null ? formatInr(product.price) : 'N/A'}
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
                      onClick={() => {
                        const moq = isRetailer ? ((product as any).moqB2B ?? 1) : 1;
                        if (cartLine.quantity <= moq) {
                          cart.remove(product.id);
                        } else {
                          cart.setQuantity(product.id, cartLine.quantity - 1);
                        }
                      }}
                    />
                    <InputNumber
                      size="small"
                      min={isRetailer ? ((product as any).moqB2B ?? 1) : 1}
                      value={cartLine.quantity}
                      controls={false}
                      onChange={(value) => {
                        const moq = isRetailer ? ((product as any).moqB2B ?? 1) : 1;
                        cart.setQuantity(product.id, Math.max(moq, value ?? moq));
                      }}
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
                    onClick={() => {
                      const moq = isRetailer ? ((product as any).moqB2B ?? 1) : 1;
                      cart.add({
                        productId: product.id,
                        productName: product.name,
                        unit: product.weight,
                        displayUnitPrice: product.price,
                        imageUrl: product.image,
                        mrp: product.mrp,
                        moqB2B: (product as any).moqB2B ?? 1,
                        minOrderQuantity: (product as any).minOrderQuantity ?? 1,
                      }, moq);
                    }}
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
    </>
  );
}

/** Large cards: 2 across on mobile, 4 across on desktop. */
function GridCards({ products, isRetailer }: { products: ShelfProduct[]; isRetailer: boolean }) {
  const cart = useCart();
  return (
    <div className="home-products-grid">
      {products.map((product) => {
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
            <Link to={`/product-detail/${product.slug}`} style={{ textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column' }}>
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
                {product.rating && product.reviewCount ? (
                  <div style={{ marginTop: 3 }}>
                    <RatingBadge rating={product.rating} count={product.reviewCount} />
                  </div>
                ) : null}
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {product.variant}
                </Typography.Text>
                <div style={{ margin: '6px 0 10px', display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <Typography.Text strong style={{ fontSize: 16, color: '#c2410c' }}>
                    {product.price !== null ? formatInr(product.price) : 'N/A'}
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
                    onClick={() => {
                      const moq = isRetailer ? ((product as any).moqB2B ?? 1) : 1;
                      if (cartLine.quantity <= moq) {
                        cart.remove(product.id);
                      } else {
                        cart.setQuantity(product.id, cartLine.quantity - 1);
                      }
                    }}
                  />
                  <InputNumber
                    size="small"
                    min={isRetailer ? ((product as any).moqB2B ?? 1) : 1}
                    value={cartLine.quantity}
                    controls={false}
                    onChange={(value) => {
                      const moq = isRetailer ? ((product as any).moqB2B ?? 1) : 1;
                      cart.setQuantity(product.id, Math.max(moq, value ?? moq));
                    }}
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
                  onClick={() => {
                    const moq = isRetailer ? ((product as any).moqB2B ?? 1) : 1;
                    cart.add({
                      productId: product.id,
                      productName: product.name,
                      unit: product.variant,
                      displayUnitPrice: product.price,
                      imageUrl: product.image,
                      mrp: product.mrp,
                      moqB2B: (product as any).moqB2B ?? 1,
                      minOrderQuantity: (product as any).minOrderQuantity ?? 1,
                    }, moq);
                  }}
                >
                  Add to Cart
                </Button>
              )}
            </div>
          </div>
        );
      })}
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
        marginBottom: 14,
        gap: 8,
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <Typography.Title
          level={4}
          className="home-section-title"
          style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#1c1917', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {title}
        </Typography.Title>
        {subtitle && (
          <Typography.Text
            type="secondary"
            className="home-section-subtitle"
            style={{ fontSize: 11.5, display: 'block', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {subtitle}
          </Typography.Text>
        )}
      </div>
      {to && (
        <Link to={to} style={{ fontSize: 12, color: '#059669', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
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
