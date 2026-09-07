import {
  ArrowLeftOutlined,
  CheckCircleFilled,
  CheckCircleOutlined,
  EnvironmentOutlined,
  FileProtectOutlined,
  HeartOutlined,
  InfoCircleOutlined,
  MinusOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  SafetyCertificateFilled,
  SafetyCertificateOutlined,
  SearchOutlined,
  ShareAltOutlined,
  ShopFilled,
  ShopOutlined,
  ShoppingCartOutlined,
  StarFilled,
  SyncOutlined,
  TagFilled,
  TagOutlined,
  ThunderboltFilled,
  TruckFilled,
  TruckOutlined,
} from '@ant-design/icons';
import { Badge, Button, Carousel, Collapse, Divider, Input, InputNumber, Switch, Table, Tag, Typography, message } from 'antd';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useCustomerAuth } from '../auth/CustomerAuthContext';
import { useCart } from '../cart/useCart';
import { bestOfBasics, buyAgainProducts, popularProducts } from '../mock/homeMockData';

function formatInr(value: number): string {
  return `₹${value.toLocaleString('en-IN')}`;
}

export function ProductDetailPage() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const cart = useCart();
  const { role, switchRole } = useCustomerAuth();
  const isRetailer = role === 'RETAILER';

  // Pincode mock state
  const [pincode, setPincode] = useState('');
  const [deliveryStatus, setDeliveryStatus] = useState<'IDLE' | 'CHECKING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [deliveryInfo, setDeliveryInfo] = useState<{ mode: 'QUICK' | 'STANDARD'; eta: string; charge: number } | null>(null);

  // Toggle states
  const [showAllHighlights, setShowAllHighlights] = useState(false);
  const [showFullDesc, setShowFullDesc] = useState(false);
  const [showGstInclusive, setShowGstInclusive] = useState(true);

  // Mock finding the product
  const allMockProducts = [...popularProducts, ...bestOfBasics, ...buyAgainProducts];
  const product = allMockProducts.find((p) => p.id === productId) || allMockProducts[0];

  // Variant Management
  const hasVariants = 'variants' in product && Array.isArray((product as any).variants) && (product as any).variants.length > 0;
  const defaultVariantId = hasVariants ? (product as any).variants[0].id : null;
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(defaultVariantId);

  // Multi-Variant Quantity Matrix State
  const [variantQuantities, setVariantQuantities] = useState<{ [variantId: string]: number }>({});

  // Active Variant / Product Details
  const activeProduct = useMemo(() => {
    if (hasVariants && selectedVariantId) {
      const variant = (product as any).variants.find((v: any) => v.id === selectedVariantId);
      if (variant) {
        return {
          ...product,
          id: variant.id,
          sku: variant.sku || (product as any).sku,
          price: variant.price,
          mrp: variant.mrp,
          images: variant.images || [variant.image],
          image: variant.images ? variant.images[0] : variant.image,
          variant: variant.name,
        };
      }
    }
    return {
      ...product,
      images: (product as any).images || [product.image],
    };
  }, [product, hasVariants, selectedVariantId]);

  // Pricing Base
  const consumerPrice = (activeProduct as any).price || 185;
  const mrp = (activeProduct as any).mrp || Math.round(consumerPrice * 1.25);
  const consumerDiscount = mrp > consumerPrice ? Math.round(((mrp - consumerPrice) / mrp) * 100) : 0;

  // Wholesale Specs & Order Parameters
  const moq = 10; // Minimum Order Quantity: 10 pcs
  const maxOrderLimit = 500; // Maximum Order Quantity
  const packBoxSize = 10; // 10 pcs/box
  const availableStock = 1450; // Available stock

  // Selected Quantities
  const [wholesaleQty, setWholesaleQty] = useState<number>(10);
  const [selectedUnits, setSelectedUnits] = useState<number>(1);

  // Tier-Based Pricing Matrix (Proportional to Base Price)
  // Example base scale:
  // 1-9 pcs: Tier 1 (~90% of MRP)
  // 10-49 pcs: Tier 2 (~80% of MRP)
  // 50-99 pcs: Tier 3 (~72% of MRP)
  // 100+ pcs: Tier 4 (~65% of MRP)
  const tierPricing = useMemo(() => {
    const tier1 = Math.round(mrp * 0.9);
    const tier2 = Math.round(mrp * 0.8);
    const tier3 = Math.round(mrp * 0.72);
    const tier4 = Math.round(mrp * 0.65);
    return [
      { key: '1-9', label: '1–9 pcs', min: 1, max: 9, price: tier1, discount: Math.round(((mrp - tier1) / mrp) * 100) },
      { key: '10-49', label: '10–49 pcs', min: 10, max: 49, price: tier2, discount: Math.round(((mrp - tier2) / mrp) * 100) },
      { key: '50-99', label: '50–99 pcs', min: 50, max: 99, price: tier3, discount: Math.round(((mrp - tier3) / mrp) * 100) },
      { key: '100+', label: '100+ pcs', min: 100, max: 99999, price: tier4, discount: Math.round(((mrp - tier4) / mrp) * 100) },
    ];
  }, [mrp]);

  // Active Price Tier based on selected quantity
  const activeTier = useMemo(() => {
    return tierPricing.find((t) => wholesaleQty >= t.min && wholesaleQty <= t.max) || tierPricing[1];
  }, [tierPricing, wholesaleQty]);

  // GST & Tax Calculations
  const gstRate = 5; // 5% GST
  const activeWholesalePriceInclGst = activeTier.price;
  const activeWholesalePriceExclGst = +(activeWholesalePriceInclGst / (1 + gstRate / 100)).toFixed(2);
  const gstAmountPerUnit = +(activeWholesalePriceInclGst - activeWholesalePriceExclGst).toFixed(2);

  const totalWholesaleOrderAmount = activeWholesalePriceInclGst * wholesaleQty;
  const totalWholesaleDiscountAmount = (mrp - activeWholesalePriceInclGst) * wholesaleQty;
  const hsnCode = (activeProduct as any).hsn || '1101 00 00';

  // Multi-Variant Matrix Calculations
  const allVariantsList = useMemo(() => {
    if (hasVariants && Array.isArray((product as any).variants)) {
      return (product as any).variants;
    }
    return [
      {
        id: product.id,
        name: (product as any).variant || 'Standard Pack',
        sku: (product as any).sku || 'DT-STD-01',
        price: (product as any).price || 185,
        mrp: (product as any).mrp || 220,
        image: (product as any).image,
      },
    ];
  }, [hasVariants, product]);

  const totalMultiVariantQty = Object.values(variantQuantities).reduce((a, b) => a + (b || 0), 0);
  const totalMultiVariantAmount = useMemo(() => {
    return Object.entries(variantQuantities).reduce((total, [varId, qty]) => {
      if (!qty) return total;
      const v = allVariantsList.find((item: any) => item.id === varId);
      const vMrp = v?.mrp || mrp;
      const vTierPrice = Math.round(vMrp * (activeTier.price / mrp));
      return total + vTierPrice * qty;
    }, 0);
  }, [variantQuantities, allVariantsList, mrp, activeTier]);

  // Cart syncing
  const cartLine = cart.lines.find((line) => line.productId === (activeProduct as any).id);
  const variantText = (activeProduct as any).variant || (activeProduct as any).weight || '1 unit';

  const handleCheckPincode = () => {
    if (pincode.length !== 6) return;
    setDeliveryStatus('CHECKING');
    setTimeout(() => {
      if (pincode.startsWith('500') || pincode.startsWith('506')) {
        const info = { mode: 'QUICK' as const, eta: isRetailer ? 'Tomorrow Morning (6 AM - 10 AM)' : 'Today by 7:30 PM (24 Mins)', charge: 0 };
        setDeliveryInfo(info);
        setDeliveryStatus('SUCCESS');
        cart.setDelivery(pincode, info);
        message.success('Delivery available at your location!');
      } else if (pincode.startsWith('400') || pincode.startsWith('501')) {
        const info = { mode: 'STANDARD' as const, eta: 'Expected in 2 business days', charge: isRetailer ? 0 : 40 };
        setDeliveryInfo(info);
        setDeliveryStatus('SUCCESS');
        cart.setDelivery(pincode, info);
        message.success('Standard dispatch serviceable!');
      } else {
        setDeliveryInfo(null);
        setDeliveryStatus('ERROR');
        cart.setDelivery(null, null);
        message.error('Delivery not serviceable at this pincode');
      }
    }, 600);
  };

  const handleAddToCart = () => {
    const qtyToAdd = isRetailer ? wholesaleQty : selectedUnits;
    const unitPrice = isRetailer ? activeWholesalePriceInclGst : consumerPrice;

    if (cartLine) {
      cart.setQuantity((activeProduct as any).id, cartLine.quantity + qtyToAdd);
    } else {
      cart.add({
        productId: (activeProduct as any).id,
        productName: (activeProduct as any).name,
        unit: isRetailer ? `${wholesaleQty} pcs (${Math.ceil(wholesaleQty / packBoxSize)} Boxes)` : variantText,
        displayUnitPrice: unitPrice,
        imageUrl: (activeProduct as any).image,
        mrp: mrp,
      });
    }
    message.success(isRetailer ? `Added ${wholesaleQty} pcs at wholesale Tier rate (${formatInr(activeWholesalePriceInclGst)}/pc)` : 'Added to Cart');
  };

  const handleAddAllVariantsToCart = () => {
    if (totalMultiVariantQty === 0) {
      message.warning('Please enter quantities for at least one variant.');
      return;
    }

    Object.entries(variantQuantities).forEach(([varId, qty]) => {
      if (qty && qty > 0) {
        const v = allVariantsList.find((item: any) => item.id === varId);
        const vMrp = v?.mrp || mrp;
        const vPrice = Math.round(vMrp * (activeTier.price / mrp));
        cart.add({
          productId: varId,
          productName: `${(activeProduct as any).name} - ${v?.name || 'Variant'}`,
          unit: `${qty} pcs`,
          displayUnitPrice: vPrice,
          imageUrl: v?.image || (activeProduct as any).image,
          mrp: vMrp,
        });
      }
    });

    message.success(`Added ${totalMultiVariantQty} pcs across variants to cart!`);
    setVariantQuantities({});
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f3f6', paddingBottom: 90, display: 'flex', flexDirection: 'column' }}>
      {/* Sticky Header */}
      <header
        className="store-safe-top"
        style={{
          position: 'sticky',
          top: 0,
          background: '#ffffff',
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 100,
          borderBottom: '1px solid #e2e8f0',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => navigate(-1)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
          >
            <ArrowLeftOutlined style={{ fontSize: 18, color: '#1e293b' }} />
          </button>
          <div>
            <Typography.Text strong style={{ fontSize: 15, color: '#0f172a' }}>
              {(activeProduct as any).name}
            </Typography.Text>
            <span style={{ display: 'block', fontSize: 11, color: '#64748b' }}>
              {isRetailer ? '🏪 B2B Wholesale Mandi Catalog' : '👤 Retail Consumer Catalog'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <SearchOutlined style={{ fontSize: 18, color: '#475569', cursor: 'pointer' }} onClick={() => navigate('/products/atta-dal')} />
          <div style={{ cursor: 'pointer', position: 'relative' }} onClick={() => navigate('/cart')}>
            <Badge count={cart.count} size="small" offset={[-2, 2]} color={isRetailer ? '#059669' : '#ea580c'}>
              <ShoppingCartOutlined style={{ fontSize: 20, color: '#1e293b' }} />
            </Badge>
          </div>
        </div>
      </header>

      {/* Interactive Role Switcher Banner */}
      <div
        style={{
          background: isRetailer ? '#ecfdf5' : '#fff7ed',
          borderBottom: isRetailer ? '1px solid #a7f3d0' : '1px solid #fed7aa',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isRetailer ? (
            <>
              <ShopFilled style={{ color: '#059669', fontSize: 16 }} />
              <div>
                <Typography.Text strong style={{ color: '#065f46', fontSize: 12, display: 'block' }}>
                  RETAILER WHOLESALE PRICING ACTIVE
                </Typography.Text>
                <Typography.Text style={{ color: '#047857', fontSize: 11 }}>
                  Tier-based Wholesale Rates • MOQ: {moq} pcs • GST Breakdown
                </Typography.Text>
              </div>
            </>
          ) : (
            <>
              <TagFilled style={{ color: '#ea580c', fontSize: 16 }} />
              <div>
                <Typography.Text strong style={{ color: '#9a3412', fontSize: 12, display: 'block' }}>
                  CUSTOMER RETAIL PRICING ACTIVE
                </Typography.Text>
                <Typography.Text style={{ color: '#c2410c', fontSize: 11 }}>
                  1 Unit MOQ • Inclusive of All Taxes • Fast Delivery
                </Typography.Text>
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            size="small"
            type={!isRetailer ? 'primary' : 'default'}
            style={{ borderRadius: 6, fontSize: 11, background: !isRetailer ? '#f97316' : undefined, borderColor: !isRetailer ? '#f97316' : undefined }}
            onClick={() => switchRole('CUSTOMER')}
          >
            👤 Customer
          </Button>
          <Button
            size="small"
            type={isRetailer ? 'primary' : 'default'}
            style={{ borderRadius: 6, fontSize: 11, background: isRetailer ? '#059669' : undefined, borderColor: isRetailer ? '#059669' : undefined }}
            onClick={() => switchRole('RETAILER')}
          >
            🏪 Retailer
          </Button>
        </div>
      </div>

      {/* Breadcrumbs */}
      <div style={{ padding: '10px 16px', background: '#fff', fontSize: 12, color: '#878787', borderBottom: '1px solid #f0f0f0' }}>
        <Link to="/" style={{ color: '#878787', textDecoration: 'none' }}>Home</Link> &gt;{' '}
        <Link to="/categories" style={{ color: '#878787', textDecoration: 'none' }}>Groceries</Link> &gt;{' '}
        <span style={{ color: '#212121', fontWeight: 600 }}>{(activeProduct as any).name}</span>
      </div>

      {/* Product Image Carousel with Wishlist & Share */}
      <div style={{ background: '#fff', padding: '16px 0 24px', position: 'relative', textAlign: 'center' }}>
        <style>{`
          .product-detail-carousel .slick-track {
            display: flex !important;
            align-items: center !important;
          }
          .product-detail-carousel .slick-slide {
            text-align: center !important;
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
          }
          .product-detail-carousel .slick-slide > div {
            width: 100% !important;
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
          }
          .product-detail-carousel img {
            margin: 0 auto !important;
            display: inline-block !important;
          }
          .product-dots li button { background: #cbd5e1 !important; height: 6px !important; border-radius: 4px !important; }
          .product-dots li.slick-active button { background: #ea580c !important; width: 18px !important; }
        `}</style>

        <button
          aria-label="Wishlist"
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            zIndex: 10,
            background: '#fff',
            border: '1px solid #e0e0e0',
            borderRadius: '50%',
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
            cursor: 'pointer',
          }}
          onClick={() => message.success('Saved to Wishlist')}
        >
          <HeartOutlined style={{ fontSize: 18, color: '#ef4444' }} />
        </button>

        <button
          aria-label="Share"
          style={{
            position: 'absolute',
            top: 60,
            right: 16,
            zIndex: 10,
            background: '#fff',
            border: '1px solid #e0e0e0',
            borderRadius: '50%',
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
            cursor: 'pointer',
          }}
          onClick={() => message.info('Product link copied to clipboard')}
        >
          <ShareAltOutlined style={{ fontSize: 18, color: '#878787' }} />
        </button>

        {isRetailer ? (
          <div
            style={{
              position: 'absolute',
              top: 16,
              left: 16,
              zIndex: 10,
              background: '#065f46',
              color: '#fff',
              padding: '4px 10px',
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <SafetyCertificateFilled /> WHOLESALE MASTER PACK
          </div>
        ) : (
          (activeProduct as any).badge && (
            <div
              style={{
                position: 'absolute',
                top: 16,
                left: 16,
                zIndex: 10,
                background: '#ea580c',
                color: '#fff',
                padding: '4px 10px',
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {(activeProduct as any).badge}
            </div>
          )
        )}

        <Carousel autoplay className="product-detail-carousel" dots={{ className: 'product-dots' }} style={{ height: 300, width: '100%' }}>
          {(activeProduct as any).images.map((img: string, idx: number) => (
            <div
              key={idx}
              style={{
                height: 300,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                width: '100%',
              }}
            >
              <img
                src={img}
                alt={`Slide ${idx}`}
                style={{
                  maxHeight: 280,
                  maxWidth: '85%',
                  objectFit: 'contain',
                  margin: '0 auto',
                  display: 'block',
                }}
              />
            </div>
          ))}
        </Carousel>
      </div>

      {/* Core Info & Pricing */}
      <div style={{ background: '#fff', padding: '16px', marginTop: 8 }}>
        {(activeProduct as any).brand && (
          <Typography.Text style={{ color: '#878787', fontSize: 13, textTransform: 'uppercase', fontWeight: 600 }}>
            {(activeProduct as any).brand}
          </Typography.Text>
        )}
        <Typography.Title level={4} style={{ margin: '4px 0 8px', fontSize: 18, color: '#212121', fontWeight: 600 }}>
          {(activeProduct as any).name}
        </Typography.Title>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            SKU: {(activeProduct as any).sku || 'DT-GR-8842'}
          </Typography.Text>
          <span style={{ color: '#cbd5e1' }}>•</span>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            HSN: {hsnCode}
          </Typography.Text>
        </div>

        {/* Rating */}
        {(activeProduct as any).rating && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 14 }}>
            <div style={{ background: '#388e3c', color: '#fff', padding: '2px 6px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700 }}>
              {(activeProduct as any).rating} <StarFilled style={{ fontSize: 10 }} />
            </div>
            <Typography.Text style={{ color: '#878787', fontSize: 13 }}>
              {(activeProduct as any).reviewCount || 148} Ratings &amp; Reviews
            </Typography.Text>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 🏪 WHOLESALE PRICING & TIER TABLE (MOST IMPORTANT B2B SECTION)             */}
        {/* ========================================================================= */}
        {isRetailer ? (
          <div>
            {/* Wholesale Overview Card */}
            <div style={{ background: '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: 14, padding: 16, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#9a3412', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  WHOLESALE PRICING BREAKDOWN
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Typography.Text style={{ fontSize: 11, color: '#7c2d12' }}>Prices:</Typography.Text>
                  <Button
                    size="small"
                    type={showGstInclusive ? 'primary' : 'default'}
                    style={{ fontSize: 10, height: 22, padding: '0 6px', borderRadius: 4, background: showGstInclusive ? '#ea580c' : undefined, borderColor: showGstInclusive ? '#ea580c' : undefined }}
                    onClick={() => setShowGstInclusive(true)}
                  >
                    Incl. GST
                  </Button>
                  <Button
                    size="small"
                    type={!showGstInclusive ? 'primary' : 'default'}
                    style={{ fontSize: 10, height: 22, padding: '0 6px', borderRadius: 4, background: !showGstInclusive ? '#ea580c' : undefined, borderColor: !showGstInclusive ? '#ea580c' : undefined }}
                    onClick={() => setShowGstInclusive(false)}
                  >
                    Excl. GST
                  </Button>
                </div>
              </div>

              {/* Price Metrics Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, background: '#fff', padding: '12px 10px', borderRadius: 10, border: '1px solid #fed7aa', marginBottom: 12, textAlign: 'center' }}>
                <div>
                  <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block' }}>MRP</Typography.Text>
                  <Typography.Text delete style={{ fontSize: 14, color: '#94a3b8', fontWeight: 600 }}>{formatInr(mrp)}</Typography.Text>
                </div>
                <div>
                  <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block' }}>WHOLESALE</Typography.Text>
                  <Typography.Text strong style={{ fontSize: 16, color: '#ea580c' }}>
                    {formatInr(showGstInclusive ? activeWholesalePriceInclGst : activeWholesalePriceExclGst)}
                  </Typography.Text>
                </div>
                <div>
                  <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block' }}>GST (5%)</Typography.Text>
                  <Typography.Text strong style={{ fontSize: 14, color: '#c2410c' }}>
                    ₹{gstAmountPerUnit}
                  </Typography.Text>
                </div>
                <div>
                  <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block' }}>DISCOUNT</Typography.Text>
                  <Tag color="orange" style={{ margin: 0, fontSize: 11, fontWeight: 700 }}>
                    {activeTier.discount}% OFF
                  </Tag>
                </div>
              </div>

              {/* Tier-Based Pricing Table */}
              <Typography.Text strong style={{ fontSize: 13, color: '#0f172a', display: 'block', marginBottom: 8 }}>
                📊 Wholesale Tier-Based Pricing Table
              </Typography.Text>

              <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #fed7aa' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left', background: '#fff' }}>
                  <thead>
                    <tr style={{ background: '#ffedd5', borderBottom: '1px solid #fed7aa', color: '#7c2d12' }}>
                      <th style={{ padding: '8px 12px' }}>Quantity</th>
                      <th style={{ padding: '8px 12px' }}>Price / Unit ({showGstInclusive ? 'Incl. GST' : 'Excl. GST'})</th>
                      <th style={{ padding: '8px 12px' }}>Discount</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Tier Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tierPricing.map((tier) => {
                      const isActive = activeTier.key === tier.key;
                      const displayPrice = showGstInclusive ? tier.price : +(tier.price / (1 + gstRate / 100)).toFixed(2);
                      return (
                        <tr
                          key={tier.key}
                          style={{
                            background: isActive ? '#fff7ed' : '#ffffff',
                            borderBottom: '1px solid #fed7aa',
                            fontWeight: isActive ? 700 : 500,
                            color: isActive ? '#9a3412' : '#334155',
                          }}
                        >
                          <td style={{ padding: '8px 12px' }}>{tier.label}</td>
                          <td style={{ padding: '8px 12px', color: isActive ? '#ea580c' : '#1e293b' }}>
                            {formatInr(displayPrice)}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{ color: '#ea580c', fontWeight: 600 }}>{tier.discount}% OFF</span>
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                            {isActive ? (
                              <Tag color="orange" style={{ margin: 0, fontWeight: 700, fontSize: 10 }}>
                                ⚡ ACTIVE TIER
                              </Tag>
                            ) : (
                              <span style={{ color: '#94a3b8', fontSize: 11 }}>Order {tier.min}+ pcs</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Quantity Stepper & Tier Trigger */}
              <div style={{ marginTop: 14, background: '#fff', padding: '12px 14px', borderRadius: 10, border: '1px solid #fed7aa', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <Typography.Text strong style={{ fontSize: 13, color: '#0f172a', display: 'block' }}>
                    Select Order Quantity (MOQ: {moq} pcs)
                  </Typography.Text>
                  <Typography.Text style={{ fontSize: 11, color: '#64748b' }}>
                    Applied: <strong>{activeTier.label}</strong> ({activeTier.discount}% off) • Total: <strong>{formatInr(totalWholesaleOrderAmount)}</strong>
                  </Typography.Text>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Button
                    shape="circle"
                    icon={<MinusOutlined />}
                    disabled={wholesaleQty <= moq}
                    onClick={() => setWholesaleQty((prev) => Math.max(moq, prev - 10))}
                  />
                  <InputNumber
                    min={moq}
                    max={maxOrderLimit}
                    step={10}
                    value={wholesaleQty}
                    onChange={(val) => setWholesaleQty(val || moq)}
                    style={{ width: 64, textAlign: 'center', fontWeight: 700 }}
                  />
                  <Button
                    shape="circle"
                    icon={<PlusOutlined />}
                    disabled={wholesaleQty >= maxOrderLimit}
                    onClick={() => setWholesaleQty((prev) => Math.min(maxOrderLimit, prev + 10))}
                  />
                </div>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* 📦 MOQ & ORDER INFORMATION (B2B SPEC)                                     */}
            {/* ========================================================================= */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, marginBottom: 16 }}>
              <Typography.Text strong style={{ fontSize: 13, color: '#0f172a', display: 'block', marginBottom: 10 }}>
                📋 MOQ &amp; Order Information
              </Typography.Text>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, fontSize: 12 }}>
                <div style={{ background: '#fff', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block' }}>MINIMUM ORDER QTY (MOQ)</Typography.Text>
                  <Typography.Text strong style={{ fontSize: 14, color: '#0f172a' }}>{moq} pcs (1 Box)</Typography.Text>
                </div>

                <div style={{ background: '#fff', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block' }}>MAXIMUM ORDER QTY</Typography.Text>
                  <Typography.Text strong style={{ fontSize: 14, color: '#0f172a' }}>{maxOrderLimit} pcs / Order</Typography.Text>
                </div>

                <div style={{ background: '#fff', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block' }}>MASTER PACK SIZE</Typography.Text>
                  <Typography.Text strong style={{ fontSize: 14, color: '#0f172a' }}>{packBoxSize} pcs / Corrugated Box</Typography.Text>
                </div>

                <div style={{ background: '#fff', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block' }}>AVAILABLE STOCK</Typography.Text>
                  <Typography.Text strong style={{ fontSize: 14, color: '#16a34a' }}>🟢 {availableStock.toLocaleString()} pcs in Stock</Typography.Text>
                </div>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* 🎯 MULTI-VARIANT QUANTITY MATRIX (SELECT VARIANTS -> QUANTITIES -> CART)   */}
            {/* ========================================================================= */}
            {allVariantsList.length > 1 && (
              <div style={{ background: '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: 14, padding: 16, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div>
                    <Typography.Text strong style={{ fontSize: 14, color: '#9a3412', display: 'block' }}>
                      ⚡ Multi-Variant Bulk Order Matrix
                    </Typography.Text>
                    <Typography.Text style={{ fontSize: 11, color: '#c2410c' }}>
                      Select variants → Enter quantities → Add all to cart
                    </Typography.Text>
                  </div>
                  <Tag color="orange" style={{ margin: 0, fontWeight: 700 }}>
                    {allVariantsList.length} VARIANTS
                  </Tag>
                </div>

                <div style={{ background: '#fff', borderRadius: 10, overflow: 'hidden', border: '1px solid #fed7aa', marginBottom: 12 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#ffedd5', color: '#7c2d12', borderBottom: '1px solid #fed7aa', textAlign: 'left' }}>
                        <th style={{ padding: '8px 10px' }}>Variant</th>
                        <th style={{ padding: '8px 10px' }}>Rate / Pc</th>
                        <th style={{ padding: '8px 10px' }}>Stock</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Qty (pcs)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allVariantsList.map((v: any) => {
                        const vQty = variantQuantities[v.id] || 0;
                        const vMrp = v.mrp || mrp;
                        const vPrice = Math.round(vMrp * (activeTier.price / mrp));
                        return (
                          <tr key={v.id} style={{ borderBottom: '1px solid #fed7aa' }}>
                            <td style={{ padding: '8px 10px' }}>
                              <Typography.Text strong style={{ fontSize: 12, display: 'block' }}>{v.name}</Typography.Text>
                              <span style={{ fontSize: 10, color: '#64748b' }}>SKU: {v.sku || 'DT-SKU'}</span>
                            </td>
                            <td style={{ padding: '8px 10px', color: '#065f46', fontWeight: 600 }}>
                              {formatInr(vPrice)}
                            </td>
                            <td style={{ padding: '8px 10px', color: '#16a34a', fontSize: 11 }}>
                              🟢 In Stock
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                              <InputNumber
                                min={0}
                                max={maxOrderLimit}
                                step={10}
                                value={vQty}
                                placeholder="0"
                                onChange={(val) => setVariantQuantities((prev) => ({ ...prev, [v.id]: val || 0 }))}
                                style={{ width: 64, textAlign: 'center' }}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Matrix Summary Action Bar */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <span style={{ fontSize: 12, color: '#7c2d12', display: 'block' }}>
                      Selected: <strong>{totalMultiVariantQty} pcs</strong>
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#9a3412' }}>
                      Total: {formatInr(totalMultiVariantAmount)}
                    </span>
                  </div>

                  <Button
                    type="primary"
                    disabled={totalMultiVariantQty === 0}
                    style={{ background: '#ea580c', borderColor: '#ea580c', fontWeight: 700, borderRadius: 8, height: 38 }}
                    onClick={handleAddAllVariantsToCart}
                  >
                    Add All Selected to Cart ({totalMultiVariantQty} pcs)
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ======================================================= */
          /* 👤 CUSTOMER (B2C) PRICING & PROMOTION                   */
          /* ======================================================= */
          <div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginTop: 4 }}>
              <Typography.Text strong style={{ fontSize: 26, lineHeight: 1, color: '#212121' }}>
                {formatInr(consumerPrice)}
              </Typography.Text>
              {mrp > consumerPrice && (
                <>
                  <Typography.Text delete style={{ fontSize: 16, color: '#878787', marginBottom: 2 }}>
                    {formatInr(mrp)}
                  </Typography.Text>
                  {consumerDiscount > 0 && (
                    <Typography.Text strong style={{ fontSize: 16, color: '#388e3c', marginBottom: 2 }}>
                      {consumerDiscount}% off
                    </Typography.Text>
                  )}
                </>
              )}
            </div>
            <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
              Inclusive of all taxes • 100% Farm Milled
            </Typography.Text>

            {/* Consumer Quantity Stepper */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '14px 0' }}>
              <div>
                <Typography.Text strong style={{ fontSize: 13, display: 'block', color: '#0f172a' }}>
                  Quantity
                </Typography.Text>
                <Typography.Text style={{ fontSize: 11, color: '#64748b' }}>
                  Total: <strong>{formatInr(consumerPrice * selectedUnits)}</strong>
                </Typography.Text>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Button
                  shape="circle"
                  icon={<MinusOutlined />}
                  disabled={selectedUnits <= 1}
                  onClick={() => setSelectedUnits((prev) => Math.max(1, prev - 1))}
                />
                <span style={{ fontSize: 15, fontWeight: 700, minWidth: 24, textAlign: 'center' }}>
                  {selectedUnits}
                </span>
                <Button
                  shape="circle"
                  icon={<PlusOutlined />}
                  onClick={() => setSelectedUnits((prev) => Math.min(10, prev + 1))}
                />
              </div>
            </div>

            {/* Promotional Banner for Wholesale Upgrade */}
            <div
              style={{
                background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
                border: '1px solid #fed7aa',
                borderRadius: 10,
                padding: 12,
                marginBottom: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div>
                <Typography.Text strong style={{ color: '#9a3412', fontSize: 13, display: 'block' }}>
                  🏪 Own a Grocery Store?
                </Typography.Text>
                <Typography.Text style={{ color: '#c2410c', fontSize: 11 }}>
                  Get wholesale tier pricing up to <strong>{tierPricing[3].discount}% OFF</strong> with GST invoices.
                </Typography.Text>
              </div>
              <Button
                size="small"
                type="primary"
                style={{ background: '#ea580c', borderColor: '#ea580c', borderRadius: 6, fontWeight: 600, fontSize: 11 }}
                onClick={() => navigate('/register')}
              >
                Become a Partner
              </Button>
            </div>
          </div>
        )}

        {/* Highlights */}
        {(activeProduct as any).highlights && (
          <div style={{ marginTop: 18, borderTop: '1px solid #f0f0f0', paddingTop: 14 }}>
            <Typography.Text strong style={{ display: 'block', fontSize: 14, marginBottom: 8, color: '#212121' }}>
              Product Highlights
            </Typography.Text>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#212121', lineHeight: 1.6 }}>
              {(activeProduct as any).highlights.slice(0, showAllHighlights ? undefined : 3).map((hl: string, i: number) => (
                <li key={i}>{hl}</li>
              ))}
            </ul>
            {(activeProduct as any).highlights.length > 3 && (
              <Button
                type="text"
                style={{ padding: 0, color: '#f97316', fontSize: 13, marginTop: 4, height: 'auto', fontWeight: 600 }}
                onClick={() => setShowAllHighlights(!showAllHighlights)}
              >
                {showAllHighlights ? 'Show Less' : 'Show More'}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Variants Selector */}
      {hasVariants && (
        <div style={{ background: '#fff', padding: '16px', marginTop: 8 }}>
          <Typography.Text strong style={{ display: 'block', fontSize: 14, marginBottom: 12 }}>
            Available Variants &amp; Pack Sizes
          </Typography.Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {(product as any).variants.map((v: any) => {
              const isSelected = v.id === selectedVariantId;
              return (
                <div
                  key={v.id}
                  onClick={() => setSelectedVariantId(v.id)}
                  style={{
                    padding: '8px 16px',
                    border: isSelected ? '2px solid #f97316' : '1px solid #e0e0e0',
                    color: isSelected ? '#f97316' : '#212121',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontWeight: isSelected ? 600 : 400,
                    fontSize: 13,
                    background: isSelected ? '#fff7ed' : '#fff',
                  }}
                >
                  {v.name}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Product Information (Description & Specifications Details) */}
      {((activeProduct as any).description || (activeProduct as any).disclaimer || (activeProduct as any).specifications) && (
        <div style={{ background: '#fff', padding: '16px', marginTop: 8 }}>
          <Typography.Text strong style={{ display: 'block', fontSize: 14, marginBottom: 12 }}>
            Product Information &amp; Specifications
          </Typography.Text>
          <div style={{ position: 'relative' }}>
            <div
              style={{
                display: showFullDesc ? 'block' : '-webkit-box',
                WebkitLineClamp: showFullDesc ? 'unset' : 6,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {/* Description */}
              {(activeProduct as any).description && (
                <Typography.Text style={{ fontSize: 13, color: '#212121', lineHeight: 1.6, display: 'block', marginBottom: 16 }}>
                  {(activeProduct as any).description}
                </Typography.Text>
              )}

              {/* Specifications Table */}
              {(activeProduct as any).specifications && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, background: '#fcfcfc', padding: 12, borderRadius: 8, border: '1px solid #f0f0f0' }}>
                  {(activeProduct as any).specifications.map((spec: any, idx: number) => (
                    <div key={idx} style={{ display: 'flex', fontSize: 13, borderBottom: idx < (activeProduct as any).specifications.length - 1 ? '1px solid #f5f5f5' : 'none', paddingBottom: 4 }}>
                      <Typography.Text type="secondary" style={{ width: 140 }}>
                        {spec.label}:
                      </Typography.Text>
                      <Typography.Text strong style={{ color: '#212121', flex: 1 }}>
                        {spec.value}
                      </Typography.Text>
                    </div>
                  ))}
                  <div style={{ display: 'flex', fontSize: 13, paddingTop: 4 }}>
                    <Typography.Text type="secondary" style={{ width: 140 }}>
                      Order Limits:
                    </Typography.Text>
                    <Typography.Text style={{ color: '#212121', flex: 1 }}>
                      Min {isRetailer ? moq : 1} - Max {isRetailer ? maxOrderLimit : 10} pcs
                    </Typography.Text>
                  </div>
                </div>
              )}

              {/* Disclaimer */}
              {(activeProduct as any).disclaimer && (
                <div style={{ marginTop: 8 }}>
                  <Typography.Text strong style={{ fontSize: 12, display: 'block', color: '#424242' }}>
                    Disclaimer:
                  </Typography.Text>
                  <Typography.Text style={{ fontSize: 12, color: '#616161', lineHeight: 1.5, display: 'block' }}>
                    {(activeProduct as any).disclaimer}
                  </Typography.Text>
                </div>
              )}
            </div>

            <Button
              type="text"
              style={{ padding: 0, color: '#f97316', fontSize: 13, marginTop: 8, height: 'auto', fontWeight: 600 }}
              onClick={() => setShowFullDesc(!showFullDesc)}
            >
              {showFullDesc ? 'Read Less' : 'Read More & All Specifications'}
            </Button>
          </div>
        </div>
      )}

      {/* Available Offers */}
      {(activeProduct as any).offers && (
        <div style={{ background: '#fff', padding: '16px', marginTop: 8 }}>
          <Typography.Text strong style={{ display: 'block', fontSize: 14, marginBottom: 12 }}>
            Available Offers &amp; Bank Discounts
          </Typography.Text>
          {(activeProduct as any).offers.map((offer: any, idx: number) => (
            <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <TagOutlined style={{ color: '#388e3c', marginTop: 3 }} />
              <div>
                <Typography.Text strong style={{ fontSize: 13, color: '#212121' }}>
                  {offer.title}:{' '}
                </Typography.Text>
                <Typography.Text style={{ fontSize: 13, color: '#212121' }}>
                  {offer.description}
                </Typography.Text>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delivery & Pincode Check */}
      <div style={{ background: '#fff', padding: '16px', marginTop: 8 }}>
        <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 12 }}>
          {isRetailer ? '🚚 Wholesale Freight & Store Dispatch' : 'Delivery & Services'}
        </Typography.Text>

        {deliveryStatus !== 'SUCCESS' && deliveryStatus !== 'ERROR' ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <Input
              placeholder="Enter Delivery Pincode"
              value={pincode}
              maxLength={6}
              onChange={(e) => {
                setPincode(e.target.value);
                setDeliveryStatus('IDLE');
              }}
              prefix={<EnvironmentOutlined style={{ color: '#878787' }} />}
              style={{ borderRadius: 4, border: 'none', borderBottom: '2px solid #f97316', background: '#fff', boxShadow: 'none' }}
            />
            <Button type="text" style={{ color: '#f97316', fontWeight: 600 }} onClick={handleCheckPincode} loading={deliveryStatus === 'CHECKING'}>
              Check
            </Button>
          </div>
        ) : (
          <div style={{ background: '#fcfcfc', border: '1px solid #f0f0f0', borderRadius: 8, padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <EnvironmentOutlined style={{ color: '#878787' }} />
                <Typography.Text style={{ fontSize: 13, color: '#424242' }}>
                  Deliver to <strong>{pincode}</strong>
                </Typography.Text>
              </div>
              <Button
                type="link"
                style={{ padding: 0, height: 'auto', fontSize: 12, color: '#f97316' }}
                onClick={() => {
                  setPincode('');
                  setDeliveryStatus('IDLE');
                  setDeliveryInfo(null);
                }}
              >
                Change
              </Button>
            </div>

            {deliveryStatus === 'SUCCESS' && deliveryInfo && (
              <div style={{ marginTop: 8 }}>
                {deliveryInfo.mode === 'QUICK' ? (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ fontSize: 16 }}>⚡</div>
                    <div>
                      <Typography.Text strong style={{ display: 'block', color: '#16a34a', fontSize: 14 }}>
                        {isRetailer ? 'Morning Store Freight' : 'Quick Delivery'}
                      </Typography.Text>
                      <Typography.Text style={{ display: 'block', color: '#212121', fontSize: 13 }}>
                        {deliveryInfo.eta}
                      </Typography.Text>
                      <Typography.Text style={{ display: 'block', color: '#616161', fontSize: 12 }}>
                        Delivery charge: {deliveryInfo.charge === 0 ? 'Free' : `₹${deliveryInfo.charge}`}
                      </Typography.Text>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ fontSize: 16 }}>🚚</div>
                    <div>
                      <Typography.Text strong style={{ display: 'block', color: '#2563eb', fontSize: 14 }}>
                        Standard Dispatch
                      </Typography.Text>
                      <Typography.Text style={{ display: 'block', color: '#212121', fontSize: 13 }}>
                        {deliveryInfo.eta}
                      </Typography.Text>
                      <Typography.Text style={{ display: 'block', color: '#616161', fontSize: 12 }}>
                        Delivery charge: {deliveryInfo.charge === 0 ? 'Free' : `₹${deliveryInfo.charge}`}
                      </Typography.Text>
                    </div>
                  </div>
                )}
              </div>
            )}

            {deliveryStatus === 'ERROR' && (
              <div style={{ marginTop: 8, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4 }}>
                <Typography.Text strong style={{ display: 'block', color: '#dc2626', fontSize: 13 }}>
                  Delivery not available at this location
                </Typography.Text>
                <Typography.Text style={{ fontSize: 12, color: '#7f1d1d' }}>
                  Please try entering a different pincode.
                </Typography.Text>
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 16, display: 'flex', gap: 24, justifyContent: 'space-around' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#fff7ed', color: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <SyncOutlined />
            </div>
            <Typography.Text style={{ fontSize: 11, textAlign: 'center' }}>
              {(activeProduct as any).returnPolicy || '7 Days Return'}
            </Typography.Text>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#fff7ed', color: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircleOutlined />
            </div>
            <Typography.Text style={{ fontSize: 11, textAlign: 'center' }}>
              {isRetailer ? 'B2B Net Credit' : 'Cash on Delivery'}
            </Typography.Text>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#fff7ed', color: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <SafetyCertificateOutlined />
            </div>
            <Typography.Text style={{ fontSize: 11, textAlign: 'center' }}>
              {(activeProduct as any).warranty || '100% Quality'}
            </Typography.Text>
          </div>
        </div>
      </div>

      {/* Business Information (Available for B2B Wholesale / Retailers) */}
      {isRetailer && (
        <div style={{ background: '#fff', padding: '0 16px 16px', marginTop: 8 }}>
          <Collapse
            ghost
            defaultActiveKey={['1']}
            expandIconPosition="end"
            items={[
              {
                key: '1',
                label: <Typography.Text strong style={{ fontSize: 14 }}>Business &amp; GST Compliance</Typography.Text>,
                children: (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', borderBottom: '1px solid #f0f0f0', paddingBottom: 8 }}>
                      <Typography.Text style={{ flex: 1, color: '#878787', fontSize: 13 }}>GST Invoice</Typography.Text>
                      <Typography.Text strong style={{ flex: 2, color: '#16a34a', fontSize: 13 }}>
                        Available with 100% Input Tax Credit (ITC)
                      </Typography.Text>
                    </div>
                    <div style={{ display: 'flex', borderBottom: '1px solid #f0f0f0', paddingBottom: 8 }}>
                      <Typography.Text style={{ flex: 1, color: '#878787', fontSize: 13 }}>HSN Classification</Typography.Text>
                      <Typography.Text style={{ flex: 2, color: '#212121', fontSize: 13 }}>
                        {hsnCode} (5% GST)
                      </Typography.Text>
                    </div>
                    <div style={{ display: 'flex', borderBottom: '1px solid #f0f0f0', paddingBottom: 8 }}>
                      <Typography.Text style={{ flex: 1, color: '#878787', fontSize: 13 }}>Business Support</Typography.Text>
                      <Typography.Text style={{ flex: 2, color: '#212121', fontSize: 13 }}>
                        Dedicated Distributor Desk: +91 1800-BALAJI
                      </Typography.Text>
                    </div>
                    <div style={{ display: 'flex', borderBottom: '1px solid #f0f0f0', paddingBottom: 8 }}>
                      <Typography.Text style={{ flex: 1, color: '#878787', fontSize: 13 }}>Delivery Terms</Typography.Text>
                      <Typography.Text style={{ flex: 2, color: '#212121', fontSize: 13 }}>
                        Direct Dispatch from Nizamabad Milling Unit to Storefront
                      </Typography.Text>
                    </div>
                  </div>
                ),
              },
            ]}
          />
        </div>
      )}

      {/* Frequently Asked Questions (FAQs) */}
      {(activeProduct as any).faqs && (
        <div style={{ background: '#fff', padding: '0 16px 16px', marginTop: 8 }}>
          <Collapse
            ghost
            expandIconPosition="end"
            items={[
              {
                key: '1',
                label: <Typography.Text strong style={{ fontSize: 14 }}>Questions and Answers (FAQs)</Typography.Text>,
                children: (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {(activeProduct as any).faqs.map((faq: any, idx: number) => (
                      <div key={idx}>
                        <Typography.Text strong style={{ display: 'block', fontSize: 13 }}>
                          Q: {faq.question}
                        </Typography.Text>
                        <Typography.Text style={{ display: 'block', fontSize: 13, color: '#424242', marginTop: 4 }}>
                          A: {faq.answer}
                        </Typography.Text>
                      </div>
                    ))}
                  </div>
                ),
              },
            ]}
          />
        </div>
      )}

      {/* Frequently Bought Together */}
      <div style={{ marginTop: 8, background: '#fff', padding: '16px 0 24px' }}>
        <Typography.Text strong style={{ display: 'block', fontSize: 14, margin: '0 16px 16px' }}>
          Frequently Bought Together
        </Typography.Text>
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '0 16px 10px' }}>
          <style>{`
            div::-webkit-scrollbar { display: none; }
            .product-dots li button { background: #c2c2c2 !important; height: 6px !important; border-radius: 4px !important; }
            .product-dots li.slick-active button { background: #f97316 !important; width: 16px !important; }
          `}</style>
          {popularProducts.slice(0, 6).map((related) => {
            const relatedCartLine = cart.lines.find((line) => line.productId === related.id);
            const relatedPrice = isRetailer ? Math.round(related.price * 0.8) : related.price;
            return (
              <div
                key={related.id}
                style={{
                  width: 144,
                  flexShrink: 0,
                  borderRadius: 8,
                  border: '1px solid #f0f0f0',
                  padding: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  background: '#ffffff',
                }}
              >
                <Link to={`/product-detail/${related.id}`} style={{ textDecoration: 'none' }}>
                  <div style={{ width: '100%', height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8, background: '#fafaf9', borderRadius: 6 }}>
                    <img src={related.image} alt={related.name} style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }} />
                  </div>
                  <Typography.Text style={{ display: 'block', fontSize: 12, color: '#212121', lineHeight: 1.3, height: 32, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {related.name}
                  </Typography.Text>
                </Link>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 8 }}>
                  <Typography.Text strong style={{ fontSize: 14, color: isRetailer ? '#065f46' : '#212121' }}>
                    {formatInr(relatedPrice)}
                  </Typography.Text>

                  {relatedCartLine ? (
                    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #fed7aa', borderRadius: 6, background: '#fff7ed' }}>
                      <Button
                        size="small"
                        type="text"
                        icon={<MinusOutlined style={{ fontSize: 9 }} />}
                        onClick={() => cart.setQuantity(related.id, relatedCartLine.quantity - 1)}
                        style={{ width: 22, minWidth: 22, height: 22, padding: 0 }}
                      />
                      <Typography.Text strong style={{ width: 20, textAlign: 'center', fontSize: 11, color: '#ea580c' }}>
                        {relatedCartLine.quantity}
                      </Typography.Text>
                      <Button
                        size="small"
                        type="text"
                        icon={<PlusOutlined style={{ fontSize: 9 }} />}
                        onClick={() => cart.setQuantity(related.id, relatedCartLine.quantity + 1)}
                        style={{ width: 22, minWidth: 22, height: 22, padding: 0 }}
                      />
                    </div>
                  ) : (
                    <Button
                      size="small"
                      style={{ border: '1px solid #f97316', color: '#f97316', borderRadius: 6, padding: '0 8px', fontSize: 11, fontWeight: 600, height: 24 }}
                      onClick={() =>
                        cart.add({
                          productId: related.id,
                          productName: related.name,
                          unit: (related as any).variant || (related as any).weight || '1 pack',
                          displayUnitPrice: relatedPrice,
                          imageUrl: related.image,
                          mrp: (related as any).mrp,
                        })
                      }
                    >
                      ADD
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sticky Bottom Bar for Actions */}
      <div
        className="store-safe-bottom"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: '#fff',
          display: 'flex',
          boxShadow: '0 -2px 10px rgba(0,0,0,0.1)',
          zIndex: 100,
        }}
      >
        <Button
          type="text"
          style={{
            flex: 1,
            height: 56,
            borderRadius: 0,
            background: '#fff',
            fontSize: 15,
            fontWeight: 600,
            color: '#ea580c',
            borderRight: '1px solid #fed7aa',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={handleAddToCart}
        >
          {isRetailer
            ? `Add ${wholesaleQty} pcs • ${formatInr(totalWholesaleOrderAmount)}`
            : `Add to Cart • ${formatInr(consumerPrice * selectedUnits)}`}
        </Button>

        <Button
          type="primary"
          style={{
            flex: 1,
            height: 56,
            borderRadius: 0,
            background: '#f97316',
            borderColor: '#f97316',
            fontSize: 15,
            fontWeight: 600,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => {
            handleAddToCart();
            navigate('/cart');
          }}
        >
          {isRetailer ? 'Bulk Consignment' : 'Buy Now'}
        </Button>
      </div>
    </div>
  );
}
