import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  EnvironmentOutlined,
  HeartOutlined,
  MinusOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  ShareAltOutlined,
  ShoppingCartOutlined,
  StarFilled,
  SyncOutlined,
  TagOutlined
} from '@ant-design/icons';
import { Badge, Button, Carousel, Collapse, Divider, Input, Tag, Typography, message } from 'antd';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@shared/auth/useAuth';
import { useCart } from '../cart/useCart';
import { bestOfBasics, buyAgainProducts, popularProducts } from '../mock/homeMockData';

function formatInr(value: number): string {
  return `₹${value.toLocaleString('en-IN')}`;
}

export function ProductDetailPage() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const cart = useCart();
  
  // Use Auth to determine B2B vs B2C pricing
  const { user } = useAuth();
  const isRetailer = (user as any)?.channel === 'B2B'; // Assuming channel distinguishes them in AuthUser

  // Pincode mock state
  const [pincode, setPincode] = useState('');
  const [deliveryStatus, setDeliveryStatus] = useState<'IDLE' | 'CHECKING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [deliveryInfo, setDeliveryInfo] = useState<{ mode: 'QUICK' | 'STANDARD', eta: string, charge: number } | null>(null);
  
  // Highlights toggle state
  const [showAllHighlights, setShowAllHighlights] = useState(false);
  
  // Description toggle state
  const [showFullDesc, setShowFullDesc] = useState(false);

  // Mock finding the product
  const allMockProducts = [...popularProducts, ...bestOfBasics, ...buyAgainProducts];
  const product = allMockProducts.find((p) => p.id === productId) || allMockProducts[0];

  // Variant Management
  const hasVariants = 'variants' in product && Array.isArray((product as any).variants) && (product as any).variants.length > 0;
  const defaultVariantId = hasVariants ? (product as any).variants[0].id : null;
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(defaultVariantId);

  // Get active variant details or fallback to base product
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
      images: (product as any).images || [product.image]
    };
  }, [product, hasVariants, selectedVariantId]);

  const cartLine = cart.lines.find((line) => line.productId === (activeProduct as any).id);
  const variantText = (activeProduct as any).variant || (activeProduct as any).weight || '1 unit';

  // Apply Retailer Discount Mock Logic (e.g. 10% off for B2B)
  const basePrice = (activeProduct as any).price;
  const applicablePrice = isRetailer ? Math.floor(basePrice * 0.9) : basePrice; 
  const applicableMrp = (activeProduct as any).mrp;
  const discountPercent = applicableMrp > 0 ? Math.round(((applicableMrp - applicablePrice) / applicableMrp) * 100) : 0;

  const handleCheckPincode = () => {
    if (pincode.length !== 6) return;
    setDeliveryStatus('CHECKING');
    setTimeout(() => {
      // Mock logic: 
      // Pincodes starting with '500' are Quick Delivery
      // Pincodes starting with '400' are Standard Delivery
      // Others are Not Serviceable
      if (pincode.startsWith('500')) {
        const info = { mode: 'QUICK' as const, eta: 'Today by 7:30 PM', charge: 30 };
        setDeliveryInfo(info);
        setDeliveryStatus('SUCCESS');
        cart.setDelivery(pincode, info);
        message.success('Quick Delivery available!');
      } else if (pincode.startsWith('400')) {
        const info = { mode: 'STANDARD' as const, eta: 'Expected by 5 Sep', charge: 50 };
        setDeliveryInfo(info);
        setDeliveryStatus('SUCCESS');
        cart.setDelivery(pincode, info);
        message.success('Standard Delivery available!');
      } else {
        setDeliveryInfo(null);
        setDeliveryStatus('ERROR');
        cart.setDelivery(null, null);
        message.error('Delivery not available at this location');
      }
    }, 800);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f3f6', paddingBottom: 80, display: 'flex', flexDirection: 'column' }}>
      {/* Sticky Header */}
      <header
        className="store-safe-top"
        style={{
          position: 'sticky',
          top: 0,
          background: '#fff',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 100,
          boxShadow: '0 1px 4px rgba(0,0,0,0.05)'
        }}
      >
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
        >
          <ArrowLeftOutlined style={{ fontSize: 20, color: '#1c1917' }} />
        </button>
        <Typography.Text strong style={{ fontSize: 16 }}>Product Detail</Typography.Text>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <SearchOutlined style={{ fontSize: 20, color: '#1c1917', cursor: 'pointer' }} onClick={() => navigate('/')} />
          <div style={{ cursor: 'pointer', position: 'relative' }} onClick={() => navigate('/cart')}>
            <Badge count={cart.count} size="small" offset={[-2, 2]}>
              <ShoppingCartOutlined style={{ fontSize: 20, color: '#1c1917' }} />
            </Badge>
          </div>
        </div>
      </header>

      {/* Breadcrumbs */}
      <div style={{ padding: '12px 16px', background: '#fff', fontSize: 12, color: '#878787' }}>
        Home {'>'} Groceries {'>'} {(activeProduct as any).name}
      </div>

      {/* Product Image Carousel */}
      <div style={{ background: '#fff', padding: '16px 0 24px', position: 'relative' }}>
        <button style={{ position: 'absolute', top: 16, right: 16, zIndex: 10, background: '#fff', border: '1px solid #e0e0e0', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
          <HeartOutlined style={{ fontSize: 18, color: '#878787' }} />
        </button>
        <button style={{ position: 'absolute', top: 60, right: 16, zIndex: 10, background: '#fff', border: '1px solid #e0e0e0', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
          <ShareAltOutlined style={{ fontSize: 18, color: '#878787' }} />
        </button>

        <Carousel autoplay dots={{ className: 'product-dots' }} style={{ height: 300 }}>
          {(activeProduct as any).images.map((img: string, idx: number) => (
            <div key={idx} style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src={img} alt={`Slide ${idx}`} style={{ height: 300, width: '100%', objectFit: 'contain' }} />
            </div>
          ))}
        </Carousel>
      </div>

      {/* Core Info & Pricing */}
      <div style={{ background: '#fff', padding: '16px', marginTop: 8 }}>
        {(activeProduct as any).brand && (
           <Typography.Text style={{ color: '#878787', fontSize: 13, textTransform: 'uppercase', fontWeight: 600 }}>{(activeProduct as any).brand}</Typography.Text>
        )}
        <Typography.Title level={4} style={{ margin: '4px 0 8px', fontSize: 18, color: '#212121', fontWeight: 500 }}>
          {(activeProduct as any).name}
        </Typography.Title>
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>SKU: {(activeProduct as any).sku || 'N/A'}</Typography.Text>
        
        {/* Rating */}
        {((activeProduct as any).rating) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 12 }}>
            <div style={{ background: '#388e3c', color: '#fff', padding: '2px 6px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700 }}>
              {(activeProduct as any).rating} <StarFilled style={{ fontSize: 10 }} />
            </div>
            <Typography.Text style={{ color: '#878787', fontSize: 13 }}>{(activeProduct as any).reviewCount} Ratings</Typography.Text>
          </div>
        )}

        {/* Pricing */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginTop: 12 }}>
          <Typography.Text strong style={{ fontSize: 26, lineHeight: 1, color: '#212121' }}>
            {formatInr(applicablePrice)}
          </Typography.Text>
          {applicableMrp && (
            <>
              <Typography.Text delete style={{ fontSize: 16, color: '#878787', marginBottom: 2 }}>
                {formatInr(applicableMrp)}
              </Typography.Text>
              {discountPercent > 0 && (
                <Typography.Text strong style={{ fontSize: 16, color: '#388e3c', marginBottom: 2 }}>
                  {discountPercent}% off
                </Typography.Text>
              )}
            </>
          )}
        </div>
        {isRetailer && (
          <Typography.Text style={{ display: 'block', fontSize: 12, color: '#c2410c', marginTop: 4, fontWeight: 500 }}>
            Retailer Price Applied
          </Typography.Text>
        )}

        {/* Highlights */}
        {(activeProduct as any).highlights && (
          <div style={{ marginTop: 24, borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
            <Typography.Text strong style={{ display: 'block', fontSize: 14, marginBottom: 8, color: '#212121' }}>Product Highlights</Typography.Text>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#212121', lineHeight: 1.6 }}>
              {(activeProduct as any).highlights.slice(0, showAllHighlights ? undefined : 3).map((hl: string, i: number) => (
                <li key={i}>{hl}</li>
              ))}
            </ul>
            {((activeProduct as any).highlights.length > 3) && (
               <Button type="text" style={{ padding: 0, color: '#f97316', fontSize: 13, marginTop: 4, height: 'auto', fontWeight: 600 }} onClick={() => setShowAllHighlights(!showAllHighlights)}>
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
            Available Variants
          </Typography.Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
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
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontWeight: isSelected ? 600 : 400,
                    fontSize: 14,
                    background: isSelected ? '#fff7ed' : '#fff'
                  }}
                >
                  {v.name}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Product Information (Description & Details) */}
      {((activeProduct as any).description || (activeProduct as any).disclaimer) && (
        <div style={{ background: '#fff', padding: '16px', marginTop: 8 }}>
          <Typography.Text strong style={{ display: 'block', fontSize: 14, marginBottom: 12 }}>
            Product Information
          </Typography.Text>
          <div style={{ position: 'relative' }}>
            <div
              style={{ 
                display: showFullDesc ? 'block' : '-webkit-box',
                WebkitLineClamp: showFullDesc ? 'unset' : 6,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden'
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {(activeProduct as any).specifications.map((spec: any, idx: number) => (
                    <div key={idx} style={{ display: 'flex', fontSize: 13 }}>
                      <Typography.Text type="secondary" style={{ width: 120 }}>{spec.label}:</Typography.Text>
                      <Typography.Text style={{ color: '#212121', flex: 1 }}>{spec.value}</Typography.Text>
                    </div>
                  ))}
                  {(activeProduct as any).orderQuantityLimits && (
                    <div style={{ display: 'flex', fontSize: 13 }}>
                      <Typography.Text type="secondary" style={{ width: 120 }}>Order Limits:</Typography.Text>
                      <Typography.Text style={{ color: '#212121', flex: 1 }}>
                        Min {(activeProduct as any).orderQuantityLimits.min} - Max {(activeProduct as any).orderQuantityLimits.max}
                      </Typography.Text>
                    </div>
                  )}
                </div>
              )}

              {/* Disclaimer */}
              {(activeProduct as any).disclaimer && (
                <div>
                  <Typography.Text strong style={{ fontSize: 12, display: 'block', color: '#424242' }}>Disclaimer:</Typography.Text>
                  <Typography.Text style={{ fontSize: 12, color: '#616161', lineHeight: 1.5, display: 'block' }}>
                    {(activeProduct as any).disclaimer}
                  </Typography.Text>
                </div>
              )}
            </div>
            {/* Always show Read More/Less if it might be long (simplified logic for demo) */}
            <Button type="text" style={{ padding: 0, color: '#f97316', fontSize: 13, marginTop: 8, height: 'auto', fontWeight: 600 }} onClick={() => setShowFullDesc(!showFullDesc)}>
              {showFullDesc ? 'Read Less' : 'Read More'}
            </Button>
          </div>
        </div>
      )}

      {/* Offers */}
      {((activeProduct as any).offers) && (
        <div style={{ background: '#fff', padding: '16px', marginTop: 8 }}>
          <Typography.Text strong style={{ display: 'block', fontSize: 14, marginBottom: 12 }}>
            Available Offers
          </Typography.Text>
          {(activeProduct as any).offers.map((offer: any, idx: number) => (
            <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <TagOutlined style={{ color: '#388e3c', marginTop: 4 }} />
              <div>
                <Typography.Text strong style={{ fontSize: 13, color: '#212121' }}>{offer.title}: </Typography.Text>
                <Typography.Text style={{ fontSize: 13, color: '#212121' }}>{offer.description}</Typography.Text>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delivery Check */}
      <div style={{ background: '#fff', padding: '16px', marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Typography.Text strong style={{ fontSize: 14 }}>
            Delivery & Services
          </Typography.Text>
        </div>
        
        {deliveryStatus !== 'SUCCESS' && deliveryStatus !== 'ERROR' ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <Input 
              placeholder="Enter Delivery Pincode" 
              value={pincode} 
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
                <Typography.Text style={{ fontSize: 13, color: '#424242' }}>Deliver to <strong>{pincode}</strong></Typography.Text>
              </div>
              <Button type="link" style={{ padding: 0, height: 'auto', fontSize: 12, color: '#f97316' }} onClick={() => {
                setPincode('');
                setDeliveryStatus('IDLE');
                setDeliveryInfo(null);
              }}>
                Change
              </Button>
            </div>
            
            {deliveryStatus === 'SUCCESS' && deliveryInfo && (
              <div style={{ marginTop: 8 }}>
                {deliveryInfo.mode === 'QUICK' ? (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ fontSize: 16 }}>⚡</div>
                    <div>
                      <Typography.Text strong style={{ display: 'block', color: '#16a34a', fontSize: 14 }}>Quick Delivery</Typography.Text>
                      <Typography.Text style={{ display: 'block', color: '#212121', fontSize: 13 }}>{deliveryInfo.eta}</Typography.Text>
                      <Typography.Text style={{ display: 'block', color: '#616161', fontSize: 12 }}>Delivery charge: {deliveryInfo.charge === 0 ? 'Free' : `₹${deliveryInfo.charge}`}</Typography.Text>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ fontSize: 16 }}>🚚</div>
                    <div>
                      <Typography.Text strong style={{ display: 'block', color: '#2563eb', fontSize: 14 }}>Standard Delivery</Typography.Text>
                      <Typography.Text style={{ display: 'block', color: '#212121', fontSize: 13 }}>{deliveryInfo.eta}</Typography.Text>
                      <Typography.Text style={{ display: 'block', color: '#616161', fontSize: 12 }}>Delivery charge: {deliveryInfo.charge === 0 ? 'Free' : `₹${deliveryInfo.charge}`}</Typography.Text>
                    </div>
                  </div>
                )}
              </div>
            )}

            {deliveryStatus === 'ERROR' && (
               <div style={{ marginTop: 8, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4 }}>
                 <Typography.Text strong style={{ display: 'block', color: '#dc2626', fontSize: 13 }}>Delivery not available at this location</Typography.Text>
                 <Typography.Text style={{ fontSize: 12, color: '#7f1d1d' }}>Please try changing the pincode.</Typography.Text>
               </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 16, display: 'flex', gap: 24 }}>
           <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
             <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#fff7ed', color: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><SyncOutlined /></div>
             <Typography.Text style={{ fontSize: 11, textAlign: 'center' }}>{(activeProduct as any).returnPolicy || '7 Days Return'}</Typography.Text>
           </div>
           <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
             <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#fff7ed', color: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CheckCircleOutlined /></div>
             <Typography.Text style={{ fontSize: 11, textAlign: 'center' }}>Cash on Delivery</Typography.Text>
           </div>
           <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
             <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#fff7ed', color: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><SafetyCertificateOutlined /></div>
             <Typography.Text style={{ fontSize: 11, textAlign: 'center' }}>{(activeProduct as any).warranty || 'No Warranty'}</Typography.Text>
           </div>
        </div>
      </div>

      {/* Removed old Highlights & Description block since they were moved up */}


      {/* Business Information */}
      {isRetailer && (activeProduct as any).businessInfo && (
        <div style={{ background: '#fff', padding: '0 16px 16px', marginTop: 8 }}>
          <Collapse ghost expandIconPosition="end" items={[
            {
              key: '1',
              label: <Typography.Text strong style={{ fontSize: 14 }}>Business Information</Typography.Text>,
              children: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', borderBottom: '1px solid #f0f0f0', paddingBottom: 8 }}>
                    <Typography.Text style={{ flex: 1, color: '#878787', fontSize: 13 }}>GST Invoice</Typography.Text>
                    <Typography.Text style={{ flex: 2, color: '#212121', fontSize: 13 }}>
                      {(activeProduct as any).businessInfo.gstInvoice ? 'Available' : 'Not Available'}
                    </Typography.Text>
                  </div>
                  <div style={{ display: 'flex', borderBottom: '1px solid #f0f0f0', paddingBottom: 8 }}>
                    <Typography.Text style={{ flex: 1, color: '#878787', fontSize: 13 }}>Business Support</Typography.Text>
                    <Typography.Text style={{ flex: 2, color: '#212121', fontSize: 13 }}>
                      {(activeProduct as any).businessInfo.businessSupport ? 'Yes' : 'No'}
                    </Typography.Text>
                  </div>
                  <div style={{ display: 'flex', borderBottom: '1px solid #f0f0f0', paddingBottom: 8 }}>
                    <Typography.Text style={{ flex: 1, color: '#878787', fontSize: 13 }}>Delivery Terms</Typography.Text>
                    <Typography.Text style={{ flex: 2, color: '#212121', fontSize: 13 }}>
                      {(activeProduct as any).businessInfo.deliveryTerms}
                    </Typography.Text>
                  </div>
                </div>
              )
            }
          ]} />
        </div>
      )}

      {/* FAQs */}
      {((activeProduct as any).faqs) && (
        <div style={{ background: '#fff', padding: '0 16px 16px', marginTop: 8 }}>
          <Collapse ghost expandIconPosition="end" items={[
            {
              key: '1',
              label: <Typography.Text strong style={{ fontSize: 14 }}>Questions and Answers</Typography.Text>,
              children: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {(activeProduct as any).faqs.map((faq: any, idx: number) => (
                    <div key={idx}>
                      <Typography.Text strong style={{ display: 'block', fontSize: 13 }}>Q: {faq.question}</Typography.Text>
                      <Typography.Text style={{ display: 'block', fontSize: 13, color: '#424242', marginTop: 4 }}>A: {faq.answer}</Typography.Text>
                    </div>
                  ))}
                </div>
              )
            }
          ]} />
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
          {popularProducts.slice(0, 5).map(related => {
            const relatedCartLine = cart.lines.find((line) => line.productId === related.id);
            return (
              <div key={related.id} style={{ width: 140, flexShrink: 0, borderRadius: 4, border: '1px solid #f0f0f0', padding: 8, display: 'flex', flexDirection: 'column' }}>
                <Link to={`/product-detail/${related.id}`} style={{ textDecoration: 'none' }}>
                  <div style={{ width: '100%', height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                    <img src={related.image} alt={related.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                  </div>
                  <Typography.Text style={{ display: 'block', fontSize: 12, color: '#212121', lineHeight: 1.3, height: 32, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {related.name}
                  </Typography.Text>
                </Link>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 8 }}>
                  <Typography.Text strong style={{ fontSize: 14, color: '#212121' }}>
                    {formatInr(isRetailer ? Math.floor(related.price * 0.9) : related.price)}
                  </Typography.Text>
                  
                  {relatedCartLine ? (
                    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #d3d3d3', borderRadius: 2 }}>
                      <Button size="small" type="text" icon={<MinusOutlined style={{ fontSize: 10 }} />} onClick={() => cart.setQuantity(related.id, relatedCartLine.quantity - 1)} style={{ width: 24, minWidth: 24, height: 24, padding: 0 }} />
                      <Typography.Text strong style={{ width: 24, textAlign: 'center', fontSize: 12, background: '#f5f5f5', borderLeft: '1px solid #d3d3d3', borderRight: '1px solid #d3d3d3' }}>{relatedCartLine.quantity}</Typography.Text>
                      <Button size="small" type="text" icon={<PlusOutlined style={{ fontSize: 10 }} />} onClick={() => cart.setQuantity(related.id, relatedCartLine.quantity + 1)} style={{ width: 24, minWidth: 24, height: 24, padding: 0 }} />
                    </div>
                  ) : (
                    <Button
                      size="small"
                      style={{ border: '1px solid #f97316', color: '#f97316', borderRadius: 2, padding: '0 8px', fontSize: 12, fontWeight: 500 }}
                      onClick={() => cart.add({ productId: related.id, productName: related.name, unit: (related as any).variant || (related as any).weight || '1 pack', displayUnitPrice: isRetailer ? Math.floor(related.price * 0.9) : related.price, imageUrl: related.image, mrp: (related as any).mrp })}
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
          zIndex: 100
        }}
      >
        <Button 
          type="text" 
          style={{ flex: 1, height: 56, borderRadius: 0, background: '#fff', fontSize: 16, fontWeight: 500, color: '#212121', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => {
            if (cartLine) {
              cart.setQuantity(activeProduct.id, cartLine.quantity + 1);
            } else {
              cart.add({
                productId: activeProduct.id,
                productName: activeProduct.name,
                unit: variantText,
                displayUnitPrice: applicablePrice,
                imageUrl: activeProduct.image,
                mrp: applicableMrp,
              });
            }
            message.success('Added to Cart');
          }}
        >
          Add to Cart
        </Button>
        <Button 
          type="primary" 
          style={{ flex: 1, height: 56, borderRadius: 0, background: '#f97316', borderColor: '#f97316', fontSize: 16, fontWeight: 500, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => {
             // Mock Buy Now
             if (!cartLine) {
                cart.add({
                  productId: activeProduct.id,
                  productName: activeProduct.name,
                  unit: variantText,
                  displayUnitPrice: applicablePrice,
                  imageUrl: activeProduct.image,
                  mrp: applicableMrp,
                });
             }
             navigate('/cart');
          }}
        >
          Buy Now
        </Button>
      </div>
    </div>
  );
}
