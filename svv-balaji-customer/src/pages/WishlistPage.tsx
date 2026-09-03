import {
  ArrowLeftOutlined,
  HeartFilled,
  MinusOutlined,
  PlusOutlined,
  ShoppingOutlined,
} from '@ant-design/icons';
import { Button, Typography, message } from 'antd';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../cart/useCart';

function formatInr(value: number): string {
  return `₹${value.toLocaleString('en-IN')}`;
}

interface WishlistItem {
  id: string;
  productId: string;
  name: string;
  variant: string;
  price: number;
  mrp: number;
  image: string;
  stockStatus: 'IN_STOCK' | 'OUT_OF_STOCK' | 'LOW_STOCK';
  badge?: string;
}

const initialWishlist: WishlistItem[] = [
  {
    id: 'w-1',
    productId: 'premium-atta',
    name: 'Aashirvaad Shudh Chakki Atta',
    variant: '10 kg',
    price: 450,
    mrp: 480,
    image: '/images/cat_atta_flour.jpg',
    stockStatus: 'IN_STOCK',
    badge: '6% off',
  },
  {
    id: 'w-2',
    productId: 'classic-namkeen-100x20',
    name: 'Classic Namkeen Mix',
    variant: '100g × 20',
    price: 180,
    mrp: 200,
    image: '/images/classic_namkeen.jpg',
    stockStatus: 'LOW_STOCK',
    badge: '10% off',
  },
  {
    id: 'w-3',
    productId: 'aloo-bhujia-500g',
    name: 'Aloo Bhujia Spicy',
    variant: '500 g',
    price: 180,
    mrp: 200,
    image: '/images/aloo_bhujia.jpg',
    stockStatus: 'OUT_OF_STOCK',
  },
  {
    id: 'w-4',
    productId: 'santa-cruz',
    name: 'Santa Cruz Organic Fruit Spread',
    variant: '250 g',
    price: 750,
    mrp: 850,
    image: '/images/santa_cruz.jpg',
    stockStatus: 'IN_STOCK',
    badge: '12% off',
  },
  {
    id: 'w-5',
    productId: 'premium-atta',
    name: 'Tata Salt Iodised',
    variant: '1 kg',
    price: 25,
    mrp: 30,
    image: '/images/cat_salt.jpg',
    stockStatus: 'IN_STOCK',
    badge: '17% off',
  },
  {
    id: 'w-6',
    productId: 'aloo-bhujia-500g',
    name: 'Moong Dal Namkeen',
    variant: '200 g',
    price: 60,
    mrp: 70,
    image: '/images/moong_dal.jpg',
    stockStatus: 'IN_STOCK',
    badge: '14% off',
  },
];

export function WishlistPage() {
  const navigate = useNavigate();
  const cart = useCart();
  const [items, setItems] = useState<WishlistItem[]>(initialWishlist);
  // Track per-item qty in the add-flow (before actually adding)
  const [localQty, setLocalQty] = useState<Record<string, number>>({});

  const handleRemove = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
    message.success('Removed from wishlist');
  };

  const getQty = (id: string) => localQty[id] || 0;

  const handleAdd = (item: WishlistItem) => {
    if (item.stockStatus === 'OUT_OF_STOCK') return;
    const newQty = 1;
    setLocalQty(prev => ({ ...prev, [item.id]: newQty }));
    cart.add({
      productId: item.productId,
      productName: item.name,
      unit: item.variant,
      displayUnitPrice: item.price,
      imageUrl: item.image,
      mrp: item.mrp,
    });
    message.success('Added to cart!');
  };

  const handleIncrease = (item: WishlistItem) => {
    const newQty = getQty(item.id) + 1;
    setLocalQty(prev => ({ ...prev, [item.id]: newQty }));
    cart.add({
      productId: item.productId,
      productName: item.name,
      unit: item.variant,
      displayUnitPrice: item.price,
      imageUrl: item.image,
      mrp: item.mrp,
    });
  };

  const handleDecrease = (item: WishlistItem) => {
    const newQty = getQty(item.id) - 1;
    if (newQty <= 0) {
      setLocalQty(prev => ({ ...prev, [item.id]: 0 }));
      cart.remove(item.productId);
    } else {
      setLocalQty(prev => ({ ...prev, [item.id]: newQty }));
      cart.remove(item.productId);
      // Re-add n-1 times
      for (let i = 0; i < newQty; i++) {
        cart.add({
          productId: item.productId,
          productName: item.name,
          unit: item.variant,
          displayUnitPrice: item.price,
          imageUrl: item.image,
          mrp: item.mrp,
        });
      }
    }
  };

  if (items.length === 0) {
    return (
      <div style={{ minHeight: '100vh', background: '#fff' }}>
        <header style={{ padding: '16px', display: 'flex', alignItems: 'center', borderBottom: '1px solid #f0f0f0' }}>
          <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: 12 }}>
            <ArrowLeftOutlined style={{ fontSize: 20 }} />
          </button>
          <Typography.Text strong style={{ fontSize: 18 }}>Wishlist</Typography.Text>
        </header>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', padding: 32 }}>
          <HeartFilled style={{ fontSize: 72, color: '#f97316', marginBottom: 16, opacity: 0.2 }} />
          <Typography.Title level={4} style={{ marginBottom: 8, color: '#212121' }}>Nothing saved yet</Typography.Title>
          <Typography.Text type="secondary" style={{ textAlign: 'center', fontSize: 14, marginBottom: 28 }}>
            Tap the ♡ on any product to save it here
          </Typography.Text>
          <Button
            type="primary"
            size="large"
            icon={<ShoppingOutlined />}
            style={{ background: '#f97316', borderColor: '#f97316', borderRadius: 24, paddingInline: 32 }}
            onClick={() => navigate('/')}
          >
            Browse Products
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fff', paddingBottom: 80 }}>
      {/* Header */}
      <header style={{
        padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid #f0f0f0', position: 'sticky', top: 0, background: '#fff', zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: 12 }}>
            <ArrowLeftOutlined style={{ fontSize: 20 }} />
          </button>
          <div>
            <Typography.Text strong style={{ fontSize: 18 }}>Wishlist</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 13, marginLeft: 6 }}>
              {items.length} item{items.length !== 1 ? 's' : ''}
            </Typography.Text>
          </div>
        </div>
      </header>

      {/* Product Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '1px',
        background: '#f0f0f0',
      }}>
        {items.map((item) => {
          const qty = getQty(item.id);
          const isOOS = item.stockStatus === 'OUT_OF_STOCK';
          const isLow = item.stockStatus === 'LOW_STOCK';
          const discount = item.mrp > item.price ? Math.round(((item.mrp - item.price) / item.mrp) * 100) : 0;

          return (
            <div key={item.id} style={{ background: '#fff', padding: '12px', position: 'relative', display: 'flex', flexDirection: 'column' }}>
              {/* Discount badge */}
              {discount > 0 && !isOOS && (
                <div style={{
                  position: 'absolute', top: 10, left: 10, zIndex: 2,
                  background: '#f0fdf4', borderRadius: 4, padding: '2px 6px',
                }}>
                  <Typography.Text style={{ fontSize: 10, fontWeight: 700, color: '#16a34a' }}>{discount}% off</Typography.Text>
                </div>
              )}
              {isOOS && (
                <div style={{
                  position: 'absolute', top: 10, left: 10, zIndex: 2,
                  background: '#fef2f2', borderRadius: 4, padding: '2px 6px',
                }}>
                  <Typography.Text style={{ fontSize: 10, fontWeight: 700, color: '#dc2626' }}>Out of Stock</Typography.Text>
                </div>
              )}
              {isLow && !isOOS && (
                <div style={{
                  position: 'absolute', top: 10, left: 10, zIndex: 2,
                  background: '#fff7ed', borderRadius: 4, padding: '2px 6px',
                }}>
                  <Typography.Text style={{ fontSize: 10, fontWeight: 700, color: '#f97316' }}>Only few left</Typography.Text>
                </div>
              )}

              {/* Remove from wishlist */}
              <button
                onClick={() => handleRemove(item.id)}
                style={{
                  position: 'absolute', top: 8, right: 8, zIndex: 2,
                  background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                }}
              >
                <HeartFilled style={{ fontSize: 20, color: '#f97316' }} />
              </button>

              {/* Image */}
              <Link to={`/product-detail/${item.productId}`} style={{ textDecoration: 'none' }}>
                <div style={{
                  height: 130, borderRadius: 8, background: '#f8f8f8',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 10, overflow: 'hidden',
                  filter: isOOS ? 'grayscale(60%)' : 'none',
                }}>
                  <img
                    src={item.image}
                    alt={item.name}
                    style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                    onError={(e) => { (e.target as HTMLImageElement).src = `https://placehold.co/140x130/f5f5f5/aaa?text=${encodeURIComponent(item.name.split(' ')[0])}`; }}
                  />
                </div>
              </Link>

              {/* Variant pill */}
              <div style={{
                display: 'inline-block', background: '#f5f5f5', borderRadius: 4,
                padding: '2px 8px', marginBottom: 6, alignSelf: 'flex-start',
              }}>
                <Typography.Text style={{ fontSize: 11, color: '#616161' }}>{item.variant}</Typography.Text>
              </div>

              {/* Name */}
              <Typography.Text style={{
                fontSize: 13, color: '#212121', display: '-webkit-box',
                WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                lineHeight: '1.35', marginBottom: 8, flex: 1,
              }}>
                {item.name}
              </Typography.Text>

              {/* Price row + ADD button */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
                <div>
                  <Typography.Text strong style={{ fontSize: 14, color: '#212121', display: 'block' }}>
                    {formatInr(item.price)}
                  </Typography.Text>
                  {item.mrp > item.price && (
                    <Typography.Text delete style={{ fontSize: 11, color: '#aaa' }}>{formatInr(item.mrp)}</Typography.Text>
                  )}
                </div>

                {/* ADD / Stepper */}
                {isOOS ? (
                  <div style={{
                    border: '1px solid #d1d5db', borderRadius: 8, padding: '5px 10px',
                    background: '#f9fafb',
                  }}>
                    <Typography.Text style={{ fontSize: 12, color: '#aaa' }}>Notify</Typography.Text>
                  </div>
                ) : qty === 0 ? (
                  <button
                    onClick={() => handleAdd(item)}
                    style={{
                      border: '1.5px solid #f97316', borderRadius: 8, padding: '5px 14px',
                      background: '#fff', color: '#f97316', fontWeight: 700, fontSize: 14,
                      cursor: 'pointer', letterSpacing: 1,
                    }}
                  >
                    ADD
                  </button>
                ) : (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 2,
                    border: '1.5px solid #f97316', borderRadius: 8, background: '#f97316',
                    overflow: 'hidden',
                  }}>
                    <button onClick={() => handleDecrease(item)} style={{ background: 'none', border: 'none', color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer', padding: '5px 8px', display: 'flex', alignItems: 'center' }}>
                      <MinusOutlined style={{ fontSize: 12 }} />
                    </button>
                    <Typography.Text strong style={{ color: '#fff', fontSize: 14, minWidth: 16, textAlign: 'center' }}>{qty}</Typography.Text>
                    <button onClick={() => handleIncrease(item)} style={{ background: 'none', border: 'none', color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer', padding: '5px 8px', display: 'flex', alignItems: 'center' }}>
                      <PlusOutlined style={{ fontSize: 12 }} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
