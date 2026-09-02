import {
  BarcodeOutlined,
  BellOutlined,
  FireFilled,
  GiftFilled,
  MinusOutlined,
  PlusOutlined,
  ReloadOutlined,
  RightOutlined,
  SearchOutlined,
  ShoppingOutlined,
  TruckFilled,
} from '@ant-design/icons';
import { Badge, Button, Input, InputNumber, Typography, Carousel } from 'antd';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../cart/useCart';
import {
  buyAgainProducts,
  categories,
  popularProducts,
  retailerProfile,
  schemes,
  bestOfBasics,
} from '../mock/homeMockData';

/**
 * The retailer home screen.
 *
 * This is the B2B ordering surface (FRD 29 read through the "customer is a
 * retailer with a running account" lens, not an anonymous shopper): reorder
 * shortcuts, active schemes, and the outstanding/credit position a rep
 * currently reads off a ledger book. None of the sales/pricing endpoints
 * exist yet (WS2.5 is still a placeholder — see PROJECT_STATE.md), so this
 * whole screen renders from `mock/homeMockData.ts`. Swap that module for
 * real queries once the sales API lands; the layout below should not need to
 * change shape to do it.
 *
 * Renders its own header (greeting, notifications) rather than StoreShell's
 * generic brand header — `StoreShell` hides that header on `/` for exactly
 * this reason.
 */

const QUICK_ACTIONS: {
  key: string;
  label: string;
  icon: ReactNode;
  color: string;
  to: string;
}[] = [
  { key: 'new-order', label: 'New Order', icon: <ShoppingOutlined />, color: '#2563eb', to: '/products' },
  { key: 'reorder', label: 'Reorder', icon: <ReloadOutlined />, color: '#f97316', to: '/orders' },
  { key: 'schemes', label: 'Schemes', icon: <GiftFilled />, color: '#059669', to: '/products' },
  { key: 'my-orders', label: 'My Orders', icon: <TruckFilled />, color: '#64748b', to: '/orders' },
];

function formatInr(value: number): string {
  return `₹${value.toLocaleString('en-IN')}`;
}

export function HomePage() {
  const cart = useCart();

  return (
    <div>
      {/* Greeting header — replaces StoreShell's generic header on this route. */}
      <header
        className="store-safe-top"
        style={{ background: '#ffffff', borderBottom: '1px solid #f0eee9' }}
      >
        <div
          className="store-container"
          style={{
            paddingTop: 18,
            paddingBottom: 16,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div>
            <Typography.Title level={4} style={{ margin: 0, color: '#1e3a8a', lineHeight: 1.25 }}>
              Good Morning, {retailerProfile.storeName}
            </Typography.Title>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              Welcome back!
            </Typography.Text>
          </div>
          <Badge dot offset={[-4, 4]} color="#ef4444">
            <button
              aria-label="Notifications"
              style={{
                border: 'none',
                background: 'transparent',
                padding: 8,
                cursor: 'pointer',
                display: 'inline-flex',
              }}
            >
              <BellOutlined style={{ fontSize: 20, color: '#44403c' }} />
            </button>
          </Badge>
        </div>

        {/* Search */}
        <div className="store-container" style={{ paddingTop: 0, paddingBottom: 18 }}>
          <Input
            size="large"
            placeholder="Search products, brands or category"
            prefix={<SearchOutlined style={{ color: '#a8a29e' }} />}
            suffix={<BarcodeOutlined style={{ color: '#1e3a8a', fontSize: 18 }} />}
            style={{ borderRadius: 14 }}
          />
        </div>
      </header>

      <div className="store-container" style={{ paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 28 }}>
        {/* Carousel banners */}
        <div style={{ borderRadius: 16, overflow: 'hidden' }}>
          <Carousel autoplay dotPosition="bottom">
            <div>
              <div style={{ height: 160, background: 'linear-gradient(135deg, #166534 0%, #15803d 100%)', color: '#fff', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ flex: 1, paddingRight: 16 }}>
                  <Typography.Title level={3} style={{ color: '#fff', margin: 0, fontSize: 20 }}>Welcome to Desi Tokri</Typography.Title>
                  <Typography.Text style={{ color: '#dcfce7', fontSize: 13, marginTop: 4, display: 'block' }}>Farm fresh groceries at your fingertips.</Typography.Text>
                </div>
                <img src="/images/welcome_3d.jpg" alt="Welcome" style={{ height: 100, width: 100, objectFit: 'cover', borderRadius: '50%', border: '4px solid rgba(255,255,255,0.2)', flexShrink: 0 }} />
              </div>
            </div>
            <div>
              <div style={{ height: 160, background: 'linear-gradient(135deg, #c2410c 0%, #ea580c 100%)', color: '#fff', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ flex: 1, paddingRight: 16 }}>
                  <Typography.Title level={3} style={{ color: '#fff', margin: 0, fontSize: 20 }}>Mega Savings Festival</Typography.Title>
                  <Typography.Text style={{ color: '#ffedd5', fontSize: 13, marginTop: 4, display: 'block' }}>Up to 50% off on all staples today.</Typography.Text>
                </div>
                <img src="/images/cat_spices.jpg" alt="Festival" style={{ height: 100, width: 100, objectFit: 'cover', borderRadius: '50%', border: '4px solid rgba(255,255,255,0.2)', flexShrink: 0 }} />
              </div>
            </div>
            <div>
              <div style={{ height: 160, background: 'linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 100%)', color: '#fff', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ flex: 1, paddingRight: 16 }}>
                  <Typography.Title level={3} style={{ color: '#fff', margin: 0, fontSize: 20 }}>Free Delivery</Typography.Title>
                  <Typography.Text style={{ color: '#dbeafe', fontSize: 13, marginTop: 4, display: 'block' }}>On your first 3 orders with Desi Tokri.</Typography.Text>
                </div>
                <img src="/images/aloo_bhujia.jpg" alt="Delivery" style={{ height: 100, width: 100, objectFit: 'cover', borderRadius: '50%', border: '4px solid rgba(255,255,255,0.2)', flexShrink: 0 }} />
              </div>
            </div>
          </Carousel>
        </div>

        {/* Shop by category */}
        <section>
          <SectionHeader title="Shop by Category" to="/products" />
          <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 4 }}>
            {categories.map((category) => (
              <Link
                key={category.id}
                to="/products"
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
        </section>

        {/* Today's schemes */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <FireFilled style={{ color: '#f97316', fontSize: 18 }} />
            <Typography.Title level={5} style={{ margin: 0 }}>
              Today&apos;s Schemes
            </Typography.Title>
          </div>
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
            {schemes.map((scheme) => (
              <div
                key={scheme.id}
                style={{
                  flex: '0 0 auto',
                  width: 260,
                  borderRadius: 0,
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
                    borderRadius: 2,
                    textTransform: 'uppercase',
                  }}
                >
                  {scheme.tag}
                </Typography.Text>
                <Typography.Title level={4} style={{ color: scheme.foreground, margin: '10px 0 2px', fontWeight: 700 }}>
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
                      borderRadius: 2,
                    }}
                  >
                    {scheme.cta}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Best of the basics */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Typography.Title level={5} style={{ margin: 0, fontWeight: 900, textTransform: 'uppercase', fontSize: 16 }}>
              Best of the Basics
            </Typography.Title>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <RightOutlined style={{ fontSize: 12, color: '#1c1917' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
            {bestOfBasics.map((product) => (
              <div
                key={product.id}
                style={{
                  flex: '0 0 auto',
                  width: 130,
                  borderRadius: 12,
                  padding: 10,
                  background: '#f8f7f5',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                  <img src={product.image} alt={product.name} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', mixBlendMode: 'multiply' }} />
                </div>
                <Typography.Text style={{ fontSize: 11, fontWeight: 700, color: '#292524', lineHeight: 1.2, height: 28, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {product.name}
                </Typography.Text>
                <Typography.Text style={{ fontSize: 10, color: '#78716c', marginTop: 2 }}>
                  {product.weight}
                </Typography.Text>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                  <Typography.Text style={{ fontSize: 13, fontWeight: 900, color: '#1c1917' }}>
                    {formatInr(product.price)}
                  </Typography.Text>
                  <button
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      background: '#ffb900',
                      color: '#1c1917',
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
                      })
                    }
                  >
                    <PlusOutlined style={{ fontSize: 14, fontWeight: 'bold' }} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Buy again */}
        <section>
          <SectionHeader title="Buy Again" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {buyAgainProducts.map((product) => {
              const cartLine = cart.lines.find((line) => line.productId === product.id);
              return (
                <div
                  key={product.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: 14,
                    border: '1px solid #e7e5e4',
                    borderRadius: 16,
                    background: '#ffffff',
                  }}
                >
                  <ProductThumb image={product.image} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Typography.Text strong style={{ display: 'block' }}>
                      {product.name}
                    </Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      Last ordered: {product.lastOrdered}
                    </Typography.Text>
                    <div>
                      <Typography.Text strong style={{ fontSize: 15 }}>
                        {formatInr(product.price)}
                      </Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {' '}
                        / {product.unit}
                      </Typography.Text>
                    </div>
                  </div>
                  <Button
                    type="primary"
                    style={{ background: '#1d4ed8', borderColor: '#1d4ed8' }}
                    onClick={() =>
                      cart.add(
                        {
                          productId: product.id,
                          productName: product.name,
                          unit: product.unit,
                          displayUnitPrice: product.price,
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

        {/* Popular products */}
        <section>
          <SectionHeader title="Popular Products" to="/products" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {popularProducts.map((product) => {
              const cartLine = cart.lines.find((line) => line.productId === product.id);
              return (
                <div
                  key={product.id}
                  style={{
                    border: '1px solid #e7e5e4',
                    borderRadius: 16,
                    background: '#ffffff',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ position: 'relative' }}>
                    <ProductThumb image={product.image} square />
                    {product.badge && (
                      <Typography.Text
                        style={{
                          position: 'absolute',
                          top: 8,
                          left: 8,
                          background: '#dcfce7',
                          color: '#166534',
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 6,
                        }}
                      >
                        {product.badge}
                      </Typography.Text>
                    )}
                  </div>
                  <div style={{ padding: 12 }}>
                    <Typography.Text strong style={{ display: 'block', fontSize: 14 }}>
                      {product.name}
                    </Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {product.variant}
                    </Typography.Text>
                    <div style={{ margin: '4px 0 10px' }}>
                      <Typography.Text strong style={{ fontSize: 15 }}>
                        {formatInr(product.price)}
                      </Typography.Text>
                      {product.mrp && (
                        <Typography.Text
                          delete
                          type="secondary"
                          style={{ fontSize: 12, marginLeft: 6 }}
                        >
                          {formatInr(product.mrp)}
                        </Typography.Text>
                      )}
                    </div>

                    {cartLine ? (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: '#eef2ff',
                          borderRadius: 10,
                          padding: '2px 4px',
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
                          style={{ width: 40, textAlign: 'center' }}
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
                        style={{ background: '#f97316', borderColor: '#f97316', color: '#fff', fontWeight: 600 }}
                        onClick={() =>
                          cart.add({
                            productId: product.id,
                            productName: product.name,
                            unit: product.variant,
                            displayUnitPrice: product.price,
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

        {/* Retailer account summary */}
        <div
          style={{
            background: '#eef1f6',
            borderRadius: 16,
            padding: 16,
          }}
        >
          <Typography.Text strong style={{ display: 'block', fontSize: 15 }}>
            {retailerProfile.storeName}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Retailer ID: {retailerProfile.retailerId} | Rep: {retailerProfile.repName}
          </Typography.Text>

          <div style={{ display: 'flex', gap: 32, marginTop: 14 }}>
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                Outstanding
              </Typography.Text>
              <Typography.Text strong style={{ fontSize: 16, color: '#dc2626' }}>
                {formatInr(retailerProfile.outstanding)}
              </Typography.Text>
            </div>
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                Credit Limit
              </Typography.Text>
              <Typography.Text strong style={{ fontSize: 16 }}>
                {formatInr(retailerProfile.creditLimit)}
              </Typography.Text>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ title, to }: { title: string; to?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
      }}
    >
      <Typography.Title level={5} style={{ margin: 0 }}>
        {title}
      </Typography.Title>
      {to && (
        <Link to={to} style={{ fontSize: 13, color: '#1d4ed8', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
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
        width: square ? '100%' : 56,
        height: square ? 110 : 56,
        borderRadius: square ? 0 : 14,
        background: '#f5f4f2',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      <img src={image} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', mixBlendMode: 'multiply' }} />
    </div>
  );
}
