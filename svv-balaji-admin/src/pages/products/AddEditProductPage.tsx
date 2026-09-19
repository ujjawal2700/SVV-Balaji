import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  BarcodeOutlined,
  EyeOutlined,
  InfoCircleOutlined,
  PictureOutlined,
  SaveOutlined,
  ShoppingOutlined,
  TagOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import { useCategories } from '@shared/hooks/useCategories';
import { App as AntApp, Alert, Breadcrumb, Button, Card, Form, Space, Spin, Tabs } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { apiErrorMessage } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import {
  useCreateProduct,
  useProduct,
  useProductStockSummary,
  useUpdateProduct,
} from '../../hooks/useProduction';
import {
  BasicTab,
  InfoTab,
  InventoryTab,
  MediaTab,
  OffersTab,
  PricingTab,
  VariantsTab,
} from './ProductFormTabs';
import { ProductStorefrontPreview } from './ProductStorefrontPreview';
import {
  EMPTY_FORM,
  FIELD_TAB,
  cleanTiers,
  formValuesToPayload,
  productToFormValues,
  type ProductFormValues,
} from './productForm';

const TAB_KEYS = ['basic', 'pricing', 'media', 'info', 'offers', 'inventory', 'variants'] as const;
type TabKey = (typeof TAB_KEYS)[number];

/**
 * Keyed on the product being edited, so moving between /add-product and
 * /products/edit/:id (or between two products) mounts a fresh form instead of
 * carrying one product's half-typed values into another.
 */
export function AddEditProductPage() {
  const { id } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const editId = id || searchParams.get('edit') || searchParams.get('id') || undefined;
  return <ProductEditor key={editId ?? 'new'} editId={editId} />;
}

function ProductEditor({ editId }: { editId?: string }) {
  const isEdit = Boolean(editId);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { message } = AntApp.useApp();
  const [form] = Form.useForm<ProductFormValues>();

  const productQuery = useProduct(editId);
  const stockQuery = useProductStockSummary();
  const categories = useCategories();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();

  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewValues, setPreviewValues] = useState<ProductFormValues>(EMPTY_FORM);

  const product = productQuery.data;

  // Prefill exactly once per product. Depending on `product` directly would
  // re-run on every background refetch (window focus, invalidation) and wipe
  // whatever the operator has typed since.
  const prefilledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!product || prefilledFor.current === product.id) return;
    prefilledFor.current = product.id;
    form.setFieldsValue(productToFormValues(product));
  }, [product, form]);

  const tabParam = searchParams.get('tab') as TabKey | null;
  const activeTab: TabKey = tabParam && TAB_KEYS.includes(tabParam) ? tabParam : 'basic';
  const setActiveTab = (key: string) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', key);
        return next;
      },
      { replace: true },
    );

  const categoryLabel = (values: ProductFormValues) => {
    const rows = categories.data?.data ?? [];
    const sub = rows.find((c) => c.id === values.categoryId);
    const main = rows.find((c) => c.id === (sub?.parentId ?? values.mainCategoryId));
    return [main?.name, sub && sub.id !== main?.id ? sub.name : undefined].filter(Boolean).join(' › ');
  };

  const openPreview = () => {
    // Snapshot at click time: `true` includes fields on tabs that were never opened.
    setPreviewValues({ ...EMPTY_FORM, ...form.getFieldsValue(true) });
    setPreviewOpen(true);
  };

  const handleSubmit = async () => {
    let values: ProductFormValues;
    try {
      values = await form.validateFields();
    } catch (error) {
      // Every tab is force-rendered, so a rule failing on a tab the operator
      // is not looking at is still caught - jump to it instead of failing silently.
      const first = (error as { errorFields?: Array<{ name: (string | number)[] }> }).errorFields?.[0];
      const tab = first ? FIELD_TAB[String(first.name[0])] : undefined;
      if (tab) setActiveTab(tab);
      message.error('Some fields need attention — see the highlighted fields.');
      return;
    }

    // A published product with no price at all would show shoppers a product
    // they cannot buy. Refuse it here rather than publish it half-finished.
    const hasPrice = typeof values.b2cPrice === 'number' || cleanTiers(values.b2bTiers).length > 0;
    if (values.showOnStorefront && !hasPrice) {
      setActiveTab('pricing');
      message.error('Add a consumer price or at least one wholesale tier before publishing, or save it as a Draft.');
      return;
    }

    const payload = formValuesToPayload(values);
    setSaving(true);
    try {
      if (isEdit && editId) {
        await updateProduct.mutateAsync({ id: editId, input: payload });
        message.success(`“${payload.name}” saved`);
      } else {
        await createProduct.mutateAsync(payload);
        message.success(`“${payload.name}” created${payload.showOnStorefront ? ' and published' : ' as a draft'}`);
      }
      navigate('/productlists');
    } catch (error) {
      message.error(apiErrorMessage(error, `Could not ${isEdit ? 'save' : 'create'} the product`));
    } finally {
      setSaving(false);
    }
  };

  if (isEdit && productQuery.isLoading) {
    return (
      <Card style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" tip="Loading product…" />
      </Card>
    );
  }

  if (isEdit && (productQuery.isError || !product)) {
    return (
      <Alert
        type="error"
        showIcon
        message="Product not found"
        description={apiErrorMessage(productQuery.error, 'It may have been deleted.')}
        action={<Button onClick={() => navigate('/productlists')}>Back to catalog</Button>}
      />
    );
  }

  const stock = editId ? stockQuery.data?.find((s) => s.productId === editId) : undefined;
  const liveSince = product?.pricing?.B2C?.[0]?.effectiveFrom ?? product?.pricing?.B2B?.[0]?.effectiveFrom;

  const tab = (key: TabKey, icon: React.ReactNode, label: string, children: React.ReactNode) => ({
    key,
    label: (
      <span>
        {icon} {label}
      </span>
    ),
    // Force-render: antd otherwise mounts a pane only when first opened, and a
    // field that was never mounted is invisible to validateFields().
    forceRender: true,
    children: <div style={{ paddingTop: 12 }}>{children}</div>,
  });

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Breadcrumb
        items={[
          {
            title: (
              <a onClick={() => navigate('/productlists')}>
                <ArrowLeftOutlined style={{ marginRight: 6 }} />
                Product Catalog
              </a>
            ),
          },
          { title: isEdit ? `Edit: ${product?.name ?? 'Product'}` : 'Add New Product' },
        ]}
      />

      <PageHeader
        title={isEdit ? `Edit product: ${product?.name ?? ''}` : 'Add new product'}
        subtitle="Every section here maps to a section of the storefront product page. Anything left blank is simply hidden from shoppers."
        actions={
          <Space wrap>
            <Button icon={<EyeOutlined />} onClick={openPreview}>
              Storefront preview
            </Button>
            <Button onClick={() => navigate('/productlists')}>Cancel</Button>
            <Button type="primary" size="large" icon={<SaveOutlined />} loading={saving} onClick={handleSubmit}>
              {isEdit ? 'Save changes' : 'Create product'}
            </Button>
          </Space>
        }
      />

      <Card style={{ borderRadius: 12 }} bodyStyle={{ padding: 20 }}>
        <Form<ProductFormValues> form={form} layout="vertical" initialValues={EMPTY_FORM} scrollToFirstError>
          <Tabs
            type="card"
            activeKey={activeTab}
            onChange={setActiveTab}
            items={[
              tab('basic', <AppstoreOutlined />, '1. Basic info', <BasicTab isEdit={isEdit} />),
              tab('pricing', <TagOutlined />, '2. Pricing & orders', <PricingTab isEdit={isEdit} liveSince={liveSince} />),
              tab('media', <PictureOutlined />, '3. Media & SEO', <MediaTab />),
              tab('info', <InfoCircleOutlined />, '4. Product information', <InfoTab />),
              tab('offers', <TagsOutlined />, '5. Offers & FAQs', <OffersTab />),
              tab('inventory', <ShoppingOutlined />, '6. Inventory', <InventoryTab stock={stock} />),
              tab('variants', <BarcodeOutlined />, '7. Pack sizes', <VariantsTab />),
            ]}
          />
        </Form>
      </Card>

      <ProductStorefrontPreview
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        values={previewValues}
        categoryLabel={categoryLabel(previewValues)}
      />
    </Space>
  );
}
