import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Empty, Input, InputNumber, Select, Space, Tooltip, Typography } from 'antd';
import { useMemo } from 'react';
import type { Category, HomePriceTile, PriceTileColor } from '@shared/api/types';

const { Text } = Typography;

/** Same gradients the storefront draws, so the preview here matches the homepage. */
export const PRICE_TILE_GRADIENTS: Record<PriceTileColor, string> = {
  purple: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
  orange: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
  green: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
  blue: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
  red: 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)',
  teal: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
};
const COLORS = Object.keys(PRICE_TILE_GRADIENTS) as PriceTileColor[];

interface PriceTilesEditorProps {
  value?: HomePriceTile[];
  onChange?: (tiles: HomePriceTile[]) => void;
  categories: Category[];
}

export function PriceTilesEditor({ value, onChange, categories }: PriceTilesEditorProps) {
  const tiles = value ?? [];

  const categoryOptions = useMemo(() => {
    const mains = categories.filter((c) => !c.parentId).sort((a, b) => a.displayOrder - b.displayOrder);
    return mains.map((m) => ({
      label: m.name,
      options: [
        { value: m.id, label: `${m.name} (all)` },
        ...categories
          .filter((c) => c.parentId === m.id)
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((c) => ({ value: c.id, label: `${m.name} › ${c.name}` })),
      ],
    }));
  }, [categories]);

  const patch = (i: number, p: Partial<HomePriceTile>) =>
    onChange?.(tiles.map((t, idx) => (idx === i ? { ...t, ...p } : t)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...tiles];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange?.(next);
  };
  const add = () =>
    onChange?.([
      ...tiles,
      { label: 'Starting from', price: 99, subtitle: '', emoji: '🛒', color: COLORS[tiles.length % COLORS.length], categoryId: null },
    ]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {tiles.length === 0 && (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No tiles yet - add one below" style={{ margin: 8 }} />
      )}
      {tiles.map((t, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, border: '1px solid #e5e7eb', borderRadius: 10, padding: 10 }}>
          {/* Live preview */}
          <div
            style={{
              width: 130,
              flexShrink: 0,
              borderRadius: 12,
              padding: 12,
              color: '#fff',
              background: PRICE_TILE_GRADIENTS[t.color] ?? PRICE_TILE_GRADIENTS.orange,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div style={{ position: 'absolute', bottom: -8, right: -6, fontSize: 40, opacity: 0.2 }}>{t.emoji}</div>
            <div style={{ fontSize: 10, opacity: 0.9 }}>{t.label || 'Starting from'}</div>
            <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.1 }}>₹{t.price ?? 0}</div>
            <div style={{ fontSize: 11, opacity: 0.9, marginTop: 4, lineHeight: 1.2 }}>{t.subtitle || 'Subtitle'}</div>
          </div>

          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                style={{ width: '40%' }}
                value={t.label}
                maxLength={40}
                placeholder="Starting from"
                onChange={(e) => patch(i, { label: e.target.value })}
              />
              <InputNumber
                style={{ width: '30%' }}
                prefix="₹"
                min={0}
                value={t.price}
                onChange={(v) => patch(i, { price: v ?? 0 })}
              />
              <Input
                style={{ width: '30%' }}
                value={t.emoji}
                maxLength={8}
                placeholder="Emoji"
                onChange={(e) => patch(i, { emoji: e.target.value })}
              />
            </Space.Compact>
            <Input
              value={t.subtitle}
              maxLength={60}
              placeholder="e.g. Namkeens & snacks"
              onChange={(e) => patch(i, { subtitle: e.target.value })}
              status={t.subtitle?.trim() ? undefined : 'warning'}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Opens: all products"
                style={{ flex: 1, minWidth: 0 }}
                options={categoryOptions}
                value={t.categoryId ?? undefined}
                onChange={(v) => patch(i, { categoryId: v ?? null })}
              />
              <Space size={4}>
                {COLORS.map((c) => (
                  <Tooltip key={c} title={c}>
                    <button
                      type="button"
                      aria-label={c}
                      onClick={() => patch(i, { color: c })}
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        cursor: 'pointer',
                        background: PRICE_TILE_GRADIENTS[c],
                        border: t.color === c ? '2px solid #0f172a' : '2px solid transparent',
                        outline: t.color === c ? '1px solid #fff' : 'none',
                        outlineOffset: -3,
                      }}
                    />
                  </Tooltip>
                ))}
              </Space>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => move(i, -1)} />
            <Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={i === tiles.length - 1} onClick={() => move(i, 1)} />
            <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => onChange?.(tiles.filter((_, idx) => idx !== i))} />
          </div>
        </div>
      ))}
      <Button icon={<PlusOutlined />} onClick={add} disabled={tiles.length >= 12} block type="dashed">
        Add tile
      </Button>
      <Text type="secondary" style={{ fontSize: 12 }}>
        The price is the headline you want shoppers to see; pick the category each tile should open.
      </Text>
    </div>
  );
}
