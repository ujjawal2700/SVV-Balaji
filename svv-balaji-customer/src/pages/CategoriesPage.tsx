import { ArrowLeftOutlined } from '@ant-design/icons';
import { Typography } from 'antd';
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { categories, popularProducts } from '../mock/homeMockData';

function formatInr(value: number): string {
  return `₹${value.toLocaleString('en-IN')}`;
}

export function CategoriesPage() {
  const navigate = useNavigate();
  // We'll use 'for-you' as a default if nothing is selected
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | 'for-you'>('for-you');

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f8f7f5' }}>
      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
      {/* Header */}
      <header
        className="store-safe-top"
        style={{
          background: '#ffffff',
          borderBottom: '1px solid #f0eee9',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          <ArrowLeftOutlined style={{ fontSize: 20, color: '#44403c' }} />
        </button>
        <Typography.Title level={4} style={{ margin: 0, color: '#1c1917', fontSize: 18 }}>
          Categories
        </Typography.Title>
      </header>

      {/* Main Content Area */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Sidebar */}
        <div
          className="hide-scrollbar"
          style={{
            width: 90,
            background: '#ffffff',
            borderRight: '1px solid #f0eee9',
            overflowY: 'auto',
            padding: '12px 0',
            flexShrink: 0,
          }}
        >
          {/* Default 'For You' Tab */}
          <div
            onClick={() => setSelectedCategoryId('for-you')}
            style={{
              padding: '12px 4px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              background: selectedCategoryId === 'for-you' ? '#f5f4f2' : 'transparent',
              borderLeft: selectedCategoryId === 'for-you' ? '4px solid #f97316' : '4px solid transparent',
              position: 'relative',
            }}
          >
            {selectedCategoryId === 'for-you' && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  right: -1,
                  width: 20,
                  background: '#f5f4f2',
                  borderTopLeftRadius: 16,
                  borderBottomLeftRadius: 16,
                  zIndex: 2,
                }}
              />
            )}
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                zIndex: 3,
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
              }}
            >
              <img src="/images/cat_namkeen.jpg" alt="For You" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <Typography.Text style={{ fontSize: 11, fontWeight: selectedCategoryId === 'for-you' ? 700 : 500, color: selectedCategoryId === 'for-you' ? '#ea580c' : '#78716c', textAlign: 'center', zIndex: 3 }}>
              For You
            </Typography.Text>
          </div>

          {/* Map through main categories */}
          {categories.map((cat) => {
            const isSelected = selectedCategoryId === cat.id;
            return (
              <div
                key={cat.id}
                onClick={() => setSelectedCategoryId(cat.id)}
                style={{
                  padding: '12px 4px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  background: isSelected ? '#f5f4f2' : 'transparent',
                  borderLeft: isSelected ? '4px solid #f97316' : '4px solid transparent',
                  position: 'relative',
                }}
              >
                {isSelected && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      right: -1,
                      width: 20,
                      background: '#f5f4f2',
                      borderTopLeftRadius: 16,
                      borderBottomLeftRadius: 16,
                      zIndex: 2,
                    }}
                  />
                )}
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    zIndex: 3,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                  }}
                >
                  <img src={cat.image} alt={cat.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>
                <Typography.Text style={{ fontSize: 11, fontWeight: isSelected ? 700 : 500, color: isSelected ? '#ea580c' : '#78716c', textAlign: 'center', zIndex: 3 }}>
                  {cat.name}
                </Typography.Text>
              </div>
            );
          })}
        </div>

        {/* Right Content Area */}
        <div className="hide-scrollbar" style={{ flex: 1, padding: '16px 16px 40px', overflowY: 'auto', background: '#f5f4f2' }}>
          {selectedCategoryId === 'for-you' ? (
            <>
              {/* Trending */}
              <div style={{ marginBottom: 24 }}>
                <Typography.Title level={5} style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 700 }}>
                  Trending
                </Typography.Title>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {categories.slice(0, 4).map((cat) => (
                    <Link
                      key={cat.id}
                      to={`/products/${cat.id}`}
                      style={{
                        background: '#fff',
                        borderRadius: 12,
                        padding: 12,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 8,
                        textDecoration: 'none',
                      }}
                    >
                      <div style={{ width: 64, height: 64 }}>
                        <img src={cat.image} alt={cat.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      </div>
                      <Typography.Text strong style={{ fontSize: 12, color: '#44403c', textAlign: 'center' }}>
                        {cat.name}
                      </Typography.Text>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Often Seen */}
              <div>
                <Typography.Title level={5} style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 700 }}>
                  Often Seen
                </Typography.Title>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px 8px' }}>
                  {popularProducts.concat(popularProducts).map((product, i) => (
                    <div key={`${product.id}-${i}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: '100%', aspectRatio: '1', background: '#fff', borderRadius: 12, padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <img src={product.image} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      </div>
                      <Typography.Text style={{ fontSize: 10, color: '#44403c', textAlign: 'center', lineHeight: 1.2 }}>
                        {product.name}
                      </Typography.Text>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Selected Category Content */}
              {(() => {
                const selectedCatData = categories.find((c) => c.id === selectedCategoryId);
                if (!selectedCatData) return null;

                return (
                  <div>
                    {/* Banner for the category */}
                    <div style={{ width: '100%', height: 120, borderRadius: 16, background: '#e0e7ff', marginBottom: 24, display: 'flex', alignItems: 'center', padding: '0 20px', position: 'relative', overflow: 'hidden' }}>
                       <div style={{ zIndex: 2 }}>
                         <Typography.Title level={4} style={{ margin: 0, color: '#3730a3' }}>
                           {selectedCatData.name}
                         </Typography.Title>
                         <Typography.Text style={{ color: '#4f46e5', fontWeight: 600 }}>Up to 20% OFF</Typography.Text>
                       </div>
                       <img src={selectedCatData.image} style={{ position: 'absolute', right: -20, bottom: -20, width: 120, height: 120, objectFit: 'contain', opacity: 0.8 }} />
                    </div>

                    <Typography.Title level={5} style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 700 }}>
                      Shop by Subcategory
                    </Typography.Title>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px 8px' }}>
                      {selectedCatData.subcategories?.map((sub) => (
                        <Link
                          key={sub.id}
                          to={`/products/${selectedCatData.id}`}
                          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textDecoration: 'none' }}
                        >
                          <div style={{ width: '100%', aspectRatio: '1', background: '#fff', borderRadius: 12, padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                            <img src={sub.image} alt={sub.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          </div>
                          <Typography.Text style={{ fontSize: 10, color: '#44403c', textAlign: 'center', lineHeight: 1.2, fontWeight: 500 }}>
                            {sub.name}
                          </Typography.Text>
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
