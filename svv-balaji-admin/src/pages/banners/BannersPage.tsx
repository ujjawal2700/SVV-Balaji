import {
  AppstoreOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  LinkOutlined,
  PictureOutlined,
  PlusOutlined,
  RocketOutlined,
  ShoppingOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Col,
  Divider,
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
import { useEffect, useState } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { Banner, CreateBannerInput } from '../../api/types';
import { Can } from '../../components/Can';
import { PageHeader } from '../../components/PageHeader';
import { FileUploadField } from '@shared/components/FileUploadField';
import {
  useBanners,
  useCreateBanner,
  useDeleteBanner,
  useSetBannerActive,
  useUpdateBanner,
} from '@shared/hooks/useBanners';

const { Text, Title, Paragraph } = Typography;

export type HomepageBanner = Banner;

/**
 * Banner Form Drawer Component
 */
function BannerFormDrawer({
  open,
  banner,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  banner?: HomepageBanner | null;
  saving: boolean;
  onClose: () => void;
  onSave: (values: CreateBannerInput) => void;
}) {
  const [form] = Form.useForm<CreateBannerInput>();
  const isEdit = Boolean(banner);

  const defaultValues: CreateBannerInput = {
    title: '',
    description: '',
    badgeText: '',
    imageUrl: '',
    backgroundColor: '#064e3b',
    textColor: '#ffffff',
    targetAudience: 'ALL',
    placement: 'HOMEPAGE',
    displayOrder: 1,
    isActive: true,
    ctaTextPrimary: 'Explore Catalog',
    ctaLinkPrimary: '/products',
    ctaTextSecondary: 'Trace A Batch',
    ctaLinkSecondary: '/trace',
  };

  const initialValues: CreateBannerInput = banner
    ? {
        ...banner,
        placement: banner.placement || 'HOMEPAGE',
      }
    : defaultValues;

  useEffect(() => {
    if (!open) return;
    if (banner) {
      form.setFieldsValue(initialValues);
    } else {
      form.resetFields();
      form.setFieldsValue(defaultValues);
    }
  }, [open, banner, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    onSave(values);
  };

  return (
    <Drawer
      title={isEdit ? `Edit Banner: ${banner?.title}` : 'Add New Promotional Banner'}
      width={720}
      open={open}
      onClose={onClose}
      extra={
        <Space>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" loading={saving} onClick={handleSubmit}>
            {isEdit ? 'Save Banner' : 'Publish Banner'}
          </Button>
        </Space>
      }
      destroyOnClose
    >
      <Form
        key={banner ? banner.id : 'new-banner'}
        form={form}
        layout="vertical"
        requiredMark
        initialValues={initialValues}
      >
        <Row gutter={16}>
          <Col span={16}>
            <Form.Item
              name="title"
              label="Banner Headline Title"
              rules={[{ required: true, message: 'Please enter banner title' }]}
            >
              <Input placeholder="Direct From Verified Mandis to Your Store" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="badgeText" label="Eyebrow Badge Pill">
              <Input placeholder="100% FARM-TRACEABLE STAPLES" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          name="description"
          label="Banner Subtitle Copy"
          rules={[{ required: true, message: 'Please enter description' }]}
        >
          <Input.TextArea
            rows={3}
            placeholder="Pure Sharbati Atta, cold-pressed oils, and ground spices with verifiable batch QR provenance."
          />
        </Form.Item>

        <Form.Item
          name="imageUrl"
          label="Banner Illustration / Image"
          rules={[{ required: true, message: 'Please upload a banner image' }]}
        >
          <FileUploadField folder="banners" hint="Recommended wide/landscape image, shown on the storefront hero." />
        </Form.Item>

        <Divider orientation="left" plain>
          Page Placement & Location
        </Divider>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="placement"
              label="Target Page Location"
              rules={[{ required: true, message: 'Please select banner placement' }]}
            >
              <Select
                options={[
                  { value: 'HOMEPAGE', label: '🏠 Customer Homepage Top Carousel' },
                  { value: 'CATEGORIES_PAGE', label: '🏷️ Categories Page Top Hero Banner (/categories)' },
                  { value: 'PRODUCTS_PAGE', label: '📦 Products Catalog Banner (/products)' },
                ]}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="targetAudience" label="Target Customer Channel">
              <Select
                options={[
                  { value: 'ALL', label: 'All Users (B2C & B2B)' },
                  { value: 'B2C', label: 'B2C Shoppers Only' },
                  { value: 'B2B', label: 'B2B Wholesale Accounts Only' },
                ]}
              />
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left" plain>
          CTA Buttons & Links
        </Divider>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="ctaTextPrimary"
              label="Primary CTA Button Label"
              rules={[{ required: true }]}
            >
              <Input placeholder="Explore Catalog" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="ctaLinkPrimary"
              label="Primary Button Route Link"
              rules={[{ required: true }]}
            >
              <Input placeholder="/products" prefix={<LinkOutlined />} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="ctaTextSecondary" label="Secondary CTA Button Label (Optional)">
              <Input placeholder="Trace A Batch" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="ctaLinkSecondary" label="Secondary Button Route Link">
              <Input placeholder="/trace" prefix={<LinkOutlined />} />
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left" plain>
          Styling & Display Order
        </Divider>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="backgroundColor" label="Theme Background Color">
              <Select
                options={[
                  { value: '#064e3b', label: '🌲 Emerald Mandi Green' },
                  { value: '#1e3a8a', label: '🟦 Deep Navy Wholesale' },
                  { value: '#ea580c', label: '🟧 Harvest Orange' },
                  { value: '#7c2d12', label: '🍁 Spice Amber' },
                  { value: '#334155', label: '🪨 Slate Metallic' },
                  { value: '#581c87', label: '🔮 Premium Purple' },
                ]}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="displayOrder" label="Sort Order Index">
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="isActive" label="Publish Live Status" valuePropName="checked">
          <Switch checkedChildren="Live" unCheckedChildren="Draft" />
        </Form.Item>
      </Form>
    </Drawer>
  );
}

/**
 * Super Admin Banner Management Console
 */
export function BannersPage() {
  const { message } = AntApp.useApp();
  const { data, isLoading } = useBanners(true);
  const banners = data?.data ?? [];

  const createBanner = useCreateBanner();
  const updateBanner = useUpdateBanner();
  const setBannerActive = useSetBannerActive();
  const deleteBanner = useDeleteBanner();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<HomepageBanner | null>(null);
  const [activePreviewIndex, setActivePreviewIndex] = useState(0);
  const [placementFilter, setPlacementFilter] = useState<'ALL' | 'HOMEPAGE' | 'CATEGORIES_PAGE' | 'PRODUCTS_PAGE'>('ALL');

  const activeBanners = banners
    .filter((b) => b.isActive)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  const currentPreview = activeBanners[activePreviewIndex] || activeBanners[0];

  const handleOpenAdd = () => {
    setEditingBanner(null);
    setDrawerOpen(true);
  };

  const handleOpenEdit = (banner: HomepageBanner) => {
    setEditingBanner(banner);
    setDrawerOpen(true);
  };

  const handleSaveBanner = (values: CreateBannerInput) => {
    if (editingBanner) {
      updateBanner.mutate(
        { id: editingBanner.id, input: values },
        {
          onSuccess: () => {
            message.success(`Banner "${values.title}" updated`);
            setDrawerOpen(false);
          },
          onError: (error) => message.error(apiErrorMessage(error)),
        },
      );
    } else {
      createBanner.mutate(values, {
        onSuccess: () => {
          message.success(`Banner "${values.title}" published`);
          setDrawerOpen(false);
        },
        onError: (error) => message.error(apiErrorMessage(error)),
      });
    }
  };

  const handleToggleActive = (banner: HomepageBanner, isActive: boolean) => {
    setBannerActive.mutate(
      { id: banner.id, isActive },
      {
        onSuccess: () => message.success('Banner live status updated'),
        onError: (error) => message.error(apiErrorMessage(error)),
      },
    );
  };

  const handleDelete = (id: string) => {
    deleteBanner.mutate(id, {
      onSuccess: () => message.success('Banner removed'),
      onError: (error) => message.error(apiErrorMessage(error)),
    });
  };

  const filteredBanners = banners.filter((b) => {
    if (placementFilter === 'ALL') return true;
    return (b.placement || 'HOMEPAGE') === placementFilter;
  });

  const columns: ColumnsType<HomepageBanner> = [
    {
      title: 'Banner Headline & Subtitle',
      key: 'title',
      width: 320,
      render: (_, record) => (
        <Space align="start" size={12}>
          <div
            style={{
              width: 54,
              height: 38,
              borderRadius: 6,
              background: record.backgroundColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            {record.imageUrl ? (
              <img src={record.imageUrl} alt="banner" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <PictureOutlined style={{ color: '#fff', fontSize: 16 }} />
            )}
          </div>
          <Space direction="vertical" size={0}>
            {record.badgeText && (
              <Tag color="gold" style={{ fontSize: 9, padding: '0 4px', lineHeight: '16px' }}>
                {record.badgeText}
              </Tag>
            )}
            <Text strong style={{ fontSize: 13 }} type={record.isActive ? undefined : 'secondary'}>
              {record.title}
            </Text>
            <Text type="secondary" style={{ fontSize: 11, maxWidth: 220 }} ellipsis={{ tooltip: true }}>
              {record.description}
            </Text>
          </Space>
        </Space>
      ),
    },
    {
      title: 'Target Placement',
      key: 'placement',
      width: 160,
      render: (_, record) => {
        const p = record.placement || 'HOMEPAGE';
        return (
          <Tag color={p === 'CATEGORIES_PAGE' ? 'orange' : p === 'PRODUCTS_PAGE' ? 'green' : 'blue'}>
            {p === 'CATEGORIES_PAGE' ? '🏷️ Categories Page' : p === 'PRODUCTS_PAGE' ? '📦 Products Page' : '🏠 Homepage'}
          </Tag>
        );
      },
    },
    {
      title: 'Target Audience',
      key: 'target',
      width: 130,
      render: (_, record) => (
        <Tag color={record.targetAudience === 'ALL' ? 'blue' : record.targetAudience === 'B2C' ? 'purple' : 'cyan'}>
          {record.targetAudience === 'ALL' ? 'All Channels' : record.targetAudience === 'B2C' ? 'B2C Shoppers' : 'B2B Accounts'}
        </Tag>
      ),
    },
    {
      title: 'Primary CTA Button',
      key: 'cta',
      width: 160,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong style={{ fontSize: 12 }}>
            {record.ctaTextPrimary}
          </Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {record.ctaLinkPrimary}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Order',
      dataIndex: 'displayOrder',
      key: 'displayOrder',
      width: 70,
      render: (order: number) => <Tag style={{ fontSize: 11 }}>#{order}</Tag>,
    },
    {
      title: 'Live Status',
      key: 'isActive',
      width: 100,
      render: (_, record) => (
        <Switch
          checked={record.isActive}
          onChange={(checked) => handleToggleActive(record, checked)}
          checkedChildren="Live"
          unCheckedChildren="Draft"
          size="small"
        />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      fixed: 'right',
      render: (_, record) => (
        <Space size={4}>
          <Can do="BANNER_MANAGE">
            <Tooltip title="Edit Banner">
              <Button size="small" icon={<EditOutlined />} onClick={() => handleOpenEdit(record)} />
            </Tooltip>
          </Can>

          <Can do="BANNER_DELETE">
            <Popconfirm
              title="Delete Banner"
              description="Remove this promotional banner?"
              onConfirm={() => handleDelete(record.id)}
              okText="Delete"
              cancelText="Cancel"
              okButtonProps={{ danger: true }}
            >
              <Tooltip title="Delete">
                <Button danger size="small" icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          </Can>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {/* Page Header */}
      <PageHeader
        title="Banner Management CMS"
        subtitle="Super Admin Banner Manager: Control customer app homepage hero carousels, categories page top banners, product catalog banners, target channels, and CTA buttons."
        actions={
          <Can do="BANNER_CREATE">
            <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenAdd}>
              Add New Banner
            </Button>
          </Can>
        }
      />

      {/* Summary Metrics */}
      <Row gutter={[12, 12]}>
        <Col xs={24} sm={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Total Banners"
              value={banners.length}
              prefix={<PictureOutlined style={{ color: '#1677ff', fontSize: 16 }} />}
              valueStyle={{ fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Active Live Banners"
              value={activeBanners.length}
              prefix={<RocketOutlined style={{ color: '#52c41a', fontSize: 16 }} />}
              valueStyle={{ color: '#52c41a', fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Categories Page Banners"
              value={banners.filter((b) => b.placement === 'CATEGORIES_PAGE').length}
              prefix={<AppstoreOutlined style={{ color: '#fa8c16', fontSize: 16 }} />}
              valueStyle={{ color: '#fa8c16', fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Homepage Carousels"
              value={banners.filter((b) => !b.placement || b.placement === 'HOMEPAGE').length}
              prefix={<ShoppingOutlined style={{ color: '#722ed1', fontSize: 16 }} />}
              valueStyle={{ color: '#722ed1', fontSize: 20 }}
            />
          </Card>
        </Col>
      </Row>

      {/* Real-time Customer Homepage Banner Preview Container */}
      <Card
        size="small"
        title={
          <Space>
            <EyeOutlined style={{ color: '#1677ff' }} />
            <span>Storefront Live Banner Preview</span>
          </Space>
        }
        extra={
          <Space size={4}>
            {activeBanners.map((b, idx) => (
              <Button
                key={b.id}
                size="small"
                type={activePreviewIndex === idx ? 'primary' : 'default'}
                onClick={() => setActivePreviewIndex(idx)}
                style={{ fontSize: 11 }}
              >
                {b.placement === 'CATEGORIES_PAGE' ? 'Cat Banner' : `Slide ${idx + 1}`}
              </Button>
            ))}
          </Space>
        }
        style={{ borderRadius: 8 }}
      >
        {currentPreview ? (
          <div
            style={{
              borderRadius: 16,
              background: currentPreview.backgroundColor,
              padding: '24px 28px',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 24,
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              minHeight: 220,
            }}
          >
            {/* Left Copy & Buttons */}
            <div style={{ flex: 1, maxWidth: 480 }}>
              {currentPreview.badgeText && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 12px',
                    borderRadius: 20,
                    background: 'rgba(255,255,255,0.2)',
                    backdropFilter: 'blur(4px)',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.5px',
                    marginBottom: 12,
                    textTransform: 'uppercase',
                  }}
                >
                  <span>✔</span> {currentPreview.badgeText}
                </div>
              )}

              <Title
                level={3}
                style={{
                  color: '#ffffff',
                  margin: '0 0 8px 0',
                  fontWeight: 800,
                  fontSize: 22,
                  lineHeight: 1.2,
                }}
              >
                {currentPreview.title}
              </Title>

              <Paragraph
                style={{
                  color: 'rgba(255,255,255,0.9)',
                  fontSize: 13,
                  margin: '0 0 20px 0',
                  lineHeight: 1.4,
                }}
              >
                {currentPreview.description}
              </Paragraph>

              <Space size={12}>
                <Button
                  type="primary"
                  size="middle"
                  style={{
                    background: '#f59e0b',
                    borderColor: '#f59e0b',
                    color: '#000',
                    fontWeight: 700,
                    borderRadius: 8,
                    height: 38,
                    padding: '0 20px',
                  }}
                >
                  {currentPreview.ctaTextPrimary}
                </Button>

                {currentPreview.ctaTextSecondary && (
                  <Button
                    size="middle"
                    style={{
                      background: 'rgba(255,255,255,0.15)',
                      borderColor: 'rgba(255,255,255,0.4)',
                      color: '#ffffff',
                      fontWeight: 600,
                      borderRadius: 8,
                      height: 38,
                      padding: '0 18px',
                    }}
                  >
                    {currentPreview.ctaTextSecondary}
                  </Button>
                )}
              </Space>
            </div>

            {/* Right Hero Image Card */}
            <div
              style={{
                width: 220,
                height: 180,
                borderRadius: 12,
                overflow: 'hidden',
                background: '#ffffff',
                boxShadow: '0 6px 16px rgba(0,0,0,0.2)',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {currentPreview.imageUrl ? (
                <img
                  src={currentPreview.imageUrl}
                  alt="Banner preview"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <PictureOutlined style={{ fontSize: 48, color: '#d9d9d9' }} />
              )}
            </div>
          </div>
        ) : (
          <Alert message="No active live banners. Click 'Add New Banner' to create one." type="warning" />
        )}
      </Card>

      {/* Banner Management Table */}
      <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 8 }}>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <Text strong style={{ fontSize: 14 }}>
              All Promotional Banners ({filteredBanners.length})
            </Text>

            <Radio.Group
              value={placementFilter}
              onChange={(e) => setPlacementFilter(e.target.value)}
              buttonStyle="solid"
              size="small"
            >
              <Radio.Button value="ALL">All ({banners.length})</Radio.Button>
              <Radio.Button value="HOMEPAGE">Homepage ({banners.filter((b) => !b.placement || b.placement === 'HOMEPAGE').length})</Radio.Button>
              <Radio.Button value="CATEGORIES_PAGE">Categories Page ({banners.filter((b) => b.placement === 'CATEGORIES_PAGE').length})</Radio.Button>
              <Radio.Button value="PRODUCTS_PAGE">Products Page ({banners.filter((b) => b.placement === 'PRODUCTS_PAGE').length})</Radio.Button>
            </Radio.Group>
          </div>

          <Table<HomepageBanner>
            columns={columns}
            dataSource={filteredBanners}
            rowKey="id"
            pagination={false}
            size="small"
            loading={isLoading}
          />
        </Space>
      </Card>

      {/* Banner Form Drawer */}
      <BannerFormDrawer
        open={drawerOpen}
        banner={editingBanner}
        saving={createBanner.isPending || updateBanner.isPending}
        onClose={() => setDrawerOpen(false)}
        onSave={handleSaveBanner}
      />
    </Space>
  );
}
