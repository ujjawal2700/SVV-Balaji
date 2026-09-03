import {
  ArrowLeftOutlined,
  CheckCircleFilled,
  CloseCircleOutlined,
  CustomerServiceOutlined,
  DownloadOutlined,
  ExclamationCircleOutlined,
  MessageOutlined,
  PhoneOutlined,
  QuestionCircleOutlined,
  RightOutlined,
  StarFilled,
} from '@ant-design/icons';
import { Button, Divider, Drawer, Rate, Typography, message } from 'antd';
import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';

function formatInr(value: number): string {
  return `₹${value.toLocaleString('en-IN')}`;
}

const allMockOrders = [
  {
    id: 'ORD-89237492',
    date: 'Today, 2:30 PM',
    status: 'IN_TRANSIT',
    statusText: 'Arriving Today by 7:30 PM',
    deliveredDate: null,
    total: 1450,
    itemCount: 3,
    items: [
      { id: 'premium-atta', name: 'Aashirvaad Shudh Chakki Atta (10kg)', image: '/images/cat_atta_flour.jpg', price: 450, mrp: 480, quantity: 1, variant: '10kg Bag' },
      { id: 'aloo-bhujia-500g', name: 'Aloo Bhujia (500g)', image: '/images/aloo_bhujia.jpg', price: 180, mrp: 200, quantity: 2, variant: '500g Box' },
      { id: 'classic-namkeen-100x20', name: 'Classic Namkeen (100g x 20)', image: '/images/classic_namkeen.jpg', price: 620, mrp: 680, quantity: 1, variant: '100g x 20' },
    ],
    deliveryDetails: {
      name: 'Rahul Sharma',
      phone: '+91 98765 43210',
      address: '123 Main St, Apartment 4B, Mumbai, Maharashtra 400001',
    },
    priceDetails: { mrpTotal: 1560, discount: 110, deliveryFee: 0, grandTotal: 1450 },
  },
  {
    id: 'ORD-76342891',
    date: '28 Aug, 2026',
    status: 'DELIVERED',
    statusText: 'Delivered on 30 Aug, 2026',
    deliveredDate: '30 Aug, 2026 at 2:15 PM',
    total: 580,
    itemCount: 1,
    items: [
      { id: 'premium-atta', name: 'Aashirvaad Shudh Chakki Atta (10kg)', image: '/images/cat_atta_flour.jpg', price: 450, mrp: 480, quantity: 1, variant: '10kg Bag' },
    ],
    deliveryDetails: {
      name: 'Rahul Sharma',
      phone: '+91 98765 43210',
      address: '123 Main St, Apartment 4B, Mumbai, Maharashtra 400001',
    },
    priceDetails: { mrpTotal: 480, discount: 30, deliveryFee: 0, grandTotal: 450 },
  },
  {
    id: 'ORD-54328912',
    date: '15 Aug, 2026',
    status: 'CANCELLED',
    statusText: 'Cancelled on 15 Aug, 2026',
    deliveredDate: null,
    total: 300,
    itemCount: 2,
    items: [
      { id: 'aloo-bhujia-500g', name: 'Aloo Bhujia (500g)', image: '/images/aloo_bhujia.jpg', price: 180, mrp: 200, quantity: 1, variant: '500g Box' },
      { id: 'classic-namkeen-100x20', name: 'Classic Namkeen (100g x 20)', image: '/images/classic_namkeen.jpg', price: 180, mrp: 200, quantity: 1, variant: '100g x 20' },
    ],
    deliveryDetails: {
      name: 'Rahul Sharma',
      phone: '+91 98765 43210',
      address: '123 Main St, Apartment 4B, Mumbai, Maharashtra 400001',
    },
    priceDetails: { mrpTotal: 400, discount: 40, deliveryFee: 49, grandTotal: 409 },
  },
];

const mockRecommendations = [
  { id: 'aloo-bhujia-500g', name: 'Aloo Bhujia (500g)', image: '/images/aloo_bhujia.jpg', price: 180, mrp: 200 },
  { id: 'classic-namkeen-100x20', name: 'Classic Namkeen (1kg)', image: '/images/classic_namkeen.jpg', price: 250, mrp: 300 },
  { id: 'santa-cruz', name: 'Santa Cruz Fruit Spread', image: '/images/santa_cruz.jpg', price: 750, mrp: 850 },
];

export function OrderTrackingPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [helpVisible, setHelpVisible] = useState(false);

  // Look up the order by ID, fallback to first order
  const order = allMockOrders.find(o => o.id === orderId) || allMockOrders[0];
  const { deliveryDetails, priceDetails } = order;

  return (
    <div style={{ minHeight: '100vh', background: '#f1f3f6', paddingBottom: 40 }}>
      {/* Header */}
      <header
        style={{
          background: '#fff',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
          position: 'sticky',
          top: 0,
          zIndex: 100
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: 16 }}>
            <ArrowLeftOutlined style={{ fontSize: 20 }} />
          </button>
          <Typography.Text strong style={{ fontSize: 16 }}>Order Details</Typography.Text>
        </div>
        <Typography.Text 
          style={{ color: '#f97316', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
          onClick={() => setHelpVisible(true)}
        >
          Help
        </Typography.Text>
      </header>

      <div style={{ padding: '8px 12px' }}>
        
        {/* Order Info Banner */}
        <div style={{ background: '#fff', padding: '16px', borderRadius: 12, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
           <Typography.Text style={{ fontSize: 13, color: '#878787', display: 'block', marginBottom: 4 }}>Order ID: {order.id}</Typography.Text>
           <Typography.Text style={{ fontSize: 13, color: '#878787', display: 'block' }}>Placed on: {order.date}</Typography.Text>
           <Divider style={{ margin: '12px 0' }} />
           <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
             {order.status === 'DELIVERED' && <CheckCircleFilled style={{ color: '#16a34a', fontSize: 24, marginTop: 4 }} />}
             {order.status === 'IN_TRANSIT' && <CheckCircleFilled style={{ color: '#f97316', fontSize: 24, marginTop: 4 }} />}
             {order.status === 'CANCELLED' && <CheckCircleFilled style={{ color: '#dc2626', fontSize: 24, marginTop: 4 }} />}
             <div>
               <Typography.Text strong style={{ fontSize: 16, color: order.status === 'DELIVERED' ? '#16a34a' : order.status === 'CANCELLED' ? '#dc2626' : '#f97316', display: 'block' }}>
                 {order.statusText}
               </Typography.Text>
               {order.deliveredDate && (
                 <Typography.Text style={{ fontSize: 13, color: '#424242' }}>On {order.deliveredDate}</Typography.Text>
               )}
             </div>
           </div>
        </div>

        {/* Product Details */}
        <div style={{ background: '#fff', padding: '16px', borderRadius: 12, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          {order.items.map((item, idx) => (
            <div key={item.id}>
              <Link to={`/product-detail/${item.id}`} style={{ display: 'flex', gap: 16, textDecoration: 'none', color: 'inherit' }}>
                 <div style={{ width: 80, height: 80, borderRadius: 8, background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                   <img src={item.image} alt={item.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                 </div>
                 <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                   <Typography.Text strong style={{ fontSize: 14, color: '#212121', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                     {item.name}
                   </Typography.Text>
                   <Typography.Text type="secondary" style={{ fontSize: 12, marginTop: 4 }}>
                     {item.variant} • Qty: {item.quantity}
                   </Typography.Text>
                   <div style={{ marginTop: 8 }}>
                     <Typography.Text strong style={{ fontSize: 15, color: '#212121' }}>{formatInr(item.price * item.quantity)}</Typography.Text>
                     {item.mrp && item.mrp > item.price && (
                       <Typography.Text delete style={{ fontSize: 12, color: '#878787', marginLeft: 6 }}>{formatInr(item.mrp * item.quantity)}</Typography.Text>
                     )}
                   </div>
                 </div>
              </Link>
              {idx < order.items.length - 1 && <Divider style={{ margin: '14px 0' }} />}
            </div>
          ))}
          
          <Divider style={{ margin: '16px 0' }} />
          
          {/* Rating Section — only for delivered orders */}
          {order.status === 'DELIVERED' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0' }}>
              <Typography.Text strong style={{ fontSize: 15, marginBottom: 12 }}>Rate your experience</Typography.Text>
              <Rate 
                 character={<StarFilled style={{ fontSize: 32 }} />} 
                 onChange={(val) => message.success(`Thanks for your ${val}-star rating!`)} 
              />
            </div>
          )}
        </div>

        {/* Delivery Details */}
        <div style={{ background: '#fff', padding: '16px', borderRadius: 12, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <Typography.Text strong style={{ display: 'block', fontSize: 15, marginBottom: 12 }}>Delivery Details</Typography.Text>
          <Typography.Text strong style={{ display: 'block', fontSize: 14, color: '#212121', marginBottom: 4 }}>{deliveryDetails.name}</Typography.Text>
          <Typography.Text style={{ display: 'block', fontSize: 13, color: '#424242', marginBottom: 4 }}>{deliveryDetails.address}</Typography.Text>
          <Typography.Text style={{ display: 'block', fontSize: 13, color: '#424242' }}>Phone: {deliveryDetails.phone}</Typography.Text>
        </div>

        {/* Price Details */}
        <div style={{ background: '#fff', padding: '16px', borderRadius: 12, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <Typography.Text strong style={{ display: 'block', fontSize: 15, marginBottom: 16 }}>Price Details</Typography.Text>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <Typography.Text style={{ color: '#424242', fontSize: 13 }}>Total MRP</Typography.Text>
            <Typography.Text style={{ color: '#212121', fontSize: 13 }}>{formatInr(priceDetails.mrpTotal)}</Typography.Text>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <Typography.Text style={{ color: '#424242', fontSize: 13 }}>Discount</Typography.Text>
            <Typography.Text style={{ color: '#16a34a', fontSize: 13 }}>-{formatInr(priceDetails.discount)}</Typography.Text>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <Typography.Text style={{ color: '#424242', fontSize: 13 }}>Delivery Fee</Typography.Text>
            <Typography.Text style={{ color: priceDetails.deliveryFee === 0 ? '#16a34a' : '#212121', fontSize: 13 }}>
              {priceDetails.deliveryFee === 0 ? 'FREE' : formatInr(priceDetails.deliveryFee)}
            </Typography.Text>
          </div>
          
          <Divider style={{ margin: '12px 0' }} />
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography.Text strong style={{ color: '#212121', fontSize: 15 }}>Grand Total</Typography.Text>
            <Typography.Text strong style={{ color: '#212121', fontSize: 15 }}>{formatInr(priceDetails.grandTotal)}</Typography.Text>
          </div>
          
          <Button type="dashed" block icon={<DownloadOutlined />} style={{ marginTop: 16, color: '#f97316', borderColor: '#f97316' }}>
            Download Invoice
          </Button>
        </div>

        {/* Recommended Products */}
        <div style={{ marginTop: 24, marginBottom: 16 }}>
          <Typography.Text strong style={{ display: 'block', fontSize: 16, marginBottom: 12, paddingLeft: 4 }}>
            Products For You
          </Typography.Text>
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, margin: '0 -12px', paddingLeft: 12, paddingRight: 12 }} className="hide-scrollbar">
             {mockRecommendations.map(rec => (
               <div key={rec.id} style={{ width: 140, flexShrink: 0, background: '#fff', borderRadius: 8, padding: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column' }}>
                 <Link to={`/product-detail/${rec.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                   <div style={{ width: '100%', height: 100, background: '#f5f5f5', borderRadius: 8, marginBottom: 12, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                     <img src={rec.image} alt={rec.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                   </div>
                   <Typography.Text strong style={{ display: 'block', fontSize: 13, color: '#212121', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                     {rec.name}
                   </Typography.Text>
                   <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 12 }}>
                     <Typography.Text strong style={{ fontSize: 14 }}>{formatInr(rec.price)}</Typography.Text>
                     <Typography.Text delete style={{ fontSize: 11, color: '#878787' }}>{formatInr(rec.mrp)}</Typography.Text>
                   </div>
                 </Link>
                 <Button size="small" block style={{ color: '#f97316', borderColor: '#f97316', fontWeight: 600, marginTop: 'auto' }}>
                   ADD
                 </Button>
               </div>
             ))}
          </div>
        </div>

      </div>
      {/* Help Drawer */}
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CustomerServiceOutlined style={{ color: '#f97316', fontSize: 18 }} />
            <Typography.Text strong style={{ fontSize: 16 }}>Help & Support</Typography.Text>
          </div>
        }
        placement="bottom"
        open={helpVisible}
        onClose={() => setHelpVisible(false)}
        height="auto"
        styles={{ body: { padding: 0 }, header: { borderBottom: '1px solid #f0f0f0', padding: '16px 20px' } }}
      >
        <div style={{ padding: '8px 0 24px' }}>
          {/* Order ID context */}
          <div style={{ padding: '10px 20px', background: '#f8fafc', borderBottom: '1px solid #f0f0f0', marginBottom: 8 }}>
            <Typography.Text style={{ fontSize: 12, color: '#878787' }}>Getting help for Order ID: <Typography.Text strong style={{ color: '#424242' }}>{order.id}</Typography.Text></Typography.Text>
          </div>

          {[
            {
              icon: <ExclamationCircleOutlined style={{ color: '#f97316', fontSize: 20 }} />,
              title: 'Raise a Complaint',
              subtitle: 'Wrong item, damaged, or missing?',
              action: () => { setHelpVisible(false); message.info('Complaint form coming soon!'); }
            },
            {
              icon: <PhoneOutlined style={{ color: '#3b82f6', fontSize: 20 }} />,
              title: 'Call Support',
              subtitle: 'Speak to us at +91 98765 00000',
              action: () => { window.location.href = 'tel:+919876500000'; }
            },
            {
              icon: <MessageOutlined style={{ color: '#10b981', fontSize: 20 }} />,
              title: 'Live Chat',
              subtitle: 'Chat with us — typically replies in 2 mins',
              action: () => { setHelpVisible(false); message.info('Live chat coming soon!'); }
            },
            {
              icon: <QuestionCircleOutlined style={{ color: '#8b5cf6', fontSize: 20 }} />,
              title: 'FAQs',
              subtitle: 'Delivery, returns, refunds and more',
              action: () => { setHelpVisible(false); message.info('FAQs coming soon!'); }
            },
            ...(order.status !== 'DELIVERED' && order.status !== 'CANCELLED'
              ? [{
                  icon: <CloseCircleOutlined style={{ color: '#dc2626', fontSize: 20 }} />,
                  title: 'Cancel Order',
                  subtitle: 'Request cancellation for this order',
                  action: () => { setHelpVisible(false); message.warning('Cancellation request submitted!'); }
                }]
              : []
            ),
          ].map((item, idx, arr) => (
            <div key={idx}>
              <button
                onClick={item.action}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 16,
                  padding: '14px 20px', background: 'none', border: 'none',
                  cursor: 'pointer', textAlign: 'left'
                }}
              >
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {item.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <Typography.Text strong style={{ display: 'block', fontSize: 14, color: '#212121' }}>{item.title}</Typography.Text>
                  <Typography.Text style={{ fontSize: 12, color: '#878787' }}>{item.subtitle}</Typography.Text>
                </div>
                <RightOutlined style={{ color: '#d1d5db', fontSize: 12 }} />
              </button>
              {idx < arr.length - 1 && <Divider style={{ margin: '0 20px', width: 'auto', minWidth: 'auto' }} />}
            </div>
          ))}
        </div>
      </Drawer>
    </div>
  );
}
