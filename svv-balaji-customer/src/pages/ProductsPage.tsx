import {
  ArrowLeftOutlined,
  CloseOutlined,
  FilterOutlined,
  MinusOutlined,
  PlusOutlined,
  SearchOutlined,
  ShoppingCartOutlined,
  SortAscendingOutlined,
  TagOutlined,
} from '@ant-design/icons';
import { Badge, Breadcrumb, Button, InputNumber, Tag, Typography } from 'antd';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useCart } from '../cart/useCart';
import { bestOfBasics, categories, popularProducts } from '../mock/homeMockData';

function formatInr(value: number): string {
  return `₹${value.toLocaleString('en-IN')}`;
}

export function ProductsPage() {
  const { categoryId } = useParams();
  const navigate = useNavigate();
  const cart = useCart();
  const [searchParams, setSearchParams] = useSearchParams();

  const maxPriceParam = searchParams.get('maxPrice');
  const maxPrice = maxPriceParam ? Number(maxPriceParam) : null;

  const [selectedSub, setSelectedSub] = useState<string>('top-picks');

  const mainCategory = categories.find((c) => c.id === categoryId);

  if (!mainCategory) {
    return <Navigate to={`/products/${categories[0]?.id || 'atta-flour'}`} replace />;
  }

  const allProducts = selectedSub === 'top-picks' ? popularProducts : [...popularProducts, ...bestOfBasics];
  const productsToDisplay = maxPrice ? allProducts.filter((p) => p.price <= maxPrice) : allProducts;

  return (
    <div>
      {/* ========================================================================= */}
      {/* 📱 MOBILE VIEW (< 768px): ORIGINAL MOBILE UI PATTERN                     */}
      {/* ========================================================================= */}
      <div className="mobile-only" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f5f4f2', paddingBottom: 70 }}>
        {/* Mobile Header */}
        <header
          className="store-safe-top"
          style={{
            background: '#ffffff',
            borderBottom: '1px solid #f0eee9',
            padding: '16px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button
              onClick={() => navigate(-1)}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <ArrowLeftOutlined style={{ fontSize: 18, color: '#1c1917' }} />
            </button>
            <Typography.Title level={4} style={{ margin: 0, color: '#1c1917', fontSize: 17, fontWeight: 700 }}>
              {mainCategory.name}
            </Typography.Title>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => navigate('/cart')}>
              <Badge count={cart.count} size="small" offset={[-2, 2]} color="#ea580c">
                <ShoppingCartOutlined style={{ fontSize: 22, color: '#1c1917' }} />
              </Badge>
            </div>
          </div>
        </header>

        {/* Filter and Sort Bar on Mobile */}
        <div className="mobile-flex" style={{ background: '#ffffff', padding: '10px 16px', borderBottom: '1px solid #e7e5e4', gap: 10 }}>
          <Button icon={<SortAscendingOutlined />} size="small" style={{ borderRadius: 10, flex: 1, borderColor: '#d6d3d1', color: '#44403c', height: 34, fontSize: 12 }}>
            Sort by
          </Button>
          <Button icon={<FilterOutlined />} size="small" style={{ borderRadius: 10, flex: 1, borderColor: '#d6d3d1', color: '#44403c', height: 34, fontSize: 12 }}>
            Filter
          </Button>
        </div>

        {/* Active Price Filter Banner (Mobile) */}
        {maxPrice && (
          <div
            style={{
              background: '#fff7ed',
              borderBottom: '1px solid #fed7aa',
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <TagOutlined style={{ color: '#ea580c', fontSize: 13 }} />
              <Typography.Text style={{ color: '#c2410c', fontSize: 12, fontWeight: 600 }}>
                Under ₹{maxPrice} ({productsToDisplay.length})
              </Typography.Text>
            </div>
            <button
              onClick={() => setSearchParams({})}
              style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, color: '#ea580c' }}
            >
              <CloseOutlined style={{ fontSize: 11 }} />
              <Typography.Text style={{ fontSize: 11, color: '#ea580c', fontWeight: 600 }}>Clear</Typography.Text>
            </button>
          </div>
        )}

        {/* Main Content Area: Left Rail + Right Product Grid */}
        <div style={{ display: 'flex', flex: 1, minHeight: 'calc(100vh - 120px)' }}>
          {/* Left Vertical Subcategory Rail */}
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
            {/* Top Picks Tab */}
            <div
              onClick={() => setSelectedSub('top-picks')}
              style={{
                padding: '12px 4px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                background: selectedSub === 'top-picks' ? '#f5f4f2' : 'transparent',
                borderLeft: selectedSub === 'top-picks' ? '4px solid #f97316' : '4px solid transparent',
                position: 'relative',
              }}
            >
              {selectedSub === 'top-picks' && (
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
                <img src="/images/cat_namkeen.jpg" alt="Top Picks" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
              <Typography.Text
                style={{
                  fontSize: 10.5,
                  fontWeight: selectedSub === 'top-picks' ? 700 : 500,
                  color: selectedSub === 'top-picks' ? '#ea580c' : '#78716c',
                  textAlign: 'center',
                  zIndex: 3,
                  lineHeight: 1.1,
                }}
              >
                Top Picks
              </Typography.Text>
            </div>

            {/* All Products Tab */}
            <div
              onClick={() => setSelectedSub('all')}
              style={{
                padding: '12px 4px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                background: selectedSub === 'all' ? '#f5f4f2' : 'transparent',
                borderLeft: selectedSub === 'all' ? '4px solid #f97316' : '4px solid transparent',
                position: 'relative',
              }}
            >
              {selectedSub === 'all' && (
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
                <img src={mainCategory.image} alt="All Products" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
              <Typography.Text
                style={{
                  fontSize: 10.5,
                  fontWeight: selectedSub === 'all' ? 700 : 500,
                  color: selectedSub === 'all' ? '#ea580c' : '#78716c',
                  textAlign: 'center',
                  zIndex: 3,
                  lineHeight: 1.1,
                }}
              >
                All Products
              </Typography.Text>
            </div>

            {/* Subcategories */}
            {mainCategory.subcategories?.map((sub) => {
              const isSelected = selectedSub === sub.id;
              return (
                <div
                  key={sub.id}
                  onClick={() => setSelectedSub(sub.id)}
                  style={{
                    padding: '12px 4px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
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
                    <img src={sub.image} alt={sub.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  </div>
                  <Typography.Text
                    style={{
                      fontSize: 10.5,
                      fontWeight: isSelected ? 700 : 500,
                      color: isSelected ? '#ea580c' : '#78716c',
                      textAlign: 'center',
                      zIndex: 3,
                      lineHeight: 1.1,
                    }}
                  >
                    {sub.name}
                  </Typography.Text>
                </div>
              );
            })}
          </div>

          {/* Right Mobile Products Grid */}
          <div className="hide-scrollbar" style={{ flex: 1, padding: '12px 10px 40px', overflowY: 'auto', background: '#f5f4f2' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {productsToDisplay.map((product, idx) => {
                const cartLine = cart.lines.find((line) => line.productId === product.id);
                return (
                  <div
                    key={`mobile-${product.id}-${idx}`}
                    style={{
                      border: '1px solid #e7e5e4',
                      borderRadius: 12,
                      background: '#ffffff',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                    }}
                  >
                    <Link to={`/product-detail/${product.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ position: 'relative', height: 110, background: '#f8f7f5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8 }}>
                        <img src={product.image} alt={product.name} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', mixBlendMode: 'multiply' }} />
                        {product.badge && (
                          <span
                            style={{
                              position: 'absolute',
                              top: 6,
                              left: 6,
                              background: '#dcfce7',
                              color: '#166534',
                              fontSize: 9,
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: 4,
                            }}
                          >
                            {product.badge}
                          </span>
                        )}
                      </div>

                      <div style={{ padding: '8px 8px 0', display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <Typography.Text strong style={{ display: 'block', fontSize: 12, lineHeight: 1.25, color: '#1c1917', minHeight: 30 }}>
                          {product.name}
                        </Typography.Text>
                        <Typography.Text type="secondary" style={{ fontSize: 11, marginTop: 2, display: 'block' }}>
                          {product.variant || (product as any).weight || '1 pack'}
                        </Typography.Text>

                        <div style={{ margin: '6px 0 8px', display: 'flex', alignItems: 'baseline', gap: 4 }}>
                          <Typography.Text strong style={{ fontSize: 14, color: '#065f46' }}>
                            {formatInr(product.price)}
                          </Typography.Text>
                          {product.mrp && (
                            <Typography.Text delete type="secondary" style={{ fontSize: 10 }}>
                              {formatInr(product.mrp)}
                            </Typography.Text>
                          )}
                        </div>
                      </div>
                    </Link>

                    <div style={{ padding: '0 8px 8px' }}>
                      {cartLine ? (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: '#fff7ed',
                            borderRadius: 8,
                            padding: '2px 4px',
                            border: '1px solid #fed7aa',
                          }}
                        >
                          <Button
                            size="small"
                            type="text"
                            icon={<MinusOutlined style={{ fontSize: 10 }} />}
                            onClick={() => cart.setQuantity(product.id, cartLine.quantity - 1)}
                            style={{ width: 24, height: 24, padding: 0 }}
                          />
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#ea580c' }}>
                            {cartLine.quantity}
                          </span>
                          <Button
                            size="small"
                            type="text"
                            icon={<PlusOutlined style={{ fontSize: 10 }} />}
                            onClick={() => cart.setQuantity(product.id, cartLine.quantity + 1)}
                            style={{ width: 24, height: 24, padding: 0 }}
                          />
                        </div>
                      ) : (
                        <Button
                          block
                          size="small"
                          style={{ background: '#f97316', borderColor: '#f97316', color: '#fff', fontWeight: 700, borderRadius: 8, height: 30, fontSize: 12 }}
                          onClick={() =>
                            cart.add({
                              productId: product.id,
                              productName: product.name,
                              unit: product.variant || (product as any).weight || 'unit',
                              displayUnitPrice: product.price,
                              imageUrl: product.image,
                              mrp: product.mrp,
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
      </div>

      {/* ========================================================================= */}
      {/* 💻 DESKTOP VIEW (>= 768px): FULL-FEATURED CATALOG LAYOUT                   */}
      {/* ========================================================================= */}
      <div className="desktop-only" style={{ background: '#f8fafc', minHeight: '85vh', padding: '24px 0 60px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px' }}>
          {/* Breadcrumb */}
          <Breadcrumb
            items={[
              { title: <Link to="/">Home</Link> },
              { title: <Link to="/categories">Categories</Link> },
              { title: mainCategory.name },
            ]}
            style={{ marginBottom: 20 }}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 28, alignItems: 'start' }}>
            {/* Left Sidebar on Desktop */}
            <div style={{ background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 16, position: 'sticky', top: 120 }}>
              <Typography.Text strong style={{ fontSize: 14, color: '#0f172a', display: 'block', marginBottom: 12, paddingLeft: 8 }}>
                Subcategories
              </Typography.Text>

              <div
                onClick={() => setSelectedSub('top-picks')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  background: selectedSub === 'top-picks' ? '#fff7ed' : 'transparent',
                  border: selectedSub === 'top-picks' ? '1px solid #fed7aa' : '1px solid transparent',
                  marginBottom: 4,
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ width: 32, height: 32, borderRadius: 8, background: '#ffedd5', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  <img src="/images/cat_namkeen.jpg" alt="Top Picks" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>
                <Typography.Text strong style={{ color: selectedSub === 'top-picks' ? '#ea580c' : '#334155', fontSize: 13 }}>
                  ⭐ Top Picks
                </Typography.Text>
              </div>

              <div
                onClick={() => setSelectedSub('all')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  background: selectedSub === 'all' ? '#fff7ed' : 'transparent',
                  border: selectedSub === 'all' ? '1px solid #fed7aa' : '1px solid transparent',
                  marginBottom: 4,
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ width: 32, height: 32, borderRadius: 8, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  <img src={mainCategory.image} alt="All Products" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>
                <Typography.Text strong style={{ color: selectedSub === 'all' ? '#ea580c' : '#334155', fontSize: 13 }}>
                  All {mainCategory.name}
                </Typography.Text>
              </div>

              {mainCategory.subcategories?.map((sub) => {
                const isSelected = selectedSub === sub.id;
                return (
                  <div
                    key={sub.id}
                    onClick={() => setSelectedSub(sub.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 12px',
                      borderRadius: 10,
                      cursor: 'pointer',
                      background: isSelected ? '#fff7ed' : 'transparent',
                      border: isSelected ? '1px solid #fed7aa' : '1px solid transparent',
                      marginBottom: 4,
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      <img src={sub.image} alt={sub.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    </div>
                    <Typography.Text strong style={{ color: isSelected ? '#ea580c' : '#334155', fontSize: 13 }}>
                      {sub.name}
                    </Typography.Text>
                  </div>
                );
              })}
            </div>

            {/* Right Product Grid on Desktop */}
            <div>
              {/* Category Header Banner */}
              <div
                style={{
                  borderRadius: 16,
                  background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                  padding: '24px 28px',
                  marginBottom: 24,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  boxShadow: '0 4px 14px rgba(5, 150, 105, 0.2)',
                }}
              >
                <div>
                  <Typography.Title level={3} style={{ color: '#fff', margin: 0, fontSize: 24, fontWeight: 800 }}>
                    {mainCategory.name} Supply
                  </Typography.Title>
                  <Typography.Text style={{ color: '#d1fae5', fontSize: 13, marginTop: 4, display: 'block' }}>
                    100% Traceable Farm &amp; Mandi Milling · Direct Supply Pricing
                  </Typography.Text>
                </div>
                <img src={mainCategory.image} alt={mainCategory.name} style={{ width: 64, height: 64, objectFit: 'contain' }} />
              </div>

              {/* Active Price Filter Banner (Desktop) */}
              {maxPrice && (
                <div
                  style={{
                    background: '#fff7ed',
                    border: '1px solid #fed7aa',
                    borderRadius: 12,
                    padding: '12px 18px',
                    marginBottom: 20,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <TagOutlined style={{ color: '#ea580c', fontSize: 16 }} />
                    <Typography.Text strong style={{ color: '#c2410c', fontSize: 14 }}>
                      Showing products under ₹{maxPrice}
                    </Typography.Text>
                    <Tag color="orange" style={{ margin: 0, fontSize: 12 }}>
                      {productsToDisplay.length} item{productsToDisplay.length !== 1 ? 's' : ''}
                    </Tag>
                  </div>
                  <button
                    onClick={() => setSearchParams({})}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: '#ea580c' }}
                  >
                    <CloseOutlined style={{ fontSize: 13 }} />
                    <Typography.Text style={{ fontSize: 13, color: '#ea580c', fontWeight: 600 }}>Clear Filter</Typography.Text>
                  </button>
                </div>
              )}

              {/* Product Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: 18,
                }}
              >
                {productsToDisplay.map((product, idx) => {
                  const cartLine = cart.lines.find((line) => line.productId === product.id);
                  return (
                    <div
                      key={`desktop-${product.id}-${idx}`}
                      className="product-card-hover"
                      style={{
                        border: '1px solid #e2e8f0',
                        borderRadius: 16,
                        background: '#ffffff',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                      }}
                    >
                      <Link to={`/product-detail/${product.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ position: 'relative', height: 150, background: '#f8f7f5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
                          <img src={product.image} alt={product.name} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', mixBlendMode: 'multiply' }} />
                          {product.badge && (
                            <span
                              style={{
                                position: 'absolute',
                                top: 8,
                                left: 8,
                                background: '#dcfce7',
                                color: '#166534',
                                fontSize: 10,
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: 6,
                              }}
                            >
                              {product.badge}
                            </span>
                          )}
                        </div>
                        <div style={{ padding: '14px 14px 0', display: 'flex', flexDirection: 'column', flex: 1 }}>
                          <Typography.Text strong style={{ display: 'block', fontSize: 13, lineHeight: 1.3, color: '#1c1917' }}>
                            {product.name}
                          </Typography.Text>
                          <Typography.Text type="secondary" style={{ fontSize: 12, marginTop: 2, display: 'block' }}>
                            {product.variant || (product as any).weight || '1 pack'}
                          </Typography.Text>

                          <div style={{ margin: '8px 0 12px', display: 'flex', alignItems: 'baseline', gap: 6 }}>
                            <Typography.Text strong style={{ fontSize: 16, color: '#065f46' }}>
                              {formatInr(product.price)}
                            </Typography.Text>
                            {product.mrp && (
                              <Typography.Text delete type="secondary" style={{ fontSize: 12 }}>
                                {formatInr(product.mrp)}
                              </Typography.Text>
                            )}
                          </div>
                        </div>
                      </Link>

                      <div style={{ padding: '0 14px 14px' }}>
                        {cartLine ? (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              background: '#fff7ed',
                              borderRadius: 10,
                              padding: '3px 6px',
                              border: '1px solid #fed7aa',
                            }}
                          >
                            <Button
                              size="small"
                              type="text"
                              icon={<MinusOutlined />}
                              onClick={() => cart.setQuantity(product.id, cartLine.quantity - 1)}
                            />
                            <InputNumber
                              size="small"
                              min={1}
                              value={cartLine.quantity}
                              controls={false}
                              onChange={(value) => cart.setQuantity(product.id, value ?? 1)}
                              style={{ width: 44, textAlign: 'center' }}
                            />
                            <Button
                              size="small"
                              type="text"
                              icon={<PlusOutlined />}
                              onClick={() => cart.setQuantity(product.id, cartLine.quantity + 1)}
                            />
                          </div>
                        ) : (
                          <Button
                            block
                            style={{ background: '#f97316', borderColor: '#f97316', color: '#fff', fontWeight: 600, borderRadius: 10 }}
                            onClick={() =>
                              cart.add({
                                productId: product.id,
                                productName: product.name,
                                unit: product.variant || (product as any).weight || 'unit',
                                displayUnitPrice: product.price,
                                imageUrl: product.image,
                                mrp: product.mrp,
                              })
                            }
                          >
                            Add to Cart
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
