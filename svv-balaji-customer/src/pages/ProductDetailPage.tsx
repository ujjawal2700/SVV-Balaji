import {
  ArrowLeftOutlined,
  CheckCircleFilled,
  CheckCircleOutlined,
  EnvironmentOutlined,
  FileProtectOutlined,
  GiftOutlined,
  HeartFilled,
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
import { Badge, Button, Carousel, Collapse, Divider, Input, InputNumber, Spin, Switch, Table, Tag, Typography, message } from 'antd';
import type { StorefrontPriceTier, StorefrontVariant } from '@shared/api/types';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useToggleWishlist, useWishlist } from '../hooks/useWishlist';
import { useCustomerAuth } from '../auth/CustomerAuthContext';
import { useCart } from '../cart/useCart';
import { useCatalogueProduct, useCatalogueProducts } from '../hooks/useCatalogue';
import { useLoyaltyEstimate } from '../loyalty/useLoyaltyEstimate';

import { formatInr } from '../utils/money';


/** One buyable pack size: the product's own pack, or one of its variants. */
interface Pack {
  /** What the cart keys on - the product id for the primary pack, the variant id otherwise. */
  id: string;
  name: string;
  sku: string;
  images: string[];
  /** GST-inclusive reference price, or null when the pack carries none. */
  mrp: number | null;
  /** GST-inclusive consumer/retailer entry price for the current channel. */
  price: number | null;
  priceTiers: StorefrontPriceTier[];
}

/** Ladder in the shape the cart prices from - GST-inclusive, as displayed. */
const toCartTiers = (tiers: StorefrontPriceTier[]) =>
  tiers.map((t) => ({ minQuantity: t.minQuantity, unitPrice: t.unitPriceInclGst }));

/** The tier a quantity falls into: the highest break at or below it, else the lowest. */
function tierFor(tiers: StorefrontPriceTier[], quantity: number): StorefrontPriceTier | undefined {
  const sorted = [...tiers].sort((a, b) => a.minQuantity - b.minQuantity);
  return [...sorted].reverse().find((t) => quantity >= t.minQuantity) ?? sorted[0];
}

export function ProductDetailPage() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const cart = useCart();
  const { role, isLoggedIn } = useCustomerAuth();
  const wishlist = useWishlist();
  const toggleWishlist = useToggleWishlist();
  const isRetailer = role === 'RETAILER';
  // Every section below renders from this one response. The channel is part of
  // the query, so flipping the role switcher refetches with the other price list.
  const catalogue = useCatalogueProduct(productId);
  const detail = catalogue.data;
  const wishlisted = detail ? wishlist.has(detail.id) : false;
  const handleWishlistToggle = () => {
    if (!detail) return;
    if (!isLoggedIn) {
      message.info('Sign in to save items to your wishlist');
      navigate('/login', { state: { from: window.location.pathname } });
      return;
    }
    toggleWishlist.mutate(
      { productId: detail.id, saved: wishlisted },
      { onSuccess: () => message.success(wishlisted ? 'Removed from wishlist' : 'Saved to wishlist') },
    );
  };


  // Pincode mock state
  const [pincode, setPincode] = useState('');
  const [deliveryStatus, setDeliveryStatus] = useState<'IDLE' | 'CHECKING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [deliveryInfo, setDeliveryInfo] = useState<{ mode: 'QUICK' | 'STANDARD'; eta: string; charge: number } | null>(null);

  // Toggle states
  const [showAllHighlights, setShowAllHighlights] = useState(false);
  const [showFullDesc, setShowFullDesc] = useState(false);
  const [showGstInclusive, setShowGstInclusive] = useState(true);

  // Pack size. Null = the product's own (primary) pack.
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [variantQuantities, setVariantQuantities] = useState<{ [variantId: string]: number }>({});

  const [wholesaleQty, setWholesaleQty] = useState<number>(1);
  const [selectedUnits, setSelectedUnits] = useState<number>(1);

  // What this quantity would earn, per the server's live loyalty rules (product-level
  // price, same as order placement). Says so plainly when the item is not eligible.
  const loyaltyEstimate = useLoyaltyEstimate(
    detail ? [{ productId: detail.id, quantity: isRetailer ? wholesaleQty : selectedUnits }] : [],
  );
  const loyaltyQuote = loyaltyEstimate.data;
  const loyaltyText = !loyaltyQuote?.enabled
    ? null
    : loyaltyQuote.points > 0
      ? `Earn ${loyaltyQuote.points} loyalty pts once delivered`
      : loyaltyQuote.lines[0] && !loyaltyQuote.lines[0].eligible
        ? 'This item does not earn loyalty points'
        : null;

  // Related products: same category (parent included), never the product itself.
  const relatedQuery = useCatalogueProducts({
    categorySlug: detail?.category?.parent?.slug ?? detail?.category?.slug,
    limit: 8,
  });
  const related = relatedQuery.products.filter((p) => p.id !== detail?.id).slice(0, 6);

  // Order limits come from the product, not from constants in this file.
  const moq = detail?.orderLimits.moqB2B ?? 1;
  const maxOrderLimit = detail?.orderLimits.maxOrderQuantityB2B ?? 10000;
  const packBoxSize = detail?.orderLimits.packBoxSize ?? null;
  // Retailers order in master boxes when the product defines one, otherwise by the unit.
  const qtyStep = packBoxSize ?? 1;
  const consumerMin = detail?.orderLimits.minOrderQuantity ?? 1;
  const consumerMax = detail?.orderLimits.maxOrderQuantity ?? 99;
  const allowBackorder = detail?.orderLimits.allowBackorder ?? false;
  const availableStock = detail?.availableQuantity ?? 0;

  // Start a fresh product at its own minimums, not the previous product's quantity.
  useEffect(() => {
    if (!detail) return;
    setSelectedVariantId(null);
    setVariantQuantities({});
    setWholesaleQty(detail.orderLimits.moqB2B ?? 1);
    setSelectedUnits(detail.orderLimits.minOrderQuantity ?? 1);
  }, [detail?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Packs: the product's own, then each additional variant.
  const allPacks: Pack[] = useMemo(() => {
    if (!detail) return [];
    const primary: Pack = {
      id: detail.id,
      name: detail.packLabel ?? 'Standard pack',
      sku: detail.sku,
      images: detail.images,
      mrp: detail.mrp,
      price: detail.price ? detail.price.unitPriceInclGst : null,
      priceTiers: detail.priceTiers,
    };
    const extra = detail.variants.map((v: StorefrontVariant): Pack => ({
      id: v.id,
      name: v.name,
      sku: v.sku,
      // A variant with no photos of its own shows the product's, not a blank.
      images: v.images.length > 0 ? v.images : detail.images,
      mrp: v.mrp,
      price: v.price ? v.price.unitPriceInclGst : null,
      priceTiers: v.priceTiers,
    }));
    return [primary, ...extra];
  }, [detail]);

  const hasVariants = allPacks.length > 1;
  const activePack: Pack | undefined = allPacks.find((p) => p.id === selectedVariantId) ?? allPacks[0];
  // Shape the variant selector below already reads.
  const product = { variants: allPacks };

  // Specification rows, plus manufacturer / origin / shelf life when staff filled
  // those fields in but did not also repeat them as a row - so no field a Super
  // Admin enters silently fails to appear.
  const baseSpecs = detail?.specifications ?? [];
  const hasSpec = (label: string) => baseSpecs.some((s) => s.label.trim().toLowerCase() === label.toLowerCase());
  const specRows: Array<{ label: string; value: string }> = detail
    ? [
        ...baseSpecs,
        ...(detail.manufacturer && !hasSpec('Manufacturer') ? [{ label: 'Manufacturer', value: detail.manufacturer }] : []),
        ...(detail.countryOfOrigin && !hasSpec('Country of Origin') ? [{ label: 'Country of Origin', value: detail.countryOfOrigin }] : []),
        ...(detail.shelfLife && !hasSpec('Shelf Life') ? [{ label: 'Shelf Life', value: detail.shelfLife }] : []),
      ]
    : [];

  // Everything the JSX reads about "the thing being viewed", for the active pack.
  const activeProduct = {
    id: activePack?.id ?? '',
    name: detail?.name ?? '',
    sku: activePack?.sku,
    brand: detail?.brand ?? undefined,
    badge: detail?.badge ?? undefined,
    rating: detail?.rating ?? undefined,
    reviewCount: detail?.reviewCount ?? undefined,
    images: activePack && activePack.images.length > 0 ? activePack.images : ['/images/cat_namkeen.jpg'],
    image: activePack?.images[0] ?? '/images/cat_namkeen.jpg',
    description: detail?.description ?? undefined,
    disclaimer: detail?.disclaimer ?? undefined,
    // Empty lists become undefined so the existing "render only if present" checks hide the section.
    specifications: specRows.length > 0 ? specRows : undefined,
    highlights: detail && detail.highlights.length > 0 ? detail.highlights : undefined,
    offers: detail && detail.offers.length > 0 ? detail.offers : undefined,
    faqs: detail && detail.faqs.length > 0 ? detail.faqs : undefined,
    returnPolicy: detail?.returnPolicy ?? undefined,
    warranty: detail?.warranty ?? undefined,
    variant: activePack?.name,
  };

  // Pricing - GST-inclusive throughout, converted server-side once.
  const consumerPrice = activePack?.price ?? null;
  const mrp = activePack?.mrp ?? null;
  const consumerDiscount =
    mrp !== null && consumerPrice !== null && mrp > consumerPrice ? Math.round(((mrp - consumerPrice) / mrp) * 100) : 0;

  // Wholesale ladder for the active pack, straight from the price rules staff defined.
  const tierPricing = useMemo(
    () =>
      (activePack?.priceTiers ?? []).map((t) => ({
        key: String(t.minQuantity),
        label: t.maxQuantity ? `${t.minQuantity}–${t.maxQuantity} pcs` : `${t.minQuantity}+ pcs`,
        min: t.minQuantity,
        max: t.maxQuantity ?? Number.POSITIVE_INFINITY,
        price: t.unitPriceInclGst,
        priceExcl: t.unitPrice,
        gstRate: t.gstRatePercent,
        // Computed server-side on the per-pack price vs MRP - never re-derived here,
        // and never from a tier total (a total is not a per-pack price).
        discount: t.discountPercent ?? 0,
        total: t.tierTotal,
      })),
    [activePack],
  );

  const activeTier = useMemo(
    () => [...tierPricing].reverse().find((t) => wholesaleQty >= t.min) ?? tierPricing[0],
    [tierPricing, wholesaleQty],
  );
  const hasWholesalePrice = Boolean(activeTier);

  const gstRate = activeTier?.gstRate ?? detail?.price?.gstRatePercent ?? 5;
  const activeWholesalePriceInclGst = activeTier?.price ?? 0;
  const activeWholesalePriceExclGst = activeTier?.priceExcl ?? 0;
  const gstAmountPerUnit = +(activeWholesalePriceInclGst - activeWholesalePriceExclGst).toFixed(2);

  const totalWholesaleOrderAmount = +(activeWholesalePriceInclGst * wholesaleQty).toFixed(2);
  const hsnCode = detail?.hsnCode ?? null;

  // A product is buyable when it has a price for this channel AND is either in
  // stock or explicitly open to backorder. Nothing here invents stock.
  const hasPrice = isRetailer ? hasWholesalePrice : consumerPrice !== null;
  const purchasable = hasPrice && (availableStock > 0 || allowBackorder);
  const stockLabel =
    availableStock > 0
      ? `🟢 ${availableStock.toLocaleString()} pcs in Stock`
      : allowBackorder
        ? '🟡 Made to order — dispatched on confirmation'
        : '🔴 Out of stock';
  const stockColor = availableStock > 0 ? '#16a34a' : allowBackorder ? '#b45309' : '#dc2626';

  // Each pack size is priced by the quantity entered for THAT pack - the same
  // way the pricing engine resolves an order line.
  const allVariantsList = allPacks;
  const rateFor = (pack: Pack, quantity: number) => tierFor(pack.priceTiers, quantity || moq)?.unitPriceInclGst ?? pack.price ?? 0;

  const totalMultiVariantQty = Object.values(variantQuantities).reduce((a, b) => a + (b || 0), 0);
  const totalMultiVariantAmount = useMemo(
    () =>
      Object.entries(variantQuantities).reduce((total, [packId, qty]) => {
        if (!qty) return total;
        const pack = allPacks.find((p) => p.id === packId);
        return pack ? total + rateFor(pack, qty) * qty : total;
      }, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [variantQuantities, allPacks, moq],
  );

  // Cart syncing
  const cartLine = cart.lines.find((line) => line.productId === activePack?.id);
  const variantText = activePack?.name || '1 unit';

  // Breadcrumb: Home > [main category] > [subcategory] > product. A crumb only
  // links where it lands on a real category page (`/products/:mainSlug`).
  const category = detail?.category ?? null;
  const parentCategory = category?.parent ?? null;

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
    if (!activePack || !detail || !purchasable) return;
    const qtyToAdd = isRetailer ? wholesaleQty : selectedUnits;
    const unitPrice = isRetailer ? activeWholesalePriceInclGst : consumerPrice;

    // Always through cart.add, never setQuantity: add() tops up an existing line
    // AND refreshes its price. Topping up with setQuantity left a line added
    // before a price change quoting the old rate, so the cart and header total
    // kept showing a price the catalogue no longer had.
    cart.add(
      {
        productId: activePack.id,
        productName: activePack.id === detail.id ? detail.name : `${detail.name} - ${activePack.name}`,
        // Names the unit, not the quantity: the quantity is its own field, and a
        // label like "6 pcs" goes stale the moment the line is topped up.
        unit: isRetailer ? 'pack' : variantText,
        displayUnitPrice: unitPrice,
        // Retailer lines carry the ladder so the cart prices the WHOLE line by its
        // final quantity - adding 6 then 6 more is a 12-pack line at the 12+ rate.
        priceTiers: isRetailer ? toCartTiers(activePack.priceTiers) : null,
        imageUrl: activeProduct.image,
        mrp,
      },
      // The quantity the shopper actually chose (in packs).
      qtyToAdd,
    );
    message.success(isRetailer ? `Added ${wholesaleQty} pcs at wholesale Tier rate (${formatInr(activeWholesalePriceInclGst)}/pc)` : 'Added to Cart');
  };

  const handleAddAllVariantsToCart = () => {
    if (totalMultiVariantQty === 0) {
      message.warning('Please enter quantities for at least one variant.');
      return;
    }

    Object.entries(variantQuantities).forEach(([packId, qty]) => {
      const pack = allPacks.find((p) => p.id === packId);
      if (qty && qty > 0 && pack && detail) {
        cart.add(
          {
            productId: pack.id,
            productName: pack.id === detail.id ? detail.name : `${detail.name} - ${pack.name}`,
            unit: `${qty} pcs`,
            displayUnitPrice: rateFor(pack, qty),
            priceTiers: toCartTiers(pack.priceTiers),
            imageUrl: pack.images[0] ?? activeProduct.image,
            mrp: pack.mrp,
          },
          qty,
        );
      }
    });

    message.success(`Added ${totalMultiVariantQty} pcs across variants to cart!`);
    setVariantQuantities({});
  };

  // All hooks are above this line, so these early returns cannot change hook order.
  if (catalogue.isLoading) {
    return (
      <div className="pdp-wrapper" style={{ padding: '96px 0', textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (catalogue.isError || !detail) {
    return (
      <div className="pdp-wrapper" style={{ padding: '96px 16px', textAlign: 'center' }}>
        <Typography.Title level={4}>We couldn&apos;t find that product</Typography.Title>
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          It may have been removed or is no longer available.
        </Typography.Text>
        <Button type="primary" onClick={() => navigate('/categories')}>
          Browse categories
        </Button>
      </div>
    );
  }

  return (
    <div className="pdp-wrapper">
      {/* Sticky Mobile App-bar Header (Hidden on Desktop/Tablet since DesktopHeader is present) */}
      <header
        className="store-safe-top pdp-mobile-header"
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

      </div>

      {/* Breadcrumbs (Desktop Enhanced) */}
      <div style={{ padding: '12px 20px', background: '#fff', fontSize: 13, color: '#878787', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ maxWidth: 1340, margin: '0 auto' }}>
          <Link to="/" style={{ color: '#878787', textDecoration: 'none' }}>Home</Link> &gt;{' '}
          {parentCategory && (
            <>
              <Link to={`/products/${parentCategory.slug}`} style={{ color: '#878787', textDecoration: 'none' }}>{parentCategory.name}</Link> &gt;{' '}
            </>
          )}
          {category ? (
            <>
              {parentCategory ? (
                <span>{category.name}</span>
              ) : (
                <Link to={`/products/${category.slug}`} style={{ color: '#878787', textDecoration: 'none' }}>{category.name}</Link>
              )}{' '}
              &gt;{' '}
            </>
          ) : (
            <>
              <Link to="/categories" style={{ color: '#878787', textDecoration: 'none' }}>Categories</Link> &gt;{' '}
            </>
          )}
          <span style={{ color: '#212121', fontWeight: 600 }}>{(activeProduct as any).name}</span>
        </div>
      </div>

      {/* Main Responsive Grid Container (Phone: Stacked | Mid & Large: 2-Column Gallery + Details) */}
      <div className="pdp-desktop-container">
        {/* Left Column: Gallery & Quick Visual Trust */}
        <div className="pdp-gallery-col">
          {/* Product Image Carousel with Wishlist & Share */}
          <div className="pdp-gallery-card" style={{ background: '#fff', padding: '16px 0 24px', position: 'relative', textAlign: 'center' }}>
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
          onClick={handleWishlistToggle}
        >
          {wishlisted ? <HeartFilled style={{ fontSize: 18, color: '#ef4444' }} /> : <HeartOutlined style={{ fontSize: 18, color: '#ef4444' }} />}
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
        </div>

        {/* Right Column: Product details, wholesale pricing, specs, offers, and delivery */}
        <div className="pdp-content-col">
          {/* Core Info & Pricing */}
          <div className="pdp-section-card" style={{ background: '#fff', padding: '16px', marginTop: 8 }}>
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
            SKU: {activeProduct.sku}
          </Typography.Text>
          {hsnCode && (
            <>
              <span style={{ color: '#cbd5e1' }}>•</span>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                HSN: {hsnCode}
              </Typography.Text>
            </>
          )}
        </div>

        {/* Rating - only shown when staff have entered one; nothing is invented. */}
        {(activeProduct as any).rating && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 14 }}>
            <div style={{ background: '#388e3c', color: '#fff', padding: '2px 6px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700 }}>
              {(activeProduct as any).rating} <StarFilled style={{ fontSize: 10 }} />
            </div>
            {(activeProduct as any).reviewCount ? (
              <Typography.Text style={{ color: '#878787', fontSize: 13 }}>
                {(activeProduct as any).reviewCount} Ratings &amp; Reviews
              </Typography.Text>
            ) : null}
          </div>
        )}

        {/* ========================================================================= */}
        {/* 🏪 WHOLESALE PRICING & TIER TABLE (MOST IMPORTANT B2B SECTION)             */}
        {/* ========================================================================= */}
        {isRetailer && !hasWholesalePrice ? (
          <div style={{ background: '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: 14, padding: 16, marginBottom: 16 }}>
            <Typography.Text strong style={{ color: '#9a3412', display: 'block' }}>
              Wholesale price not available yet
            </Typography.Text>
            <Typography.Text style={{ color: '#7c2d12', fontSize: 12 }}>
              This product has no wholesale rate set. Contact your distributor desk to enquire.
            </Typography.Text>
          </div>
        ) : isRetailer ? (
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
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${mrp !== null ? 4 : 2}, 1fr)`, gap: 10, background: '#fff', padding: '12px 10px', borderRadius: 10, border: '1px solid #fed7aa', marginBottom: 12, textAlign: 'center' }}>
                {mrp !== null && (
                  <div>
                    <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block' }}>MRP</Typography.Text>
                    <Typography.Text delete style={{ fontSize: 14, color: '#94a3b8', fontWeight: 600 }}>{formatInr(mrp)}</Typography.Text>
                  </div>
                )}
                <div>
                  <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block' }}>WHOLESALE</Typography.Text>
                  <Typography.Text strong style={{ fontSize: 16, color: '#ea580c' }}>
                    {formatInr(showGstInclusive ? activeWholesalePriceInclGst : activeWholesalePriceExclGst)}
                  </Typography.Text>
                </div>
                <div>
                  <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block' }}>GST ({gstRate}%)</Typography.Text>
                  <Typography.Text strong style={{ fontSize: 14, color: '#c2410c' }}>
                    {formatInr(gstAmountPerUnit)}
                  </Typography.Text>
                </div>
                {mrp !== null && (
                  <div>
                    <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block' }}>DISCOUNT</Typography.Text>
                    <Tag color="orange" style={{ margin: 0, fontSize: 11, fontWeight: 700 }}>
                      {activeTier.discount}% OFF
                    </Tag>
                  </div>
                )}
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
                      {mrp !== null && <th style={{ padding: '8px 12px' }}>Discount</th>}
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Tier Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tierPricing.map((tier) => {
                      const isActive = activeTier.key === tier.key;
                      // Both figures come from the server (exclusive is what is billed;
                      // inclusive is exclusive + GST, rounded once) - never re-derived here.
                      const displayPrice = showGstInclusive ? tier.price : tier.priceExcl;
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
                          <td style={{ padding: '8px 12px' }}>
                            {tier.label}
                            {tier.total !== null && (
                              <span style={{ display: 'block', fontSize: 10, color: '#94a3b8', fontWeight: 400 }}>
                                {formatInr(tier.total)} for {tier.min} (excl. GST)
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '8px 12px', color: isActive ? '#ea580c' : '#1e293b' }}>
                            {formatInr(displayPrice)}
                          </td>
                          {mrp !== null && (
                            <td style={{ padding: '8px 12px' }}>
                              <span style={{ color: '#ea580c', fontWeight: 600 }}>{tier.discount}% OFF</span>
                            </td>
                          )}
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
                    Applied: <strong>{activeTier.label}</strong>{mrp !== null ? ` (${activeTier.discount}% off)` : ''} • Total: <strong>{formatInr(totalWholesaleOrderAmount)}</strong>
                  </Typography.Text>
                  {loyaltyText ? (
                    <Typography.Text style={{ fontSize: 11, color: '#b45309', display: 'block', marginTop: 4 }}>
                      <GiftOutlined /> {loyaltyText}
                    </Typography.Text>
                  ) : null}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Button
                    shape="circle"
                    icon={<MinusOutlined />}
                    disabled={wholesaleQty <= moq}
                    onClick={() => setWholesaleQty((prev) => Math.max(moq, prev - qtyStep))}
                  />
                  <InputNumber
                    min={moq}
                    max={maxOrderLimit}
                    step={qtyStep}
                    value={wholesaleQty}
                    onChange={(val) => setWholesaleQty(val || moq)}
                    style={{ width: 64, textAlign: 'center', fontWeight: 700 }}
                  />
                  <Button
                    shape="circle"
                    icon={<PlusOutlined />}
                    disabled={wholesaleQty >= maxOrderLimit}
                    onClick={() => setWholesaleQty((prev) => Math.min(maxOrderLimit, prev + qtyStep))}
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
                  <Typography.Text strong style={{ fontSize: 14, color: '#0f172a' }}>{moq} pcs{packBoxSize && moq === packBoxSize ? ' (1 Box)' : ''}</Typography.Text>
                </div>

                <div style={{ background: '#fff', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block' }}>MAXIMUM ORDER QTY</Typography.Text>
                  <Typography.Text strong style={{ fontSize: 14, color: '#0f172a' }}>
                    {detail.orderLimits.maxOrderQuantityB2B ? `${detail.orderLimits.maxOrderQuantityB2B} pcs / Order` : 'No limit'}
                  </Typography.Text>
                </div>

                {packBoxSize && (
                  <div style={{ background: '#fff', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block' }}>MASTER PACK SIZE</Typography.Text>
                    <Typography.Text strong style={{ fontSize: 14, color: '#0f172a' }}>{packBoxSize} pcs / Corrugated Box</Typography.Text>
                  </div>
                )}

                <div style={{ background: '#fff', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block' }}>AVAILABLE STOCK</Typography.Text>
                  <Typography.Text strong style={{ fontSize: 14, color: stockColor }}>{stockLabel}</Typography.Text>
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
                        // Priced by the quantity entered for THIS pack, from its own ladder.
                        const vPrice = rateFor(v, vQty);
                        return (
                          <tr key={v.id} style={{ borderBottom: '1px solid #fed7aa' }}>
                            <td style={{ padding: '8px 10px' }}>
                              <Typography.Text strong style={{ fontSize: 12, display: 'block' }}>{v.name}</Typography.Text>
                              <span style={{ fontSize: 10, color: '#64748b' }}>SKU: {v.sku}</span>
                            </td>
                            <td style={{ padding: '8px 10px', color: '#065f46', fontWeight: 600 }}>
                              {formatInr(vPrice)}
                            </td>
                            <td style={{ padding: '8px 10px', color: stockColor, fontSize: 11 }}>
                              {availableStock > 0 ? '🟢 In Stock' : allowBackorder ? '🟡 On order' : '🔴 Out of stock'}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                              <InputNumber
                                min={0}
                                max={maxOrderLimit}
                                step={qtyStep}
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
                {consumerPrice !== null ? formatInr(consumerPrice) : 'Price on request'}
              </Typography.Text>
              {mrp !== null && consumerPrice !== null && mrp > consumerPrice && (
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
              Inclusive of all taxes
            </Typography.Text>
            {loyaltyText ? (
              <Typography.Text style={{ fontSize: 12, color: '#b45309', display: 'block', marginTop: 4, fontWeight: 500 }}>
                <GiftOutlined /> {loyaltyText}
              </Typography.Text>
            ) : null}

            {/* Consumer Quantity Stepper */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '14px 0' }}>
              <div>
                <Typography.Text strong style={{ fontSize: 13, display: 'block', color: '#0f172a' }}>
                  Quantity
                </Typography.Text>
                <Typography.Text style={{ fontSize: 11, color: '#64748b' }}>
                  Total: <strong>{formatInr((consumerPrice ?? 0) * selectedUnits)}</strong>
                </Typography.Text>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Button
                  shape="circle"
                  icon={<MinusOutlined />}
                  disabled={selectedUnits <= consumerMin}
                  onClick={() => setSelectedUnits((prev) => Math.max(consumerMin, prev - 1))}
                />
                <span style={{ fontSize: 15, fontWeight: 700, minWidth: 24, textAlign: 'center' }}>
                  {selectedUnits}
                </span>
                <Button
                  shape="circle"
                  icon={<PlusOutlined />}
                  disabled={selectedUnits >= consumerMax}
                  onClick={() => setSelectedUnits((prev) => Math.min(consumerMax, prev + 1))}
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
                  Get wholesale tier pricing with GST invoices.
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

        {/* Desktop Quick Buy & Cart Action Panel (visible on tablet/desktop, hidden on phone) */}
        <div className="pdp-desktop-buy-panel">
          <Button
            size="large"
            style={{
              flex: 1,
              height: 50,
              borderRadius: 10,
              background: '#fff',
              fontSize: 16,
              fontWeight: 700,
              color: '#ea580c',
              border: '2px solid #fed7aa',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
            disabled={!purchasable}
            onClick={handleAddToCart}
          >
            <ShoppingCartOutlined />
            {isRetailer
              ? `Add ${wholesaleQty} pcs • ${formatInr(totalWholesaleOrderAmount)}`
              : `Add to Cart • ${formatInr((consumerPrice ?? 0) * selectedUnits)}`}
          </Button>

          <Button
            type="primary"
            size="large"
            style={{
              flex: 1,
              height: 50,
              borderRadius: 10,
              background: isRetailer ? '#059669' : '#ea580c',
              borderColor: isRetailer ? '#059669' : '#ea580c',
              fontSize: 16,
              fontWeight: 700,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 14px rgba(234, 88, 12, 0.3)',
            }}
            disabled={!purchasable}
            onClick={() => {
              handleAddToCart();
              navigate('/cart');
            }}
          >
            <ThunderboltFilled />
            {isRetailer ? 'Bulk Consignment Order' : 'Instant Buy Now'}
          </Button>
        </div>
      </div>

      {/* Variants Selector */}
      {hasVariants && (
        <div className="pdp-section-card" style={{ background: '#fff', padding: '16px', marginTop: 8 }}>
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
        <div className="pdp-section-card" style={{ background: '#fff', padding: '16px', marginTop: 8 }}>
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
                      Min {isRetailer ? moq : consumerMin}
                      {isRetailer
                        ? detail.orderLimits.maxOrderQuantityB2B ? ` - Max ${detail.orderLimits.maxOrderQuantityB2B}` : ''
                        : detail.orderLimits.maxOrderQuantity ? ` - Max ${detail.orderLimits.maxOrderQuantity}` : ''}{' '}
                      pcs
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
        <div className="pdp-section-card" style={{ background: '#fff', padding: '16px', marginTop: 8 }}>
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
      <div className="pdp-section-card" style={{ background: '#fff', padding: '16px', marginTop: 8 }}>
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
                        Delivery charge: {deliveryInfo.charge === 0 ? 'Free' : formatInr(deliveryInfo.charge)}
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
                        Delivery charge: {deliveryInfo.charge === 0 ? 'Free' : formatInr(deliveryInfo.charge)}
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
        <div className="pdp-section-card" style={{ background: '#fff', padding: '0 16px 16px', marginTop: 8 }}>
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
                    {detail.businessInfo.gstInvoiceAvailable && (
                      <div style={{ display: 'flex', borderBottom: '1px solid #f0f0f0', paddingBottom: 8 }}>
                        <Typography.Text style={{ flex: 1, color: '#878787', fontSize: 13 }}>GST Invoice</Typography.Text>
                        <Typography.Text strong style={{ flex: 2, color: '#16a34a', fontSize: 13 }}>
                          Available with 100% Input Tax Credit (ITC)
                        </Typography.Text>
                      </div>
                    )}
                    {hsnCode && (
                      <div style={{ display: 'flex', borderBottom: '1px solid #f0f0f0', paddingBottom: 8 }}>
                        <Typography.Text style={{ flex: 1, color: '#878787', fontSize: 13 }}>HSN Classification</Typography.Text>
                        <Typography.Text style={{ flex: 2, color: '#212121', fontSize: 13 }}>
                          {hsnCode} ({gstRate}% GST)
                        </Typography.Text>
                      </div>
                    )}
                    {detail.businessInfo.businessSupportContact && (
                      <div style={{ display: 'flex', borderBottom: '1px solid #f0f0f0', paddingBottom: 8 }}>
                        <Typography.Text style={{ flex: 1, color: '#878787', fontSize: 13 }}>Business Support</Typography.Text>
                        <Typography.Text style={{ flex: 2, color: '#212121', fontSize: 13 }}>
                          {detail.businessInfo.businessSupportContact}
                        </Typography.Text>
                      </div>
                    )}
                    {detail.businessInfo.deliveryTerms && (
                      <div style={{ display: 'flex', borderBottom: '1px solid #f0f0f0', paddingBottom: 8 }}>
                        <Typography.Text style={{ flex: 1, color: '#878787', fontSize: 13 }}>Delivery Terms</Typography.Text>
                        <Typography.Text style={{ flex: 2, color: '#212121', fontSize: 13 }}>
                          {detail.businessInfo.deliveryTerms}
                        </Typography.Text>
                      </div>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </div>
      )}

      {/* Frequently Asked Questions (FAQs) */}
      {(activeProduct as any).faqs && (
        <div className="pdp-section-card" style={{ background: '#fff', padding: '0 16px 16px', marginTop: 8 }}>
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
        </div>
      </div>

      {/* More from the same category - real products, hidden when there are none (full width on desktop) */}
      {related.length > 0 && (
      <div style={{ marginTop: 16, background: '#fff', padding: '24px 0 32px', borderTop: '1px solid #e2e8f0' }}>
        <div style={{ maxWidth: 1340, margin: '0 auto', padding: '0 20px' }}>
          <Typography.Text strong style={{ display: 'block', fontSize: 18, marginBottom: 16, color: '#0f172a' }}>
            You May Also Like
          </Typography.Text>
          <div className="pdp-related-grid" style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '0 4px 10px' }}>
            <style>{`
              div::-webkit-scrollbar { display: none; }
              .product-dots li button { background: #c2c2c2 !important; height: 6px !important; border-radius: 4px !important; }
              .product-dots li.slick-active button { background: #f97316 !important; width: 16px !important; }
            `}</style>
            {related.map((related) => {
              const relatedCartLine = cart.lines.find((line) => line.productId === related.id);
              // Already priced for this channel by the API - no client-side "x 0.8" guess.
              const relatedPrice = related.price;
              return (
                <div
                  key={related.id}
                  style={{
                    width: 144,
                    flexShrink: 0,
                    borderRadius: 10,
                    border: '1px solid #f0f0f0',
                    padding: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    background: '#ffffff',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
                  }}
                >
                  <Link to={`/product-detail/${related.slug}`} style={{ textDecoration: 'none' }}>
                    <div style={{ width: '100%', height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8, background: '#fafaf9', borderRadius: 6 }}>
                      <img src={related.image} alt={related.name} style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }} />
                    </div>
                    <Typography.Text style={{ display: 'block', fontSize: 12, color: '#212121', lineHeight: 1.3, height: 32, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {related.name}
                    </Typography.Text>
                  </Link>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 8 }}>
                    <Typography.Text strong style={{ fontSize: 14, color: isRetailer ? '#065f46' : '#212121' }}>
                      {relatedPrice !== null ? formatInr(relatedPrice) : 'N/A'}
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
                        disabled={!related.purchasable}
                        style={{ border: '1px solid #f97316', color: '#f97316', borderRadius: 6, padding: '0 8px', fontSize: 11, fontWeight: 600, height: 24 }}
                        onClick={() =>
                          cart.add({
                            productId: related.id,
                            productName: related.name,
                            unit: related.variant || '1 pack',
                            displayUnitPrice: relatedPrice,
                            imageUrl: related.image,
                            mrp: related.mrp,
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
      </div>
      )}

      {/* Sticky Bottom Bar for Actions (Mobile only - on tablet/desktop, inline buy panel is used) */}
      <div
        className="store-safe-bottom pdp-fixed-bottom-bar"
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
          disabled={!purchasable}
            onClick={handleAddToCart}
        >
          {isRetailer
            ? `Add ${wholesaleQty} pcs • ${formatInr(totalWholesaleOrderAmount)}`
            : `Add to Cart • ${formatInr((consumerPrice ?? 0) * selectedUnits)}`}
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
          disabled={!purchasable}
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
