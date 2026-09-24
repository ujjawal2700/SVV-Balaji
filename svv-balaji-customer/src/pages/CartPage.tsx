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
import { Button, Divider, Empty, Input, Modal, Radio, Space, Tag, Typography, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCart } from '../cart/useCart';
import { useLoyaltyEstimate } from '../loyalty/useLoyaltyEstimate';
import { couponsApi } from '@shared/api/coupons';
import type { Coupon } from '@shared/api/types';
import { checkoutApi, type OfferCoupon, type Address } from '../api/checkout';
import Lottie from 'lottie-react';
import shoppingCartAnimation from '../assets/animations/shopping-cart.json';
import { useCustomerAuth } from '../auth/CustomerAuthContext';
import { useToggleWishlist } from '../hooks/useWishlist';
import { AddressFormModal } from '../components/AddressFormModal';
import { ADDRESSES_KEY } from './AddressesPage';
import { formatInr } from '../utils/money';


/** The server's offer, in the shape this page already renders. */
function toCoupon(o: OfferCoupon): Coupon {
  return {
    id: o.code,
    code: o.code,
    title: o.title,
    description: o.description,
    discountType: o.type === 'PERCENT' ? 'PERCENTAGE' : 'FIXED',
    discountValue: o.value,
    minOrderValue: o.minOrderValue,
    maxDiscount: o.maxDiscount ?? undefined,
    targetAudience: 'ALL',
    expiryDate: o.expiresAt ?? undefined,
    usedCount: 0,
    isActive: true,
    createdAt: '',
    updatedAt: '',
  };
}

export function CartPage() {
  const navigate = useNavigate();
  const cart = useCart();
  const { role, isLoggedIn } = useCustomerAuth();
  const toggleWishlist = useToggleWishlist();

  // Coupons state. The offers are the SERVER's (active, in date, for this channel);
  // the amounts shown in the cart are only an estimate - checkout prices the coupon for real.
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponInput, setCouponInput] = useState('');
  const [couponModalOpen, setCouponModalOpen] = useState(false);

  useEffect(() => {
    if (role === 'GUEST') return;
    let live = true;
    void checkoutApi
      .coupons()
      .then((offers) => {
        if (!live) return;
        const list = offers.map(toCoupon);
        setCoupons(list);
        const savedCode = sessionStorage.getItem('applied_coupon_code');
        const saved = savedCode ? list.find((c) => c.code === savedCode) : undefined;
        if (saved) setAppliedCoupon(saved);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [role]);

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
            image={<Lottie animationData={shoppingCartAnimation} loop autoplay style={{ width: 260, height: 260, margin: '0 auto' }} />}
            imageStyle={{ height: 'auto', marginBottom: 8 }}
            description={
              <div>
                <Typography.Text strong style={{ fontSize: 18, display: 'block', color: '#1c1917' }}>
                  Your cart is empty
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 14 }}>
                  {role === 'RETAILER' ? 'Add products from the wholesale catalogue to place a bulk order.' : 'Looks like you haven’t added anything yet.'}
                </Typography.Text>
              </div>
            }
          >
            <Button type="primary" size="large" style={{ background: '#059669', borderColor: '#059669', borderRadius: 8, marginTop: 12 }} onClick={() => navigate('/')}>
              {role === 'RETAILER' ? 'Explore Wholesale Catalog' : 'Start Shopping'}
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
    const found = coupons.find((c) => c.code === code);
    if (!found) {
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

  // Worked out by the server (same engine that credits the delivered order).
  const loyaltyEstimate = useLoyaltyEstimate(cart.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })));
  const estimatedPoints = loyaltyEstimate.data?.enabled ? loyaltyEstimate.data.points : 0;

  const today = new Date();
  const tmrw = new Date(today);
  tmrw.setDate(tmrw.getDate() + 1);
  const dayStr = tmrw.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const qc = useQueryClient();
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [addressSelectModalOpen, setAddressSelectModalOpen] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(() => localStorage.getItem('selectedAddressId'));

  const addressesQuery = useQuery({ queryKey: ADDRESSES_KEY, queryFn: checkoutApi.addresses, enabled: role !== 'GUEST' });
  const addressesList = addressesQuery.data ?? [];

  const selectedAddress: Address | null = useMemo(() => {
    if (!addressesList.length) return null;
    return addressesList.find((a) => a.id === selectedAddressId) ?? addressesList.find((a) => a.isDefault) ?? addressesList[0];
  }, [addressesList, selectedAddressId]);

  const handleSelectAddress = (id: string) => {
    setSelectedAddressId(id);
    localStorage.setItem('selectedAddressId', id);
    setAddressSelectModalOpen(false);
  };

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
            <div
              style={{
                background: '#fff',
                borderRadius: 14,
                padding: '16px 20px',
                border: '1px solid #e7e5e4',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
              }}
            >
              {selectedAddress ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Typography.Text strong style={{ fontSize: 14 }}>Delivering to:</Typography.Text>
                    <Tag color="green" style={{ margin: 0, borderRadius: 6, fontWeight: 600 }}>{selectedAddress.label}</Tag>
                    {selectedAddress.latitude ? <Tag color="blue" style={{ margin: 0, borderRadius: 6, fontSize: 11 }}>📍 Pinned</Tag> : null}
                  </div>
                  <Typography.Text style={{ fontSize: 13, color: '#44403c', display: 'block', lineHeight: 1.4 }}>
                    {[selectedAddress.line1, selectedAddress.line2].filter(Boolean).join(', ')}, {selectedAddress.city}, {selectedAddress.state} - <strong>{selectedAddress.pincode}</strong>
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 3 }}>
                    {selectedAddress.fullName} · {selectedAddress.phone}
                  </Typography.Text>
                </div>
              ) : (
                <div>
                  <Typography.Text strong style={{ fontSize: 14, color: '#1c1917', display: 'block' }}>No Delivery Address Selected</Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>Add an address for doorstep delivery</Typography.Text>
                </div>
              )}
              <Button
                size="small"
                style={{ color: '#059669', borderColor: '#059669', borderRadius: 6, fontWeight: 600 }}
                onClick={() => {
                  if (addressesList.length > 0) {
                    setAddressSelectModalOpen(true);
                  } else {
                    setAddressModalOpen(true);
                  }
                }}
              >
                {selectedAddress ? 'Change' : '+ Add'}
              </Button>
            </div>

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
                          if (!isLoggedIn) {
                            message.info('Sign in to save items for later');
                            navigate('/login', { state: { from: '/cart' } });
                            return;
                          }
                          toggleWishlist.mutate(
                            { productId: line.productId, saved: false },
                            {
                              onSuccess: () => {
                                cart.remove(line.productId);
                                message.success('Moved item to wishlist');
                              },
                            },
                          );
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
                      Earn {estimatedPoints} loyalty points once this order is delivered
                    </Typography.Text>
                  </div>
                )}
              </div>

              {/* Checkout CTA Button (Visible on all devices) */}
              <div style={{ marginTop: 20 }}>
                <Button
                  type="primary"
                  size="large"
                  block
                  style={{
                    background: '#f97316',
                    borderColor: '#f97316',
                    fontWeight: 700,
                    height: 50,
                    borderRadius: 12,
                    fontSize: 16,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    boxShadow: '0 4px 14px rgba(249,115,22,0.3)',
                  }}
                  onClick={() => navigate('/checkout')}
                >
                  Proceed to Checkout ({formatInr(grandTotal)}) &rarr;
                </Button>
              </div>

              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', color: '#78716c', fontSize: 12 }}>
                <SafetyCertificateOutlined style={{ color: '#059669' }} />
                <span>100% Secure &amp; Verified B2B Billing</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Fixed Bottom Checkout Bar (Above BottomNav) */}
      <div
        className="mobile-only"
        style={{
          position: 'fixed',
          bottom: 56,
          left: 0,
          right: 0,
          background: '#fff',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 -4px 14px rgba(0,0,0,0.08)',
          zIndex: 99,
          borderTop: '1px solid #e7e5e4',
        }}
      >
        <div>
          <span style={{ display: 'block', fontSize: 11, color: '#78716c' }}>Total Amount</span>
          <strong style={{ fontSize: 17, color: '#065f46', lineHeight: 1 }}>{formatInr(grandTotal)}</strong>
        </div>
        <Button
          type="primary"
          size="large"
          style={{
            background: '#f97316',
            borderColor: '#f97316',
            fontWeight: 700,
            padding: '0 20px',
            height: 42,
            borderRadius: 10,
            fontSize: 14,
          }}
          onClick={() => navigate('/checkout')}
        >
          Checkout &rarr;
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

      {/* Address Switcher Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: 24 }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>Select Delivery Address</span>
            <Button
              type="link"
              size="small"
              onClick={() => {
                setAddressSelectModalOpen(false);
                setAddressModalOpen(true);
              }}
              style={{ color: '#f97316', fontWeight: 600, padding: 0 }}
            >
              + Add New Address
            </Button>
          </div>
        }
        open={addressSelectModalOpen}
        onCancel={() => setAddressSelectModalOpen(false)}
        footer={null}
        width={520}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
          {addressesList.map((a) => {
            const isSelected = selectedAddress?.id === a.id;
            return (
              <div
                key={a.id}
                onClick={() => handleSelectAddress(a.id)}
                style={{
                  border: isSelected ? '2px solid #059669' : '1px solid #e5e7eb',
                  borderRadius: 12,
                  padding: '12px 14px',
                  background: isSelected ? '#f0fdf4' : '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  transition: 'all 0.2s',
                }}
              >
                <Radio checked={isSelected} style={{ marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <Typography.Text strong style={{ fontSize: 14, color: '#0f172a' }}>{a.fullName}</Typography.Text>
                    <Tag color="green" style={{ fontSize: 11, margin: 0, fontWeight: 600 }}>{a.label}</Tag>
                    {a.latitude ? <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>📍 Pinned</Tag> : null}
                  </div>
                  <Typography.Text style={{ fontSize: 13, color: '#475569', display: 'block', lineHeight: 1.4 }}>
                    {[a.line1, a.line2].filter(Boolean).join(', ')}, {a.city}, {a.state} - <strong>{a.pincode}</strong>
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 2 }}>
                    Phone: {a.phone}
                  </Typography.Text>
                </div>
              </div>
            );
          })}
        </div>
      </Modal>

      {/* Add New Address Modal */}
      <AddressFormModal
        open={addressModalOpen}
        onClose={() => setAddressModalOpen(false)}
        onSaved={(saved) => {
          void qc.invalidateQueries({ queryKey: ADDRESSES_KEY });
          handleSelectAddress(saved.id);
          setAddressModalOpen(false);
        }}
      />
    </div>
  );
}
