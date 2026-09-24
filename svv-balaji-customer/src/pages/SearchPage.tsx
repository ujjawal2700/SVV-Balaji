import { ArrowLeftOutlined, ClockCircleOutlined, CloseCircleFilled, SearchOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { Badge, Skeleton, Typography } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCustomerAuth } from '../auth/CustomerAuthContext';
import { useCart } from '../cart/useCart';
import { RatingBadge } from '../components/ProductReviews';
import { useCatalogueProducts, type ShelfProduct } from '../hooks/useCatalogue';
import { useCategoryTree } from '../hooks/useCategoryTree';
import { formatInr } from '../utils/money';

const RECENT_KEY = 'recent_searches';
const MAX_RECENT = 8;

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function writeRecent(list: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch {
    // Private mode / storage blocked - recent searches are only a convenience.
  }
}

/** Waits until the shopper pauses typing, so we don't query the server on every keystroke. */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Highlights the typed words inside a product name. */
function Highlight({ text, query }: { text: string; query: string }) {
  const words = query.trim().split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return <>{text}</>;
  const alternation = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const splitter = new RegExp(`(${alternation})`, 'ig');
  const isMatch = new RegExp(`^(?:${alternation})$`, 'i');
  return (
    <>
      {text.split(splitter).map((part, i) =>
        isMatch.test(part) ? (
          <mark key={i} style={{ background: 'transparent', color: 'inherit', fontWeight: 800, padding: 0 }}>
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/**
 * Product search. Suggestions come from the live catalogue as the shopper types
 * (name, brand, SKU, pack size, category and description), priced for their own
 * channel. With nothing typed it offers recent searches, categories and popular
 * products instead of an empty screen.
 */
export function SearchPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { role } = useCustomerAuth();
  const cart = useCart();
  const isRetailer = role === 'RETAILER';
  const accent = isRetailer ? '#059669' : '#ea580c';

  const [text, setText] = useState(params.get('q') ?? '');
  const [recent, setRecent] = useState<string[]>(readRecent);
  const inputRef = useRef<HTMLInputElement>(null);
  const query = useDebounced(text.trim(), 250);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keep the box in step when the URL changes (e.g. back/forward between searches).
  useEffect(() => {
    setText(params.get('q') ?? '');
  }, [params]);

  const results = useCatalogueProducts({ q: query, limit: 40 }, { enabled: query.length > 0 });
  const popular = useCatalogueProducts({ topPick: true, limit: 8 });
  const categories = useCategoryTree();

  const popularList = popular.products.length ? popular.products : [];
  const matches = query ? results.products : [];

  const matchingCategories = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return [];
    const flat = categories.flatMap((c) => [{ id: c.id, name: c.name, image: c.image }, ...c.subcategories.map((s) => ({ id: s.id, name: s.name, image: s.image }))]);
    return flat.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 6);
  }, [categories, query]);

  const commit = (value: string) => {
    const v = value.trim();
    if (!v) return;
    const next = [v, ...recent.filter((r) => r.toLowerCase() !== v.toLowerCase())].slice(0, MAX_RECENT);
    setRecent(next);
    writeRecent(next);
    setParams({ q: v }, { replace: false });
    inputRef.current?.blur();
  };

  const openProduct = (p: ShelfProduct) => {
    if (text.trim()) commit(text);
    navigate(`/product-detail/${p.slug}`);
  };

  const clearRecent = () => {
    setRecent([]);
    writeRecent([]);
  };

  const inCart = (id: string) => cart.lines.find((l) => l.productId === id)?.quantity ?? 0;

  const addToCart = (p: ShelfProduct) =>
    cart.add({
      productId: p.id,
      productName: p.name,
      unit: p.variant || p.weight || p.unit,
      displayUnitPrice: p.price,
      imageUrl: p.image,
      mrp: p.mrp,
    });

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', paddingBottom: 80 }}>
      {/* Header: back · search box · cart */}
      <header
        className="store-safe-top"
        style={{ position: 'sticky', top: 0, zIndex: 100, background: '#fff', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #e2e8f0' }}
      >
        <button onClick={() => navigate(-1)} aria-label="Back" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
          <ArrowLeftOutlined style={{ fontSize: 20, color: '#1e293b' }} />
        </button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            commit(text);
          }}
          style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', border: `1px solid ${text ? accent : '#e2e8f0'}`, borderRadius: 10, padding: '0 12px', height: 40 }}
        >
          <SearchOutlined style={{ fontSize: 16, color: '#94a3b8' }} />
          <input
            ref={inputRef}
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={isRetailer ? 'Search wholesale products' : 'Search for products'}
            enterKeyHint="search"
            maxLength={80}
            style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: '#0f172a' }}
          />
          {text ? (
            <CloseCircleFilled
              onClick={() => {
                setText('');
                setParams({}, { replace: true });
                inputRef.current?.focus();
              }}
              style={{ color: '#94a3b8', cursor: 'pointer' }}
            />
          ) : null}
        </form>
        <div style={{ cursor: 'pointer', flexShrink: 0 }} onClick={() => navigate('/cart')} aria-label="Cart">
          <Badge count={cart.count} size="small" offset={[-2, 2]} color={accent}>
            <ShoppingCartOutlined style={{ fontSize: 22, color: '#1e293b' }} />
          </Badge>
        </div>
      </header>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '12px 12px 0' }}>
        {!query ? (
          <>
            {recent.length > 0 ? (
              <Section
                title="Recent searches"
                action={
                  <button onClick={clearRecent} style={{ background: 'none', border: 'none', color: accent, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                    Clear
                  </button>
                }
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {recent.map((r) => (
                    <Chip key={r} onClick={() => { setText(r); commit(r); }}>
                      <ClockCircleOutlined style={{ fontSize: 11, color: '#94a3b8' }} /> {r}
                    </Chip>
                  ))}
                </div>
              </Section>
            ) : null}

            {categories.length > 0 ? (
              <Section title="Browse categories">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {categories.slice(0, 10).map((c) => (
                    <Chip key={c.id} onClick={() => navigate(`/products/${c.id}`)}>
                      {c.name}
                    </Chip>
                  ))}
                </div>
              </Section>
            ) : null}

            {popularList.length > 0 ? (
              <Section title={isRetailer ? 'Popular with retailers' : 'Popular right now'}>
                <ProductList products={popularList} query="" accent={accent} inCart={inCart} onOpen={openProduct} onAdd={addToCart} />
              </Section>
            ) : null}
          </>
        ) : results.isLoading ? (
          <Section title={`Searching for “${query}”`}>
            <Skeleton active avatar paragraph={{ rows: 1 }} />
            <Skeleton active avatar paragraph={{ rows: 1 }} />
          </Section>
        ) : (
          <>
            {matchingCategories.length > 0 ? (
              <Section title="Categories">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {matchingCategories.map((c) => (
                    <Chip key={c.id} onClick={() => navigate(`/products/${c.id}`)}>
                      <Highlight text={c.name} query={query} />
                    </Chip>
                  ))}
                </div>
              </Section>
            ) : null}

            {matches.length > 0 ? (
              <Section title={`${matches.length} result${matches.length === 1 ? '' : 's'} for “${query}”`}>
                <ProductList products={matches} query={query} accent={accent} inCart={inCart} onOpen={openProduct} onAdd={addToCart} />
              </Section>
            ) : (
              <>
                <div style={{ background: '#fff', borderRadius: 16, padding: '24px 16px', textAlign: 'center', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                  <div style={{ fontSize: 40, lineHeight: 1 }}>🔍</div>
                  <Typography.Text strong style={{ fontSize: 16, display: 'block', marginTop: 8 }}>
                    No results for “{query}”
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    Check the spelling or try a simpler word like “atta” or “spices”.
                  </Typography.Text>
                </div>
                {popularList.length > 0 ? (
                  <Section title="You might like these">
                    <ProductList products={popularList} query="" accent={accent} inCart={inCart} onOpen={openProduct} onAdd={addToCart} />
                  </Section>
                ) : null}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Typography.Text strong style={{ fontSize: 15 }}>{title}</Typography.Text>
        {action}
      </div>
      {children}
    </div>
  );
}

function Chip({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: 999,
        padding: '6px 12px',
        fontSize: 13,
        color: '#334155',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function ProductList({
  products,
  query,
  accent,
  inCart,
  onOpen,
  onAdd,
}: {
  products: ShelfProduct[];
  query: string;
  accent: string;
  inCart: (id: string) => number;
  onOpen: (p: ShelfProduct) => void;
  onAdd: (p: ShelfProduct) => void;
}) {
  return (
    <div>
      {products.map((p, idx) => {
        const qty = inCart(p.id);
        return (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: idx === 0 ? 'none' : '1px solid #f1f5f9' }}>
            <div onClick={() => onOpen(p)} style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, cursor: 'pointer' }}>
              <img
                src={p.image}
                alt={p.name}
                style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'contain', background: '#f8fafc', border: '1px solid #eef2f6', flexShrink: 0, mixBlendMode: 'multiply' }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, color: '#0f172a', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  <Highlight text={p.name} query={query} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                  {p.weight ? <span style={{ fontSize: 12, color: '#64748b' }}>{p.weight}</span> : null}
                  <RatingBadge rating={p.rating} count={p.reviewCount} />
                </div>
                <div style={{ marginTop: 3, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  {p.price !== null ? <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{formatInr(p.price)}</span> : null}
                  {p.mrp ? <span style={{ fontSize: 12, color: '#94a3b8', textDecoration: 'line-through' }}>{formatInr(p.mrp)}</span> : null}
                </div>
              </div>
            </div>
            {p.purchasable ? (
              <button
                onClick={() => onAdd(p)}
                style={{
                  flexShrink: 0,
                  minWidth: 64,
                  height: 34,
                  borderRadius: 10,
                  border: `1.5px solid ${accent}`,
                  background: qty ? accent : '#fff',
                  color: qty ? '#fff' : accent,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                {qty ? `${qty} in cart` : 'ADD'}
              </button>
            ) : (
              <span style={{ fontSize: 11.5, color: '#dc2626', fontWeight: 600, flexShrink: 0 }}>{p.price === null ? 'Unavailable' : 'Out of stock'}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

