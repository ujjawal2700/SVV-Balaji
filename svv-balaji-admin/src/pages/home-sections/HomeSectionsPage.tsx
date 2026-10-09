import {
  AppstoreOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  OrderedListOutlined,
  CheckCircleOutlined,
  ShoppingOutlined,
  ThunderboltOutlined,
  TagsOutlined,
  StarOutlined,
  SelectOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Col,
  Drawer,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Radio,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { apiErrorMessage } from '../../api/client';
import type { CreateHomeSectionInput, HomeSection, HomeSectionKind } from '@shared/api/types';
import { Can } from '../../components/Can';
import { PageHeader } from '../../components/PageHeader';
import { useCan } from '@shared/auth/useCan';
import {
  useCreateHomeSection,
  useDeleteHomeSection,
  useHomeSections,
  useSetHomeSectionActive,
  useUpdateHomeSection,
} from '@shared/hooks/useHomeSections';
import { useProducts } from '@shared/hooks/useProduction';
import { useCategories } from '@shared/hooks/useCategories';
import { ProductPicker } from './ProductPicker';
import { PRICE_TILE_GRADIENTS, PriceTilesEditor } from './PriceTilesEditor';

const { Text } = Typography;

const KIND_META: Record<HomeSectionKind, { label: string; short: string; color: string; icon: ReactNode; help: string }> = {
  PRODUCTS: {
    label: 'Hand-picked products',
    short: 'Hand-picked',
    color: 'volcano',
    icon: <SelectOutlined />,
    help: 'You choose exactly which products appear, and in what order.',
  },
  DAILY_STAPLES: {
    label: 'Auto: Daily Staples',
    short: 'Auto · Daily Staples',
    color: 'green',
    icon: <ThunderboltOutlined />,
    help: 'Shows every product with "Daily staple" ticked in its product form. Tick or untick it there to change this section.',
  },
  TOP_PICKS: {
    label: 'Auto: Top Picks',
    short: 'Auto · Top Picks',
    color: 'gold',
    icon: <StarOutlined />,
    help: 'Shows every product with "Top pick" ticked in its product form. Tick or untick it there to change this section.',
  },
  PRICE_DEALS: {
    label: 'Price deal tiles',
    short: 'Price tiles',
    color: 'purple',
    icon: <TagsOutlined />,
    help: 'Colourful "Starting from ₹X" tiles that each open a category.',
  },
};

interface HomeSectionDrawerProps {
  open: boolean;
  section?: HomeSection | null;
  saving: boolean;
  onClose: () => void;
  onSave: (values: CreateHomeSectionInput) => void;
}

const DEFAULT_VALUES: CreateHomeSectionInput = {
  title: '',
  subtitle: '',
  kind: 'PRODUCTS',
  layout: 'SHELF',
  targetAudience: 'ALL',
  displayOrder: 0,
  isActive: true,
  productIds: [],
  productLimit: 12,
  tiles: [],
};

function HomeSectionFormDrawer({ open, section, saving, onClose, onSave }: HomeSectionDrawerProps) {
  const [form] = Form.useForm<CreateHomeSectionInput>();
  const isEdit = Boolean(section);
  const kind: HomeSectionKind = Form.useWatch('kind', form) ?? 'PRODUCTS';
  const productsQuery = useProducts();
  const allProducts = productsQuery.data?.data ?? (Array.isArray(productsQuery.data) ? productsQuery.data : []);
  const categoriesQuery = useCategories();
  const allCategories = categoriesQuery.data?.data ?? [];

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (section) {
      form.setFieldsValue({
        title: section.title,
        subtitle: section.subtitle ?? '',
        kind: section.kind,
        layout: section.layout,
        targetAudience: section.targetAudience,
        displayOrder: section.displayOrder,
        isActive: section.isActive,
        productIds: section.productIds ?? [],
        productLimit: section.productLimit ?? 12,
        tiles: section.tiles ?? [],
      });
    } else {
      form.setFieldsValue(DEFAULT_VALUES);
    }
  }, [open, section, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      // Validated fields only include what's mounted; carry the rest so a
      // switch of kind never wipes the hidden settings.
      onSave({ ...form.getFieldsValue(true), ...values });
    } catch {
      // Form validation error handled inline
    }
  };

  const autoCount =
    kind === 'DAILY_STAPLES'
      ? allProducts.filter((p) => p.isDailyStaple && p.showOnStorefront).length
      : kind === 'TOP_PICKS'
        ? allProducts.filter((p) => p.isTopPick && p.showOnStorefront).length
        : 0;

  return (
    <Drawer
      title={
        <Space>
          <AppstoreOutlined style={{ color: '#ea580c' }} />
          <span>{isEdit ? 'Edit Homepage Section' : 'Create New Homepage Section'}</span>
        </Space>
      }
      width={760}
      open={open}
      onClose={onClose}
      extra={
        <Space>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="primary" onClick={handleSubmit} loading={saving} style={{ background: '#ea580c', borderColor: '#ea580c' }}>
            {isEdit ? 'Save Changes' : 'Create Section'}
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical" initialValues={DEFAULT_VALUES}>
        <Form.Item name="kind" label="Section Type">
          <Radio.Group style={{ width: '100%' }}>
            <Row gutter={[8, 8]}>
              {(Object.keys(KIND_META) as HomeSectionKind[]).map((k) => (
                <Col span={12} key={k}>
                  <Radio.Button
                    value={k}
                    style={{ width: '100%', height: 'auto', padding: '8px 12px', lineHeight: 1.3, borderRadius: 8 }}
                  >
                    <Space size={6}>
                      {KIND_META[k].icon}
                      <Text strong style={{ color: 'inherit' }}>
                        {KIND_META[k].label}
                      </Text>
                    </Space>
                  </Radio.Button>
                </Col>
              ))}
            </Row>
          </Radio.Group>
        </Form.Item>
        <Alert type="info" showIcon message={KIND_META[kind].help} style={{ marginTop: -12, marginBottom: 16 }} />

        <Form.Item
          name="title"
          label="Section Title"
          rules={[{ required: true, message: 'Please enter section title (e.g. Best of the Basics)' }]}
          extra="Visible header title for shoppers on the homepage."
        >
          <Input placeholder="e.g. Best of the Basics" maxLength={100} />
        </Form.Item>

        <Form.Item name="subtitle" label="Subtitle / Description" extra="Short line shown under the section header.">
          <Input.TextArea rows={2} placeholder="e.g. Farm-fresh flour, namkeen, spices & kitchen essentials" maxLength={250} />
        </Form.Item>

        <Row gutter={16}>
          <Col span={kind === 'PRICE_DEALS' ? 12 : 8}>
            <Form.Item name="displayOrder" label="Position" extra="Lower numbers appear higher.">
              <InputNumber min={0} max={99} style={{ width: '100%' }} placeholder="0" />
            </Form.Item>
          </Col>
          <Col span={kind === 'PRICE_DEALS' ? 12 : 8}>
            <Form.Item name="targetAudience" label="Target Audience">
              <Select
                options={[
                  { value: 'ALL', label: '🌐 All (B2C + B2B)' },
                  { value: 'B2C', label: '🛒 Retail customers' },
                  { value: 'B2B', label: '🏪 Retailer partners' },
                ]}
              />
            </Form.Item>
          </Col>
          {kind !== 'PRICE_DEALS' && (
            <Col span={8}>
              <Form.Item name="layout" label="Card Style">
                <Radio.Group optionType="button" buttonStyle="solid" style={{ display: 'flex' }}>
                  <Tooltip title="Compact cards - scroll sideways on mobile, 6 per row on desktop">
                    <Radio.Button value="SHELF" style={{ flex: 1, textAlign: 'center' }}>
                      Shelf
                    </Radio.Button>
                  </Tooltip>
                  <Tooltip title="Large cards - 2 per row on mobile, 4 per row on desktop">
                    <Radio.Button value="GRID" style={{ flex: 1, textAlign: 'center' }}>
                      Grid
                    </Radio.Button>
                  </Tooltip>
                </Radio.Group>
              </Form.Item>
            </Col>
          )}
        </Row>

        {kind === 'PRODUCTS' && (
          <Form.Item
            name="productIds"
            label="Products to Display"
            extra="Search or filter by category and sub-category, then tick the products to show in this section."
          >
            <ProductPicker
              products={allProducts}
              categories={allCategories}
              loading={productsQuery.isLoading || categoriesQuery.isLoading}
            />
          </Form.Item>
        )}

        {(kind === 'DAILY_STAPLES' || kind === 'TOP_PICKS') && (
          <Row gutter={16} align="middle">
            <Col span={8}>
              <Form.Item name="productLimit" label="Show up to" extra="products">
                <InputNumber min={1} max={48} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={16}>
              <Alert
                type={autoCount ? 'success' : 'warning'}
                showIcon
                style={{ marginBottom: 24 }}
                message={
                  autoCount
                    ? `${autoCount} storefront product${autoCount === 1 ? ' is' : 's are'} currently marked "${kind === 'DAILY_STAPLES' ? 'Daily staple' : 'Top pick'}".`
                    : `No storefront product is marked "${kind === 'DAILY_STAPLES' ? 'Daily staple' : 'Top pick'}" yet - the section stays hidden until one is.`
                }
                description={<Link to="/products">Manage in Products →</Link>}
              />
            </Col>
          </Row>
        )}

        {kind === 'PRICE_DEALS' && (
          <Form.Item
            name="tiles"
            label="Price Tiles"
            rules={[
              {
                validator: (_, v: CreateHomeSectionInput['tiles']) =>
                  !v?.length
                    ? Promise.reject(new Error('Add at least one tile'))
                    : v.some((t) => !t.subtitle?.trim())
                      ? Promise.reject(new Error('Every tile needs a subtitle'))
                      : Promise.resolve(),
              },
            ]}
          >
            <PriceTilesEditor categories={allCategories} />
          </Form.Item>
        )}

        <Form.Item
          name="isActive"
          label="Publish Status"
          valuePropName="checked"
          extra="Active sections are instantly published on the storefront."
        >
          <Switch checkedChildren="Active" unCheckedChildren="Hidden" />
        </Form.Item>
      </Form>
    </Drawer>
  );
}

export function HomeSectionsPage() {
  const { message } = AntApp.useApp();
  const canEditSections = useCan('HOME_SECTION_MANAGE');
  const { data, isLoading } = useHomeSections(true);
  const sections: HomeSection[] = data?.data ?? (Array.isArray(data) ? data : []);

  const createMutation = useCreateHomeSection();
  const updateMutation = useUpdateHomeSection();
  const setActiveMutation = useSetHomeSectionActive();
  const deleteMutation = useDeleteHomeSection();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<HomeSection | null>(null);

  const handleOpenCreate = () => {
    setEditingSection(null);
    setDrawerOpen(true);
  };

  const handleOpenEdit = (sec: HomeSection) => {
    setEditingSection(sec);
    setDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    setEditingSection(null);
  };

  const handleSave = async (values: CreateHomeSectionInput) => {
    try {
      if (editingSection) {
        await updateMutation.mutateAsync({ id: editingSection.id, input: values });
        message.success('Homepage section updated successfully.');
      } else {
        await createMutation.mutateAsync(values);
        message.success('New homepage section created successfully.');
      }
      handleCloseDrawer();
    } catch (err) {
      message.error(apiErrorMessage(err, 'Failed to save section.'));
    }
  };

  const handleToggleActive = async (sec: HomeSection, checked: boolean) => {
    try {
      await setActiveMutation.mutateAsync({ id: sec.id, isActive: checked });
      message.success(`Section "${sec.title}" is now ${checked ? 'published' : 'hidden'}.`);
    } catch (err) {
      message.error(apiErrorMessage(err, 'Failed to update section status.'));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      message.success('Homepage section deleted.');
    } catch (err) {
      message.error(apiErrorMessage(err, 'Failed to delete section.'));
    }
  };

  const activeCount = sections.filter((s) => s.isActive).length;
  const featuredCount = sections.reduce((acc, s) => acc + (s.kind === 'PRICE_DEALS' ? 0 : (s.products?.length ?? 0)), 0);

  const columns: ColumnsType<HomeSection> = [
    {
      title: 'Position',
      dataIndex: 'displayOrder',
      key: 'displayOrder',
      width: 90,
      render: (order: number) => (
        <Tag color="orange" style={{ fontWeight: 700 }}>
          #{order}
        </Tag>
      ),
      sorter: (a, b) => a.displayOrder - b.displayOrder,
    },
    {
      title: 'Section Header & Subtitle',
      dataIndex: 'title',
      key: 'title',
      render: (_, sec) => (
        <div>
          <Text strong style={{ fontSize: 14, color: '#0f172a', display: 'block' }}>
            {sec.title}
          </Text>
          {sec.subtitle && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {sec.subtitle}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: 'Type',
      key: 'kind',
      width: 190,
      filters: (Object.keys(KIND_META) as HomeSectionKind[]).map((k) => ({ text: KIND_META[k].label, value: k })),
      onFilter: (v, sec) => sec.kind === v,
      render: (_, sec) => (
        <Space direction="vertical" size={2}>
          <Tag icon={KIND_META[sec.kind].icon} color={KIND_META[sec.kind].color}>
            {KIND_META[sec.kind].short}
          </Tag>
          {sec.kind !== 'PRICE_DEALS' && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              {sec.layout === 'GRID' ? 'Grid · large cards' : 'Shelf · compact cards'}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Target Audience',
      dataIndex: 'targetAudience',
      key: 'targetAudience',
      width: 120,
      render: (audience: string) => {
        const color = audience === 'B2B' ? 'purple' : audience === 'B2C' ? 'blue' : 'green';
        return <Tag color={color}>{audience}</Tag>;
      },
    },
    {
      title: 'Content',
      key: 'products',
      render: (_, sec) => {
        if (sec.kind === 'PRICE_DEALS') {
          const tiles = sec.tiles ?? [];
          return (
            <Space size={4} wrap>
              {tiles.map((t, i) => (
                <span
                  key={i}
                  style={{
                    background: PRICE_TILE_GRADIENTS[t.color] ?? PRICE_TILE_GRADIENTS.orange,
                    color: '#fff',
                    borderRadius: 6,
                    padding: '1px 8px',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  ₹{t.price} · {t.subtitle}
                </span>
              ))}
              {tiles.length === 0 && <Text type="secondary">No tiles</Text>}
            </Space>
          );
        }
        const productsList = sec.products || [];
        return (
          <div>
            <Tag icon={<ShoppingOutlined />} color={productsList.length ? 'volcano' : 'default'} style={{ fontWeight: 600 }}>
              {productsList.length} Products
            </Tag>
            {sec.kind !== 'PRODUCTS' && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                auto, up to {sec.productLimit}
              </Text>
            )}
            <div style={{ marginTop: 4 }}>
              {productsList.slice(0, 3).map((p) => (
                <Tag key={p.id} style={{ fontSize: 11, marginBottom: 2 }}>
                  {p.name}
                </Tag>
              ))}
              {productsList.length > 3 && (
                <Text type="secondary" style={{ fontSize: 11 }}>
                  +{productsList.length - 3} more
                </Text>
              )}
              {productsList.length === 0 && (
                <Text type="warning" style={{ fontSize: 11 }}>
                  Hidden on the homepage until it has products
                </Text>
              )}
            </div>
          </div>
        );
      },
    },
    {
      title: 'Status',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 110,
      render: (isActive: boolean, sec) => (
        <Switch
          checked={isActive}
          disabled={!canEditSections || setActiveMutation.isPending}
          onChange={(checked) => handleToggleActive(sec, checked)}
          checkedChildren="Active"
          unCheckedChildren="Hidden"
        />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_, sec) => (
        <Space size="small">
          <Can do="HOME_SECTION_MANAGE">
            <Tooltip title="Edit section">
              <Button type="text" icon={<EditOutlined style={{ color: '#ea580c' }} />} onClick={() => handleOpenEdit(sec)} />
            </Tooltip>
          </Can>
          <Can do="HOME_SECTION_DELETE">
            <Popconfirm
              title="Delete Section"
              description="Are you sure you want to delete this homepage section?"
              onConfirm={() => handleDelete(sec.id)}
              okText="Delete"
              cancelText="Cancel"
              okButtonProps={{ danger: true }}
            >
              <Tooltip title="Delete section">
                <Button type="text" danger icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          </Can>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <PageHeader
        title="Homepage Sections Management"
        subtitle="Every product shelf and price strip on the customer homepage. Add, reorder, hide or edit them here."
        extra={
          <Can do="HOME_SECTION_CREATE">
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleOpenCreate}
              style={{ background: '#ea580c', borderColor: '#ea580c', fontWeight: 600 }}
            >
              Add New Section
            </Button>
          </Can>
        }
      />

      <Row gutter={16} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Total Homepage Sections"
              value={sections.length}
              prefix={<OrderedListOutlined style={{ color: '#ea580c' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Published Active Sections"
              value={activeCount}
              valueStyle={{ color: '#059669' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Total Products Featured"
              value={featuredCount}
              prefix={<ShoppingOutlined style={{ color: '#2563eb' }} />}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title={
          <Space>
            <AppstoreOutlined style={{ color: '#ea580c' }} />
            <span>Configured Homepage Sections</span>
          </Space>
        }
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Homepage order: banners → Shop by Category → Today's Schemes → the sections below (by position) → Buy Again."
          description="Banners and schemes are managed on their own pages. Buy Again is personal to each shopper's order history."
        />
        <Table
          dataSource={sections}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          pagination={false}
          scroll={{ x: 960 }}
          locale={{ emptyText: 'No homepage sections created yet. Click "Add New Section" to create one.' }}
        />
      </Card>

      <HomeSectionFormDrawer
        open={drawerOpen}
        section={editingSection}
        saving={createMutation.isPending || updateMutation.isPending}
        onClose={handleCloseDrawer}
        onSave={handleSave}
      />
    </div>
  );
}
