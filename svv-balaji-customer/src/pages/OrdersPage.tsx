import {
  ArrowLeftOutlined,
  CheckCircleFilled,
  ClockCircleFilled,
  CloseCircleFilled,
  DownloadOutlined,
  FileTextOutlined,
  FilterOutlined,
  QrcodeOutlined,
  ReloadOutlined,
  RightOutlined,
  SearchOutlined,
  ShoppingOutlined,
  StarOutlined,
  TruckOutlined,
} from '@ant-design/icons';
import {
  Breadcrumb,
  Button,
  Divider,
  Drawer,
  Empty,
  Input,
  Modal,
  Radio,
  Segmented,
  Tag,
  Typography,
  message,
} from 'antd';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../cart/useCart';

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
      { productId: 'premium-atta', name: 'Aashirvaad Shudh Chakki Atta (10kg)', unit: '10kg Bag', price: 450, mrp: 480, image: '/images/premium_atta.jpg' },
      { productId: 'aloo-bhujia-500g', name: 'Aloo Bhujia (500g)', unit: '500g Box', price: 180, mrp: 200, image: '/images/aloo_bhujia.jpg' },
      { productId: 'cat-spices', name: 'Desi Tokri Whole Turmeric (500g)', unit: '500g Pack', price: 120, mrp: 140, image: '/images/cat_spices.jpg' },
      { productId: 'tata-salt', name: 'Tata Salt (1kg)', unit: '1kg Pack', price: 25, mrp: 30, image: '/images/classic_namkeen.jpg' },
    ],
  },
  {
    id: 'ORD-76342891',
    date: '28 Aug, 2026',
    status: 'DELIVERED',
    statusText: 'Delivered on 30 Aug, 2026',
    total: 980,
    itemCount: 2,
    items: [
      { productId: 'premium-atta', name: 'Aashirvaad Shudh Chakki Atta (10kg)', unit: '10kg Bag', price: 450, mrp: 480, image: '/images/premium_atta.jpg' },
      { productId: 'aloo-bhujia-500g', name: 'Aloo Bhujia (500g)', unit: '500g Box', price: 180, mrp: 200, image: '/images/aloo_bhujia.jpg' },
    ],
  },
  {
    id: 'ORD-54328912',
    date: '15 Aug, 2026',
    status: 'CANCELLED',
    statusText: 'Cancelled on 15 Aug, 2026',
    total: 300,
    itemCount: 2,
    items: [
      { productId: 'aloo-bhujia-500g', name: 'Aloo Bhujia (500g)', unit: '500g Box', price: 180, mrp: 200, image: '/images/aloo_bhujia.jpg' },
      { productId: 'tata-salt', name: 'Tata Salt (1kg)', unit: '1kg Pack', price: 25, mrp: 30, image: '/images/classic_namkeen.jpg' },
    ],
  },
];

const currentProductCatalog: Record<string, { price: number; mrp: number; stockStatus: 'IN_STOCK' | 'OUT_OF_STOCK' | 'LOW_STOCK' }> = {
  'premium-atta': { price: 470, mrp: 480, stockStatus: 'IN_STOCK' },
  'aloo-bhujia-500g': { price: 170, mrp: 200, stockStatus: 'IN_STOCK' },
  'cat-spices': { price: 120, mrp: 140, stockStatus: 'OUT_OF_STOCK' },
  'tata-salt': { price: 25, mrp: 30, stockStatus: 'LOW_STOCK' },
};

export function OrdersPage() {
  const navigate = useNavigate();
  const cart = useCart();

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterVisible, setFilterVisible] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [timeFilter, setTimeFilter] = useState('all_time');
  const [activeFilterLabel, setActiveFilterLabel] = useState<string | null>(null);

  // Desktop active tab
  const [desktopStatus, setDesktopStatus] = useState<string>('ALL');

  // Tracking Modal State
  const [trackingModal, setTrackingModal] = useState<{ visible: boolean; orderId: string | null }>({
    visible: false,
    orderId: null,
  });

  // Reorder Modal State
  const [reorderModal, setReorderModal] = useState<{ visible: boolean; order: typeof mockOrders[0] | null }>({
    visible: false,
    order: null,
  });

  // Filter apply logic
  const handleApplyFilters = () => {
    let label = '';
    if (statusFilter !== 'all') {
      label += statusFilter === 'in_transit' ? 'In Transit' : statusFilter === 'delivered' ? 'Delivered' : 'Cancelled';
    }
    if (timeFilter !== 'all_time') {
      const timeText = timeFilter === 'last_30_days' ? 'Last 30 Days' : timeFilter === 'last_6_months' ? 'Last 6 Months' : '2025';
      label += label ? ` • ${timeText}` : timeText;
    }
    setActiveFilterLabel(label || null);
    setFilterVisible(false);
  };

  const clearFilters = () => {
    setStatusFilter('all');
    setTimeFilter('all_time');
    setActiveFilterLabel(null);
  };

  // Reorder handlers
  const handleReorderClick = (e: React.MouseEvent, order: typeof mockOrders[0]) => {
    e.stopPropagation();
    setReorderModal({ visible: true, order });
  };

  const getEnrichedItems = (order: typeof mockOrders[0]) => {
    return order.items.map((item) => {
      const current = currentProductCatalog[item.productId];
      const isOOS = current ? current.stockStatus === 'OUT_OF_STOCK' : false;
      const priceChanged = current ? current.price !== item.price : false;
      return { ...item, current, isOOS, priceChanged };
    });
  };

  const handleConfirmReorder = () => {
    if (!reorderModal.order) return;
    const enriched = getEnrichedItems(reorderModal.order);
    let addedCount = 0;
    enriched.forEach((item) => {
      if (!item.isOOS) {
        cart.add(
          {
            productId: item.productId,
            productName: item.name,
            unit: item.unit,
            imageUrl: item.image,
            mrp: item.mrp,
            displayUnitPrice: item.current ? item.current.price : item.price,
          },
          1
        );
        addedCount++;
      }
    });
    setReorderModal({ visible: false, order: null });
    message.success(`Added ${addedCount} items to your cart.`);
    navigate('/cart');
  };

  // Filtered orders for mobile
  const mobileFilteredOrders = mockOrders.filter((order) => {
    const matchesSearch =
      order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.items.some((i) => i.name.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'in_transit' && order.status === 'IN_TRANSIT') ||
      (statusFilter === 'delivered' && order.status === 'DELIVERED') ||
      (statusFilter === 'cancelled' && order.status === 'CANCELLED');
    return matchesSearch && matchesStatus;
  });

  // Filtered orders for desktop
  const desktopFilteredOrders = mockOrders.filter((order) => {
    const matchesSearch =
      order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.items.some((i) => i.name.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = desktopStatus === 'ALL' || order.status === desktopStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div>
      {/* ========================================================================= */}
      {/* 📱 MOBILE VIEW (< 768px): PREVIOUS ORIGINAL MOBILE UI                     */}
      {/* ========================================================================= */}
      <div className="mobile-only" style={{ minHeight: '100vh', background: '#f1f3f6', paddingBottom: 80 }}>
        {/* Header */}
        <header
          className="store-safe-top"
          style={{
            background: '#ffffff',
            borderBottom: '1px solid #e0e0e0',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <button
            onClick={() => navigate(-1)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <ArrowLeftOutlined style={{ fontSize: 18, color: '#212121' }} />
          </button>
          <Typography.Title level={4} style={{ margin: 0, color: '#212121', fontSize: 18, fontWeight: 700 }}>
            My Orders
          </Typography.Title>
        </header>

        {/* Search & Filter Bar */}
        <div style={{ background: '#fff', padding: '12px 16px', borderBottom: '1px solid #e0e0e0', display: 'flex', gap: 10 }}>
          <Input
            placeholder="Search by Order ID or item..."
            prefix={<SearchOutlined style={{ color: '#878787' }} />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            allowClear
            style={{ borderRadius: 8, background: '#f5f5f5', border: 'none' }}
          />
          <Button
            icon={<FilterOutlined />}
            onClick={() => setFilterVisible(true)}
            style={{
              borderRadius: 8,
              borderColor: activeFilterLabel ? '#f97316' : '#d9d9d9',
              color: activeFilterLabel ? '#f97316' : '#212121',
              fontWeight: 500,
            }}
          >
            Filters {activeFilterLabel && '•'}
          </Button>
        </div>

        {/* Active Filter Chips */}
        {activeFilterLabel && (
          <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderBottom: '1px solid #f0f0f0' }}>
            <Typography.Text style={{ fontSize: 12, color: '#878787' }}>Applied:</Typography.Text>
            <Tag
              closable
              onClose={clearFilters}
              color="orange"
              style={{ borderRadius: 12, padding: '2px 8px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
            >
              {activeFilterLabel}
            </Tag>
          </div>
        )}

        {/* Order Cards List */}
        <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mobileFilteredOrders.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <Empty description="No orders found matching your criteria" />
            </div>
          ) : (
            mobileFilteredOrders.map((order) => {
              let statusColor = '#388e3c';
              let statusIcon = <CheckCircleFilled style={{ color: '#388e3c' }} />;
              if (order.status === 'IN_TRANSIT') {
                statusColor = '#f97316';
                statusIcon = <ClockCircleFilled style={{ color: '#f97316' }} />;
              } else if (order.status === 'CANCELLED') {
                statusColor = '#d32f2f';
                statusIcon = <CloseCircleFilled style={{ color: '#d32f2f' }} />;
              }

              return (
                <div
                  key={order.id}
                  onClick={() => navigate(`/order-tracking/${order.id}`)}
                  style={{
                    background: '#ffffff',
                    borderRadius: 8,
                    padding: '16px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    cursor: 'pointer',
                  }}
                >
                  {/* Card Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {statusIcon}
                      <Typography.Text strong style={{ color: statusColor, fontSize: 14 }}>
                        {order.statusText}
                      </Typography.Text>
                    </div>
                    <RightOutlined style={{ color: '#878787', fontSize: 12 }} />
                  </div>

                  {/* Product Details & Images */}
                  <div style={{ display: 'flex', gap: 14 }}>
                    {/* Thumbnails Container */}
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, position: 'relative' }}>
                      {order.items.slice(0, 3).map((item, idx) => (
                        <div
                          key={idx}
                          style={{
                            width: 54,
                            height: 54,
                            borderRadius: 6,
                            background: '#f9f9f9',
                            border: '1px solid #f0f0f0',
                            overflow: 'hidden',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <img src={item.image} alt={item.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                        </div>
                      ))}
                      {order.items.length > 3 && (
                        <div
                          style={{
                            position: 'absolute',
                            right: 0,
                            top: 0,
                            width: 54,
                            height: 54,
                            borderRadius: 6,
                            background: 'rgba(0,0,0,0.6)',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          +{order.items.length - 3}
                        </div>
                      )}
                    </div>

                    {/* Order summary text */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Typography.Text strong style={{ fontSize: 14, color: '#212121', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {order.items[0]?.name}
                      </Typography.Text>
                      {order.items.length > 1 && (
                        <Typography.Text style={{ fontSize: 12, color: '#878787', display: 'block', marginTop: 2 }}>
                          +{order.items.length - 1} other item{order.items.length > 2 ? 's' : ''}
                        </Typography.Text>
                      )}
                      <Typography.Text style={{ fontSize: 12, color: '#878787', display: 'block' }}>
                        Placed on: {order.date}
                      </Typography.Text>
                    </div>
                    <Typography.Text strong style={{ fontSize: 16, color: '#212121' }}>
                      {formatInr(order.total)}
                    </Typography.Text>
                  </div>

                  <Divider style={{ margin: '16px 0' }} />

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {order.status === 'IN_TRANSIT' && (
                      <Button
                        type="primary"
                        style={{ flex: 1, background: '#f97316', borderColor: '#f97316', fontWeight: 600 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/order-tracking/${order.id}`);
                        }}
                      >
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
                      <Button
                        icon={<StarOutlined />}
                        style={{ flex: 1, color: '#424242', borderColor: '#d3d3d3', fontWeight: 500 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          message.info('Review submitted!');
                        }}
                      >
                        Rate & Review
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div style={{ padding: '24px 0', textAlign: 'center' }}>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            ~ No more orders ~
          </Typography.Text>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 💻 DESKTOP VIEW (>= 768px): CLEAN B2B WEBSITE ORDER DASHBOARD              */}
      {/* ========================================================================= */}
      <div className="desktop-only" style={{ background: '#f8fafc', minHeight: '80vh', padding: '24px 0 60px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px' }}>
          {/* Breadcrumbs */}
          <Breadcrumb
            items={[
              { title: <Link to="/">Home</Link> },
              { title: <Link to="/profile">My Account</Link> },
              { title: 'Orders' },
            ]}
            style={{ marginBottom: 20 }}
          />

          {/* Page Title Row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
              <Typography.Title level={2} style={{ margin: 0, color: '#0f172a', fontWeight: 700 }}>
                Wholesale Order History
              </Typography.Title>
              <Typography.Text style={{ color: '#64748b', fontSize: 14 }}>
                Track consignments, download GST tax invoices, and perform 1-click stock replenishment.
              </Typography.Text>
            </div>
            <Tag color="orange" style={{ padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600 }}>
              {mockOrders.length} Total Consignments
            </Tag>
          </div>

          {/* Search Bar + Segmented Status Filters */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: 14,
              border: '1px solid #e2e8f0',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 20,
              marginBottom: 24,
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
            }}
          >
            <Input
              prefix={<SearchOutlined style={{ color: '#94a3b8', fontSize: 16 }} />}
              placeholder="Search by Order ID (e.g. ORD-89237492) or Product Name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              allowClear
              style={{ maxWidth: 420, borderRadius: 8, height: 40 }}
            />

            <Segmented
              value={desktopStatus}
              onChange={(val) => setDesktopStatus(val as string)}
              options={[
                { label: 'All Orders', value: 'ALL' },
                { label: 'In Transit (1)', value: 'IN_TRANSIT' },
                { label: 'Delivered (1)', value: 'DELIVERED' },
                { label: 'Cancelled (1)', value: 'CANCELLED' },
              ]}
              style={{ background: '#f1f5f9', padding: 4, borderRadius: 10 }}
            />
          </div>

          {/* Orders List */}
          {desktopFilteredOrders.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: '60px 20px', textAlign: 'center' }}>
              <Empty description="No orders found matching your search" />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {desktopFilteredOrders.map((order) => {
                const isTransit = order.status === 'IN_TRANSIT';
                const isDelivered = order.status === 'DELIVERED';

                return (
                  <div
                    key={order.id}
                    style={{
                      background: '#ffffff',
                      borderRadius: 16,
                      border: '1px solid #e2e8f0',
                      overflow: 'hidden',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                    }}
                  >
                    {/* Header Strip */}
                    <div
                      style={{
                        background: '#f8fafc',
                        padding: '16px 24px',
                        borderBottom: '1px solid #e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                        <div>
                          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', fontWeight: 600 }}>
                            ORDER NUMBER
                          </Typography.Text>
                          <Typography.Text strong style={{ fontSize: 14, color: '#0f172a' }}>
                            {order.id}
                          </Typography.Text>
                        </div>
                        <div>
                          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', fontWeight: 600 }}>
                            DATE PLACED
                          </Typography.Text>
                          <Typography.Text style={{ fontSize: 14, color: '#334155' }}>
                            {order.date}
                          </Typography.Text>
                        </div>
                        <div>
                          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', fontWeight: 600 }}>
                            TOTAL AMOUNT
                          </Typography.Text>
                          <Typography.Text strong style={{ fontSize: 15, color: '#0f172a' }}>
                            {formatInr(order.total)}
                          </Typography.Text>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {isTransit && (
                          <Tag color="orange" icon={<ClockCircleFilled />} style={{ padding: '4px 12px', fontSize: 13, borderRadius: 12, fontWeight: 600 }}>
                            In Transit · Arriving Today
                          </Tag>
                        )}
                        {isDelivered && (
                          <Tag color="green" icon={<CheckCircleFilled />} style={{ padding: '4px 12px', fontSize: 13, borderRadius: 12, fontWeight: 600 }}>
                            Delivered
                          </Tag>
                        )}
                        {!isTransit && !isDelivered && (
                          <Tag color="red" icon={<CloseCircleFilled />} style={{ padding: '4px 12px', fontSize: 13, borderRadius: 12, fontWeight: 600 }}>
                            Cancelled
                          </Tag>
                        )}

                        <Button
                          icon={<FileTextOutlined />}
                          style={{ borderRadius: 8, fontSize: 13 }}
                          onClick={() => message.success(`Downloading GST Invoice for ${order.id}`)}
                        >
                          Invoice
                        </Button>
                      </div>
                    </div>

                    {/* Items Body */}
                    <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
                      {/* Products List */}
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', flex: 1 }}>
                        {order.items.map((item, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              padding: '10px 14px',
                              background: '#f8fafc',
                              border: '1px solid #e2e8f0',
                              borderRadius: 12,
                              minWidth: 240,
                            }}
                          >
                            <div style={{ width: 44, height: 44, background: '#fff', borderRadius: 8, padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #f1f5f9' }}>
                              <img src={item.image} alt={item.name} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <Typography.Text strong style={{ fontSize: 13, color: '#1e293b', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {item.name}
                              </Typography.Text>
                              <Typography.Text style={{ fontSize: 12, color: '#64748b' }}>
                                {item.unit} · {formatInr(item.price)}
                              </Typography.Text>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Action buttons */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0, minWidth: 160 }}>
                        {isTransit && (
                          <Button
                            type="primary"
                            icon={<TruckOutlined />}
                            style={{ background: '#f97316', borderColor: '#f97316', borderRadius: 8, fontWeight: 600, height: 38 }}
                            onClick={() => setTrackingModal({ visible: true, orderId: order.id })}
                          >
                            Track Live
                          </Button>
                        )}
                        <Button
                          icon={<ReloadOutlined />}
                          style={{ borderColor: '#f97316', color: '#f97316', borderRadius: 8, fontWeight: 600, height: 38 }}
                          onClick={(e) => handleReorderClick(e, order)}
                        >
                          Reorder Items
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Filter Bottom Drawer (for Mobile) */}
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
          <Typography.Text strong style={{ display: 'block', marginBottom: 12, fontSize: 15 }}>
            Order Status
          </Typography.Text>
          <Radio.Group onChange={(e) => setStatusFilter(e.target.value)} value={statusFilter} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Radio value="all">All Orders</Radio>
            <Radio value="in_transit">In Transit</Radio>
            <Radio value="delivered">Delivered</Radio>
            <Radio value="cancelled">Cancelled</Radio>
          </Radio.Group>
        </div>

        <div>
          <Typography.Text strong style={{ display: 'block', marginBottom: 12, fontSize: 15 }}>
            Order Time
          </Typography.Text>
          <Radio.Group onChange={(e) => setTimeFilter(e.target.value)} value={timeFilter} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Radio value="all_time">Anytime</Radio>
            <Radio value="last_30_days">Last 30 Days</Radio>
            <Radio value="last_6_months">Last 6 Months</Radio>
            <Radio value="2025">2025</Radio>
          </Radio.Group>
        </div>

        {/* Bottom Actions */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#fff', padding: '16px 20px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: 12, boxShadow: '0 -2px 10px rgba(0,0,0,0.05)' }}>
          <Button size="large" style={{ flex: 1, borderRadius: 8 }} onClick={() => setFilterVisible(false)}>
            Cancel
          </Button>
          <Button type="primary" size="large" style={{ flex: 1, borderRadius: 8, background: '#f97316', borderColor: '#f97316', fontWeight: 600 }} onClick={handleApplyFilters}>
            Apply
          </Button>
        </div>
      </Drawer>

      {/* Tracking Modal */}
      <Modal
        title={`Live Tracking: ${trackingModal.orderId || 'Consignment'}`}
        open={trackingModal.visible}
        onCancel={() => setTrackingModal({ visible: false, orderId: null })}
        footer={[
          <Button key="close" onClick={() => setTrackingModal({ visible: false, orderId: null })}>
            Close
          </Button>,
          <Button
            key="details"
            type="primary"
            style={{ background: '#f97316', borderColor: '#f97316' }}
            onClick={() => {
              const id = trackingModal.orderId;
              setTrackingModal({ visible: false, orderId: null });
              if (id) navigate(`/order-tracking/${id}`);
            }}
          >
            Full Tracking Details
          </Button>,
        ]}
      >
        <div style={{ padding: '16px 0' }}>
          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: 14, marginBottom: 20 }}>
            <Typography.Text strong style={{ color: '#c2410c', display: 'block' }}>
              🚚 Out for Delivery with Morning Dispatch Van
            </Typography.Text>
            <Typography.Text style={{ color: '#ea580c', fontSize: 13 }}>
              Estimated arrival at your store today by 7:30 PM. Driver contact: +91 94401 23456.
            </Typography.Text>
          </div>
        </div>
      </Modal>

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
            disabled={reorderModal.order ? getEnrichedItems(reorderModal.order).every((i) => i.isOOS) : false}
          >
            Add to Cart
          </Button>,
        ]}
      >
        {reorderModal.order &&
          (() => {
            const enriched = getEnrichedItems(reorderModal.order);
            const hasOOS = enriched.some((i) => i.isOOS);
            const hasPriceChange = enriched.some((i) => i.priceChanged);
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
                          <Typography.Text strong style={{ fontSize: 13, display: 'block' }}>
                            {item.name}
                          </Typography.Text>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                            <Typography.Text strong style={{ fontSize: 13, color: item.priceChanged && !item.isOOS ? (livePrice > item.price ? '#dc2626' : '#16a34a') : '#212121' }}>
                              ₹{livePrice}
                            </Typography.Text>
                            {item.priceChanged && !item.isOOS && (
                              <Typography.Text delete style={{ fontSize: 12, color: '#878787' }}>
                                ₹{item.price}
                              </Typography.Text>
                            )}
                            {item.priceChanged && !item.isOOS && livePrice > item.price && (
                              <Tag color="red" style={{ margin: 0, fontSize: 11 }}>Price Up</Tag>
                            )}
                            {item.priceChanged && !item.isOOS && livePrice < item.price && (
                              <Tag color="green" style={{ margin: 0, fontSize: 11 }}>Price Down</Tag>
                            )}
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
