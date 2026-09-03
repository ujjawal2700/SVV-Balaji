import { CheckCircleFilled, WarningOutlined, ClockCircleFilled, ArrowLeftOutlined, DeleteOutlined, PlusOutlined, MinusOutlined, HeartOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Button, Divider, Empty, Spin, Typography, message, Tag } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../cart/useCart';

function formatInr(value: number): string {
  return `₹${value.toLocaleString('en-IN')}`;
}

export function CartPage() {
  const navigate = useNavigate();
  const cart = useCart();
  
  if (cart.lines.length === 0) {
    return (
      <div style={{ minHeight: '100vh', background: '#f1f3f6', display: 'flex', flexDirection: 'column' }}>
        <header
          style={{
            background: '#fff',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
            position: 'sticky',
            top: 0,
            zIndex: 100
          }}
        >
          <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: 16 }}>
            <ArrowLeftOutlined style={{ fontSize: 20 }} />
          </button>
          <Typography.Text strong style={{ fontSize: 16 }}>My Cart</Typography.Text>
        </header>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Empty
            description={<Typography.Text type="secondary">Your cart is empty!</Typography.Text>}
          >
            <Button type="primary" style={{ background: '#f97316', borderColor: '#f97316' }} onClick={() => navigate('/')}>
              Shop Now
            </Button>
          </Empty>
        </div>
      </div>
    );
  }

  // Calculate Subtotal (sum of selling price), Total MRP, and Discount
  const totalMrp = cart.lines.reduce((acc, line) => acc + ((line.mrp || line.displayUnitPrice || 0) * line.quantity), 0);
  const subtotal = cart.indicativeTotal || 0;
  const productDiscount = totalMrp - subtotal;
  const gst = Math.floor(subtotal * 0.05); // Mock 5% GST
  const couponDiscount = 50; // Mock coupon
  
  const deliveryCharge = cart.deliveryInfo ? cart.deliveryInfo.charge : (subtotal > 500 ? 0 : 50);
  const grandTotal = subtotal + gst + deliveryCharge - couponDiscount;
  const totalSavings = productDiscount + couponDiscount + (deliveryCharge === 0 && subtotal <= 500 ? 50 : 0);

  // Mock delivery dates
  const today = new Date();
  const tmrw = new Date(today);
  tmrw.setDate(tmrw.getDate() + 1);
  const dayStr = tmrw.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const [selectedAddress, setSelectedAddress] = useState<any>(null);

  useEffect(() => {
    // Read from localStorage to sync with AddressesPage
    const storedAddrsStr = localStorage.getItem('mockAddresses');
    const storedSelectedId = localStorage.getItem('selectedAddressId') || 'addr-1';
    if (storedAddrsStr) {
      const addrs = JSON.parse(storedAddrsStr);
      const selected = addrs.find((a: any) => a.id === storedSelectedId) || addrs[0];
      setSelectedAddress(selected);
    } else {
      // Default fallback if AddressesPage was never visited
      setSelectedAddress({
        type: 'Home',
        addressLine1: '123 Main St, Apartment 4B',
        addressLine2: 'Andheri West',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001'
      });
    }
  }, []);

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
          zIndex: 100
        }}
      >
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: 16 }}>
          <ArrowLeftOutlined style={{ fontSize: 20 }} />
        </button>
        <Typography.Text strong style={{ fontSize: 16 }}>My Cart ({cart.count} items)</Typography.Text>
      </header>

      {/* Address Details */}
      {selectedAddress && (
        <div style={{ background: '#fff', padding: '16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Typography.Text strong style={{ fontSize: 14 }}>Deliver to:</Typography.Text>
              <Tag color="orange" style={{ margin: 0, borderRadius: 12, fontWeight: 600 }}>{selectedAddress.type}</Tag>
            </div>
            <Typography.Text style={{ color: '#616161', fontSize: 13, display: 'block', lineHeight: 1.4 }}>
              {selectedAddress.addressLine1}, {selectedAddress.addressLine2}<br />{selectedAddress.city}, {selectedAddress.state} {selectedAddress.pincode}
            </Typography.Text>
          </div>
          <Button size="small" style={{ color: '#f97316', borderColor: '#f97316', borderRadius: 4 }} onClick={() => navigate('/addresses')}>
            Change
          </Button>
        </div>
      )}

      {/* Cart Items */}
      <div style={{ padding: '8px 0' }}>
        {cart.lines.map((line) => {
          const lineMrp = line.mrp || line.displayUnitPrice || 0;
          const lineSellingPrice = line.displayUnitPrice || 0;
          const discountPercent = lineMrp > 0 ? Math.round(((lineMrp - lineSellingPrice) / lineMrp) * 100) : 0;

          return (
            <div key={line.productId} style={{ background: '#fff', padding: '16px', marginBottom: 8, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', gap: 16 }}>
                
                {/* Details on Left */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <Typography.Text strong style={{ fontSize: 14, color: '#212121', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {line.productName}
                  </Typography.Text>
                  
                  <Typography.Text type="secondary" style={{ fontSize: 12, marginTop: 4 }}>
                    {line.unit} {line.packSize ? `(${line.packSize})` : ''}
                  </Typography.Text>
                  
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
                    <Typography.Text strong style={{ fontSize: 16, color: '#212121' }}>
                      {formatInr(lineSellingPrice)}
                    </Typography.Text>
                    {discountPercent > 0 && (
                      <>
                        <Typography.Text delete style={{ fontSize: 13, color: '#878787' }}>
                          {formatInr(lineMrp)}
                        </Typography.Text>
                        <Typography.Text strong style={{ fontSize: 12, color: '#16a34a' }}>
                          {discountPercent}% OFF
                        </Typography.Text>
                      </>
                    )}
                  </div>
                  
                  <Typography.Text style={{ fontSize: 12, color: '#424242', marginTop: 8 }}>
                    Delivered by {cart.deliveryInfo?.eta || `Tomorrow, ${dayStr}`}
                  </Typography.Text>
                </div>

                {/* Image & Controls on Right */}
                <div style={{ width: 80, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ width: 80, height: 80, background: '#f5f5f5', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 12 }}>
                    {line.imageUrl ? (
                      <img src={line.imageUrl} alt={line.productName} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }} />
                    ) : (
                      <Typography.Text type="secondary" style={{ fontSize: 10 }}>No Image</Typography.Text>
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #d3d3d3', borderRadius: 6, background: '#fff' }}>
                    <Button 
                      type="text" 
                      icon={<MinusOutlined style={{ fontSize: 10 }} />} 
                      onClick={() => cart.setQuantity(line.productId, line.quantity - 1)} 
                      style={{ width: 28, minWidth: 28, height: 28, padding: 0 }} 
                    />
                    <Typography.Text strong style={{ width: 24, textAlign: 'center', fontSize: 13, background: '#fcfcfc', borderLeft: '1px solid #d3d3d3', borderRight: '1px solid #d3d3d3', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 28 }}>
                      {line.quantity}
                    </Typography.Text>
                    <Button 
                      type="text" 
                      icon={<PlusOutlined style={{ fontSize: 10 }} />} 
                      onClick={() => cart.setQuantity(line.productId, line.quantity + 1)} 
                      style={{ width: 28, minWidth: 28, height: 28, padding: 0 }} 
                    />
                  </div>
                </div>
              </div>

              <Divider style={{ margin: '12px 0' }} />
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Button 
                  type="text" 
                  icon={<DeleteOutlined />} 
                  onClick={() => cart.remove(line.productId)} 
                  style={{ color: '#878787', padding: 0, height: 'auto', fontSize: 13 }}
                >
                  Remove
                </Button>
                <Button 
                  type="text" 
                  icon={<HeartOutlined />} 
                  onClick={() => {
                    cart.remove(line.productId);
                    message.success('Moved to Wishlist');
                  }} 
                  style={{ color: '#424242', padding: 0, height: 'auto', fontSize: 13 }}
                >
                  Move to Wishlist
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bill Details */}
      <div style={{ background: '#fff', padding: '16px', marginBottom: 8 }}>
        <Typography.Text strong style={{ display: 'block', fontSize: 15, marginBottom: 16 }}>
          Price Breakdown
        </Typography.Text>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <Typography.Text style={{ color: '#424242', fontSize: 13 }}>Total MRP ({cart.count} items)</Typography.Text>
          <Typography.Text style={{ color: '#212121', fontSize: 13 }}>{formatInr(totalMrp)}</Typography.Text>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <Typography.Text style={{ color: '#424242', fontSize: 13 }}>Discount on MRP</Typography.Text>
          <Typography.Text style={{ color: '#16a34a', fontSize: 13 }}>-{formatInr(productDiscount)}</Typography.Text>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <Typography.Text style={{ color: '#424242', fontSize: 13 }}>Coupon Savings</Typography.Text>
          <Typography.Text style={{ color: '#16a34a', fontSize: 13 }}>-{formatInr(couponDiscount)}</Typography.Text>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <Typography.Text style={{ color: '#424242', fontSize: 13 }}>GST / Taxes (5%)</Typography.Text>
          <Typography.Text style={{ color: '#212121', fontSize: 13 }}>{formatInr(gst)}</Typography.Text>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <Typography.Text style={{ color: '#424242', fontSize: 13 }}>Delivery Charge</Typography.Text>
          <Typography.Text style={{ color: deliveryCharge === 0 ? '#16a34a' : '#212121', fontSize: 13 }}>
            {deliveryCharge === 0 ? 'FREE' : formatInr(deliveryCharge)}
          </Typography.Text>
        </div>
        
        <Divider style={{ margin: '16px 0' }} />
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography.Text strong style={{ color: '#212121', fontSize: 16 }}>Grand Total</Typography.Text>
          <Typography.Text strong style={{ color: '#212121', fontSize: 18 }}>{formatInr(grandTotal)}</Typography.Text>
        </div>
        
        {totalSavings > 0 && (
          <div style={{ marginTop: 16, padding: '10px 12px', background: '#dcfce7', borderRadius: 6 }}>
             <Typography.Text strong style={{ color: '#15803d', fontSize: 13 }}>
               You saved {formatInr(totalSavings)} on this order 🎉
             </Typography.Text>
          </div>
        )}
        
        <div style={{ marginTop: 12, padding: '8px 0', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
           <SafetyCertificateOutlined style={{ color: '#878787', fontSize: 16 }} />
           <Typography.Text style={{ color: '#878787', fontSize: 12 }}>Safe and Secure Payments.</Typography.Text>
        </div>
      </div>

      {/* Sticky Bottom Checkout Bar */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: '#fff',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 -2px 10px rgba(0,0,0,0.1)',
          zIndex: 100
        }}
      >
        <div>
          <Typography.Text style={{ display: 'block', fontSize: 12, color: '#878787' }}>Total Amount</Typography.Text>
          <Typography.Text strong style={{ fontSize: 18, color: '#212121', lineHeight: 1 }}>{formatInr(grandTotal)}</Typography.Text>
        </div>
        <Button 
          type="primary" 
          size="large"
          style={{ background: '#f97316', borderColor: '#f97316', fontWeight: 600, width: 180, borderRadius: 8 }}
          onClick={() => navigate('/checkout')}
        >
          Place Order
        </Button>
      </div>
    </div>
  );
}
