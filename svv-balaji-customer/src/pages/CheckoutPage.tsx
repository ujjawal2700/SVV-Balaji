import {
  ArrowLeftOutlined,
  BankOutlined,
  CarOutlined,
  CheckCircleFilled,
  CreditCardOutlined,
  EnvironmentOutlined,
  GiftOutlined,
  LockOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
  ShoppingOutlined,
  ThunderboltOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Col,
  Divider,
  Input,
  InputNumber,
  Modal,
  Radio,
  Row as AntRow,
  Skeleton,
  Space,
  Switch,
  Tag,
  Typography,
  message,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  checkoutApi,
  checkoutError,
  type CheckoutRequest,
  type CheckoutSession,
  type PaymentMode,
  type PlacedOrder,
  type Quote,
} from '../api/checkout';
import { useCustomerAuth } from '../auth/CustomerAuthContext';
import { useCart } from '../cart/useCart';
import { AddressFormModal } from '../components/AddressFormModal';
import { LOYALTY_QUERY_KEY } from '../loyalty/LoyaltyProvider';
import { formatInr } from '../utils/money';
import { ADDRESSES_KEY } from './AddressesPage';

const COUPON_KEY = 'applied_coupon_code';

const MODE_LABEL: Record<PaymentMode, { title: string; hint: string; icon: React.ReactNode }> = {
  ONLINE: { title: 'Pay Online (UPI / Cards / Netbanking)', hint: 'Instant confirmation via Razorpay/Gateway', icon: <CreditCardOutlined style={{ fontSize: 18, color: '#f97316' }} /> },
  COD: { title: 'Cash on Delivery', hint: 'Pay via cash or UPI when order arrives', icon: <WalletOutlined style={{ fontSize: 18, color: '#16a34a' }} /> },
  CREDIT: { title: 'On Account (Credit Terms)', hint: 'Billed against your verified B2B credit limit', icon: <BankOutlined style={{ fontSize: 18, color: '#2563eb' }} /> },
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the payment window'));
    document.body.appendChild(s);
  });
}

/**
 * Responsive Checkout Page
 * Supports seamless desktop 2-column layout and mobile-optimized single-column flow.
 */
export function CheckoutPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const cart = useCart();
  const { role } = useCustomerAuth();

  const [addressId, setAddressId] = useState<string | null>(null);
  const [addressModal, setAddressModal] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [couponCode, setCouponCode] = useState<string>(() => sessionStorage.getItem(COUPON_KEY) ?? '');
  const [redeem, setRedeem] = useState(0);
  const [redeemReferral, setRedeemReferral] = useState(0);
  const [mode, setMode] = useState<PaymentMode | undefined>();
  // Quick is pre-selected the first time the quote offers it; the customer can switch.
  const [speed, setSpeed] = useState<'STANDARD' | 'QUICK'>('STANDARD');
  const [speedTouched, setSpeedTouched] = useState(false);
  const [quickDropped, setQuickDropped] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [mockSession, setMockSession] = useState<CheckoutSession | null>(null);

  const addresses = useQuery({ queryKey: ADDRESSES_KEY, queryFn: checkoutApi.addresses, enabled: role !== 'GUEST' });
  const offers = useQuery({ queryKey: ['storefront', 'coupons'], queryFn: checkoutApi.coupons, enabled: role !== 'GUEST' });

  useEffect(() => {
    if (!addresses.data?.length) return;
    if (!addressId || !addresses.data.some((a) => a.id === addressId)) {
      setAddressId((addresses.data.find((a) => a.isDefault) ?? addresses.data[0]).id);
    }
  }, [addresses.data, addressId]);

  const request: CheckoutRequest | null = useMemo(
    () =>
      addressId && cart.lines.length > 0
        ? {
            addressId,
            items: cart.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
            couponCode: couponCode || undefined,
            redeemPoints: redeem || undefined,
            redeemReferralPoints: redeemReferral || undefined,
            paymentMode: mode,
            deliverySpeed: speed,
          }
        : null,
    [addressId, cart.lines, couponCode, redeem, redeemReferral, mode, speed],
  );

  const quoteQuery = useQuery({
    queryKey: ['storefront', 'checkout', 'quote', request],
    queryFn: () => checkoutApi.quote(request as CheckoutRequest),
    enabled: request !== null,
    retry: false,
    staleTime: 0,
  });
  const quote = quoteQuery.data;
  const quoteErr = quoteQuery.error ? checkoutError(quoteQuery.error) : null;
  // Quick stopped being possible (sold out at the store, closed, moved address): fall back and say why.
  const quickRefused = quoteErr?.code === 'QUICK_UNAVAILABLE';
  const quoteError = quoteErr && !quickRefused ? quoteErr.message : null;
  useEffect(() => {
    if (quickRefused && speed === 'QUICK') {
      setQuickDropped(quoteErr?.message ?? 'Quick Delivery is not available right now');
      setSpeed('STANDARD');
    }
  }, [quickRefused, speed, quoteErr?.message]);
  useEffect(() => {
    if (!speedTouched && speed === 'STANDARD' && quote?.deliveryOptions?.quick?.available) setSpeed('QUICK');
  }, [quote?.deliveryOptions?.quick?.available, speedTouched, speed]);
  useEffect(() => {
    // A new address is a new decision.
    setSpeedTouched(false);
    setQuickDropped(null);
    setSpeed('STANDARD');
  }, [addressId]);
  const address = addresses.data?.find((a) => a.id === addressId);

  const applyCoupon = (code: string) => {
    const c = code.trim().toUpperCase();
    setCouponCode(c);
    if (c) sessionStorage.setItem(COUPON_KEY, c);
    else sessionStorage.removeItem(COUPON_KEY);
    setCouponInput('');
  };

  const finish = (order: PlacedOrder) => {
    cart.clear();
    sessionStorage.removeItem(COUPON_KEY);
    void qc.invalidateQueries({ queryKey: LOYALTY_QUERY_KEY });
    message.success('Order placed successfully! 🎉');
    navigate(`/orders/${order.orderNumber}`, { replace: true, state: { justPlaced: true } });
  };

  const handleError = (error: unknown) => {
    const e = checkoutError(error);
    if (e.code === 'PRICE_CHANGED') message.warning(e.message, 6);
    else if (e.code === 'OUT_OF_STOCK') message.error('Some items just sold out. Please review your cart.', 6);
    else if (e.code === 'PAYMENT_FAILED' || e.code === 'REFUND_REQUIRED') message.error(e.message, 8);
    else message.error(e.message, 6);
    void qc.invalidateQueries({ queryKey: ['storefront', 'checkout', 'quote'] });
  };

  const confirmMock = async (session: CheckoutSession, ok: boolean) => {
    setMockSession(null);
    setPlacing(true);
    try {
      const order = await checkoutApi.confirm(session.sessionId, {
        gatewayPaymentId: `${ok ? 'mockpay' : 'mockfail'}_${Date.now()}`,
        signature: ok ? 'mock_signature' : 'declined',
      });
      finish(order);
    } catch (error) {
      handleError(error);
    } finally {
      setPlacing(false);
    }
  };

  const payWithRazorpay = async (session: CheckoutSession) => {
    const g = session.payment.gateway!;
    await loadRazorpay();
    const rz = new window.Razorpay!({
      key: g.keyId,
      order_id: g.gatewayOrderId,
      amount: g.amount,
      currency: g.currency,
      name: 'SVV Balaji',
      prefill: { name: address?.fullName, contact: address?.phone },
      handler: async (resp: { razorpay_payment_id: string; razorpay_signature: string }) => {
        try {
          finish(await checkoutApi.confirm(session.sessionId, { gatewayPaymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature }));
        } catch (error) {
          handleError(error);
        } finally {
          setPlacing(false);
        }
      },
      modal: {
        ondismiss: () => {
          void checkoutApi.abort(session.sessionId).catch(() => undefined);
          setPlacing(false);
        },
      },
    });
    rz.open();
  };

  const placeOrder = async () => {
    if (!request || !quote) return;
    setPlacing(true);
    try {
      const session = await checkoutApi.start({ ...request, paymentMode: request.paymentMode ?? quote.payment.mode, expectedTotal: quote.totals.totalPayable });
      if (!session.payment.requiresPayment) {
        finish(await checkoutApi.confirm(session.sessionId, {}));
        setPlacing(false);
      } else if (session.payment.gateway?.provider === 'razorpay') {
        await payWithRazorpay(session);
      } else {
        setMockSession(session);
        setPlacing(false);
      }
    } catch (error) {
      handleError(error);
      setPlacing(false);
    }
  };

  const cancelMock = async () => {
    const s = mockSession;
    setMockSession(null);
    if (s) await checkoutApi.abort(s.sessionId).catch(() => undefined);
    message.info('Payment cancelled - reserved stock has been released');
  };

  if (role === 'GUEST') {
    return (
      <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '40px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: '32px 24px', maxWidth: 440, width: '100%', textAlign: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <LockOutlined style={{ fontSize: 24, color: '#f97316' }} />
          </div>
          <Typography.Title level={4} style={{ margin: '0 0 8px', color: '#1e293b' }}>Sign in to Checkout</Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 24, fontSize: 14 }}>
            Please sign in with your phone number to access saved addresses and place orders.
          </Typography.Paragraph>
          <Button type="primary" size="large" block onClick={() => navigate('/login')} style={{ background: '#f97316', borderColor: '#f97316', height: 46, borderRadius: 10, fontWeight: 600 }}>
            Sign In with OTP
          </Button>
        </div>
      </div>
    );
  }

  if (cart.lines.length === 0) {
    return (
      <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '40px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: '36px 24px', maxWidth: 440, width: '100%', textAlign: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <ShoppingOutlined style={{ fontSize: 28, color: '#f97316' }} />
          </div>
          <Typography.Title level={4} style={{ margin: '0 0 8px', color: '#1e293b' }}>Your Cart is Empty</Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 24, fontSize: 14 }}>
            You don't have any items in your cart to checkout.
          </Typography.Paragraph>
          <Button type="primary" size="large" block onClick={() => navigate('/')} style={{ background: '#f97316', borderColor: '#f97316', height: 46, borderRadius: 10, fontWeight: 600 }}>
            Continue Shopping
          </Button>
        </div>
      </div>
    );
  }

  const f = quote?.fulfillment;

  return (
    <div className="checkout-page" style={{ minHeight: '100vh', background: '#f8fafc', paddingBottom: 110 }}>
      {/* Sticky Header */}
      <header
        style={{
          background: '#fff',
          padding: '14px 20px',
          borderBottom: '1px solid #e2e8f0',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button
              onClick={() => navigate(-1)}
              style={{
                background: '#f1f5f9',
                border: 'none',
                borderRadius: '50%',
                width: 36,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              title="Go Back"
            >
              <ArrowLeftOutlined style={{ fontSize: 16, color: '#334155' }} />
            </button>
            <div>
              <Typography.Title level={4} style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>
                Secure Checkout
              </Typography.Title>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {cart.count} {cart.count === 1 ? 'item' : 'items'} in your cart
              </Typography.Text>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#16a34a', fontSize: 13, fontWeight: 600 }}>
            <SafetyCertificateOutlined style={{ fontSize: 16 }} />
            <span style={{ display: 'none' }} className="desktop-inline">100% Secure &amp; Verified</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="checkout-main" style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 16px' }}>
        <AntRow gutter={[{ xs: 0, lg: 24 }, { xs: 8, lg: 24 }]}>
          {/* Left Column: Form Details (Address, Fulfillment, Coupons, Payment) */}
          <Col xs={24} lg={15} xl={16}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* 1. Delivery Address Card */}
              <Card
                title={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
                    <EnvironmentOutlined style={{ color: '#f97316' }} /> Delivery Address
                  </div>
                }
                extra={
                  (addresses.data ?? []).length > 0 ? (
                    <Button type="link" icon={<PlusOutlined />} onClick={() => setAddressModal(true)} style={{ color: '#f97316', padding: 0, fontWeight: 600 }}>
                      Add New Address
                    </Button>
                  ) : null
                }
                style={{ borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}
              >
                {addresses.isLoading ? (
                  <Skeleton active paragraph={{ rows: 2 }} />
                ) : (addresses.data ?? []).length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
                      No saved addresses found. Please add a delivery address to proceed.
                    </Typography.Paragraph>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddressModal(true)} style={{ background: '#f97316', borderColor: '#f97316' }}>
                      Add Delivery Address
                    </Button>
                  </div>
                ) : (
                  <Radio.Group value={addressId} onChange={(e) => setAddressId(e.target.value)} style={{ width: '100%' }}>
                    <Space direction="vertical" style={{ width: '100%' }} size={12}>
                      {addresses.data!.map((a) => {
                        const isSelected = a.id === addressId;
                        return (
                          <div
                            key={a.id}
                            onClick={() => setAddressId(a.id)}
                            style={{
                              padding: '14px 16px',
                              borderRadius: 12,
                              border: isSelected ? '2px solid #f97316' : '1px solid #e2e8f0',
                              background: isSelected ? '#fffaf5' : '#fff',
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 12,
                            }}
                          >
                            <Radio value={a.id} style={{ marginTop: 2 }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                                <Typography.Text strong style={{ fontSize: 14, color: '#0f172a' }}>
                                  {a.fullName}
                                </Typography.Text>
                                <Tag color={a.label.toUpperCase() === 'HOME' ? 'blue' : a.label.toUpperCase() === 'WORK' ? 'purple' : 'default'} style={{ borderRadius: 4, margin: 0, fontSize: 11, fontWeight: 600 }}>
                                  {a.label}
                                </Tag>
                                {a.latitude ? <Tag color="green" style={{ borderRadius: 4, margin: 0, fontSize: 11 }}>📍 Pinned Location</Tag> : null}
                              </div>
                              <Typography.Text style={{ fontSize: 13, color: '#475569', display: 'block', lineHeight: 1.5 }}>
                                {[a.line1, a.line2].filter(Boolean).join(', ')}, {a.city}, {a.state} - <strong>{a.pincode}</strong>
                              </Typography.Text>
                              <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                                Phone: {a.phone}
                              </Typography.Text>
                            </div>
                          </div>
                        );
                      })}
                    </Space>
                  </Radio.Group>
                )}
              </Card>

              {/* 2. Delivery & Fulfillment Method (Compact Approx Date View) */}
              <Card
                title={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
                    <CarOutlined style={{ color: '#16a34a' }} /> Delivery &amp; Fulfillment
                  </div>
                }
                style={{ borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}
              >
                {quoteQuery.isLoading ? (
                  <Skeleton active paragraph={{ rows: 1 }} />
                ) : quoteError ? (
                  <Alert type="error" showIcon message="Delivery Quote Error" description={quoteError} />
                ) : f ? (
                  <DeliveryChoice
                    quote={quote!}
                    speed={f.speed === 'QUICK' ? 'QUICK' : 'STANDARD'}
                    dropped={quickDropped}
                    onChange={(next) => {
                      setSpeedTouched(true);
                      setQuickDropped(null);
                      setSpeed(next);
                    }}
                  />
                ) : (
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>Select a delivery address to view approximate delivery date.</Typography.Text>
                )}
              </Card>

              {/* 3. Offers, Coupons & Loyalty Rewards */}
              <Card
                title={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
                    <GiftOutlined style={{ color: '#f97316' }} /> Offers &amp; Loyalty Rewards
                  </div>
                }
                style={{ borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}
              >
                {couponCode ? (
                  <div
                    style={{
                      background: '#fff7ed',
                      border: '1px dashed #f97316',
                      borderRadius: 10,
                      padding: '12px 16px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Tag color="orange" style={{ fontWeight: 700, fontSize: 13, padding: '2px 8px' }}>
                        {couponCode}
                      </Tag>
                      <Typography.Text strong style={{ color: '#c2410c', fontSize: 13 }}>
                        APPLIED SUCCESSFULLY
                      </Typography.Text>
                    </div>
                    <Button type="link" danger onClick={() => applyCoupon('')} style={{ fontWeight: 600, padding: 0 }}>
                      Remove
                    </Button>
                  </div>
                ) : (
                  <div>
                    <Space.Compact style={{ width: '100%' }}>
                      <Input
                        placeholder="Enter Promo or Coupon Code"
                        size="large"
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value)}
                        onPressEnter={() => applyCoupon(couponInput)}
                        style={{ borderRadius: '8px 0 0 8px' }}
                      />
                      <Button
                        type="primary"
                        size="large"
                        onClick={() => applyCoupon(couponInput)}
                        style={{ background: '#f97316', borderColor: '#f97316', borderRadius: '0 8px 8px 0', fontWeight: 600 }}
                      >
                        Apply
                      </Button>
                    </Space.Compact>

                    {!couponCode && (offers.data ?? []).length > 0 ? (
                      <div style={{ marginTop: 12 }}>
                        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
                          Available offers for you:
                        </Typography.Text>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {offers.data!.slice(0, 4).map((o) => (
                            <Tag
                              key={o.code}
                              color="gold"
                              style={{ cursor: 'pointer', padding: '4px 10px', borderRadius: 6, fontSize: 12 }}
                              onClick={() => applyCoupon(o.code)}
                            >
                              <strong>{o.code}</strong> · {o.title}
                            </Tag>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}

                {quote?.wallet.mode === 'COMBINED' && quote.wallet.combined?.enabled && quote.wallet.combined.balance > 0 ? (
                  <>
                    <Divider style={{ margin: '16px 0' }} />
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <Typography.Text strong style={{ fontSize: 14, color: '#0f172a' }}>
                            Redeem Wallet Coins
                          </Typography.Text>
                          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                            Available: <strong>{quote.wallet.combined.balance} coins</strong> (referral + loyalty combined, worth ₹
                            {(quote.wallet.combined.balance * quote.wallet.combined.pointValueInr).toFixed(2)})
                          </div>
                        </div>
                        <Switch
                          checked={redeem > 0}
                          disabled={quote.wallet.combined.maxPoints === 0}
                          onChange={(on) => setRedeem(on ? quote.wallet.combined!.maxPoints : 0)}
                        />
                      </div>
                      {redeem > 0 ? (
                        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                          <InputNumber
                            size="middle"
                            min={quote.wallet.combined.minPoints || 1}
                            max={quote.wallet.combined.maxPoints}
                            precision={0}
                            value={redeem}
                            onChange={(v) => setRedeem(v ?? 0)}
                            addonAfter="coins"
                            style={{ width: 160 }}
                          />
                          <Typography.Text style={{ color: '#16a34a', fontSize: 13, fontWeight: 600 }}>
                            − {formatInr(redeem * quote.wallet.combined.pointValueInr)} saved on this order
                          </Typography.Text>
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <>
                    {quote?.loyalty.enabled && quote.loyalty.balance > 0 ? (
                      <>
                        <Divider style={{ margin: '16px 0' }} />
                        <div
                          style={{
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: 12,
                            padding: '14px 16px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <Typography.Text strong style={{ fontSize: 14, color: '#0f172a' }}>
                                Redeem Loyalty Coins
                              </Typography.Text>
                              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                                Available: <strong>{quote.loyalty.balance} pts</strong> (Worth ₹{(quote.loyalty.balance * quote.loyalty.pointValueInr).toFixed(2)})
                              </div>
                            </div>
                            <Switch
                              checked={redeem > 0}
                              disabled={quote.loyalty.maxPoints === 0}
                              onChange={(on) => setRedeem(on ? quote.loyalty.maxPoints : 0)}
                            />
                          </div>
                          {redeem > 0 ? (
                            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                              <InputNumber
                                size="middle"
                                min={quote.loyalty.minPoints || 1}
                                max={quote.loyalty.maxPoints}
                                precision={0}
                                value={redeem}
                                onChange={(v) => setRedeem(v ?? 0)}
                                addonAfter="pts"
                                style={{ width: 160 }}
                              />
                              <Typography.Text style={{ color: '#16a34a', fontSize: 13, fontWeight: 600 }}>
                                − {formatInr(redeem * quote.loyalty.pointValueInr)} saved on this order
                              </Typography.Text>
                            </div>
                          ) : null}
                        </div>
                      </>
                    ) : null}

                    {quote?.referral.enabled && quote.referral.balance > 0 ? (
                      <>
                        <Divider style={{ margin: '16px 0' }} />
                        <div
                          style={{
                            background: '#fff7ed',
                            border: '1px solid #fed7aa',
                            borderRadius: 12,
                            padding: '14px 16px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <Typography.Text strong style={{ fontSize: 14, color: '#0f172a' }}>
                                Redeem Referral Coins
                              </Typography.Text>
                              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                                Available: <strong>{quote.referral.balance} coins</strong> (Worth ₹{(quote.referral.balance * quote.referral.pointValueInr).toFixed(2)})
                              </div>
                            </div>
                            <Switch
                              checked={redeemReferral > 0}
                              disabled={quote.referral.maxPoints === 0}
                              onChange={(on) => setRedeemReferral(on ? quote.referral.maxPoints : 0)}
                            />
                          </div>
                          {redeemReferral > 0 ? (
                            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                              <InputNumber
                                size="middle"
                                min={quote.referral.minPoints || 1}
                                max={quote.referral.maxPoints}
                                precision={0}
                                value={redeemReferral}
                                onChange={(v) => setRedeemReferral(v ?? 0)}
                                addonAfter="coins"
                                style={{ width: 160 }}
                              />
                              <Typography.Text style={{ color: '#16a34a', fontSize: 13, fontWeight: 600 }}>
                                − {formatInr(redeemReferral * quote.referral.pointValueInr)} saved on this order
                              </Typography.Text>
                            </div>
                          ) : null}
                        </div>
                      </>
                    ) : null}
                  </>
                )}
              </Card>

              {/* 4. Payment Options */}
              {quote ? (
                <Card
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
                      <CreditCardOutlined style={{ color: '#f97316' }} /> Payment Options
                    </div>
                  }
                  style={{ borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}
                >
                  <Radio.Group value={quote.payment.mode} onChange={(e) => setMode(e.target.value)} style={{ width: '100%' }}>
                    <Space direction="vertical" style={{ width: '100%' }} size={10}>
                      {quote.payment.allowedModes.map((m) => {
                        const isSelected = quote.payment.mode === m;
                        return (
                          <div
                            key={m}
                            onClick={() => setMode(m)}
                            style={{
                              padding: '14px 16px',
                              borderRadius: 12,
                              border: isSelected ? '2px solid #f97316' : '1px solid #e2e8f0',
                              background: isSelected ? '#fffaf5' : '#fff',
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <Radio value={m} />
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  {MODE_LABEL[m].icon}
                                  <Typography.Text strong style={{ fontSize: 14, color: '#0f172a' }}>
                                    {MODE_LABEL[m].title}
                                  </Typography.Text>
                                </div>
                                <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 2 }}>
                                  {MODE_LABEL[m].hint}
                                </Typography.Text>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </Space>
                  </Radio.Group>

                  {quote.payment.codUnavailableReason && quote.channel === 'B2C' ? (
                    <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8, color: '#94a3b8' }}>
                      ℹ️ {quote.payment.codUnavailableReason}
                    </Typography.Text>
                  ) : null}
                  {quote.payment.creditUnavailableReason && quote.channel === 'B2B' ? (
                    <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8, color: '#94a3b8' }}>
                      ℹ️ {quote.payment.creditUnavailableReason}
                    </Typography.Text>
                  ) : null}
                </Card>
              ) : null}
            </div>
          </Col>

          {/* Right Column: Sticky Order Summary & Price Breakdown */}
          <Col xs={24} lg={9} xl={8}>
            <div style={{ position: 'sticky', top: 80, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Items in Order */}
              {quote ? (
                <Card
                  title={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>Order Items ({quote.lines.length})</span>
                      <Link to="/cart" style={{ fontSize: 12, color: '#f97316', fontWeight: 600 }}>Edit Cart</Link>
                    </div>
                  }
                  style={{ borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}
                >
                  <div style={{ maxHeight: 280, overflowY: 'auto', paddingRight: 4 }}>
                    {quote.lines.map((l) => (
                      <div
                        key={l.productId}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '10px 0',
                          borderBottom: '1px solid #f1f5f9',
                          fontSize: 13,
                        }}
                      >
                        <div
                          style={{
                            width: 44,
                            height: 44,
                            background: '#f8fafc',
                            border: '1px solid #f1f5f9',
                            borderRadius: 8,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            overflow: 'hidden',
                            padding: 3,
                          }}
                        >
                          {l.image ? (
                            <img
                              src={l.image}
                              alt={l.name}
                              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', mixBlendMode: 'multiply' }}
                            />
                          ) : (
                            <ShoppingOutlined style={{ fontSize: 16, color: '#cbd5e1' }} />
                          )}
                        </div>
                        <div style={{ flex: 1, paddingRight: 8, minWidth: 0 }}>
                          <Typography.Text
                            strong
                            ellipsis
                            style={{ fontSize: 13, color: '#334155', display: 'block' }}
                          >
                            {l.name}
                          </Typography.Text>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            Qty: {l.quantity}
                          </Typography.Text>
                        </div>
                        <Typography.Text strong style={{ fontSize: 13, color: '#0f172a', flexShrink: 0 }}>
                          {formatInr(l.gross)}
                        </Typography.Text>
                      </div>
                    ))}
                  </div>

                  <Divider style={{ margin: '14px 0' }} />

                  {/* Price Breakdown */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <PriceRow label="Items Subtotal" value={formatInr(quote.totals.subtotal)} />
                    {quote.totals.couponDiscount > 0 ? (
                      <PriceRow
                        label={`Coupon Discount (${quote.coupon?.code})`}
                        value={`− ${formatInr(quote.totals.couponDiscount)}`}
                        green
                      />
                    ) : null}
                    {quote.totals.loyaltyDiscount > 0 ? (
                      <PriceRow
                        label="Loyalty Coins Used"
                        value={`− ${formatInr(quote.totals.loyaltyDiscount)}`}
                        green
                      />
                    ) : null}
                    {quote.totals.referralDiscount > 0 ? (
                      <PriceRow
                        label="Referral Coins Used"
                        value={`− ${formatInr(quote.totals.referralDiscount)}`}
                        green
                      />
                    ) : null}
                    <PriceRow label="Estimated GST / Taxes" value={formatInr(quote.totals.tax)} />
                    <PriceRow
                      label="Delivery Charges"
                      value={quote.totals.deliveryFee === 0 ? 'FREE' : formatInr(quote.totals.deliveryFee)}
                      green={quote.totals.deliveryFee === 0}
                    />

                    <Divider style={{ margin: '10px 0' }} />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
                      <div>
                        <Typography.Text strong style={{ fontSize: 16, color: '#0f172a', display: 'block' }}>
                          Total Payable
                        </Typography.Text>
                        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                          Inclusive of all taxes
                        </Typography.Text>
                      </div>
                      <Typography.Text strong style={{ fontSize: 22, color: '#0f172a' }}>
                        {formatInr(quote.totals.totalPayable)}
                      </Typography.Text>
                    </div>
                  </div>

                  {/* Desktop Action Button */}
                  <div style={{ marginTop: 20 }}>
                    <Button
                      type="primary"
                      size="large"
                      block
                      loading={placing}
                      disabled={!quote || placing}
                      onClick={() => void placeOrder()}
                      style={{
                        background: '#f97316',
                        borderColor: '#f97316',
                        height: 50,
                        borderRadius: 12,
                        fontSize: 16,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        boxShadow: '0 4px 14px rgba(249,115,22,0.3)',
                      }}
                    >
                      <LockOutlined />
                      {quote.payment.mode === 'ONLINE' && quote.totals.totalPayable > 0
                        ? `Pay ${formatInr(quote.totals.totalPayable)}`
                        : `Place Order · ${formatInr(quote.totals.totalPayable)}`}
                    </Button>
                  </div>
                </Card>
              ) : null}

              {/* Trust Badges */}
              <div
                style={{
                  background: '#fff',
                  borderRadius: 12,
                  padding: '16px',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#475569' }}>
                  <CheckCircleFilled style={{ color: '#16a34a', fontSize: 16 }} />
                  <span>100% Direct from Verified Mandi Farmers</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#475569' }}>
                  <SafetyCertificateOutlined style={{ color: '#2563eb', fontSize: 16 }} />
                  <span>Unhindered Batch Traceability &amp; Lab Tested</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#475569' }}>
                  <ThunderboltOutlined style={{ color: '#f59e0b', fontSize: 16 }} />
                  <span>Fast Local Delivery with Doorstep OTP</span>
                </div>
              </div>
            </div>
          </Col>
        </AntRow>
      </main>

      {/* Mobile Sticky Bottom Bar */}
      <div
        style={{
          position: 'fixed',
          // Sits on top of the tab bar, which now shows on every page.
          bottom: 'var(--store-bottom-nav)',
          left: 0,
          right: 0,
          background: '#fff',
          padding: '12px 16px',
          boxShadow: '0 -4px 16px rgba(0,0,0,0.08)',
          zIndex: 99,
          borderTop: '1px solid #e2e8f0',
        }}
        className="mobile-only"
      >
        <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          {quote ? (
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                TOTAL PAYABLE
              </Typography.Text>
              <Typography.Text strong style={{ fontSize: 18, color: '#0f172a' }}>
                {formatInr(quote.totals.totalPayable)}
              </Typography.Text>
            </div>
          ) : (
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>Calculating total...</Typography.Text>
            </div>
          )}

          <Button
            type="primary"
            size="large"
            loading={placing}
            disabled={!quote || placing}
            onClick={() => void placeOrder()}
            style={{
              background: '#f97316',
              borderColor: '#f97316',
              height: 46,
              padding: '0 24px',
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 700,
              flex: 1,
              maxWidth: 240,
            }}
          >
            {quote ? (quote.payment.mode === 'ONLINE' && quote.totals.totalPayable > 0 ? 'Pay Now' : 'Place Order') : 'Place Order'}
          </Button>
        </div>
      </div>

      {/* Add Address Modal */}
      <AddressFormModal
        open={addressModal}
        onClose={() => setAddressModal(false)}
        onSaved={(a) => {
          void qc.invalidateQueries({ queryKey: ADDRESSES_KEY });
          setAddressId(a.id);
        }}
      />

      {/* Mock Development Payment Gateway Modal */}
      <Modal
        open={mockSession !== null}
        title="Test Payment (Development Gateway)"
        onCancel={() => void cancelMock()}
        footer={null}
        maskClosable={false}
      >
        <Typography.Paragraph>
          This is the mock payment gateway simulated in development environment. Order Amount:{' '}
          <strong>{mockSession ? formatInr(mockSession.payment.amount) : ''}</strong>. Stock reservations are held for 15 minutes.
        </Typography.Paragraph>
        <Space wrap style={{ marginTop: 12 }}>
          <Button type="primary" onClick={() => mockSession && void confirmMock(mockSession, true)} style={{ background: '#16a34a', borderColor: '#16a34a' }}>
            Simulate Successful Payment
          </Button>
          <Button danger onClick={() => mockSession && void confirmMock(mockSession, false)}>
            Simulate Payment Failure
          </Button>
          <Button onClick={() => void cancelMock()}>
            Cancel &amp; Release Stock
          </Button>
        </Space>
      </Modal>

      <style>{`
        @media (max-width: 767px) {
          .checkout-main {
            padding: 12px 10px !important;
          }
          .checkout-page .ant-card-body {
            padding: 14px !important;
          }
          .checkout-page .ant-card-head {
            padding: 0 14px !important;
            min-height: 44px !important;
          }
        }
        @media (max-width: 991px) {
          .checkout-page {
            padding-bottom: 100px !important;
          }
        }
      `}</style>
    </div>
  );
}

function PriceRow({ label, value, bold, green }: { label: string; value: string; bold?: boolean; green?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: bold ? 15 : 13,
        fontWeight: bold ? 700 : 400,
        color: green ? '#16a34a' : '#475569',
      }}
    >
      <span>{label}</span>
      <span style={{ fontWeight: green || bold ? 700 : 500 }}>{value}</span>
    </div>
  );
}

/**
 * Quick vs standard delivery. Quick shows only when the address is in a Quick
 * zone; greyed out with the reason when the zone cannot promise it right now.
 */
function DeliveryChoice({
  quote, speed, dropped, onChange,
}: {
  quote: Quote;
  speed: 'STANDARD' | 'QUICK';
  dropped: string | null;
  onChange: (s: 'STANDARD' | 'QUICK') => void;
}) {
  const opts = quote.deliveryOptions;
  const quick = opts?.quick ?? null;
  const standard = opts?.standard ?? { etaLabel: quote.fulfillment.etaLabel, fee: quote.totals.deliveryFee, reason: quote.fulfillment.reason, method: quote.fulfillment.method };
  const fee = (n: number | null) => (n === null ? '' : n === 0 ? 'FREE' : formatInr(n));
  const option = (key: 'QUICK' | 'STANDARD', title: string, eta: string, price: string, sub: string, icon: React.ReactNode, disabled = false) => {
    const on = speed === key;
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(key)}
        style={{
          flex: 1, minWidth: 200, textAlign: 'left', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
          padding: '12px 14px', borderRadius: 12, background: on ? (key === 'QUICK' ? '#fff7ed' : '#f0fdf4') : '#fff',
          border: `2px solid ${on ? (key === 'QUICK' ? '#f97316' : '#16a34a') : '#e2e8f0'}`, display: 'flex', gap: 12, alignItems: 'flex-start',
        }}
      >
        <span style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', background: key === 'QUICK' ? '#ffedd5' : '#dcfce7', color: key === 'QUICK' ? '#ea580c' : '#16a34a', fontSize: 18 }}>{icon}</span>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <b style={{ color: '#0f172a', fontSize: 14 }}>{title}</b>
            <b style={{ color: price === 'FREE' ? '#16a34a' : '#0f172a', fontSize: 13 }}>{price}</b>
          </span>
          <span style={{ display: 'block', fontSize: 13, color: key === 'QUICK' && !disabled ? '#c2410c' : '#475569', fontWeight: 600, marginTop: 2 }}>{eta}</span>
          <span style={{ display: 'block', fontSize: 12, color: '#64748b', marginTop: 2 }}>{sub}</span>
        </span>
      </button>
    );
  };
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {quick
          ? option('QUICK', 'Quick Delivery', quick.available ? `In ${quick.etaLabel}` : 'Not available now', quick.available ? fee(quick.fee) : '', quick.available ? `From your nearby store${quick.zoneName ? ` · ${quick.zoneName}` : ''}` : quick.reason, <ThunderboltOutlined />, !quick.available)
          : null}
        {option('STANDARD', quick ? 'Standard Delivery' : 'Delivery', `Estimated ${standard.etaLabel}`, fee(standard.fee), standard.reason, <CarOutlined />)}
      </div>
      {dropped ? <Alert style={{ marginTop: 10 }} type="warning" showIcon message={`Switched to standard delivery: ${dropped}`} /> : null}
    </div>
  );
}
