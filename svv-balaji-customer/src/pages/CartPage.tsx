import {
  ArrowLeftOutlined,
  CheckCircleFilled,
  ClockCircleFilled,
  DeleteOutlined,
  GiftOutlined,
  HeartOutlined,
  MinusOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
  ShoppingOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import { Button, Divider, Empty, Input, Modal, Space, Tag, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../cart/useCart';
import { useLoyalty } from '../loyalty/useLoyalty';
import { couponsApi } from '@shared/api/coupons';
import type { Coupon } from '@shared/api/types';

function formatInr(value: number): string {
  return `₹${value.toLocaleString('en-IN')}`;
}

export function CartPage() {
  const navigate = useNavigate();
  const cart = useCart();
  const loyalty = useLoyalty();

  // Coupons state
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponInput, setCouponInput] = useState('');
  const [couponModalOpen, setCouponModalOpen] = useState(false);

  useEffect(() => {
    const list = couponsApi.list(false);
    setCoupons(list);
    // Try to auto-apply first valid coupon if subtotal qualifies
    const savedCode = sessionStorage.getItem('applied_coupon_code');
    if (savedCode) {
      const c = couponsApi.getByCode(savedCode);
      if (c && c.isActive) setAppliedCoupon(c);
    } else if (list.length > 0) {
      setAppliedCoupon(list[0]);
    }
  }, []);

  if (cart.lines.length === 0) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <header
          className="mobile-only"
          style={{
            background: '#fff',
            padding: '14px 16px',
            borderBottom: '1px solid #e7e5e4',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: 16 }}>
            <ArrowLeftOutlined style={{ fontSize: 18 }} />
          </button>
          <Typography.Text strong style={{ fontSize: 16 }}>My Cart</Typography.Text>
        </header>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Empty
            image={<ShoppingOutlined style={{ fontSize: 64, color: '#059669' }} />}
            description={<Typography.Text type="secondary" style={{ fontSize: 16 }}>Your wholesale cart is currently empty</Typography.Text>}
          >
            <Button type="primary" size="large" style={{ background: '#059669', borderColor: '#059669', borderRadius: 8, marginTop: 12 }} onClick={() => navigate('/')}>
              Explore Wholesale Catalog
            </Button>
          </Empty>
        </div>
      </div>
    );
  }

  // Calculations
  const totalMrp = cart.lines.reduce((acc, line) => acc + ((line.mrp || line.displayUnitPrice || 0) * line.quantity), 0);
  const subtotal = cart.indicativeTotal || 0;
  const productDiscount = totalMrp - subtotal;
  const gst = Math.floor(subtotal * 0.05); // 5% GST

  const couponDiscount = appliedCoupon ? couponsApi.calculateDiscount(appliedCoupon, subtotal) : 0;

  const deliveryCharge = cart.deliveryInfo ? cart.deliveryInfo.charge : (subtotal > 500 ? 0 : 50);
  const grandTotal = Math.max(0, subtotal + gst + deliveryCharge - couponDiscount);
  const totalSavings = productDiscount + couponDiscount + (deliveryCharge === 0 && subtotal <= 500 ? 50 : 0);

  const handleApplyCode = (codeToApply?: string) => {
    const code = (codeToApply || couponInput).trim().toUpperCase();
    if (!code) {
      message.error('Please enter a coupon code');
      return;
    }
    const found = couponsApi.getByCode(code);
    if (!found || !found.isActive) {
      message.error(`Coupon code "${code}" is invalid or expired.`);
      return;
    }
    if (subtotal < found.minOrderValue) {
      message.warning(`Add items worth ${formatInr(found.minOrderValue - subtotal)} more to apply "${found.code}"`);
      return;
    }
    setAppliedCoupon(found);
    sessionStorage.setItem('applied_coupon_code', found.code);
    const saving = couponsApi.calculateDiscount(found, subtotal);
    message.success(`🎉 Coupon "${found.code}" applied! You saved ${formatInr(saving)}.`);
    setCouponInput('');
    setCouponModalOpen(false);
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    sessionStorage.removeItem('applied_coupon_code');
    message.info('Coupon removed');
  };

  const estimatedPoints = loyalty.estimateOrderPoints(
    cart.lines.map((l) => ({ productName: l.productName, price: l.displayUnitPrice ?? 0, quantity: l.quantity })),
  );

  const today = new Date();
  const tmrw = new Date(today);
  tmrw.setDate(tmrw.getDate() + 1);
  const dayStr = tmrw.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const [selectedAddress, setSelectedAddress] = useState<any>(null);

  useEffect(() => {
    const storedAddrsStr = localStorage.getItem('mockAddresses');
    const storedSelectedId = localStorage.getItem('selectedAddressId') || 'addr-1';
    if (storedAddrsStr) {
      const addrs = JSON.parse(storedAddrsStr);
      const selected = addrs.find((a: any) => a.id === storedSelectedId) || addrs[0];
      setSelectedAddress(selected);
    } else {
      setSelectedAddress({
        type: 'Store Hub',
        addressLine1: 'Plot 12, Main Mandi Road',
        addressLine2: 'Sector 18',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
      });
    }
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#fafaf9', paddingBottom: 100 }}>
      {/* Mobile-only subheader */}
      <header
        className="mobile-only"
        style={{
          background: '#fff',
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid #e7e5e4',
          position: 'sticky',
          top: 0,
          zIndex: 90,
        }}
      >
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: 16 }}>
          <ArrowLeftOutlined style={{ fontSize: 18 }} />
        </button>
        <Typography.Text strong style={{ fontSize: 16 }}>My Cart ({cart.count} items)</Typography.Text>
      </header>

      {/* Main Responsive Container */}
      <div className="store-container">
        {/* Breadcrumb / Title on Desktop */}
        <div className="desktop-only" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#78716c', marginBottom: 6 }}>
            <Link to="/" style={{ color: '#78716c', textDecoration: 'none' }}>Home</Link>
            <span>/</span>
            <span style={{ color: '#1c1917', fontWeight: 600 }}>Shopping Cart</span>
          </div>
          <Typography.Title level={3} style={{ margin: 0, color: '#1c1917' }}>
            Shopping Cart ({cart.count} items)
          </Typography.Title>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24, alignItems: 'flex-start' }}>
          
          {/* Left Column: Delivery Address & Cart Lines */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Delivery Address Card */}
            {selectedAddress && (
              <div
                style={{
                  background: '#fff',
                  borderRadius: 14,
                  padding: '16px 20px',
                  border: '1px solid #e7e5e4',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Typography.Text strong style={{ fontSize: 14 }}>Delivering to:</Typography.Text>
                    <Tag color="green" style={{ margin: 0, borderRadius: 6, fontWeight: 600 }}>{selectedAddress.type}</Tag>
                  </div>
                  <Typography.Text type="secondary" style={{ fontSize: 13, display: 'block', lineHeight: 1.4 }}>
                    {selectedAddress.addressLine1}, {selectedAddress.addressLine2}, {selectedAddress.city}, {selectedAddress.state} - {selectedAddress.pincode}
                  </Typography.Text>
                </div>
                <Button size="small" style={{ color: '#059669', borderColor: '#059669', borderRadius: 6 }} onClick={() => navigate('/addresses')}>
                  Change
                </Button>
              </div>
            )}

            {/* Cart Item Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {cart.lines.map((line) => {
                const lineMrp = line.mrp || line.displayUnitPrice || 0;
                const lineSellingPrice = line.displayUnitPrice || 0;
                const discountPercent = lineMrp > 0 ? Math.round(((lineMrp - lineSellingPrice) / lineMrp) * 100) : 0;

                return (
                  <div
                    key={line.productId}
                    style={{
                      background: '#fff',
                      borderRadius: 14,
                      padding: '18px 20px',
                      border: '1px solid #e7e5e4',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <div style={{ display: 'flex', gap: 18 }}>
                      {/* Product Thumbnail */}
                      <div
                        style={{
                          width: 84,
                          height: 84,
                          background: '#f8f7f5',
                          borderRadius: 12,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          overflow: 'hidden',
                          padding: 6,
                        }}
                      >
                        {line.imageUrl ? (
                          <img src={line.imageUrl} alt={line.productName} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', mixBlendMode: 'multiply' }} />
                        ) : (
                          <Typography.Text type="secondary" style={{ fontSize: 11 }}>No Image</Typography.Text>
                        )}
                      </div>

                      {/* Product Details */}
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div>
                          <Typography.Text strong style={{ fontSize: 15, color: '#1c1917', display: 'block', lineHeight: 1.3 }}>
                            {line.productName}
                          </Typography.Text>
                          <Typography.Text type="secondary" style={{ fontSize: 12, marginTop: 2, display: 'block' }}>
                            {line.unit} {line.packSize ? `(${line.packSize})` : ''}
                          </Typography.Text>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, flexWrap: 'wrap', gap: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                            <Typography.Text strong style={{ fontSize: 17, color: '#065f46' }}>
                              {formatInr(lineSellingPrice)}
                            </Typography.Text>
                            {discountPercent > 0 && (
                              <>
                                <Typography.Text delete type="secondary" style={{ fontSize: 13 }}>
                                  {formatInr(lineMrp)}
                                </Typography.Text>
                                <Typography.Text strong style={{ fontSize: 12, color: '#16a34a' }}>
                                  {discountPercent}% OFF
                                </Typography.Text>
                              </>
                            )}
                          </div>

                          {/* Quantity selector */}
                          <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff' }}>
                            <Button
                              type="text"
                              icon={<MinusOutlined style={{ fontSize: 11 }} />}
                              onClick={() => cart.setQuantity(line.productId, line.quantity - 1)}
                              style={{ width: 32, minWidth: 32, height: 32, padding: 0 }}
                            />
                            <Typography.Text strong style={{ width: 32, textAlign: 'center', fontSize: 14, background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 32 }}>
                              {line.quantity}
                            </Typography.Text>
                            <Button
                              type="text"
                              icon={<PlusOutlined style={{ fontSize: 11 }} />}
                              onClick={() => cart.setQuantity(line.productId, line.quantity + 1)}
                              style={{ width: 32, minWidth: 32, height: 32, padding: 0 }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <Divider style={{ margin: '14px 0 10px' }} />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Button
                        type="text"
                        icon={<DeleteOutlined />}
                        onClick={() => cart.remove(line.productId)}
                        style={{ color: '#ef4444', padding: 0, height: 'auto', fontSize: 13 }}
                      >
                        Remove
                      </Button>
                      <Button
                        type="text"
                        icon={<HeartOutlined />}
                        onClick={() => {
                          cart.remove(line.productId);
                          message.success('Moved item to wishlist');
                        }}
                        style={{ color: '#4b5563', padding: 0, height: 'auto', fontSize: 13 }}
                      >
                        Save for later
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Sticky Price Breakdown & Checkout */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Coupons & Promo Codes Card */}
            <div
              style={{
                background: '#fff',
                borderRadius: 16,
                padding: '18px 20px',
                border: '1px solid #e7e5e4',
                boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Typography.Text strong style={{ fontSize: 14, color: '#1c1917', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <TagsOutlined style={{ color: '#f97316' }} /> Apply Coupon &amp; Offers
                </Typography.Text>
                {coupons.length > 0 && (
                  <Button
                    type="link"
                    size="small"
                    style={{ padding: 0, color: '#f97316', fontWeight: 600 }}
                    onClick={() => setCouponModalOpen(true)}
                  >
                    View All ({coupons.length})
                  </Button>
                )}
              </div>

              {appliedCoupon ? (
                <div
                  style={{
                    background: '#f0fdf4',
                    border: '1px dashed #22c55e',
                    borderRadius: 10,
                    padding: '12px 14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Tag color="green" style={{ fontWeight: 700, letterSpacing: 0.5, margin: 0 }}>
                        {appliedCoupon.code}
                      </Tag>
                      <Typography.Text strong style={{ color: '#15803d', fontSize: 13 }}>
                        APPLIED
                      </Typography.Text>
                    </div>
                    <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 3 }}>
                      {couponDiscount > 0 ? `Saving ${formatInr(couponDiscount)} on this cart` : `Minimum cart required: ${formatInr(appliedCoupon.minOrderValue)}`}
                    </Typography.Text>
                  </div>
                  <Button
                    type="text"
                    danger
                    size="small"
                    onClick={handleRemoveCoupon}
                    style={{ fontWeight: 600 }}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <div>
                  <Space.Compact style={{ width: '100%' }}>
                    <Input
                      placeholder="Enter Coupon Code"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                      onPressEnter={() => handleApplyCode()}
                      style={{ textTransform: 'uppercase', fontWeight: 600 }}
                    />
                    <Button
                      type="primary"
                      onClick={() => handleApplyCode()}
                      style={{ background: '#f97316', borderColor: '#f97316', fontWeight: 600 }}
                    >
                      Apply
                    </Button>
                  </Space.Compact>

                  {/* Available Quick Coupon Chips */}
                  {coupons.slice(0, 2).map((c) => (
                    <div
                      key={c.id}
                      onClick={() => handleApplyCode(c.code)}
                      style={{
                        marginTop: 10,
                        padding: '6px 10px',
                        background: '#fffbeb',
                        border: '1px solid #fef3c7',
                        borderRadius: 8,
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Tag color="orange" style={{ fontWeight: 700, margin: 0, fontSize: 11 }}>
                          {c.code}
                        </Tag>
                        <span style={{ fontSize: 12, color: '#92400e' }}>{c.description}</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#d97706' }}>TAP TO APPLY</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div
              style={{
                background: '#fff',
                borderRadius: 16,
                padding: '22px 24px',
                border: '1px solid #e7e5e4',
                boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
              }}
            >
              <Typography.Title level={5} style={{ margin: '0 0 18px', fontSize: 16, color: '#1c1917' }}>
                Order Summary
              </Typography.Title>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#4b5563' }}>Total MRP ({cart.count} items)</span>
                  <span style={{ color: '#1c1917' }}>{formatInr(totalMrp)}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#4b5563' }}>Wholesale Discount</span>
                  <span style={{ color: '#059669', fontWeight: 600 }}>-{formatInr(productDiscount)}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#4b5563' }}>Coupon Savings {appliedCoupon ? `(${appliedCoupon.code})` : ''}</span>
                  <span style={{ color: '#059669', fontWeight: 600 }}>-{formatInr(couponDiscount)}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#4b5563' }}>GST / Taxes (5%)</span>
                  <span style={{ color: '#1c1917' }}>{formatInr(gst)}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#4b5563' }}>Delivery Charge</span>
                  <span style={{ color: deliveryCharge === 0 ? '#059669' : '#1c1917', fontWeight: deliveryCharge === 0 ? 600 : 400 }}>
                    {deliveryCharge === 0 ? 'FREE' : formatInr(deliveryCharge)}
                  </span>
                </div>

                <Divider style={{ margin: '10px 0' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 16, color: '#1c1917' }}>Grand Total</strong>
                  <strong style={{ fontSize: 20, color: '#065f46' }}>{formatInr(grandTotal)}</strong>
                </div>

                {totalSavings > 0 && (
                  <div style={{ marginTop: 8, padding: '10px 14px', background: '#ecfdf5', borderRadius: 8, border: '1px solid #a7f3d0' }}>
                    <Typography.Text strong style={{ color: '#065f46', fontSize: 13 }}>
                      You saved {formatInr(totalSavings)} on this order 🎉
                    </Typography.Text>
                  </div>
                )}

                {estimatedPoints > 0 && (
                  <div style={{ marginTop: 8, padding: '10px 14px', background: '#fffbeb', borderRadius: 8, border: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <GiftOutlined style={{ color: '#d97706' }} />
                    <Typography.Text strong style={{ color: '#92400e', fontSize: 13 }}>
                      Earn {estimatedPoints} loyalty points on this order
                    </Typography.Text>
                  </div>
                )}
              </div>

              {/* Desktop Checkout CTA */}
              <div className="desktop-only" style={{ marginTop: 24 }}>
                <Button
                  type="primary"
                  size="large"
                  block
                  style={{
                    background: '#f97316',
                    borderColor: '#f97316',
                    fontWeight: 700,
                    height: 48,
                    borderRadius: 10,
                    fontSize: 16,
                  }}
                  onClick={() => navigate('/checkout')}
                >
                  Proceed to Checkout ({formatInr(grandTotal)}) &rarr;
                </Button>
              </div>

              <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', color: '#78716c', fontSize: 12 }}>
                <SafetyCertificateOutlined style={{ color: '#059669' }} />
                <span>100% Secure &amp; Verified B2B Billing</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Fixed Bottom Checkout Bar */}
      <div
        className="mobile-only"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: '#fff',
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 -4px 14px rgba(0,0,0,0.08)',
          zIndex: 100,
        }}
      >
        <div>
          <span style={{ display: 'block', fontSize: 11, color: '#78716c' }}>Total Amount</span>
          <strong style={{ fontSize: 18, color: '#065f46', lineHeight: 1 }}>{formatInr(grandTotal)}</strong>
        </div>
        <Button
          type="primary"
          size="large"
          style={{ background: '#f97316', borderColor: '#f97316', fontWeight: 700, width: 180, borderRadius: 10 }}
          onClick={() => navigate('/checkout')}
        >
          Place Order
        </Button>
      </div>

      {/* Available Coupons Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TagsOutlined style={{ color: '#f97316' }} />
            <span>Available Coupons &amp; Offers</span>
          </div>
        }
        open={couponModalOpen}
        onCancel={() => setCouponModalOpen(false)}
        footer={null}
        width={500}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          {coupons.map((c) => {
            const isApplied = appliedCoupon?.id === c.id;
            const qualifies = subtotal >= c.minOrderValue;
            const saving = couponsApi.calculateDiscount(c, subtotal);

            return (
              <div
                key={c.id}
                style={{
                  border: isApplied ? '2px solid #22c55e' : '1px solid #e5e7eb',
                  borderRadius: 12,
                  padding: '14px 16px',
                  background: isApplied ? '#f0fdf4' : '#fff',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Tag color="orange" style={{ fontWeight: 700, fontSize: 13, letterSpacing: 0.5 }}>
                      {c.code}
                    </Tag>
                    <span style={{ fontWeight: 600, fontSize: 13, color: '#1f2937' }}>{c.title}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#4b5563', marginTop: 4 }}>{c.description}</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                    Min order: {formatInr(c.minOrderValue)}
                    {c.discountType === 'PERCENTAGE' && c.maxDiscount ? ` • Max discount: ${formatInr(c.maxDiscount)}` : ''}
                  </div>
                </div>

                <div>
                  {isApplied ? (
                    <Button type="text" danger size="small" onClick={handleRemoveCoupon} style={{ fontWeight: 700 }}>
                      Remove
                    </Button>
                  ) : (
                    <Button
                      type="primary"
                      size="small"
                      disabled={!qualifies}
                      style={{
                        background: qualifies ? '#059669' : undefined,
                        borderColor: qualifies ? '#059669' : undefined,
                        fontWeight: 600,
                      }}
                      onClick={() => handleApplyCode(c.code)}
                    >
                      {qualifies ? `Apply (-${formatInr(saving)})` : 'Under Min Cart'}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
