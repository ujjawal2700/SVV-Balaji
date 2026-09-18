import {
  FolderOpenOutlined,
  PlusOutlined,
  SearchOutlined,
  SubnodeOutlined,
  TagOutlined,
  EditOutlined,
  EyeInvisibleOutlined,
} from '@ant-design/icons';
import {
  App as AntApp,
  Avatar,
  Button,
  Card,
  Col,
  Input,
  Popconfirm,
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
import { useMemo, useState } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { Category } from '../../api/types';
import { Can } from '../../components/Can';
import { PageHeader } from '../../components/PageHeader';
import {
  useCategories,
  useDeleteCategory,
  useSetCategoryActive,
} from '@shared/hooks/useCategories';
import { EM_DASH } from '../../utils/format';
import { CategoryFormModal } from './CategoryFormModal';
import { MOCK_CATEGORIES } from './MainCategoriesPage';

const { Text } = Typography;

/**
 * Super Admin Dedicated Sub-Categories Page
 */
export function SubCategoriesPage() {
  const { message, modal } = AntApp.useApp();
  const [formOpen, setFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedParent, setSelectedParent] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'hidden'>('all');

  const categoriesQuery = useCategories(true);
  const setActiveMutation = useSetCategoryActive();
  const deleteMutation = useDeleteCategory();

  const rawCategories = useMemo(() => categoriesQuery.data?.data ?? [], [categoriesQuery.data]);
  const allCategories = useMemo(() => (rawCategories.length > 0 ? rawCategories : MOCK_CATEGORIES), [rawCategories]);

  // Main Categories map
  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>();
    allCategories.forEach((c) => map.set(c.id, c));
    return map;
  }, [allCategories]);

  // Main Category options for dropdown filter
  const mainCategoryOptions = useMemo(() => {
    return allCategories
      .filter((c) => !c.parentId)
      .map((c) => ({ value: c.id, label: c.name }));
  }, [allCategories]);

  // Sub-Categories only (has parentId)
  const subCategories = useMemo(() => {
    return allCategories.filter((c) => Boolean(c.parentId));
  }, [allCategories]);

  // Metrics
  const metrics = useMemo(() => {
    const total = subCategories.length;
    const activeCount = subCategories.filter((c) => c.isActive).length;
    const hiddenCount = subCategories.filter((c) => !c.isActive).length;
    return { total, activeCount, hiddenCount };
  }, [subCategories]);

  const handleOpenAddSub = () => {
    setEditingCategory(null);
    setFormOpen(true);
  };

  const handleOpenEdit = (category: Category) => {
    setEditingCategory(category);
    setFormOpen(true);
  };

  const handleToggleActive = async (category: Category, isActive: boolean) => {
    try {
      await setActiveMutation.mutateAsync({ id: category.id, isActive });
      message.success(`Sub-Category "${category.name}" is now ${isActive ? 'Visible' : 'Hidden'}`);
    } catch (err) {
      message.error(apiErrorMessage(err, 'Could not update category status'));
    }
  };

  const handleDelete = async (category: Category) => {
    try {
      await deleteMutation.mutateAsync(category.id);
      message.success(`Sub-Category "${category.name}" deleted successfully`);
    } catch (error) {
      modal.error({
        title: 'Could not delete sub-category',
        content: apiErrorMessage(error, 'Ensure no products are assigned to this sub-category first.'),
      });
    }
  };

  // Filtered rows
  const filteredRows = useMemo(() => {
    return subCategories.filter((c) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!c.name.toLowerCase().includes(q) && !c.slug.toLowerCase().includes(q)) {
          return false;
        }
      }
      if (selectedParent && c.parentId !== selectedParent) return false;
      if (statusFilter === 'active' && !c.isActive) return false;
      if (statusFilter === 'hidden' && c.isActive) return false;
      return true;
    });
  }, [subCategories, searchQuery, selectedParent, statusFilter]);

  const columns: ColumnsType<Category> = [
    {
      title: 'Sub-Category & Slug',
      key: 'name',
      width: 300,
      render: (_, category) => (
        <Space align="start" size={12}>
          <Avatar
            shape="square"
            size={40}
            src={category.imageUrl || undefined}
            icon={<SubnodeOutlined />}
            style={{ backgroundColor: '#e6f4ff', color: '#1677ff' }}
          />
          <Space direction="vertical" size={0}>
            <Space size={6}>
              <Text strong type={category.isActive ? undefined : 'secondary'}>
                {category.name}
              </Text>
              <Tag color="cyan" style={{ fontSize: 10 }}>
                Sub-Category
              </Tag>
            </Space>
            <Text type="secondary" style={{ fontSize: 12 }}>
              /{category.slug}
            </Text>
          </Space>
        </Space>
      ),
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    {
      title: 'Parent Category',
      key: 'parent',
      width: 200,
      render: (_, category) => {
        if (!category.parentId) return <Text type="secondary">{EM_DASH}</Text>;
        const parent = categoryMap.get(category.parentId);
        return parent ? (
          <Tag icon={<FolderOpenOutlined />} color="blue" style={{ fontSize: 12, padding: '2px 8px' }}>
            {parent.name}
          </Tag>
        ) : (
          <Text type="secondary">{EM_DASH}</Text>
        );
      },
    },
    {
      title: 'Assigned Products',
      key: 'products',
      width: 160,
      render: (_, category) => (
        <Tag color="geekblue">
          {category._count?.products ?? 0} Products
        </Tag>
      ),
    },
    {
      title: 'Display Order',
      dataIndex: 'displayOrder',
      key: 'displayOrder',
      width: 120,
      render: (order: number) => <Tag>{order ?? 0}</Tag>,
    },
    {
      title: 'Storefront Status',
      key: 'isActive',
      width: 140,
      render: (_, category) => (
        <Switch
          checked={category.isActive}
          onChange={(checked) => handleToggleActive(category, checked)}
          checkedChildren="Visible"
          unCheckedChildren="Hidden"
          size="small"
        />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 140,
      fixed: 'right',
      render: (_, category) => (
        <Space size={4}>
          <Can do="CATEGORY_MANAGE">
            <Tooltip title="Edit Sub-Category">
              <Button
                type="text"
                icon={<EditOutlined />}
                onClick={() => handleOpenEdit(category)}
              />
            </Tooltip>
          </Can>

          <Can do="CATEGORY_MANAGE">
            <Popconfirm
              title="Delete Sub-Category"
              description={`Delete "${category.name}"? This cannot be undone.`}
              onConfirm={() => handleDelete(category)}
              okText="Delete"
              cancelText="Cancel"
              okButtonProps={{ danger: true }}
            >
              <Tooltip title="Delete">
                <Button danger type="text" icon={<EyeInvisibleOutlined style={{ display: 'none' }} />} />
              </Tooltip>
            </Popconfirm>
          </Can>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {/* Page Header */}
      <PageHeader
        title="Sub-Categories"
        subtitle="Manage sub-categories, parent category assignments, and storefront menu placement."
        actions={
          <Can do="CATEGORY_CREATE">
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleOpenAddSub}
              size="large"
            >
              Add Sub-Category
            </Button>
          </Can>
        }
      />

      {/* Summary Widgets */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Total Sub-Categories"
              value={metrics.total}
              prefix={<SubnodeOutlined style={{ color: '#fa8c16' }} />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Visible on Storefront"
              value={metrics.activeCount}
              prefix={<TagOutlined style={{ color: '#1677ff' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Hidden Sub-Categories"
              value={metrics.hiddenCount}
              prefix={<FolderOpenOutlined style={{ color: '#8c8c8c' }} />}
            />
          </Card>
        </Col>
      </Row>

      {/* Data Table */}
      <Card bodyStyle={{ padding: 16 }} style={{ borderRadius: 8 }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Row gutter={[12, 12]} align="middle">
            <Col xs={24} md={8}>
              <Input
                placeholder="Search Sub-Categories..."
                prefix={<SearchOutlined />}
                allowClear
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </Col>

            <Col xs={12} md={6}>
              <Select
                style={{ width: '100%' }}
                allowClear
                placeholder="Filter by Parent Category"
                value={selectedParent}
                onChange={(val) => setSelectedParent(val)}
                options={mainCategoryOptions}
              />
            </Col>

            <Col xs={12} md={5}>
              <Select
                style={{ width: '100%' }}
                value={statusFilter}
                onChange={(val) => setStatusFilter(val)}
                options={[
                  { value: 'all', label: 'All Statuses' },
                  { value: 'active', label: 'Visible Only' },
                  { value: 'hidden', label: 'Hidden Only' },
                ]}
              />
            </Col>
          </Row>

          <Table<Category>
            columns={columns}
            dataSource={filteredRows}
            rowKey="id"
            loading={categoriesQuery.isLoading}
            pagination={{ pageSize: 10, showSizeChanger: true }}
            size="middle"
            scroll={{ x: 700 }}
          />
        </Space>
      </Card>

      {/* Modal Form */}
      <CategoryFormModal
        open={formOpen}
        category={editingCategory}
        defaultParentId={undefined}
        onClose={() => setFormOpen(false)}
      />
    </Space>
  );
}
