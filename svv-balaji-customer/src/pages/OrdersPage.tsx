import {
  ArrowLeftOutlined,
  CheckCircleFilled,
  ClockCircleFilled,
  CloseCircleFilled,
  FilterOutlined,
  RightOutlined,
  SearchOutlined,
  StarOutlined
} from '@ant-design/icons';
import { Button, Carousel, Divider, Drawer, Input, Modal, Radio, Tag, Typography, message } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../cart/useCart';
import { currentProductCatalog } from '../mock/homeMockData';

function formatInr(value: number): string {
  return `₹${value.toLocaleString('en-IN')}`;
}

const mockOrders = [
  {
    id: 'ORD-89237492',
    date: 'Today, 2:30 PM',
    status: 'IN_TRANSIT',
    statusText: 'Arriving Today by 7:30 PM',
    total: 1450,
    itemCount: 4,
    items: [
      { productId: 'premium-atta', name: 'Aashirvaad Shudh Chakki Atta (10kg)', unit: '10kg Bag', price: 450, mrp: 480, image: 'https://placehold.co/100x100/f5f5f5/878787?text=Atta' },
      { productId: 'aloo-bhujia-500g', name: 'Aloo Bhujia (500g)', unit: '500g Box', price: 180, mrp: 200, image: 'https://placehold.co/100x100/f5f5f5/878787?text=Snack' },
      { productId: 'tata-salt', name: 'Tata Salt (1kg)', unit: '1kg Pack', price: 25, mrp: 30, image: 'https://placehold.co/100x100/f5f5f5/878787?text=Salt' },
    ]
  },
  {
    id: 'ORD-76342891',
    date: '28 Aug, 2026',
    status: 'DELIVERED',
    statusText: 'Delivered on 30 Aug, 2026',
    total: 580,
    itemCount: 1,
    items: [
      { productId: 'premium-atta', name: 'Aashirvaad Shudh Chakki Atta (10kg)', unit: '10kg Bag', price: 450, mrp: 480, image: 'https://placehold.co/100x100/f5f5f5/878787?text=Atta' }
    ]
  },
  {
    id: 'ORD-54328912',
    date: '15 Aug, 2026',
    status: 'CANCELLED',
    statusText: 'Cancelled on 15 Aug, 2026',
    total: 300,
    itemCount: 2,
    items: [
      { productId: 'aloo-bhujia-500g', name: 'Aloo Bhujia (500g)', unit: '500g Box', price: 180, mrp: 200, image: 'https://placehold.co/100x100/f5f5f5/878787?text=Snack' },
      { productId: 'tata-salt', name: 'Tata Salt (1kg)', unit: '1kg Pack', price: 25, mrp: 30, image: 'https://placehold.co/100x100/f5f5f5/878787?text=Salt' }
    ]
  }
];

export function OrdersPage() {
  const navigate = useNavigate();
  const cart = useCart();
  const [filterVisible, setFilterVisible] = useState(false);
  const [reorderModal, setReorderModal] = useState<{ visible: boolean; order: typeof mockOrders[0] | null }>({ visible: false, order: null });

  // Build enriched item list with current price/stock info
  const getEnrichedItems = (order: typeof mockOrders[0]) =>
    order.items.map(item => {
      const current = currentProductCatalog[item.productId];
      const priceChanged = current && current.price !== item.price;
      const isOOS = current?.stockStatus === 'OUT_OF_STOCK';
      return { ...item, current, priceChanged, isOOS };
    });

  const handleReorderClick = (e: React.MouseEvent, order: typeof mockOrders[0]) => {
    e.stopPropagation();
    setReorderModal({ visible: true, order });
  };

  const handleConfirmReorder = () => {
    if (!reorderModal.order) return;
    const enriched = getEnrichedItems(reorderModal.order);
    const available = enriched.filter(i => !i.isOOS);
    const oosCount = enriched.length - available.length;

    available.forEach(item => {
      const livePrice = item.current?.price ?? item.price;
      const liveMrp = item.current?.mrp ?? item.mrp;
      cart.add({
        productId: item.productId,
        productName: item.name,
        unit: item.unit,
        displayUnitPrice: livePrice,
        imageUrl: item.image,
        mrp: liveMrp,
      });
    });

    setReorderModal({ visible: false, order: null });

    if (oosCount > 0) {
      message.warning(`${available.length} item(s) added to cart. ${oosCount} out-of-stock item(s) were skipped.`);
    } else {
      message.success('All items added to cart with latest prices!');
    }
    navigate('/cart');
  };
  
  // Mock filter states
  const [statusFilter, setStatusFilter] = useState('all');
  const [timeFilter, setTimeFilter] = useState('all_time');

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'IN_TRANSIT':
        return { color: '#f97316', icon: <ClockCircleFilled style={{ color: '#f97316' }} /> };
      case 'DELIVERED':
        return { color: '#16a34a', icon: <CheckCircleFilled style={{ color: '#16a34a' }} /> };
      case 'CANCELLED':
        return { color: '#dc2626', icon: <CloseCircleFilled style={{ color: '#dc2626' }} /> };
      default:
        return { color: '#878787', icon: null };
    }
  };

  const handleApplyFilters = () => {
    setFilterVisible(false);
    message.success('Filters applied');
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f3f6', paddingBottom: 40 }}>
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
        <Typography.Text strong style={{ fontSize: 16 }}>My Orders</Typography.Text>
      </header>

      {/* Offers Carousel */}
      <div style={{ background: '#fff', padding: '12px 16px', marginBottom: 8 }}>
        <Carousel autoplay dotPosition="bottom" effect="fade">
          <div>
            <div style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', borderRadius: 8, padding: '16px', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <Typography.Text strong style={{ color: '#fff', fontSize: 16 }}>Get 20% Off Your Next Order!</Typography.Text>
              <Typography.Text style={{ color: '#fff', fontSize: 12, opacity: 0.9, marginTop: 4 }}>Use code: REORDER20</Typography.Text>
            </div>
          </div>
          <div>
             <div style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', borderRadius: 8, padding: '16px', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <Typography.Text strong style={{ color: '#fff', fontSize: 16 }}>Free Delivery Weekend 🚚</Typography.Text>
              <Typography.Text style={{ color: '#fff', fontSize: 12, opacity: 0.9, marginTop: 4 }}>Valid on all orders above ₹500</Typography.Text>
            </div>
          </div>
        </Carousel>
      </div>

      {/* Search & Filter Bar */}
      <div style={{ padding: '0 12px', marginBottom: 12, display: 'flex', gap: 8 }}>
        <Input 
          placeholder="Search your orders..." 
          prefix={<SearchOutlined style={{ color: '#a3a3a3' }} />}
          style={{ flex: 1, borderRadius: 8, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
        />
        <Button 
          icon={<FilterOutlined />} 
          style={{ borderRadius: 8, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', color: '#424242' }}
          onClick={() => setFilterVisible(true)}
        >
          Filter
        </Button>
      </div>

      {/* Orders List */}
      <div style={{ padding: '0 12px' }}>
        {mockOrders.map((order) => {
          const statusConfig = getStatusConfig(order.status);
          
          return (
            <div 
              key={order.id} 
              style={{ background: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', cursor: 'pointer' }}
              onClick={() => navigate(`/orders/${order.id}`)}
            >
              
              {/* Top Row: Status */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {statusConfig.icon}
                  <Typography.Text strong style={{ color: statusConfig.color, fontSize: 14 }}>
                    {order.statusText}
                  </Typography.Text>
                </div>
                <RightOutlined style={{ color: '#878787', fontSize: 12 }} />
              </div>
              
              <Divider style={{ margin: '0 0 12px 0' }} />
              
              {/* Items Row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                  {/* Images cascade */}
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {order.items.slice(0, 3).map((item, idx) => (
                      <div 
                        key={idx} 
                        style={{ 
                          width: 48, 
                          minWidth: 48,
                          height: 48, 
                          borderRadius: 8, 
                          background: '#fff', 
                          border: '1px solid #e0e0e0',
                          marginLeft: idx > 0 ? -16 : 0, // overlap effect
                          zIndex: 3 - idx,
                          overflow: 'hidden',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}
                      >
                         <img src={item.image} alt={item.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                      </div>
                    ))}
                    {order.itemCount > 3 && (
                      <div 
                        style={{ 
                          width: 48, 
                          minWidth: 48,
                          height: 48, 
                          borderRadius: 8, 
                          background: '#f1f5f9', 
                          border: '1px solid #e2e8f0',
                          marginLeft: -16,
                          zIndex: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}
                      >
                         <Typography.Text strong style={{ fontSize: 12, color: '#64748b' }}>
                           +{order.itemCount - 3}
                         </Typography.Text>
                      </div>
                    )}
                  </div>
                  
                  {/* Summary Text */}
                  <div style={{ marginLeft: 8, display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                     <Typography.Text strong style={{ fontSize: 14, color: '#212121', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                       {order.items[0].name}
                     </Typography.Text>
                     {order.itemCount > 1 && (
                       <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                         + {order.itemCount - 1} more item{order.itemCount - 1 > 1 ? 's' : ''}
                       </Typography.Text>
                     )}
                  </div>
                </div>
              </div>
              
              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                 <div>
                   <Typography.Text style={{ fontSize: 12, color: '#878787', display: 'block' }}>Order ID: {order.id}</Typography.Text>
                   <Typography.Text style={{ fontSize: 12, color: '#878787', display: 'block' }}>Placed on: {order.date}</Typography.Text>
                 </div>
                 <Typography.Text strong style={{ fontSize: 16, color: '#212121' }}>
                   {formatInr(order.total)}
                 </Typography.Text>
              </div>

              <Divider style={{ margin: '16px 0' }} />
              
              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {order.status === 'IN_TRANSIT' && (
                  <Button type="primary" style={{ flex: 1, background: '#f97316', borderColor: '#f97316', fontWeight: 600 }}>
                    Track Order
                  </Button>
                )}
                <Button 
                  style={{ flex: 1, color: '#f97316', borderColor: '#f97316', fontWeight: 600 }}
                  onClick={(e) => handleReorderClick(e, order)}
                >
                  Reorder
                </Button>
                {order.status === 'DELIVERED' && (
                  <Button icon={<StarOutlined />} style={{ flex: 1, color: '#424242', borderColor: '#d3d3d3', fontWeight: 500 }}>
                    Rate & Review
                  </Button>
                )}
              </div>

            </div>
          );
        })}
      </div>

      <div style={{ padding: '24px 0', textAlign: 'center' }}>
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          ~ No more orders ~
        </Typography.Text>
      </div>

      {/* Filter Bottom Drawer */}
      <Drawer
        title="Filter Orders"
        placement="bottom"
        onClose={() => setFilterVisible(false)}
        open={filterVisible}
        height="auto"
        styles={{ header: { borderBottom: '1px solid #f0f0f0', padding: '16px 20px' }, body: { padding: '20px', paddingBottom: 100 } }}
        closeIcon={<CloseCircleFilled style={{ fontSize: 20, color: '#a3a3a3' }} />}
      >
        <div style={{ marginBottom: 24 }}>
          <Typography.Text strong style={{ display: 'block', marginBottom: 12, fontSize: 15 }}>Order Status</Typography.Text>
          <Radio.Group onChange={(e) => setStatusFilter(e.target.value)} value={statusFilter} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Radio value="all">All Orders</Radio>
            <Radio value="in_transit">In Transit</Radio>
            <Radio value="delivered">Delivered</Radio>
            <Radio value="cancelled">Cancelled</Radio>
          </Radio.Group>
        </div>
        
        <div>
          <Typography.Text strong style={{ display: 'block', marginBottom: 12, fontSize: 15 }}>Order Time</Typography.Text>
          <Radio.Group onChange={(e) => setTimeFilter(e.target.value)} value={timeFilter} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Radio value="all_time">Anytime</Radio>
            <Radio value="last_30_days">Last 30 Days</Radio>
            <Radio value="last_6_months">Last 6 Months</Radio>
            <Radio value="2025">2025</Radio>
          </Radio.Group>
        </div>

        {/* Fixed Bottom Actions in Drawer */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#fff', padding: '16px 20px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: 12, boxShadow: '0 -2px 10px rgba(0,0,0,0.05)' }}>
          <Button 
            size="large" 
            style={{ flex: 1, borderRadius: 8 }} 
            onClick={() => setFilterVisible(false)}
          >
            Cancel
          </Button>
          <Button 
            type="primary" 
            size="large" 
            style={{ flex: 1, borderRadius: 8, background: '#f97316', borderColor: '#f97316', fontWeight: 600 }}
            onClick={handleApplyFilters}
          >
            Apply
          </Button>
        </div>
      </Drawer>

      {/* Reorder Price Check Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>Review Before Reordering</span>
          </div>
        }
        open={reorderModal.visible}
        onCancel={() => setReorderModal({ visible: false, order: null })}
        footer={[
          <Button key="cancel" onClick={() => setReorderModal({ visible: false, order: null })}>
            Cancel
          </Button>,
          <Button
            key="confirm"
            type="primary"
            style={{ background: '#f97316', borderColor: '#f97316' }}
            onClick={handleConfirmReorder}
            disabled={reorderModal.order ? getEnrichedItems(reorderModal.order).every(i => i.isOOS) : false}
          >
            Add to Cart
          </Button>
        ]}
      >
        {reorderModal.order && (() => {
          const enriched = getEnrichedItems(reorderModal.order);
          const hasOOS = enriched.some(i => i.isOOS);
          const hasPriceChange = enriched.some(i => i.priceChanged);
          return (
            <div>
              {(hasOOS || hasPriceChange) && (
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
                  <Typography.Text style={{ color: '#c2410c', fontSize: 13 }}>
                    ⚠️ Some items have changed since your last order. Please review before adding.
                  </Typography.Text>
                </div>
              )}
              {enriched.map((item, idx) => {
                const livePrice = item.current?.price ?? item.price;
                const status = item.current?.stockStatus;
                return (
                  <div key={item.productId}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: item.isOOS ? 0.5 : 1 }}>
                      <div style={{ width: 52, height: 52, borderRadius: 8, background: '#f5f5f5', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <img src={item.image} alt={item.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <Typography.Text strong style={{ fontSize: 13, display: 'block' }}>{item.name}</Typography.Text>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                          {/* Price display */}
                          <Typography.Text strong style={{ fontSize: 13, color: item.priceChanged && !item.isOOS ? (livePrice > item.price ? '#dc2626' : '#16a34a') : '#212121' }}>
                            ₹{livePrice}
                          </Typography.Text>
                          {item.priceChanged && !item.isOOS && (
                            <Typography.Text delete style={{ fontSize: 12, color: '#878787' }}>₹{item.price}</Typography.Text>
                          )}
                          {item.priceChanged && !item.isOOS && livePrice > item.price && (
                            <Tag color="red" style={{ margin: 0, fontSize: 11 }}>Price Up</Tag>
                          )}
                          {item.priceChanged && !item.isOOS && livePrice < item.price && (
                            <Tag color="green" style={{ margin: 0, fontSize: 11 }}>Price Down</Tag>
                          )}
                          {/* Stock status */}
                          {item.isOOS && <Tag color="red" style={{ margin: 0, fontSize: 11 }}>Out of Stock</Tag>}
                          {status === 'LOW_STOCK' && !item.isOOS && <Tag color="orange" style={{ margin: 0, fontSize: 11 }}>Low Stock</Tag>}
                        </div>
                      </div>
                    </div>
                    {idx < enriched.length - 1 && <Divider style={{ margin: '12px 0' }} />}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
