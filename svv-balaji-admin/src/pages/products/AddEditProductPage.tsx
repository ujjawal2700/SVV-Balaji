import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  BarcodeOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PictureOutlined,
  PlusOutlined,
  SaveOutlined,
  ShoppingOutlined,
  TagOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  AutoComplete,
  Avatar,
  Breadcrumb,
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { apiErrorMessage } from '../../api/client';
import type { CreateProductInput, Product } from '../../api/types';
import { PageHeader } from '../../components/PageHeader';
import { CategorySelect } from '../../components/pickers';
import {
  useCreateProduct,
  useProduct,
  useProducts,
  useUpdateProduct,
} from '../../hooks/useProduction';
import { formatCurrency } from '../../utils/format';
import { maxLength, required } from '../../validation/rules';
import { MOCK_PRODUCTS } from './ProductListsPage';
import { ProductImagesField } from './ProductImagesField';

const { Text, Title, Paragraph } = Typography;

const UNITS = ['KG', 'GRAM', 'LITRE', 'ML', 'PACK', 'PIECE', 'BOX', 'BAG'];

interface VariantItem {
  id: string;
  name: string;
  sku: string;
  unit: string;
  priceB2C: number;
  priceB2B: number;
  stock: number;
  image?: string;
}

const VALID_TABS = ['basic', 'pricing', 'media', 'inventory', 'variants'] as const;
type ProductTab = (typeof VALID_TABS)[number];

export function AddEditProductPage() {
  const { id } = useParams<{ id?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { message } = AntApp.useApp();

  const editId = id || searchParams.get('edit') || searchParams.get('id') || undefined;
  const isEdit = Boolean(editId);

  // Queries & Mutations
  const { data: apiProduct, isLoading: isProductLoading } = useProduct(editId);
  const productsQuery = useProducts(true);
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();

  // Find product from API or mock fallback
  const mockProduct = useMemo(
    () => MOCK_PRODUCTS.find((p) => p.id === editId),
    [editId],
  );
  const targetProduct: Product | null = (apiProduct as Product) || mockProduct || null;

  const [form] = Form.useForm<CreateProductInput>();

  // ── URL-based Tab Navigation ──────────────────────────────────────────────
  const tabFromUrl = searchParams.get('tab') as ProductTab | null;
  const activeTab: ProductTab =
    tabFromUrl && VALID_TABS.includes(tabFromUrl as ProductTab)
      ? (tabFromUrl as ProductTab)
      : 'basic';

  const setActiveTab = (key: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', key);
        return next;
      },
      { replace: true },
    );
  };

  // State for pricing & variants & preview
  const [b2cPrice, setB2cPrice] = useState<number>(100);
  const [b2bPrice, setB2bPrice] = useState<number>(85);
  const [variants, setVariants] = useState<VariantItem[]>([]);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Populate form when editing
  useEffect(() => {
    if (isEdit && targetProduct) {
      form.setFieldsValue({
        name: targetProduct.name,
        sku: targetProduct.sku,
        unit: targetProduct.unit,
        categoryId: targetProduct.categoryId ?? undefined,
        description: targetProduct.description ?? undefined,
        images: targetProduct.images ?? [],
        showOnStorefront: targetProduct.showOnStorefront,
        slug: targetProduct.slug ?? undefined,
        metaTitle: targetProduct.metaTitle ?? undefined,
        metaDescription: targetProduct.metaDescription ?? undefined,
        reorderPoint: targetProduct.reorderPoint ?? 10,
        safetyStock: targetProduct.safetyStock ?? 5,
        allowBackorder: targetProduct.allowBackorder ?? false,
      });

      setVariants([
        {
          id: 'v1',
          name: `${targetProduct.name} - Standard Pack`,
          sku: targetProduct.sku,
          unit: targetProduct.unit,
          priceB2C: 120,
          priceB2B: 95,
          stock: 150,
        },
      ]);
    } else if (!isEdit) {
      form.resetFields();
      form.setFieldsValue({
        unit: 'KG',
        showOnStorefront: true,
        reorderPoint: 30,
        safetyStock: 10,
        allowBackorder: false,
      });
      setVariants([]);
    }
  }, [isEdit, targetProduct, form]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    if (!isEdit && name) {
      const prefix = name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 4).toUpperCase() || 'PRD';
      const uniqueId = Math.random().toString(36).substring(2, 6).toUpperCase();
      form.setFieldValue('sku', `${prefix}-${uniqueId}`);
      form.setFieldValue(
        'slug',
        name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
      );
      form.setFieldValue('metaTitle', `${name} | Premium SVV Balaji Quality`);
    }
  };

  // Variant Modal State & Handlers
  const [variantModalOpen, setVariantModalOpen] = useState(false);
  const [editingVariant, setEditingVariant] = useState<VariantItem | null>(null);
  const [variantForm] = Form.useForm<Omit<VariantItem, 'id'>>();

  const handleOpenVariantModal = (variant?: VariantItem) => {
    if (variant) {
      setEditingVariant(variant);
      variantForm.setFieldsValue({
        name: variant.name,
        sku: variant.sku,
        unit: variant.unit,
        stock: variant.stock,
        priceB2C: variant.priceB2C,
        priceB2B: variant.priceB2B,
        image: variant.image ?? '',
      });
    } else {
      setEditingVariant(null);
      const baseName = form.getFieldValue('name') || 'New Product';
      const baseSku = form.getFieldValue('sku') || 'PRD';
      const baseUnit = form.getFieldValue('unit') || 'KG';
      const baseImages = form.getFieldValue('images') || [];
      const defaultImage = baseImages.length > 0 ? baseImages[0] : '';
      variantForm.resetFields();
      variantForm.setFieldsValue({
        name: `${baseName} (${variants.length + 1} Pack)`,
        sku: `${baseSku}-V${variants.length + 1}`,
        unit: baseUnit,
        stock: 50,
        priceB2C: b2cPrice,
        priceB2B: b2bPrice,
        image: defaultImage,
      });
    }
    setVariantModalOpen(true);
  };

  const handleSaveVariantModal = async () => {
    try {
      const values = await variantForm.validateFields();
      if (editingVariant) {
        setVariants((prev) =>
          prev.map((v) => (v.id === editingVariant.id ? { ...v, ...values } : v)),
        );
        message.success(`Variant "${values.name}" updated`);
      } else {
        const newVariant: VariantItem = {
          id: Date.now().toString(),
          ...values,
        };
        setVariants((prev) => [...prev, newVariant]);
        message.success(`Variant "${values.name}" added`);
      }
      setVariantModalOpen(false);
    } catch (err) {
      // Form validation failed
    }
  };

  const handleRemoveVariant = (vId: string) => {
    setVariants(variants.filter((v) => v.id !== vId));
  };

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      const values = await form.validateFields();
      const payload: CreateProductInput = {
        ...values,
        sku: values.sku.toUpperCase(),
        images: (values.images ?? []).filter(Boolean),
      };

      if (isEdit && editId) {
        await updateProduct.mutateAsync({ id: editId, input: payload });
        message.success(`Product "${payload.name}" updated successfully`);
      } else {
        await createProduct.mutateAsync(payload);
        message.success(`Product "${payload.name}" created successfully`);
      }

      navigate('/productlists');
    } catch (error) {
      message.error(
        apiErrorMessage(error, `Failed to ${isEdit ? 'update' : 'create'} product`),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const variantColumns: ColumnsType<VariantItem> = [
    {
      title: 'Variant Name & SKU',
      key: 'name',
      render: (_, record) => (
        <Space align="center" size={12}>
          <Avatar
            shape="square"
            size={40}
            src={record.image}
            icon={!record.image ? <PictureOutlined /> : undefined}
            style={{ backgroundColor: '#f5f5f5', color: '#8c8c8c' }}
          />
          <Space direction="vertical" size={2}>
            <Text strong style={{ fontSize: 13 }}>
              {record.name}
            </Text>
            <Tag color="cyan" style={{ fontSize: 11 }}>
              {record.sku}
            </Tag>
          </Space>
        </Space>
      ),
    },
    {
      title: 'Unit',
      dataIndex: 'unit',
      key: 'unit',
      width: 90,
      render: (u) => <Tag color="purple">{u}</Tag>,
    },
    {
      title: 'Stock Qty',
      dataIndex: 'stock',
      key: 'stock',
      width: 110,
      render: (qty, record) => <Tag color="blue">{qty} {record.unit}</Tag>,
    },
    {
      title: 'B2C Price',
      dataIndex: 'priceB2C',
      key: 'priceB2C',
      width: 110,
      render: (val) => formatCurrency(val),
    },
    {
      title: 'B2B Wholesale',
      dataIndex: 'priceB2B',
      key: 'priceB2B',
      width: 120,
      render: (val) => formatCurrency(val),
    },
    {
      title: 'Action',
      key: 'action',
      width: 100,
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="Edit Variant SKU">
            <Button
              type="text"
              icon={<EditOutlined style={{ color: '#1677ff' }} />}
              onClick={() => handleOpenVariantModal(record)}
            />
          </Tooltip>
          <Tooltip title="Delete Variant">
            <Button
              danger
              type="text"
              icon={<DeleteOutlined />}
              onClick={() => handleRemoveVariant(record.id)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  const currentValues = form.getFieldsValue();

  if (isEdit && isProductLoading && !targetProduct) {
    return (
      <Card style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" tip="Loading product details..." />
      </Card>
    );
  }

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      {/* Breadcrumb Navigation */}
      <Breadcrumb
        items={[
          {
            title: (
              <a onClick={() => navigate('/productlists')}>
                <ArrowLeftOutlined style={{ marginRight: 6 }} /> Product Catalog
              </a>
            ),
          },
          {
            title: isEdit ? `Edit: ${targetProduct?.name || 'Product'}` : 'Add New Product',
          },
        ]}
      />

      {/* Main Page Header */}
      <PageHeader
        title={isEdit ? `Edit Product: ${targetProduct?.name || 'Product'}` : 'Add New Product'}
        subtitle="Configure product details, SKUs, inventory thresholds, tiered pricing, and storefront publishing."
        actions={
          <Space wrap size={12}>
            <Button icon={<EyeOutlined />} onClick={() => setPreviewModalOpen(true)}>
              Storefront Preview
            </Button>
            <Button onClick={() => navigate('/productlists')}>Cancel</Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={isSubmitting}
              onClick={handleSubmit}
              size="large"
            >
              {isEdit ? 'Save Changes' : 'Publish Product'}
            </Button>
          </Space>
        }
      />

      {/* Main Form Container */}
      <Card bodyStyle={{ padding: 24 }} style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <Form form={form} layout="vertical" initialValues={{ unit: 'KG', showOnStorefront: true }}>
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            type="card"
            items={[
              {
                key: 'basic',
                label: (
                  <span>
                    <AppstoreOutlined /> 1. Basic Info & SKU
                  </span>
                ),
                children: (
                  <div style={{ paddingTop: 16 }}>
                    <Row gutter={[20, 0]}>
                      <Col xs={24} md={16}>
                        <Form.Item
                          name="name"
                          label="Product Name"
                          rules={[required('Product name is required'), maxLength(200)]}
                        >
                          <Input
                            placeholder="e.g. Desi Tokri Organic Sharbati Wheat Atta (10 KG)"
                            onChange={handleNameChange}
                            size="large"
                          />
                        </Form.Item>
                      </Col>

                      <Col xs={24} md={8}>
                        <Form.Item
                          name="unit"
                          label="Base Measurement Unit"
                          rules={[required('Unit is required')]}
                        >
                          <AutoComplete
                            options={UNITS.map((u) => ({ value: u }))}
                            placeholder="Select or enter unit (e.g. KG, LITRE)"
                            size="large"
                          />
                        </Form.Item>
                      </Col>

                      <Col xs={24} md={12}>
                        <Form.Item
                          name="sku"
                          label="Product SKU Code"
                          rules={[required('SKU is required'), maxLength(50)]}
                          extra="Must be unique. Capitalized automatically."
                        >
                          <Input
                            placeholder="e.g. PRD-ATT-001"
                            style={{ textTransform: 'uppercase' }}
                            size="large"
                          />
                        </Form.Item>
                      </Col>

                      <Col xs={24} md={12}>
                        <Form.Item name="categoryId" label="Catalog Category">
                          <CategorySelect placeholder="Select primary category" />
                        </Form.Item>
                      </Col>

                      <Col xs={24}>
                        <Form.Item name="description" label="Product Description">
                          <Input.TextArea
                            rows={4}
                            placeholder="Customer-facing detail text displayed on product landing page."
                            maxLength={2000}
                            showCount
                          />
                        </Form.Item>
                      </Col>

                      <Col xs={24}>
                        <Divider />
                        <Space align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
                          <div>
                            <Text strong style={{ fontSize: 15 }}>
                              Storefront Publishing
                            </Text>
                            <br />
                            <Text type="secondary" style={{ fontSize: 13 }}>
                              Control whether this product is visible to public B2C mobile & web buyers.
                            </Text>
                          </div>
                          <Form.Item name="showOnStorefront" valuePropName="checked" noStyle>
                            <Switch checkedChildren="Published" unCheckedChildren="Draft" />
                          </Form.Item>
                        </Space>
                      </Col>
                    </Row>
                  </div>
                ),
              },
              {
                key: 'pricing',
                label: (
                  <span>
                    <TagOutlined /> 2. Pricing & Tiered Rates
                  </span>
                ),
                children: (
                  <div style={{ paddingTop: 16 }}>
                    <Alert
                      type="info"
                      showIcon
                      message="Standard Base Pricing Setup"
                      description="Set retail B2C consumer prices and wholesale B2B baseline rates. Volume tier rules are managed in the Tiered Pricing section."
                      style={{ marginBottom: 20 }}
                    />
                    <Row gutter={[20, 20]}>
                      <Col xs={24} md={12}>
                        <Card size="small" title="B2C Retail Price (MSRP)" style={{ background: '#fafafa', borderRadius: 8 }}>
                          <Form.Item label="Retail Consumer Price (INR ₹)" required>
                            <InputNumber
                              min={0}
                              prefix="₹"
                              style={{ width: '100%' }}
                              size="large"
                              value={b2cPrice}
                              onChange={(val) => setB2cPrice(val || 0)}
                            />
                          </Form.Item>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            Standard single unit price shown on retail storefront.
                          </Text>
                        </Card>
                      </Col>

                      <Col xs={24} md={12}>
                        <Card size="small" title="B2B Wholesale Baseline Price" style={{ background: '#fafafa', borderRadius: 8 }}>
                          <Form.Item label="Verified Retailer Wholesale Price (INR ₹)" required>
                            <InputNumber
                              min={0}
                              prefix="₹"
                              style={{ width: '100%' }}
                              size="large"
                              value={b2bPrice}
                              onChange={(val) => setB2bPrice(val || 0)}
                            />
                          </Form.Item>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            Baseline price offered to approved B2B accounts.
                          </Text>
                        </Card>
                      </Col>
                    </Row>
                  </div>
                ),
              },
              {
                key: 'media',
                label: (
                  <span>
                    <PictureOutlined /> 3. Media & Storefront
                  </span>
                ),
                children: (
                  <div style={{ paddingTop: 16 }}>
                    <Form.Item
                      name="images"
                      label="Product Imagery (URLs)"
                      extra="Paste image URLs or select preset samples to display on product detail card."
                    >
                      <ProductImagesField />
                    </Form.Item>

                    <Divider />

                    <Title level={5}>SEO & URL Slug Optimization</Title>
                    <Row gutter={[20, 0]}>
                      <Col xs={24} md={12}>
                        <Form.Item name="slug" label="URL Slug (Custom Permalinks)">
                          <Input placeholder="e.g. sharbati-wheat-atta-10kg" prefix="/" />
                        </Form.Item>
                      </Col>

                      <Col xs={24} md={12}>
                        <Form.Item name="metaTitle" label="SEO Meta Title">
                          <Input placeholder="Meta title for Google search" />
                        </Form.Item>
                      </Col>

                      <Col xs={24}>
                        <Form.Item name="metaDescription" label="SEO Meta Description">
                          <Input.TextArea rows={2} placeholder="Brief summary snippet for search engines." />
                        </Form.Item>
                      </Col>
                    </Row>
                  </div>
                ),
              },
              {
                key: 'inventory',
                label: (
                  <span>
                    <ShoppingOutlined /> 4. Stock & Inventory
                  </span>
                ),
                children: (
                  <div style={{ paddingTop: 16 }}>
                    <Alert
                      type="warning"
                      showIcon
                      message="Inventory Safety Controls"
                      description="Configure reorder thresholds so store managers receive low stock alerts before running out."
                      style={{ marginBottom: 20 }}
                    />
                    <Row gutter={[20, 0]}>
                      <Col xs={24} md={12}>
                        <Form.Item
                          name="reorderPoint"
                          label="Reorder Point Threshold"
                          extra="Trigger warning alert when stock drops below this number."
                        >
                          <InputNumber min={0} style={{ width: '100%' }} size="large" />
                        </Form.Item>
                      </Col>

                      <Col xs={24} md={12}>
                        <Form.Item
                          name="safetyStock"
                          label="Safety Buffer Reserve"
                          extra="Emergency reserve quantity held for high priority orders."
                        >
                          <InputNumber min={0} style={{ width: '100%' }} size="large" />
                        </Form.Item>
                      </Col>

                      <Col xs={24}>
                        <Form.Item name="allowBackorder" valuePropName="checked">
                          <Switch /> <span style={{ marginLeft: 8 }}>Allow Backorders (Continue selling when out of stock)</span>
                        </Form.Item>
                      </Col>
                    </Row>
                  </div>
                ),
              },
              {
                key: 'variants',
                label: (
                  <span>
                    <BarcodeOutlined /> 5. Variants & Pack Sizes
                  </span>
                ),
                children: (
                  <div style={{ paddingTop: 16 }}>
                    <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 16 }}>
                      <div>
                        <Text strong style={{ fontSize: 15 }}>
                          Multi-Pack Size Variants
                        </Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 13 }}>
                          Create distinct SKU variants for different pack sizes (e.g., 1 KG, 5 KG, 10 KG).
                        </Text>
                      </div>
                      <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenVariantModal()}>
                        Add Variant SKU
                      </Button>
                    </Space>

                    <Table<VariantItem>
                      columns={variantColumns}
                      dataSource={variants}
                      rowKey="id"
                      pagination={false}
                      size="small"
                      locale={{ emptyText: 'No variant SKUs created yet. Click "Add Variant SKU" to add.' }}
                    />
                  </div>
                ),
              },
            ]}
          />
        </Form>
      </Card>

      {/* Interactive Variant SKU Add/Edit Modal */}
      <Modal
        title={editingVariant ? `Edit Variant SKU: ${editingVariant.name}` : 'Add New Variant SKU'}
        open={variantModalOpen}
        onOk={handleSaveVariantModal}
        onCancel={() => setVariantModalOpen(false)}
        okText={editingVariant ? 'Save Variant' : 'Add Variant'}
        destroyOnClose
        width={560}
      >
        <Form form={variantForm} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={[16, 0]}>
            <Col xs={24}>
              <Form.Item
                name="name"
                label="Variant Name"
                rules={[{ required: true, message: 'Variant name is required' }]}
              >
                <Input placeholder="e.g. 5 KG Family Pack / 250g Glass Jar" />
              </Form.Item>
            </Col>

            <Col xs={24} sm={12}>
              <Form.Item
                name="sku"
                label="Variant SKU"
                rules={[{ required: true, message: 'Variant SKU is required' }]}
              >
                <Input placeholder="e.g. PRD-ATT-001-V5KG" style={{ textTransform: 'uppercase' }} />
              </Form.Item>
            </Col>

            <Col xs={24} sm={12}>
              <Form.Item
                name="unit"
                label="Measurement Unit"
                rules={[{ required: true, message: 'Unit is required' }]}
              >
                <AutoComplete
                  options={UNITS.map((u) => ({ value: u }))}
                  placeholder="e.g. KG, GRAM, PACK"
                />
              </Form.Item>
            </Col>

            <Col xs={24} sm={8}>
              <Form.Item
                name="stock"
                label="Stock Qty"
                rules={[{ required: true, message: 'Stock is required' }]}
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>

            <Col xs={24} sm={8}>
              <Form.Item
                name="priceB2C"
                label="B2C Retail Price (₹)"
                rules={[{ required: true, message: 'Retail price is required' }]}
              >
                <InputNumber min={0} prefix="₹" style={{ width: '100%' }} />
              </Form.Item>
            </Col>

            <Col xs={24} sm={8}>
              <Form.Item
                name="priceB2B"
                label="B2B Wholesale (₹)"
                rules={[{ required: true, message: 'Wholesale price is required' }]}
              >
                <InputNumber min={0} prefix="₹" style={{ width: '100%' }} />
              </Form.Item>
            </Col>

            <Col xs={24}>
              <Form.Item
                name="image"
                label="Variant Photo / Image URL"
                extra="Enter custom image URL or select from uploaded product photos."
              >
                <Input placeholder="https://images.unsplash.com/..." prefix={<PictureOutlined />} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Storefront Preview Modal */}
      <Modal
        title="Storefront Consumer Preview"
        open={previewModalOpen}
        onCancel={() => setPreviewModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setPreviewModalOpen(false)}>
            Close Preview
          </Button>,
        ]}
        width={480}
      >
        <Card
          hoverable
          cover={
            <div
              style={{
                height: 220,
                background: '#f5f5f5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              {currentValues.images && currentValues.images[0] ? (
                <img
                  src={currentValues.images[0]}
                  alt="preview"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <PictureOutlined style={{ fontSize: 48, color: '#bfbfbf' }} />
              )}
            </div>
          }
        >
          <Tag color="green" style={{ marginBottom: 8 }}>
            SVV Balaji Direct
          </Tag>
          <Title level={4} style={{ margin: '0 0 8px 0' }}>
            {currentValues.name || 'Sample Product Name'}
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Unit: {currentValues.unit || 'KG'} | SKU: {currentValues.sku || 'PRD-001'}
          </Text>
          <Divider style={{ margin: '12px 0' }} />
          <Row align="middle" justify="space-between">
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Retail Price
              </Text>
              <br />
              <Text strong style={{ fontSize: 20, color: '#1677ff' }}>
                {formatCurrency(b2cPrice)}
              </Text>
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Wholesale Price
              </Text>
              <br />
              <Text strong style={{ fontSize: 16, color: '#52c41a' }}>
                {formatCurrency(b2bPrice)}
              </Text>
            </div>
          </Row>
          <Paragraph type="secondary" style={{ marginTop: 12, fontSize: 12 }} ellipsis={{ rows: 2 }}>
            {currentValues.description || 'No description provided.'}
          </Paragraph>
        </Card>
      </Modal>
    </Space>
  );
}
