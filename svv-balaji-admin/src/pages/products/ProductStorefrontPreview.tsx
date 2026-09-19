import { PictureOutlined, TagOutlined } from '@ant-design/icons';
import { Alert, Divider, Modal, Segmented, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { formatCurrency } from '../../utils/format';
import {
  cleanTiers,
  discountPercent,
  round2,
  tierDiscount,
  inclusiveOf,
  type ProductFormValues,
} from './productForm';

const { Text, Title } = Typography;

/**
 * A faithful-enough rendering of what the storefront product page will show,
 * fed from the form's CURRENT values rather than the saved product - so an
 * operator can check a price ladder or a badge before committing it.
 *
 * It mirrors the storefront's own rules (GST-inclusive display, MRP strike-through
 * only when an MRP exists, each section hidden when empty) but is deliberately
 * not a copy of that page: the storefront is a separate app and pulling its
 * components in here would couple two release cycles for a preview.
 */
export function ProductStorefrontPreview({
  open,
  onClose,
  values,
  categoryLabel,
}: {
  open: boolean;
  onClose: () => void;
  values: ProductFormValues;
  categoryLabel?: string;
}) {
  const [channel, setChannel] = useState<'B2C' | 'B2B'>('B2C');

  const gst = values.gstRatePercent ?? 5;
  const mrp = typeof values.mrp === 'number' ? values.mrp : null;
  const b2c = typeof values.b2cPrice === 'number' ? values.b2cPrice : null;
  const totals = Boolean(values.b2bTiersAreTotals);
  // Per-pack price for every tier, whichever way the operator typed it.
  const tiers = cleanTiers(values.b2bTiers, totals).map((t) => ({
    minQuantity: t.minQuantity,
    unitPrice: t.totalPrice !== undefined ? round2(t.totalPrice / t.minQuantity) : (t.unitPrice as number),
  }));
  const image = (values.images ?? []).find(Boolean);

  const highlights = (values.highlights ?? []).map((h) => h?.trim()).filter(Boolean);
  const specs = (values.specifications ?? []).filter((s) => s?.label?.trim() && s?.value?.trim());
  const offers = (values.offers ?? []).filter((o) => o?.title?.trim() && o?.description?.trim());
  const faqs = (values.faqs ?? []).filter((f) => f?.question?.trim() && f?.answer?.trim());

  const priced = channel === 'B2C' ? b2c !== null : tiers.length > 0;

  return (
    <Modal
      title="Storefront preview"
      open={open}
      onCancel={onClose}
      footer={null}
      width={620}
      destroyOnClose
    >
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        <Segmented
          block
          value={channel}
          onChange={(v) => setChannel(v as 'B2C' | 'B2B')}
          options={[
            { label: 'Customer (B2C)', value: 'B2C' },
            { label: 'Retailer (B2B)', value: 'B2B' },
          ]}
        />

        {!values.showOnStorefront ? (
          <Alert
            type="warning"
            showIcon
            message="This product is a Draft"
            description="Shoppers will not see it until Published is switched on."
          />
        ) : null}

        <div style={{ display: 'flex', gap: 16 }}>
          <div
            style={{
              width: 150,
              height: 150,
              flexShrink: 0,
              background: '#f5f5f5',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {image ? (
              <img src={image} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            ) : (
              <PictureOutlined style={{ fontSize: 40, color: '#bfbfbf' }} />
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>{categoryLabel || 'No category'}</Text>
            {values.badge ? <Tag color="green" style={{ marginLeft: 8 }}>{values.badge}</Tag> : null}
            {values.brand ? (
              <div><Text type="secondary" style={{ textTransform: 'uppercase', fontSize: 12, fontWeight: 600 }}>{values.brand}</Text></div>
            ) : null}
            <Title level={4} style={{ margin: '2px 0 4px' }}>{values.name || 'Untitled product'}</Title>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {[values.packLabel, values.sku && `SKU ${values.sku}`, values.hsnCode && `HSN ${values.hsnCode}`]
                .filter(Boolean)
                .join(' · ')}
            </Text>

            {channel === 'B2C' ? (
              <div style={{ marginTop: 10 }}>
                {b2c !== null ? (
                  <Space align="baseline" size={10}>
                    <Text strong style={{ fontSize: 24 }}>{formatCurrency(inclusiveOf(b2c, gst))}</Text>
                    {mrp && mrp > inclusiveOf(b2c, gst) ? (
                      <>
                        <Text delete type="secondary">{formatCurrency(mrp)}</Text>
                        <Text strong style={{ color: '#388e3c' }}>{discountPercent(mrp, b2c, gst)}% off</Text>
                      </>
                    ) : null}
                  </Space>
                ) : null}
                <div><Text type="secondary" style={{ fontSize: 12 }}>Inclusive of all taxes</Text></div>
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Order {values.minOrderQuantity ?? 1}–{values.maxOrderQuantity ?? 10} per order
                  </Text>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 10 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  MOQ {values.moqB2B ?? 1}
                  {values.maxOrderQuantityB2B ? ` · max ${values.maxOrderQuantityB2B}` : ''}
                  {values.packBoxSize ? ` · ${values.packBoxSize} per master box` : ''}
                </Text>
              </div>
            )}
          </div>
        </div>

        {!priced ? (
          <Alert
            type="error"
            showIcon
            message={channel === 'B2C' ? 'No consumer price set' : 'No wholesale tiers set'}
            description="Shoppers in this channel will see the product without a price."
          />
        ) : null}

        {channel === 'B2B' && tiers.length > 0 ? (
          <Table
            size="small"
            pagination={false}
            rowKey="minQuantity"
            dataSource={tiers.map((t, i) => ({
              ...t,
              range: tiers[i + 1] ? `${t.minQuantity}–${tiers[i + 1].minQuantity - 1}` : `${t.minQuantity}+`,
            }))}
            columns={[
              { title: 'Quantity', dataIndex: 'range', render: (r: string) => `${r} pcs` },
              { title: 'Per pack (incl. GST)', render: (_, t) => formatCurrency(inclusiveOf(t.unitPrice, gst)) },
              { title: 'Per pack (excl. GST)', render: (_, t) => formatCurrency(t.unitPrice) },
              {
                title: 'Discount',
                render: (_, t) => {
                  const off = tierDiscount(mrp, t.unitPrice, gst);
                  return off ? <Tag color="orange">{off}% off</Tag> : '—';
                },
              },
            ]}
          />
        ) : null}

        {highlights.length > 0 ? (
          <div>
            <Text strong>Product highlights</Text>
            <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
              {highlights.map((h, i) => <li key={i}>{h}</li>)}
            </ul>
          </div>
        ) : null}

        {values.description ? (
          <div>
            <Text strong>Description</Text>
            <div><Text type="secondary">{values.description}</Text></div>
          </div>
        ) : null}

        {specs.length > 0 ? (
          <div>
            <Text strong>Specifications</Text>
            {specs.map((s, i) => (
              <div key={i} style={{ display: 'flex', fontSize: 13, padding: '2px 0' }}>
                <Text type="secondary" style={{ width: 150 }}>{s.label}</Text>
                <Text>{s.value}</Text>
              </div>
            ))}
          </div>
        ) : null}

        {offers.length > 0 ? (
          <div>
            <Text strong>Available offers</Text>
            {offers.map((o, i) => (
              <div key={i} style={{ fontSize: 13 }}>
                <TagOutlined style={{ color: '#388e3c', marginRight: 6 }} />
                <Text strong>{o.title}: </Text>
                <Text>{o.description}</Text>
              </div>
            ))}
          </div>
        ) : null}

        {(values.variants ?? []).length > 0 ? (
          <div>
            <Text strong>Pack sizes</Text>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              {values.packLabel ? <Tag color="orange">{values.packLabel}</Tag> : null}
              {(values.variants ?? []).map((v, i) => <Tag key={v.id ?? i}>{v.name || 'Unnamed variant'}</Tag>)}
            </div>
          </div>
        ) : null}

        {faqs.length > 0 ? (
          <>
            <Divider style={{ margin: '4px 0' }} />
            <Text strong>Questions and answers</Text>
            {faqs.map((f, i) => (
              <div key={i} style={{ fontSize: 13 }}>
                <div><Text strong>Q: {f.question}</Text></div>
                <div><Text type="secondary">A: {f.answer}</Text></div>
              </div>
            ))}
          </>
        ) : null}
      </Space>
    </Modal>
  );
}
