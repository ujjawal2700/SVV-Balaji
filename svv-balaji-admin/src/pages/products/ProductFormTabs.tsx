import { InfoCircleOutlined } from '@ant-design/icons';
import { useCategories } from '@shared/hooks/useCategories';
import { LOYALTY_ELIGIBILITY_LABELS, type EligibilitySource, type LoyaltyEligibility } from '@shared/api/loyalty';
import { useLoyaltyEligibility } from '@shared/hooks/useLoyalty';
import {
  Alert,
  AutoComplete,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Tag,
  Typography,
} from 'antd';
import type { ProductStockSummary } from '@shared/api/types';
import { formatCurrency, formatDate } from '../../utils/format';
import { maxLength, required } from '../../validation/rules';
import { DynamicRows } from './DynamicRows';
import { PriceTierEditor } from './PriceTierEditor';
import { ProductImagesField } from './ProductImagesField';
import {
  DEFAULT_GST,
  UNITS,
  discountPercent,
  inclusiveOf,
  type ProductFormValues,
} from './productForm';

const { Text } = Typography;

const NUMBER_FULL = { style: { width: '100%' } } as const;

/** A titled group inside a tab. */
function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card
      size="small"
      title={title}
      extra={hint ? <Text type="secondary" style={{ fontSize: 12 }}>{hint}</Text> : undefined}
      style={{ marginBottom: 16, borderRadius: 8 }}
    >
      {children}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 1. Basic info
// ---------------------------------------------------------------------------

export function BasicTab({ isEdit }: { isEdit: boolean }) {
  const form = Form.useFormInstance<ProductFormValues>();
  const categories = useCategories();
  const rows = categories.data?.data ?? [];

  const mainCategoryId = Form.useWatch('mainCategoryId', form);
  const categoryId = Form.useWatch('categoryId', form);
  const published = Form.useWatch('showOnStorefront', form);
  const topPick = Form.useWatch('isTopPick', form);
  const staple = Form.useWatch('isDailyStaple', form);
  const slug = Form.useWatch('slug', form);

  const mains = rows.filter((c) => !c.parentId && c.isActive);
  const subs = rows.filter((c) => c.parentId === mainCategoryId && c.isActive);
  const main = rows.find((c) => c.id === mainCategoryId);
  const sub = categoryId && categoryId !== mainCategoryId ? rows.find((c) => c.id === categoryId) : undefined;

  const onMainChange = (value?: string) => {
    // Changing the main category invalidates whatever subcategory was chosen.
    form.setFieldsValue({ mainCategoryId: value, categoryId: value });
  };
  const onSubChange = (value?: string) => {
    form.setFieldsValue({ categoryId: value ?? mainCategoryId });
  };

  const onNameBlur = () => {
    if (isEdit) return;
    const name = (form.getFieldValue('name') ?? '').trim();
    if (!name) return;
    // Only fill what the operator has not typed themselves.
    if (!form.isFieldTouched('slug')) {
      form.setFieldValue('slug', name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
    }
    if (!form.isFieldTouched('metaTitle')) form.setFieldValue('metaTitle', `${name} | SVV Balaji`);
  };

  const generateSku = () => {
    const brand = (form.getFieldValue('brand') ?? '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase();
    const name = (form.getFieldValue('name') ?? '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase();
    const pack = (form.getFieldValue('packLabel') ?? '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 5).toUpperCase();
    form.setFieldValue('sku', [brand || 'PRD', name || 'ITEM', pack].filter(Boolean).join('-'));
  };

  const homeShelves = [
    topPick ? 'Popular Products (home)' : null,
    staple ? 'Best of the Basics (home)' : null,
  ].filter(Boolean);
  const categoryPath = [main?.name, sub?.name].filter(Boolean).join(' › ');

  return (
    <>
      <Alert
        style={{ marginBottom: 16 }}
        showIcon
        type={published ? 'success' : 'warning'}
        message={published ? 'Published — shoppers can find this product' : 'Draft — hidden from the storefront'}
        description={
          published ? (
            <>
              {categoryPath ? (
                <div>
                  Listed under <b>{categoryPath}</b> › All Products
                  {topPick ? ' and Top Picks' : ''}
                  {sub ? '' : ' (no subcategory chosen — it appears in the main category only)'}.
                </div>
              ) : (
                <div>
                  <b>No category chosen</b> — it will not appear on any category page, only on the home shelves below
                  and via its direct link.
                </div>
              )}
              {homeShelves.length > 0 ? <div>Also shown in: {homeShelves.join(', ')}.</div> : null}
              {slug ? <div>Direct link: <Text code>/product-detail/{slug}</Text></div> : null}
            </>
          ) : (
            'Switch on “Published” below when the product is ready. Nothing on this screen is visible to shoppers until then.'
          )
        }
      />

      <Section title="Identity">
        <Row gutter={16}>
          <Col xs={24} md={16}>
            <Form.Item name="name" label="Product name" rules={[required('Product name is required'), maxLength(200)]}>
              <Input size="large" placeholder="e.g. Premium Chakki Atta" onBlur={onNameBlur} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="brand" label="Brand" rules={[maxLength(100)]}>
              <Input placeholder="e.g. Desi Tokri" />
            </Form.Item>
          </Col>

          <Col xs={24} md={10}>
            <Form.Item
              name="sku"
              label="SKU"
              rules={[required('SKU is required'), maxLength(50)]}
              extra="Unique across products and pack sizes. Upper-cased on save."
            >
              <Input
                placeholder="e.g. DT-ATTA-10KG"
                style={{ textTransform: 'uppercase' }}
                addonAfter={<a onClick={generateSku}>Generate</a>}
              />
            </Form.Item>
          </Col>
          <Col xs={12} md={7}>
            <Form.Item name="unit" label="Base unit" rules={[required('Unit is required')]}>
              <AutoComplete options={UNITS.map((u) => ({ value: u }))} placeholder="KG, PACK…" />
            </Form.Item>
          </Col>
          <Col xs={12} md={7}>
            <Form.Item name="packLabel" label="Pack label" extra="Shown under the name — “10kg Bag”, “100g x 20”.">
              <Input placeholder="10kg Bag" />
            </Form.Item>
          </Col>
        </Row>
      </Section>

      <Section title="Category" hint="Decides which storefront category page lists this product">
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="mainCategoryId" label="Main category">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                loading={categories.isLoading}
                placeholder="Select a main category"
                options={mains.map((c) => ({ value: c.id, label: c.name }))}
                onChange={onMainChange}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label="Subcategory" extra={mainCategoryId && subs.length === 0 ? 'This category has no subcategories yet.' : undefined}>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                disabled={!mainCategoryId || subs.length === 0}
                placeholder={mainCategoryId ? 'Select a subcategory (optional)' : 'Choose a main category first'}
                value={sub?.id}
                options={subs.map((c) => ({ value: c.id, label: c.name }))}
                onChange={onSubChange}
              />
            </Form.Item>
            {/* The stored value - hidden, but registered so it is validated and submitted. */}
            <Form.Item name="categoryId" hidden><Input /></Form.Item>
          </Col>
        </Row>
      </Section>

      <Section title="Copy">
        <Form.Item name="badge" label="Badge" extra="A small ribbon on the product card — “Buy 10 Get 1”, “100% Sharbati”." rules={[maxLength(40)]}>
          <Input placeholder="Optional" />
        </Form.Item>
        <Form.Item name="description" label="Description">
          <Input.TextArea rows={4} maxLength={2000} showCount placeholder="Customer-facing description." />
        </Form.Item>
        <Form.Item label="Highlights" extra="Bullet points above the fold. The storefront shows the first three, with “Show more”.">
          <DynamicRows name="highlights" newRow="" addLabel="Add highlight" emptyText="No highlights yet">
            {(field) => (
              <Form.Item name={field.name} noStyle rules={[maxLength(200)]}>
                <Input placeholder="e.g. Ground using traditional stone chakki" />
              </Form.Item>
            )}
          </DynamicRows>
        </Form.Item>
      </Section>

      <LoyaltySection />

      <Section title="Publishing & shelves">
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space align="center">
            <Form.Item name="showOnStorefront" valuePropName="checked" noStyle>
              <Switch checkedChildren="Published" unCheckedChildren="Draft" />
            </Form.Item>
            <Text type="secondary">Controls whether shoppers and retailers can see this product at all.</Text>
          </Space>
          <Space align="center">
            <Form.Item name="isTopPick" valuePropName="checked" noStyle>
              <Switch />
            </Form.Item>
            <Text>Popular Products &amp; category Top Picks</Text>
          </Space>
          <Space align="center">
            <Form.Item name="isDailyStaple" valuePropName="checked" noStyle>
              <Switch />
            </Form.Item>
            <Text>Best of the Basics (home page)</Text>
          </Space>
        </Space>
      </Section>
    </>
  );
}

const ELIGIBILITY_SOURCE_LABELS: Record<EligibilitySource, string> = {
  PRODUCT: 'this product\'s own setting',
  CATEGORY: 'its category',
  PARENT_CATEGORY: 'its parent category',
  DEFAULT: 'the program default',
};

/**
 * Loyalty eligibility for this product. The dropdown is the override; the line
 * underneath is the SERVER's answer to "so will it actually earn?" for the
 * current choice and category - the cascade is never re-implemented here.
 */
function LoyaltySection() {
  const form = Form.useFormInstance<ProductFormValues>();
  const setting = (Form.useWatch('loyaltyEligibility', form) ?? 'INHERIT') as LoyaltyEligibility;
  const categoryId = Form.useWatch('categoryId', form);
  const preview = useLoyaltyEligibility(setting, categoryId);

  return (
    <Section title="Loyalty rewards" hint="Configured centrally by Super Admin under Loyalty Rewards">
      <Form.Item
        name="loyaltyEligibility"
        label="Earns loyalty points"
        extra="Inherit follows the category's rule, then the program default. Choose an option here to override both for this product."
        style={{ marginBottom: 12 }}
      >
        <Select
          style={{ maxWidth: 320 }}
          options={(Object.keys(LOYALTY_ELIGIBILITY_LABELS) as LoyaltyEligibility[]).map((value) => ({
            value,
            label: LOYALTY_ELIGIBILITY_LABELS[value],
          }))}
        />
      </Form.Item>
      {preview.data ? (
        <Alert
          type={preview.data.eligible ? 'success' : 'warning'}
          showIcon
          message={
            <>
              {preview.data.eligible ? 'Eligible' : 'Not eligible'} — from{' '}
              {ELIGIBILITY_SOURCE_LABELS[preview.data.source]}
              {!preview.data.programActive ? ' (the loyalty program is currently paused)' : ''}
            </>
          }
        />
      ) : null}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// 2. Pricing, order limits, retailer panel
// ---------------------------------------------------------------------------

export function PricingTab({
  isEdit,
  liveSince,
}: {
  isEdit: boolean;
  liveSince?: string;
}) {
  const form = Form.useFormInstance<ProductFormValues>();
  const mrp = Form.useWatch('mrp', form);
  const gst = Form.useWatch('gstRatePercent', form) ?? DEFAULT_GST;
  const b2c = Form.useWatch('b2cPrice', form);

  const b2cIncl = typeof b2c === 'number' ? inclusiveOf(b2c, gst) : null;
  const b2cOff = discountPercent(typeof mrp === 'number' ? mrp : null, typeof b2c === 'number' ? b2c : null, gst);

  return (
    <>
      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        message="Prices are entered excluding GST"
        description={
          <>
            The order engine bills <b>price + GST</b>, so enter the base price here; the GST-inclusive figure a shopper
            reads is shown beside each price. {isEdit ? 'Changing a price closes the current rate and opens a new one from now — the old rate stays on record, so past invoices still reproduce.' : ''}
            {isEdit && liveSince ? <> Current rates live since {formatDate(liveSince)}.</> : null}
          </>
        }
      />

      <Section title="Reference price & tax">
        <Row gutter={16}>
          <Col xs={24} md={8}>
            <Form.Item name="mrp" label="MRP (incl. GST)" extra="The struck-through “was” price. Leave blank if the pack carries none.">
              <InputNumber min={0} precision={2} prefix="₹" {...NUMBER_FULL} />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="gstRatePercent" label="GST rate (%)" rules={[required('GST rate is required')]}>
              <InputNumber min={0} max={100} precision={2} {...NUMBER_FULL} />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="hsnCode" label="HSN code" rules={[maxLength(20)]}>
              <Input placeholder="e.g. 1101 00 00" />
            </Form.Item>
          </Col>
        </Row>
      </Section>

      <Section title="Consumer (B2C) price">
        <Row gutter={16}>
          <Col xs={24} md={10}>
            <Form.Item
              name="b2cPrice"
              label="Selling price (excl. GST)"
              extra={isEdit ? 'Leave blank to keep the current rate unchanged.' : undefined}
            >
              <InputNumber min={0} precision={2} prefix="₹" {...NUMBER_FULL} />
            </Form.Item>
          </Col>
          <Col xs={24} md={14}>
            <Form.Item label="What a shopper sees">
              <Space wrap>
                {b2cIncl !== null ? (
                  <>
                    <Tag color="blue">{formatCurrency(b2cIncl)} incl. {gst}% GST</Tag>
                    {b2cOff ? <Tag color="orange">{b2cOff}% off MRP</Tag> : null}
                  </>
                ) : (
                  <Text type="secondary">Enter a price to preview</Text>
                )}
              </Space>
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col xs={12} md={6}>
            <Form.Item name="minOrderQuantity" label="Min per order">
              <InputNumber min={1} precision={0} {...NUMBER_FULL} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item
              name="maxOrderQuantity"
              label="Max per order"
              dependencies={['minOrderQuantity']}
              rules={[
                ({ getFieldValue }) => ({
                  validator: async (_, value) => {
                    const min = getFieldValue('minOrderQuantity');
                    if (typeof value === 'number' && typeof min === 'number' && value < min) {
                      throw new Error('Max cannot be below min');
                    }
                  },
                }),
              ]}
            >
              <InputNumber min={1} precision={0} {...NUMBER_FULL} />
            </Form.Item>
          </Col>
        </Row>
      </Section>

      <Section title="Retailer (B2B) wholesale tiers" hint="Each row is a quantity break">
        <Space align="start" style={{ marginBottom: 12 }}>
          <Form.Item name="b2bTiersAreTotals" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
          <div>
            <Text strong>Enter each tier as the total for that quantity</Text>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                On: type “5 packs = ₹2,750” and the per-pack price (₹550) is worked out for you. Off: type the
                per-unit price directly. Orders are always billed per pack, and the discount is measured on the
                per-pack price against MRP.
              </Text>
            </div>
          </div>
        </Space>
        <PriceTierEditor
          name="b2bTiers"
          absolutePath={['b2bTiers']}
          mrp={typeof mrp === 'number' ? mrp : null}
          gst={gst}
        />
        <Row gutter={16} style={{ marginTop: 16 }}>
          <Col xs={12} md={6}>
            <Form.Item name="moqB2B" label="Minimum order qty (MOQ)">
              <InputNumber min={1} precision={0} {...NUMBER_FULL} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="maxOrderQuantityB2B" label="Maximum per order">
              <InputNumber min={1} precision={0} {...NUMBER_FULL} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="packBoxSize" label="Units per master box">
              <InputNumber min={1} precision={0} {...NUMBER_FULL} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="bulkAvailable" label="Bulk ordering" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
        </Row>
      </Section>

      <Section title="Retailer “Business & GST” panel" hint="Each line is hidden on the storefront when blank">
        <Row gutter={16}>
          <Col xs={24} md={8}>
            <Form.Item name="gstInvoiceAvailable" label="GST invoice with ITC" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
          <Col xs={24} md={16}>
            <Form.Item name="businessSupportContact" label="Business support">
              <Input placeholder="e.g. Dedicated Distributor Desk: +91 …" />
            </Form.Item>
          </Col>
          <Col xs={24}>
            <Form.Item name="deliveryTerms" label="Delivery terms">
              <Input placeholder="e.g. Dispatch within 24 hours" />
            </Form.Item>
          </Col>
        </Row>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// 3. Media & SEO
// ---------------------------------------------------------------------------

export function MediaTab() {
  return (
    <>
      <Section title="Photos" hint="The first photo is the card image">
        <Form.Item name="images" noStyle>
          <ProductImagesField />
        </Form.Item>
      </Section>

      <Section title="Search & URL">
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="slug" label="URL slug" extra="Becomes the product's link. Kept unique automatically.">
              <Input prefix="/" placeholder="premium-atta" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="metaTitle" label="SEO title" rules={[maxLength(120)]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24}>
            <Form.Item name="metaDescription" label="SEO description" rules={[maxLength(300)]}>
              <Input.TextArea rows={2} />
            </Form.Item>
          </Col>
        </Row>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// 4. Product information
// ---------------------------------------------------------------------------

export function InfoTab() {
  return (
    <>
      <Section title="Origin & policies">
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="manufacturer" label="Manufacturer">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="countryOfOrigin" label="Country of origin">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="shelfLife" label="Shelf life">
              <Input placeholder="12 Months" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="returnPolicy" label="Return policy" extra="Storefront falls back to “7 Days Return” when blank.">
              <Input placeholder="7 Days Replacement Policy" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="warranty" label="Quality / warranty note" extra="Storefront falls back to “100% Quality” when blank.">
              <Input placeholder="Not Applicable" />
            </Form.Item>
          </Col>
          <Col xs={24}>
            <Form.Item name="disclaimer" label="Disclaimer">
              <Input.TextArea rows={3} />
            </Form.Item>
          </Col>
        </Row>
      </Section>

      <Section title="Specifications" hint="Label / value rows in the product information table">
        <DynamicRows
          name="specifications"
          newRow={{ label: '', value: '' }}
          addLabel="Add specification"
          emptyText="No specifications yet"
        >
          {(field) => (
            <Row gutter={10}>
              <Col xs={24} sm={9}>
                <Form.Item name={[field.name, 'label']} noStyle>
                  <Input placeholder="Label — Net Weight" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={15}>
                <Form.Item name={[field.name, 'value']} noStyle>
                  <Input placeholder="Value — 10 KG" />
                </Form.Item>
              </Col>
            </Row>
          )}
        </DynamicRows>
      </Section>

      <Section
        title="Displayed rating"
        hint="Staff-entered. There is no review system yet, so this is not calculated from real reviews"
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="Only enter a rating you can stand behind"
          description="Shoppers read this as genuine customer feedback. Leave both fields blank to hide the rating."
        />
        <Row gutter={16}>
          <Col xs={12} md={6}>
            <Form.Item name="rating" label="Rating (0–5)">
              <InputNumber min={0} max={5} step={0.1} precision={1} {...NUMBER_FULL} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="reviewCount" label="Number of reviews">
              <InputNumber min={0} precision={0} {...NUMBER_FULL} />
            </Form.Item>
          </Col>
        </Row>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// 5. Offers & FAQs
// ---------------------------------------------------------------------------

export function OffersTab() {
  return (
    <>
      <Section title="Available offers" hint="Product-page offer lines — not the home page scheme tiles">
        <DynamicRows
          name="offers"
          newRow={{ title: '', description: '' }}
          addLabel="Add offer"
          emptyText="No offers on this product"
        >
          {(field) => (
            <Row gutter={10}>
              <Col xs={24} sm={9}>
                <Form.Item name={[field.name, 'title']} noStyle>
                  <Input placeholder="Title — Bank Offer" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={15}>
                <Form.Item name={[field.name, 'description']} noStyle>
                  <Input placeholder="Description" />
                </Form.Item>
              </Col>
            </Row>
          )}
        </DynamicRows>
      </Section>

      <Section title="Questions & answers">
        <DynamicRows
          name="faqs"
          newRow={{ question: '', answer: '' }}
          addLabel="Add question"
          emptyText="No FAQs yet"
        >
          {(field) => (
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Form.Item name={[field.name, 'question']} noStyle>
                <Input placeholder="Question" />
              </Form.Item>
              <Form.Item name={[field.name, 'answer']} noStyle>
                <Input.TextArea rows={2} placeholder="Answer" />
              </Form.Item>
            </Space>
          )}
        </DynamicRows>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// 6. Inventory
// ---------------------------------------------------------------------------

export function InventoryTab({ stock }: { stock?: ProductStockSummary }) {
  return (
    <>
      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        message="Stock is never typed in here"
        description="Available stock is counted from QA-released finished-goods batches, less what orders have reserved — so it always traces back to a production batch. This screen only sets the thresholds that flag it."
      />

      {stock ? (
        <Section title="Available now">
          <Space size={32} wrap>
            <Statistic title="Sellable quantity" value={stock.availableQuantity} suffix={stock.unit} />
            <div>
              <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>Status</Text>
              <Tag color={stock.status === 'OK' ? 'success' : stock.status === 'LOW' ? 'warning' : 'error'}>
                {stock.status}
              </Tag>
            </div>
          </Space>
        </Section>
      ) : null}

      <Section title="Thresholds">
        <Row gutter={16}>
          <Col xs={24} md={8}>
            <Form.Item name="reorderPoint" label="Reorder point" extra="At or below this, stock is flagged LOW.">
              <InputNumber min={0} precision={0} {...NUMBER_FULL} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="safetyStock" label="Safety stock" extra="At or below this, stock is flagged CRITICAL.">
              <InputNumber min={0} precision={0} {...NUMBER_FULL} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item
              name="allowBackorder"
              label="Allow backorder"
              valuePropName="checked"
              extra="Keep taking orders when nothing is in stock. Off = shoppers see “Out of stock”."
            >
              <Switch />
            </Form.Item>
          </Col>
        </Row>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// 7. Variants
// ---------------------------------------------------------------------------

export function VariantsTab() {
  const form = Form.useFormInstance<ProductFormValues>();
  const productSku = Form.useWatch('sku', form);
  const productName = Form.useWatch('name', form);
  const packLabel = Form.useWatch('packLabel', form);
  const gst = Form.useWatch('gstRatePercent', form) ?? DEFAULT_GST;
  const variants = Form.useWatch('variants', form) ?? [];

  return (
    <>
      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        message="The product above is the primary pack"
        description={
          <>
            {productName || 'This product'}
            {packLabel ? <> (<b>{packLabel}</b>)</> : null} is the default option a shopper sees. Add any <b>other</b>{' '}
            pack sizes here — each gets its own SKU, MRP, photos and price ladder. Stock is tracked per product from
            finished-goods batches, so pack sizes share that availability for now.
          </>
        }
      />

      <DynamicRows
        name="variants"
        newRow={{ isActive: true, images: [], b2bTiers: [] }}
        addLabel="Add pack size"
        emptyText="No additional pack sizes"
        rules={[
          {
            validator: async (_, list: ProductFormValues['variants'] | undefined) => {
              const skus = (list ?? []).map((v) => (v?.sku ?? '').trim().toUpperCase()).filter(Boolean);
              const dup = skus.find((s, i) => skus.indexOf(s) !== i);
              if (dup) throw new Error(`Pack-size SKU ${dup} is used twice`);
              const own = (productSku ?? '').trim().toUpperCase();
              if (own && skus.includes(own)) {
                throw new Error(`${own} is the primary product's SKU — a pack size needs its own`);
              }
            },
          },
        ]}
      >
        {(field, index) => {
          const row = variants[index];
          const b2c = row?.b2cPrice;
          return (
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              <Form.Item name={[field.name, 'id']} hidden><Input /></Form.Item>

              <Row gutter={12}>
                <Col xs={24} md={9}>
                  <Form.Item
                    name={[field.name, 'name']}
                    label="Pack size name"
                    rules={[required('Name is required'), maxLength(100)]}
                    style={{ marginBottom: 8 }}
                  >
                    <Input placeholder="5kg Bag" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item
                    name={[field.name, 'sku']}
                    label="SKU"
                    rules={[required('SKU is required'), maxLength(50)]}
                    style={{ marginBottom: 8 }}
                  >
                    <Input placeholder="DT-ATTA-5KG" style={{ textTransform: 'uppercase' }} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={4}>
                  <Form.Item name={[field.name, 'unit']} label="Unit" style={{ marginBottom: 8 }}>
                    <AutoComplete options={UNITS.map((u) => ({ value: u }))} placeholder="KG" />
                  </Form.Item>
                </Col>
                <Col xs={12} md={3}>
                  <Form.Item name={[field.name, 'isActive']} label="Active" valuePropName="checked" style={{ marginBottom: 8 }}>
                    <Switch size="small" />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={12}>
                <Col xs={12} md={8}>
                  <Form.Item name={[field.name, 'mrp']} label="MRP (incl. GST)" style={{ marginBottom: 8 }}>
                    <InputNumber min={0} precision={2} prefix="₹" {...NUMBER_FULL} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                  <Form.Item name={[field.name, 'b2cPrice']} label="Consumer price (excl. GST)" style={{ marginBottom: 8 }}>
                    <InputNumber min={0} precision={2} prefix="₹" {...NUMBER_FULL} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item label="Shopper sees" style={{ marginBottom: 8 }}>
                    {typeof b2c === 'number' ? (
                      <Tag color="blue">{formatCurrency(inclusiveOf(b2c, gst))} incl. GST</Tag>
                    ) : (
                      <Text type="secondary">—</Text>
                    )}
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item label="Wholesale tiers" style={{ marginBottom: 8 }}>
                <PriceTierEditor
                  name={[field.name, 'b2bTiers']}
                  absolutePath={['variants', field.name, 'b2bTiers']}
                  mrp={typeof row?.mrp === 'number' ? row.mrp : null}
                  gst={gst}
                />
              </Form.Item>

              <Form.Item name={[field.name, 'images']} label="Photos for this pack size" style={{ marginBottom: 0 }}>
                <ProductImagesField />
              </Form.Item>
            </Space>
          );
        }}
      </DynamicRows>

      <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
        Removing a pack size deletes it along with its price rules. To stop selling one but keep its history, switch it
        to inactive instead. Renaming or re-pricing keeps the price history.
      </Text>
    </>
  );
}
