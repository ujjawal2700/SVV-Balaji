import { ArrowLeftOutlined } from '@ant-design/icons';
import { Breadcrumb, Button, Tag, Typography } from 'antd';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { categories, popularProducts } from '../mock/homeMockData';

export function CategoriesPage() {
  const navigate = useNavigate();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | 'for-you'>('for-you');

  const selectedCatData = categories.find((c) => c.id === selectedCategoryId);

  return (
    <div>
      {/* ========================================================================= */}
      {/* 📱 MOBILE VIEW (< 768px): PREVIOUS ORIGINAL MOBILE UI                     */}
      {/* ========================================================================= */}
      <div className="mobile-only" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f5f4f2', paddingBottom: 60 }}>
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
            position: 'sticky',
            top: 0,
            zIndex: 10,
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

        {/* Content Area */}
        <div style={{ display: 'flex', flex: 1, minHeight: 'calc(100vh - 120px)' }}>
          {/* Left Sidebar */}
          <div
            className="hide-scrollbar"
            style={{
              width: 80,
              background: '#ffffff',
              borderRight: '1px solid #f0eee9',
              overflowY: 'auto',
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
              <Typography.Text
                style={{
                  fontSize: 11,
                  fontWeight: selectedCategoryId === 'for-you' ? 700 : 500,
                  color: selectedCategoryId === 'for-you' ? '#ea580c' : '#78716c',
                  textAlign: 'center',
                  zIndex: 3,
                }}
              >
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
                  <Typography.Text
                    style={{
                      fontSize: 11,
                      fontWeight: isSelected ? 700 : 500,
                      color: isSelected ? '#ea580c' : '#78716c',
                      textAlign: 'center',
                      zIndex: 3,
                    }}
                  >
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
                      <Link
                        key={`${product.id}-${i}`}
                        to={`/product-detail/${product.id}`}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textDecoration: 'none' }}
                      >
                        <div
                          style={{
                            width: '100%',
                            aspectRatio: '1',
                            background: '#fff',
                            borderRadius: 12,
                            padding: 8,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <img src={product.image} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        </div>
                        <Typography.Text style={{ fontSize: 10, color: '#44403c', textAlign: 'center', lineHeight: 1.2 }}>
                          {product.name}
                        </Typography.Text>
                      </Link>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Selected Category Content */}
                {selectedCatData && (
                  <div>
                    {/* Banner for the category */}
                    <div
                      style={{
                        width: '100%',
                        height: 120,
                        borderRadius: 16,
                        background: '#fff7ed',
                        border: '1px solid #ffedd5',
                        marginBottom: 24,
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0 20px',
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                    >
                      <div style={{ zIndex: 2 }}>
                        <Typography.Title level={4} style={{ margin: 0, color: '#9a3412' }}>
                          {selectedCatData.name}
                        </Typography.Title>
                        <Typography.Text style={{ color: '#ea580c', fontWeight: 600 }}>Up to 20% OFF</Typography.Text>
                      </div>
                      <img
                        src={selectedCatData.image}
                        alt={selectedCatData.name}
                        style={{ position: 'absolute', right: -20, bottom: -20, width: 120, height: 120, objectFit: 'contain', opacity: 0.8 }}
                      />
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
                          <div
                            style={{
                              width: '100%',
                              aspectRatio: '1',
                              background: '#fff',
                              borderRadius: 12,
                              padding: 8,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                            }}
                          >
                            <img src={sub.image} alt={sub.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          </div>
                          <Typography.Text style={{ fontSize: 10, color: '#44403c', textAlign: 'center', lineHeight: 1.2, fontWeight: 500 }}>
                            {sub.name}
                          </Typography.Text>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 💻 DESKTOP VIEW (>= 768px): CLEAN B2B WEBSITE CATALOG                      */}
      {/* ========================================================================= */}
      <div className="desktop-only" style={{ background: '#f8fafc', minHeight: '80vh', padding: '24px 0 60px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px' }}>
          {/* Breadcrumb */}
          <Breadcrumb
            items={[
              { title: <Link to="/">Home</Link> },
              { title: 'Categories' },
              { title: selectedCategoryId === 'for-you' ? 'Featured Catalog' : selectedCatData?.name || 'Category' },
            ]}
            style={{ marginBottom: 20 }}
          />

          {/* Header Title */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
              <Typography.Title level={2} style={{ margin: 0, color: '#0f172a', fontWeight: 700 }}>
                Explore Product Categories
              </Typography.Title>
              <Typography.Text style={{ color: '#64748b', fontSize: 14 }}>
                Wholesale direct supply with verified mandi quality check and transparent margin calculation.
              </Typography.Text>
            </div>
            <Tag color="orange" style={{ padding: '4px 12px', fontSize: 13, borderRadius: 20, fontWeight: 600 }}>
              {categories.length} Categories Available
            </Tag>
          </div>

          {/* Desktop 2-Column Split */}
          <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 28, alignItems: 'start' }}>
            {/* Left Category Menu */}
            <div
              style={{
                background: '#ffffff',
                borderRadius: 16,
                border: '1px solid #e2e8f0',
                padding: '12px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                position: 'sticky',
                top: 100,
              }}
            >
              <Typography.Text strong style={{ display: 'block', padding: '10px 12px 6px', fontSize: 12, color: '#94a3b8', letterSpacing: 0.5 }}>
                ALL CATEGORIES
              </Typography.Text>

              {/* For You Button */}
              <div
                onClick={() => setSelectedCategoryId('for-you')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  borderRadius: 12,
                  cursor: 'pointer',
                  background: selectedCategoryId === 'for-you' ? '#fff7ed' : 'transparent',
                  border: selectedCategoryId === 'for-you' ? '1px solid #fed7aa' : '1px solid transparent',
                  marginBottom: 4,
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ width: 34, height: 34, borderRadius: 8, background: '#ffedd5', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  <img src="/images/cat_namkeen.jpg" alt="Featured" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <Typography.Text strong style={{ color: selectedCategoryId === 'for-you' ? '#ea580c' : '#1e293b', fontSize: 14 }}>
                    ⭐ Trending & Popular
                  </Typography.Text>
                </div>
              </div>

              {/* Category list */}
              {categories.map((cat) => {
                const isSelected = selectedCategoryId === cat.id;
                return (
                  <div
                    key={cat.id}
                    onClick={() => setSelectedCategoryId(cat.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 14px',
                      borderRadius: 12,
                      cursor: 'pointer',
                      background: isSelected ? '#fff7ed' : 'transparent',
                      border: isSelected ? '1px solid #fed7aa' : '1px solid transparent',
                      marginBottom: 4,
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '1px solid #f1f5f9' }}>
                      <img src={cat.image} alt={cat.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <Typography.Text strong style={{ color: isSelected ? '#ea580c' : '#334155', fontSize: 13, display: 'block' }}>
                        {cat.name}
                      </Typography.Text>
                      <Typography.Text style={{ color: '#94a3b8', fontSize: 11 }}>
                        {cat.subcategories?.length || 0} subcategories
                      </Typography.Text>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right Display Area */}
            <div>
              {selectedCategoryId === 'for-you' ? (
                <div>
                  {/* Category Grid */}
                  <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 24, marginBottom: 24 }}>
                    <Typography.Title level={4} style={{ margin: '0 0 16px 0', color: '#0f172a', fontWeight: 700 }}>
                      All Supply Verticals
                    </Typography.Title>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                      {categories.map((cat) => (
                        <div
                          key={cat.id}
                          onClick={() => setSelectedCategoryId(cat.id)}
                          style={{
                            background: '#f8fafc',
                            borderRadius: 14,
                            padding: 18,
                            border: '1px solid #e2e8f0',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            textAlign: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                          }}
                        >
                          <div style={{ width: 72, height: 72, marginBottom: 10 }}>
                            <img src={cat.image} alt={cat.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          </div>
                          <Typography.Text strong style={{ fontSize: 14, color: '#1e293b', marginBottom: 4 }}>
                            {cat.name}
                          </Typography.Text>
                          <Typography.Text style={{ fontSize: 12, color: '#64748b' }}>
                            {cat.subcategories?.length || 0} Subcategories
                          </Typography.Text>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Frequently Ordered Items */}
                  <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                      <Typography.Title level={4} style={{ margin: 0, color: '#0f172a', fontWeight: 700 }}>
                        High Velocity Retail Essentials
                      </Typography.Title>
                      <Link to="/products/atta-dal" style={{ color: '#f97316', fontWeight: 600, fontSize: 13 }}>
                        View All Products &rarr;
                      </Link>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                      {popularProducts.concat(popularProducts).slice(0, 8).map((product, i) => (
                        <Link
                          key={`${product.id}-${i}`}
                          to={`/product-detail/${product.id}`}
                          style={{
                            textDecoration: 'none',
                            background: '#f8fafc',
                            borderRadius: 14,
                            padding: 14,
                            border: '1px solid #e2e8f0',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                          }}
                        >
                          <div style={{ width: '100%', height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                            <img src={product.image} alt={product.name} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
                          </div>
                          <Typography.Text strong style={{ fontSize: 13, color: '#1e293b', textAlign: 'center', marginBottom: 4 }}>
                            {product.name}
                          </Typography.Text>
                          <Typography.Text strong style={{ fontSize: 14, color: '#ea580c' }}>
                            ₹{product.price}
                          </Typography.Text>
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  {selectedCatData && (
                    <>
                      {/* Banner */}
                      <div
                        style={{
                          background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
                          borderRadius: 16,
                          padding: '28px 32px',
                          color: '#fff',
                          marginBottom: 24,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div>
                          <Tag color="gold" style={{ fontWeight: 700, borderRadius: 12, marginBottom: 8 }}>
                            DIRECT BULK SUPPLY
                          </Tag>
                          <Typography.Title level={2} style={{ margin: 0, color: '#fff', fontWeight: 800 }}>
                            {selectedCatData.name}
                          </Typography.Title>
                          <Typography.Text style={{ color: '#ffedd5', fontSize: 14, marginTop: 4, display: 'block' }}>
                            Up to 20% Wholesale Margin • Mandi Grade Assured
                          </Typography.Text>
                        </div>
                        <img src={selectedCatData.image} alt={selectedCatData.name} style={{ width: 100, height: 100, objectFit: 'contain' }} />
                      </div>

                      {/* Subcategories Grid */}
                      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 24, marginBottom: 24 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                          <Typography.Title level={4} style={{ margin: 0, color: '#0f172a', fontWeight: 700 }}>
                            Subcategories in {selectedCatData.name}
                          </Typography.Title>
                          <Button
                            type="primary"
                            style={{ background: '#f97316', borderColor: '#f97316', borderRadius: 8 }}
                            onClick={() => navigate(`/products/${selectedCatData.id}`)}
                          >
                            Browse All Items
                          </Button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                          {selectedCatData.subcategories?.map((sub) => (
                            <Link
                              key={sub.id}
                              to={`/products/${selectedCatData.id}`}
                              style={{
                                textDecoration: 'none',
                                background: '#f8fafc',
                                borderRadius: 14,
                                padding: 18,
                                border: '1px solid #e2e8f0',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                textAlign: 'center',
                              }}
                            >
                              <div style={{ width: 72, height: 72, background: '#fff', borderRadius: 12, padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10, border: '1px solid #e2e8f0' }}>
                                <img src={sub.image} alt={sub.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                              </div>
                              <Typography.Text strong style={{ fontSize: 13, color: '#1e293b' }}>
                                {sub.name}
                              </Typography.Text>
                              <Typography.Text style={{ fontSize: 11, color: '#f97316', marginTop: 4 }}>
                                View Products &rarr;
                              </Typography.Text>
                            </Link>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
