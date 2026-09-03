import {
  ArrowLeftOutlined,
  CheckCircleFilled,
  EnvironmentOutlined,
  EditOutlined,
  CreditCardOutlined,
  WalletOutlined,
  BankOutlined,
} from '@ant-design/icons';
import { Button, Divider, Radio, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../cart/useCart';

function formatInr(value: number): string {
  return `₹${value.toLocaleString('en-IN')}`;
}

const defaultAddress = {
  id: 'addr-1',
  type: 'Home',
  name: 'Rahul Sharma',
  phone: '9876543210',
  addressLine1: '123 Main St, Apartment 4B',
  addressLine2: 'Andheri West',
  city: 'Mumbai',
  state: 'Maharashtra',
  pincode: '400001',
};

const DELIVERY_CHARGE = 49;

/**
 * Checkout — second half of FRD 29.2.
 *
 * Where the browser-side cart becomes a real order: delivery address, server-
 * side re-pricing of every line, a stock check, then order creation and payment.
 *
 * The gap here is not cosmetic. The whole sales module was built for B2B — an
 * order belongs to a `Customer` with a credit limit, a payment term and a price
 * list, and is placed by a staff member on that customer's behalf. A member of
 * the public has none of those. Whether a B2C order reuses `Order` with a
 * different customer type, or is its own thing, is the first design decision of
 * WS3.5 and it is a client conversation, not a coding one.
 */
export function CheckoutPage() {
  const navigate = useNavigate();
  const cart = useCart();
  const [selectedAddress, setSelectedAddress] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>('cod');

  useEffect(() => {
    // Read selected address from localStorage (synced with AddressesPage)
    const storedAddrsStr = localStorage.getItem('mockAddresses');
    const storedSelectedId = localStorage.getItem('selectedAddressId') || 'addr-1';
    if (storedAddrsStr) {
      const addrs = JSON.parse(storedAddrsStr);
      const found = addrs.find((a: any) => a.id === storedSelectedId) || addrs[0];
      setSelectedAddress(found || defaultAddress);
    } else {
      setSelectedAddress(defaultAddress);
    }
  }, []);

  // Price calculations
  const mrpTotal = cart.lines.reduce((sum, l) => sum + (l.mrp || l.displayUnitPrice) * l.quantity, 0);
  const sellingTotal = cart.lines.reduce((sum, l) => sum + l.displayUnitPrice * l.quantity, 0);
  const discount = mrpTotal - sellingTotal;
  const deliveryFee = sellingTotal >= 500 ? 0 : DELIVERY_CHARGE;
  const grandTotal = sellingTotal + deliveryFee;

  const handlePlaceOrder = () => {
    message.success('Order placed successfully! 🎉');
    cart.clear();
    setTimeout(() => navigate('/orders'), 800);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f3f6', paddingBottom: 100 }}>
      {/* Header */}
      <header
        style={{
          background: '#fff',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: 16 }}>
          <ArrowLeftOutlined style={{ fontSize: 20 }} />
        </button>
        <Typography.Text strong style={{ fontSize: 16 }}>Checkout</Typography.Text>
      </header>

      <div style={{ padding: '12px' }}>

        {/* Delivery Address */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <EnvironmentOutlined style={{ color: '#f97316', fontSize: 16 }} />
            <Typography.Text strong style={{ fontSize: 15 }}>Delivery Address</Typography.Text>
          </div>

          {selectedAddress && (
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Typography.Text strong style={{ fontSize: 14 }}>{selectedAddress.name}</Typography.Text>
                  <span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 4, fontSize: 11, color: '#475569', fontWeight: 600 }}>
                    {selectedAddress.type}
                  </span>
                </div>
                <Typography.Text style={{ fontSize: 13, color: '#424242', display: 'block', lineHeight: 1.6 }}>
                  {selectedAddress.addressLine1}, {selectedAddress.addressLine2}<br />
                  {selectedAddress.city}, {selectedAddress.state} - {selectedAddress.pincode}
                </Typography.Text>
                <Typography.Text style={{ fontSize: 13, color: '#424242', display: 'block', marginTop: 4 }}>
                  Phone: <Typography.Text strong>{selectedAddress.phone}</Typography.Text>
                </Typography.Text>
              </div>
              <button
                onClick={() => navigate('/addresses')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: '#f97316', fontSize: 13, fontWeight: 600, flexShrink: 0 }}
              >
                <EditOutlined /> Change
              </button>
            </div>
          )}
        </div>

        {/* Order Items */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <Typography.Text strong style={{ fontSize: 15, display: 'block', marginBottom: 12 }}>
            Order Items ({cart.count})
          </Typography.Text>
          {cart.lines.map((line, idx) => (
            <div key={line.productId}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: 8, background: '#f5f5f5', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {line.imageUrl
                    ? <img src={line.imageUrl} alt={line.productName} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                    : <Typography.Text style={{ fontSize: 10, color: '#aaa', textAlign: 'center', padding: 4 }}>{line.productName}</Typography.Text>
                  }
                </div>
                <div style={{ flex: 1 }}>
                  <Typography.Text strong style={{ fontSize: 13, display: 'block', color: '#212121' }}>{line.productName}</Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>{line.unit} × {line.quantity}</Typography.Text>
                </div>
                <Typography.Text strong style={{ fontSize: 14 }}>{formatInr(line.displayUnitPrice * line.quantity)}</Typography.Text>
              </div>
              {idx < cart.lines.length - 1 && <Divider style={{ margin: '12px 0' }} />}
            </div>
          ))}
        </div>

        {/* Payment Method */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <Typography.Text strong style={{ fontSize: 15, display: 'block', marginBottom: 12 }}>Payment Method</Typography.Text>
          <Radio.Group value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Radio value="cod" style={{ padding: '10px 12px', border: paymentMethod === 'cod' ? '1px solid #f97316' : '1px solid #e0e0e0', borderRadius: 8, background: paymentMethod === 'cod' ? '#fff3ed' : '#fff' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <WalletOutlined style={{ color: '#f97316' }} />
                <Typography.Text strong>Cash on Delivery</Typography.Text>
              </div>
            </Radio>
            <Radio value="upi" style={{ padding: '10px 12px', border: paymentMethod === 'upi' ? '1px solid #f97316' : '1px solid #e0e0e0', borderRadius: 8, background: paymentMethod === 'upi' ? '#fff3ed' : '#fff' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <BankOutlined style={{ color: '#f97316' }} />
                <Typography.Text strong>UPI / Net Banking</Typography.Text>
              </div>
            </Radio>
            <Radio value="card" style={{ padding: '10px 12px', border: paymentMethod === 'card' ? '1px solid #f97316' : '1px solid #e0e0e0', borderRadius: 8, background: paymentMethod === 'card' ? '#fff3ed' : '#fff' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <CreditCardOutlined style={{ color: '#f97316' }} />
                <Typography.Text strong>Credit / Debit Card</Typography.Text>
              </div>
            </Radio>
          </Radio.Group>
        </div>

        {/* Price Breakdown */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <Typography.Text strong style={{ fontSize: 15, display: 'block', marginBottom: 16 }}>Price Details</Typography.Text>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <Typography.Text style={{ color: '#424242', fontSize: 13 }}>Total MRP ({cart.count} items)</Typography.Text>
            <Typography.Text style={{ fontSize: 13 }}>{formatInr(mrpTotal)}</Typography.Text>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <Typography.Text style={{ color: '#424242', fontSize: 13 }}>Discount on MRP</Typography.Text>
            <Typography.Text style={{ color: '#16a34a', fontSize: 13 }}>-{formatInr(discount)}</Typography.Text>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <Typography.Text style={{ color: '#424242', fontSize: 13 }}>Delivery Fee</Typography.Text>
            <Typography.Text style={{ color: deliveryFee === 0 ? '#16a34a' : '#212121', fontSize: 13 }}>
              {deliveryFee === 0 ? 'FREE' : formatInr(deliveryFee)}
            </Typography.Text>
          </div>

          <Divider style={{ margin: '12px 0' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Typography.Text strong style={{ fontSize: 15 }}>Total Amount</Typography.Text>
            <Typography.Text strong style={{ fontSize: 16, color: '#212121' }}>{formatInr(grandTotal)}</Typography.Text>
          </div>

          {discount > 0 && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircleFilled style={{ color: '#16a34a' }} />
              <Typography.Text style={{ color: '#16a34a', fontSize: 13, fontWeight: 500 }}>
                You're saving {formatInr(discount)} on this order!
              </Typography.Text>
            </div>
          )}
        </div>

      </div>

      {/* Sticky Place Order Button */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: '#fff',
          padding: '12px 16px',
          boxShadow: '0 -2px 8px rgba(0,0,0,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16
        }}
      >
        <div>
          <Typography.Text strong style={{ fontSize: 18, color: '#212121' }}>{formatInr(grandTotal)}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>{cart.count} items</Typography.Text>
        </div>
        <Button
          type="primary"
          size="large"
          style={{ background: '#f97316', borderColor: '#f97316', flex: 1, height: 48, fontWeight: 600, fontSize: 15 }}
          onClick={handlePlaceOrder}
        >
          Place Order
        </Button>
      </div>
    </div>
  );
}
