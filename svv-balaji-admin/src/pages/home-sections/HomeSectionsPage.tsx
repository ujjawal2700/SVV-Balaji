import {
  AppstoreOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  OrderedListOutlined,
  CheckCircleOutlined,
  ShoppingOutlined,
  SearchOutlined,
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
import { useEffect, useMemo, useState } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { CreateHomeSectionInput, HomeSection } from '@shared/api/types';
import { Can } from '../../components/Can';
import { PageHeader } from '../../components/PageHeader';
import {
  useCreateHomeSection,
  useDeleteHomeSection,
  useHomeSections,
  useSetHomeSectionActive,
  useUpdateHomeSection,
} from '@shared/hooks/useHomeSections';
import { useProducts } from '@shared/hooks/useProduction';

const { Text, Title, Paragraph } = Typography;

interface HomeSectionDrawerProps {
  open: boolean;
  section?: HomeSection | null;
  saving: boolean;
  onClose: () => void;
  onSave: (values: CreateHomeSectionInput) => void;
}

function HomeSectionFormDrawer({
  open,
  section,
  saving,
  onClose,
  onSave,
}: HomeSectionDrawerProps) {
  const [form] = Form.useForm<CreateHomeSectionInput>();
  const isEdit = Boolean(section);
  const productsQuery = useProducts();
  const allProducts = productsQuery.data?.data ?? (Array.isArray(productsQuery.data) ? productsQuery.data : []);

  const defaultValues: CreateHomeSectionInput = {
    title: '',
    subtitle: '',
    targetAudience: 'ALL',
    displayOrder: 0,
    isActive: true,
    productIds: [],
  };

  useEffect(() => {
    if (open) {
      if (section) {
        form.setFieldsValue({
          title: section.title,
          subtitle: section.subtitle ?? '',
          targetAudience: section.targetAudience,
          displayOrder: section.displayOrder,
          isActive: section.isActive,
          productIds: section.productIds ?? [],
        });
      } else {
        form.setFieldsValue(defaultValues);
      }
    }
  }, [open, section, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      onSave(values);
    } catch {
      // Form validation error handled inline
    }
  };

  const productOptions = useMemo(() => {
    return allProducts.map((p) => ({
      value: p.id,
      label: `${p.name} (${p.packLabel || p.unit || 'Standard'}) - ${p.category?.name || 'Unassigned'}`,
    }));
  }, [allProducts]);

  return (
    <Drawer
      title={
        <Space>
          <AppstoreOutlined style={{ color: '#ea580c' }} />
          <span>{isEdit ? 'Edit Homepage Section' : 'Create New Homepage Section'}</span>
        </Space>
      }
      width={600}
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
      <Form form={form} layout="vertical">
        <Form.Item
          name="title"
          label="Section Title"
          rules={[{ required: true, message: 'Please enter section title (e.g. Best of the Basics)' }]}
          extra="Visible header title for shoppers on the homepage."
        >
          <Input placeholder="e.g. Best of the Basics" maxLength={100} />
        </Form.Item>

        <Form.Item
          name="subtitle"
          label="Subtitle / Description"
          extra="Short subtitle description displayed under the section header."
        >
          <Input.TextArea
            rows={2}
            placeholder="e.g. Farm-fresh flour, namkeen, spices & kitchen essentials"
            maxLength={250}
          />
        </Form.Item>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="displayOrder"
              label="Display Order (Position Rank)"
              extra="Lower numbers appear higher on the homepage."
            >
              <InputNumber min={0} max={99} style={{ width: '100%' }} placeholder="0" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="targetAudience"
              label="Target Audience"
              extra="Channel filter for storefront."
            >
              <Select>
                <Select.Option value="ALL">🌐 All Customers (B2C + B2B)</Select.Option>
                <Select.Option value="B2C">🛒 Retail Customers (B2C Only)</Select.Option>
                <Select.Option value="B2B">🏪 Retailer Partners (B2B Only)</Select.Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          name="productIds"
          label="Select Products to Display"
          extra="Pick products from your catalogue that will appear as cards in this section."
        >
          <Select
            mode="multiple"
            allowClear
            style={{ width: '100%' }}
            placeholder="Search and pick products..."
            optionFilterProp="label"
            options={productOptions}
            loading={productsQuery.isLoading}
            maxTagCount="responsive"
          />
        </Form.Item>

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
  const { data, isLoading, isError } = useHomeSections(true);
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
      title: 'Target Audience',
      dataIndex: 'targetAudience',
      key: 'targetAudience',
      width: 140,
      render: (audience: string) => {
        const color = audience === 'B2B' ? 'purple' : audience === 'B2C' ? 'blue' : 'green';
        return <Tag color={color}>{audience}</Tag>;
      },
    },
    {
      title: 'Selected Products',
      key: 'products',
      render: (_, sec) => {
        const count = sec.productIds?.length || 0;
        const productsList = sec.products || [];
        return (
          <div>
            <Tag icon={<ShoppingOutlined />} color="volcano" style={{ fontWeight: 600 }}>
              {count} Products
            </Tag>
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
            </div>
          </div>
        );
      },
    },
    {
      title: 'Status',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 120,
      render: (isActive: boolean, sec) => (
        <Can I="homeSections.edit">
          {(allowed) => (
            <Switch
              checked={isActive}
              disabled={!allowed || setActiveMutation.isPending}
              onChange={(checked) => handleToggleActive(sec, checked)}
              checkedChildren="Active"
              unCheckedChildren="Hidden"
            />
          )}
        </Can>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_, sec) => (
        <Space size="small">
          <Can I="homeSections.edit">
            <Tooltip title="Edit section">
              <Button
                type="text"
                icon={<EditOutlined style={{ color: '#ea580c' }} />}
                onClick={() => handleOpenEdit(sec)}
              />
            </Tooltip>
          </Can>
          <Can I="homeSections.delete">
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
        subtitle="Create and organize dynamic product sections for the customer homepage (e.g. Best of the Basics, Trending Staples, Festive Offers)."
        extra={
          <Can I="homeSections.create">
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
              value={sections.reduce((acc, s) => acc + (s.productIds?.length || 0), 0)}
              prefix={<ShoppingOutlined style={{ color: '#2563eb' }} />}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title={
          <Space>
            <AppstoreOutlined style={{ color: '#ea580c' }} />
            <span>Configured Homepage Product Sections</span>
          </Space>
        }
      >
        <Table
          dataSource={sections}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          pagination={false}
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
