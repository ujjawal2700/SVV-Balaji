import { CloseOutlined, PictureOutlined, SearchOutlined, ShoppingOutlined } from '@ant-design/icons';
import { Button, Checkbox, Empty, Input, Select, Space, Spin, Switch, Tag, Tooltip, Typography } from 'antd';
import { useMemo, useState } from 'react';
import type { Category, Product } from '@shared/api/types';

const { Text } = Typography;

const ACCENT = '#ea580c';

interface ProductPickerProps {
  /** Injected by Form.Item. Order is the order cards appear in on the storefront. */
  value?: string[];
  onChange?: (ids: string[]) => void;
  products: Product[];
  categories: Category[];
  loading?: boolean;
}

/** Splits a product's category into (main, sub). A product filed directly on a main category has no sub. */
function categoryPath(p: Product): { mainId: string | null; mainName: string | null; subId: string | null; subName: string | null } {
  const c = p.category;
  if (!c) return { mainId: null, mainName: null, subId: null, subName: null };
  if (c.parent) return { mainId: c.parent.id, mainName: c.parent.name, subId: c.id, subName: c.name };
  return { mainId: c.id, mainName: c.name, subId: null, subName: null };
}

export function ProductPicker({ value, onChange, products, categories, loading }: ProductPickerProps) {
  const selected = useMemo(() => value ?? [], [value]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const [search, setSearch] = useState('');
  const [mainId, setMainId] = useState<string | undefined>();
  const [subId, setSubId] = useState<string | undefined>();
  const [selectedOnly, setSelectedOnly] = useState(false);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const mainOptions = useMemo(
    () =>
      categories
        .filter((c) => !c.parentId)
        .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name))
        .map((c) => ({ value: c.id, label: c.name })),
    [categories],
  );

  const subOptions = useMemo(
    () =>
      categories
        .filter((c) => c.parentId && (!mainId || c.parentId === mainId))
        .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name))
        .map((c) => ({
          value: c.id,
          label: mainId ? c.name : `${c.parent?.name ?? '—'} › ${c.name}`,
        })),
    [categories, mainId],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (selectedOnly && !selectedSet.has(p.id)) return false;
      const path = categoryPath(p);
      if (mainId && path.mainId !== mainId) return false;
      if (subId && path.subId !== subId) return false;
      if (!q) return true;
      return [p.name, p.sku, p.brand, p.packLabel, path.mainName, path.subName]
        .filter(Boolean)
        .some((s) => (s as string).toLowerCase().includes(q));
    });
  }, [products, search, mainId, subId, selectedOnly, selectedSet]);

  const visibleSelectedCount = visible.filter((p) => selectedSet.has(p.id)).length;
  const allVisibleSelected = visible.length > 0 && visibleSelectedCount === visible.length;
  const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;

  const toggle = (id: string) => {
    onChange?.(selectedSet.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  const toggleAllVisible = () => {
    if (allVisibleSelected) {
      const visibleIds = new Set(visible.map((p) => p.id));
      onChange?.(selected.filter((id) => !visibleIds.has(id)));
    } else {
      onChange?.([...selected, ...visible.filter((p) => !selectedSet.has(p.id)).map((p) => p.id)]);
    }
  };

  const filtersActive = Boolean(search || mainId || subId || selectedOnly);
  const resetFilters = () => {
    setSearch('');
    setMainId(undefined);
    setSubId(undefined);
    setSelectedOnly(false);
  };

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
      {/* Selected tray - storefront order */}
      <div style={{ padding: 12, background: '#fff7ed', borderBottom: '1px solid #fed7aa' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: selected.length ? 8 : 0 }}>
          <Space size={6}>
            <ShoppingOutlined style={{ color: ACCENT }} />
            <Text strong>{selected.length} selected</Text>
            {selected.length > 0 && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                · shown on the homepage in this order
              </Text>
            )}
          </Space>
          {selected.length > 0 && (
            <Button size="small" type="link" danger onClick={() => onChange?.([])} style={{ padding: 0 }}>
              Clear all
            </Button>
          )}
        </div>
        {selected.length === 0 ? (
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
            No products picked yet. Tick products below to add them to this section.
          </Text>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 96, overflowY: 'auto' }}>
            {selected.map((id, i) => {
              const p = productById.get(id);
              return (
                <Tag
                  key={id}
                  closable
                  closeIcon={<CloseOutlined style={{ fontSize: 10 }} />}
                  onClose={(e) => {
                    e.preventDefault();
                    toggle(id);
                  }}
                  style={{ margin: 0, padding: '2px 8px', borderRadius: 999, background: '#fff', borderColor: '#fdba74' }}
                >
                  <Text style={{ fontSize: 12, color: ACCENT, fontWeight: 600, marginRight: 4 }}>{i + 1}.</Text>
                  <Text style={{ fontSize: 12 }}>{p?.name ?? 'Unavailable product'}</Text>
                </Tag>
              );
            })}
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={{ padding: 12, borderBottom: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Input
          allowClear
          prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
          placeholder="Search by product name, SKU, brand or pack size"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="All categories"
            style={{ flex: 1, minWidth: 0 }}
            options={mainOptions}
            value={mainId}
            onChange={(v) => {
              setMainId(v);
              setSubId(undefined);
            }}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="All sub-categories"
            style={{ flex: 1, minWidth: 0 }}
            options={subOptions}
            value={subId}
            onChange={setSubId}
            notFoundContent={mainId ? 'No sub-categories' : undefined}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Checkbox
            checked={allVisibleSelected}
            indeterminate={someVisibleSelected}
            disabled={visible.length === 0}
            onChange={toggleAllVisible}
          >
            <Text style={{ fontSize: 13 }}>
              Select all shown <Text type="secondary">({visible.length})</Text>
            </Text>
          </Checkbox>
          <Space size={12}>
            <Space size={6}>
              <Switch size="small" checked={selectedOnly} onChange={setSelectedOnly} />
              <Text style={{ fontSize: 13 }}>Selected only</Text>
            </Space>
            {filtersActive && (
              <Button size="small" type="link" onClick={resetFilters} style={{ padding: 0 }}>
                Reset filters
              </Button>
            )}
          </Space>
        </div>
      </div>

      {/* Product list */}
      <div style={{ maxHeight: 380, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <Spin />
          </div>
        ) : visible.length === 0 ? (
          <Empty
            style={{ padding: 24 }}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={filtersActive ? 'No products match these filters' : 'No products in the catalogue yet'}
          />
        ) : (
          visible.map((p) => {
            const isSel = selectedSet.has(p.id);
            const path = categoryPath(p);
            const thumb = p.images?.[0];
            return (
              <div
                key={p.id}
                role="checkbox"
                aria-checked={isSel}
                tabIndex={0}
                onClick={() => toggle(p.id)}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    toggle(p.id);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  cursor: 'pointer',
                  borderBottom: '1px solid #f1f5f9',
                  borderLeft: `3px solid ${isSel ? ACCENT : 'transparent'}`,
                  background: isSel ? '#fff7ed' : undefined,
                  transition: 'background 0.15s',
                }}
              >
                <Checkbox checked={isSel} style={{ pointerEvents: 'none' }} />
                <div
                  style={{
                    width: 40,
                    height: 40,
                    flexShrink: 0,
                    borderRadius: 6,
                    background: '#f8fafc',
                    border: '1px solid #e5e7eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                >
                  {thumb ? (
                    <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <PictureOutlined style={{ color: '#cbd5e1', fontSize: 18 }} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Text strong ellipsis={{ tooltip: p.name }} style={{ fontSize: 13, maxWidth: '100%' }}>
                      {p.name}
                    </Text>
                    {!p.isActive && (
                      <Tooltip title="Discontinued - will not show on the storefront">
                        <Tag color="default" style={{ margin: 0, fontSize: 10 }}>
                          Inactive
                        </Tag>
                      </Tooltip>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                    {(p.packLabel || p.unit) && (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {p.packLabel || p.unit}
                      </Text>
                    )}
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      · {p.sku}
                    </Text>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, maxWidth: 180 }}>
                  {path.mainName ? (
                    <>
                      <Tag color="orange" style={{ margin: 0, fontSize: 11 }}>
                        {path.mainName}
                      </Tag>
                      {path.subName && (
                        <div style={{ marginTop: 2 }}>
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            › {path.subName}
                          </Text>
                        </div>
                      )}
                    </>
                  ) : (
                    <Tag style={{ margin: 0, fontSize: 11 }}>Unassigned</Tag>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
