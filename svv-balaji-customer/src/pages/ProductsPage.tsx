import { ArrowLeftOutlined, CloseOutlined, FilterOutlined, MinusOutlined, PlusOutlined, SearchOutlined, ShoppingCartOutlined, SortAscendingOutlined, TagOutlined } from '@ant-design/icons';
import { Badge, Button, InputNumber, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate, useParams, Navigate, Link, useSearchParams } from 'react-router-dom';
import { useCart } from '../cart/useCart';
import { categories, popularProducts, bestOfBasics } from '../mock/homeMockData';

function formatInr(value: number): string {
  return `₹${value.toLocaleString('en-IN')}`;
}

function ProductThumb({ image }: { image: string }) {
  return (
    <div
      style={{
        width: '100%',
        height: 140,
        background: '#f5f4f2',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <img src={image} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', mixBlendMode: 'multiply' }} />
    </div>
  );
}

/**
 * Zepto-style Product Listing Page nested under a category
 */
export function ProductsPage() {
  const { categoryId } = useParams();
  const navigate = useNavigate();
  const cart = useCart();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const maxPriceParam = searchParams.get('maxPrice');
  const maxPrice = maxPriceParam ? Number(maxPriceParam) : null;

  // Left sidebar selection (subcategories)
  const [selectedSub, setSelectedSub] = useState<string>('top-picks');

  // Find the selected main category
  const mainCategory = categories.find(c => c.id === categoryId);

  // If no category matched or no ID provided, redirect to first category
  if (!mainCategory) {
    return <Navigate to={`/categories/${categories[0]?.id || 'atta-flour'}`} replace />;
  }

  // We reuse mock data to simulate category products
  const allProducts = selectedSub === 'top-picks' ? popularProducts : [...popularProducts, ...bestOfBasics];
  // Apply maxPrice filter from URL param if present
  const productsToDisplay = maxPrice
    ? allProducts.filter(p => p.price <= maxPrice)
    : allProducts;

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
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            onClick={() => navigate(-1)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <ArrowLeftOutlined style={{ fontSize: 20, color: '#44403c' }} />
          </button>
          <Typography.Title level={4} style={{ margin: 0, color: '#1c1917', fontSize: 18 }}>
            {mainCategory.name}
          </Typography.Title>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <SearchOutlined style={{ fontSize: 20, color: '#44403c' }} />
          <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => navigate('/cart')}>
            <Badge count={cart.count} size="small" offset={[-2, 2]}>
              <ShoppingCartOutlined style={{ fontSize: 20, color: '#44403c' }} />
            </Badge>
          </div>
        </div>
      </header>

      {/* Filter and Sort Bar */}
      <div style={{ background: '#ffffff', padding: '12px 20px', borderBottom: '1px solid #e7e5e4', display: 'flex', gap: 12 }}>
        <Button icon={<SortAscendingOutlined />} style={{ borderRadius: 16, flex: 1, borderColor: '#d6d3d1', color: '#44403c' }}>
          Sort by
        </Button>
        <Button icon={<FilterOutlined />} style={{ borderRadius: 16, flex: 1, borderColor: '#d6d3d1', color: '#44403c' }}>
          Filter
        </Button>
      </div>

      {/* Active Price Filter Banner */}
      {maxPrice && (
        <div style={{
          background: 'linear-gradient(90deg, #fff3ed 0%, #ffedd5 100%)',
          borderBottom: '1px solid #fed7aa',
          padding: '10px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TagOutlined style={{ color: '#f97316', fontSize: 15 }} />
            <Typography.Text strong style={{ color: '#c2410c', fontSize: 13 }}>
              Showing products under ₹{maxPrice}
            </Typography.Text>
            <Tag color="orange" style={{ margin: 0, fontSize: 11 }}>
              {productsToDisplay.length} item{productsToDisplay.length !== 1 ? 's' : ''}
            </Tag>
          </div>
          <button
            onClick={() => setSearchParams({})}
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: '#f97316' }}
          >
            <CloseOutlined style={{ fontSize: 13 }} />
            <Typography.Text style={{ fontSize: 12, color: '#f97316', fontWeight: 600 }}>Clear</Typography.Text>
          </button>
        </div>
      )}


      {/* Main Content Area */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        
        {/* Left Sidebar (Subcategories) */}
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
          {/* Top Picks Tab */}
          <SidebarTab
            id="top-picks"
            title="Top Picks"
            image="/images/cat_namkeen.jpg"
            isSelected={selectedSub === 'top-picks'}
            onClick={() => setSelectedSub('top-picks')}
          />
          
          {/* All Tab */}
          <SidebarTab
            id="all"
            title="All"
            image={mainCategory.image}
            isSelected={selectedSub === 'all'}
            onClick={() => setSelectedSub('all')}
          />

          {/* Subcategories */}
          {mainCategory.subcategories?.map((sub) => (
            <SidebarTab
              key={sub.id}
              id={sub.id}
              title={sub.name}
              image={sub.image}
              isSelected={selectedSub === sub.id}
              onClick={() => setSelectedSub(sub.id)}
            />
          ))}
        </div>

        {/* Right Content Area (Products) */}
        <div className="hide-scrollbar" style={{ flex: 1, padding: '16px', overflowY: 'auto', background: '#f5f4f2', paddingBottom: 40 }}>
          
          {/* Orange Poster ONLY when Top Picks is selected */}
          {selectedSub === 'top-picks' && (
            <div
              style={{
                borderRadius: 16,
                background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                padding: '24px 20px',
                marginBottom: 20,
                color: '#fff',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 4px 12px rgba(234, 88, 12, 0.2)'
              }}
            >
              <Typography.Title level={3} style={{ color: '#fff', margin: 0, fontSize: 22, fontWeight: 800 }}>
                {mainCategory.name} Deals
              </Typography.Title>
              <Typography.Text style={{ color: '#ffedd5', fontSize: 13, marginTop: 4, display: 'block', marginBottom: 16 }}>
                Fresh & Premium Quality
              </Typography.Text>
              <Button style={{ alignSelf: 'flex-start', background: '#fff', color: '#ea580c', border: 'none', fontWeight: 700, borderRadius: 20 }}>
                ORDER NOW
              </Button>
            </div>
          )}

          {/* Product Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {productsToDisplay.map((product, idx) => {
              const cartLine = cart.lines.find((line) => line.productId === product.id);
              return (
                <div
                  key={`${product.id}-${idx}`}
                  style={{
                    border: '1px solid #e7e5e4',
                    borderRadius: 16,
                    background: '#ffffff',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <Link to={`/product-detail/${product.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <div style={{ position: 'relative' }}>
                      <ProductThumb image={product.image} />
                      {product.badge && (
                        <Typography.Text
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
                        </Typography.Text>
                      )}
                    </div>
                    <div style={{ padding: '12px 12px 0', display: 'flex', flexDirection: 'column', flex: 1 }}>
                      <Typography.Text strong style={{ display: 'block', fontSize: 13, lineHeight: 1.2 }}>
                        {product.name}
                      </Typography.Text>
                      {product.variant && (
                         <Typography.Text type="secondary" style={{ fontSize: 12, marginTop: 2, display: 'block', marginBottom: 'auto' }}>
                           {product.variant}
                         </Typography.Text>
                      )}
                      {('weight' in product) && !(product as any).variant && (
                         <Typography.Text type="secondary" style={{ fontSize: 12, marginTop: 2, display: 'block', marginBottom: 'auto' }}>
                           {(product as any).weight}
                         </Typography.Text>
                      )}
                      
                      <div style={{ margin: '8px 0 12px' }}>
                        <Typography.Text strong style={{ fontSize: 15 }}>
                          {formatInr(product.price)}
                        </Typography.Text>
                        {product.mrp && (
                          <Typography.Text delete type="secondary" style={{ fontSize: 12, marginLeft: 6 }}>
                            {formatInr(product.mrp)}
                          </Typography.Text>
                        )}
                      </div>
                    </div>
                  </Link>

                  <div style={{ padding: '0 12px 12px' }}>
                    {cartLine ? (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: '#eef2ff',
                          borderRadius: 10,
                          padding: '2px 4px',
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
                          style={{ width: 40, textAlign: 'center' }}
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
                        style={{ background: '#f97316', borderColor: '#f97316', color: '#fff', fontWeight: 600 }}
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
  );
}

function SidebarTab({ id, title, image, isSelected, onClick }: { id: string; title: string; image: string; isSelected: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
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
        <img src={image} alt={title} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      </div>
      <Typography.Text style={{ fontSize: 10, fontWeight: isSelected ? 700 : 500, color: isSelected ? '#ea580c' : '#78716c', textAlign: 'center', zIndex: 3, lineHeight: 1.1 }}>
        {title}
      </Typography.Text>
    </div>
  );
}
