import {
  AppstoreOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  PlusOutlined,
  SearchOutlined,
  SubnodeOutlined,
  TagOutlined,
  EditOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
} from '@ant-design/icons';
import {
  App as AntApp,
  Avatar,
  Badge,
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
  Tabs,
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

const { Text, Title } = Typography;

/** Sort categories hierarchically: Parent first, followed by its child sub-categories */
function sortHierarchical(rows: Category[]): Category[] {
  const byParent = new Map<string | null, Category[]>();
  for (const row of rows) {
    const key = row.parentId ?? null;
    byParent.set(key, [...(byParent.get(key) ?? []), row]);
  }
  const order = (list: Category[] | undefined) =>
    (list ?? []).sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));

  const out: Category[] = [];
  for (const parent of order(byParent.get(null))) {
    out.push(parent);
    out.push(...order(byParent.get(parent.id)));
  }
  return out;
}

/**
 * Super Admin Dedicated Category & Sub-Category Management Console
 */
export function CategoriesPage() {
  const { message, modal } = AntApp.useApp();
  const [formOpen, setFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [defaultParentId, setDefaultParentId] = useState<string | null>(null);

  // Filters & Tabs state
  const [activeTab, setActiveTab] = useState<'all' | 'main' | 'sub'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'hidden'>('all');

  const categoriesQuery = useCategories(true);
  const setActiveMutation = useSetCategoryActive();
  const deleteMutation = useDeleteCategory();

  const rawCategories = useMemo(() => categoriesQuery.data?.data ?? [], [categoriesQuery.data]);
  const allCategories = useMemo(() => (rawCategories.length > 0 ? rawCategories : MOCK_CATEGORIES), [rawCategories]);

  // Compute stats metrics
  const metrics = useMemo(() => {
    const total = allCategories.length;
    const mainCount = allCategories.filter((c) => !c.parentId).length;
    const subCount = allCategories.filter((c) => Boolean(c.parentId)).length;
    const activeCount = allCategories.filter((c) => c.isActive).length;
    return { total, mainCount, subCount, activeCount };
  }, [allCategories]);

  const handleOpenAddMain = () => {
    setEditingCategory(null);
    setDefaultParentId(null);
    setFormOpen(true);
  };

  const handleOpenAddSub = (parentId?: string) => {
    setEditingCategory(null);
    setDefaultParentId(parentId ?? null);
    setFormOpen(true);
  };

  const handleOpenEdit = (category: Category) => {
    setEditingCategory(category);
    setDefaultParentId(null);
    setFormOpen(true);
  };

  const handleToggleActive = async (category: Category, isActive: boolean) => {
    try {
      await setActiveMutation.mutateAsync({ id: category.id, isActive });
      message.success(`Category "${category.name}" is now ${isActive ? 'Visible' : 'Hidden'}`);
    } catch (err) {
      message.error(apiErrorMessage(err, 'Could not update category status'));
    }
  };

  const handleDelete = async (category: Category) => {
    try {
      await deleteMutation.mutateAsync(category.id);
      message.success(`Category "${category.name}" deleted successfully`);
    } catch (error) {
      modal.error({
        title: 'Could not delete category',
        content: apiErrorMessage(error, 'Ensure no sub-categories or products are linked first.'),
      });
    }
  };

  // Filtered dataset according to active tab & search query
  const filteredRows = useMemo(() => {
    let rows = allCategories;

    // Filter by tab
    if (activeTab === 'main') {
      rows = rows.filter((c) => !c.parentId);
    } else if (activeTab === 'sub') {
      rows = rows.filter((c) => Boolean(c.parentId));
    }

    // Filter by search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(
        (c) => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q),
      );
    }

    // Filter by status
    if (statusFilter === 'active') rows = rows.filter((c) => c.isActive);
    if (statusFilter === 'hidden') rows = rows.filter((c) => !c.isActive);

    return activeTab === 'all' ? sortHierarchical(rows) : rows;
  }, [allCategories, activeTab, searchQuery, statusFilter]);

  // Lookup map for parent names
  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>();
    allCategories.forEach((c) => map.set(c.id, c));
    return map;
  }, [allCategories]);

  const columns: ColumnsType<Category> = [
    {
      title: 'Category Name & Slug',
      key: 'name',
      width: 320,
      render: (_, category) => {
        const isSub = Boolean(category.parentId);
        return (
          <Space style={{ paddingLeft: isSub ? 32 : 0 }} align="start" size={12}>
            <Avatar
              shape="square"
              size={36}
              src={category.imageUrl || undefined}
              icon={isSub ? <SubnodeOutlined /> : <FolderOutlined />}
              style={{
                backgroundColor: isSub ? '#e6f4ff' : '#f6ffed',
                color: isSub ? '#1677ff' : '#52c41a',
              }}
            />
            <Space direction="vertical" size={0}>
              <Space size={6}>
                <Text strong={!isSub} type={category.isActive ? undefined : 'secondary'}>
                  {category.name}
                </Text>
                {isSub ? (
                  <Tag color="cyan" style={{ fontSize: 10 }}>
                    Sub-Category
                  </Tag>
                ) : (
                  <Tag color="green" style={{ fontSize: 10 }}>
                    Main Category
                  </Tag>
                )}
              </Space>
              <Text type="secondary" style={{ fontSize: 12 }}>
                /{category.slug}
              </Text>
            </Space>
          </Space>
        );
      },
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    {
      title: 'Parent Category',
      key: 'parent',
      width: 180,
      render: (_, category) => {
        if (!category.parentId) return <Text type="secondary">— (Top Level)</Text>;
        const parent = categoryMap.get(category.parentId);
        return parent ? (
          <Tag icon={<FolderOpenOutlined />} color="blue">
            {parent.name}
          </Tag>
        ) : (
          <Text type="secondary">{EM_DASH}</Text>
        );
      },
    },
    {
      title: 'Contains / Links',
      key: 'counts',
      width: 200,
      render: (_, category) => (
        <Space size={4} wrap>
          {category._count?.children ? (
            <Tag color="purple">{category._count.children} sub-categories</Tag>
          ) : null}
          {category._count?.products ? (
            <Tag color="geekblue">{category._count.products} products</Tag>
          ) : null}
          {!category._count?.children && !category._count?.products ? (
            <Text type="secondary">{EM_DASH}</Text>
          ) : null}
        </Space>
      ),
    },
    {
      title: 'Display Order',
      dataIndex: 'displayOrder',
      key: 'displayOrder',
      width: 110,
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
      width: 180,
      fixed: 'right',
      render: (_, category) => (
        <Space size={4}>
          {!category.parentId && (
            <Can do="CATEGORY_CREATE">
              <Tooltip title="Add Sub-Category under this parent">
                <Button
                  type="text"
                  icon={<PlusOutlined style={{ color: '#1677ff' }} />}
                  onClick={() => handleOpenAddSub(category.id)}
                />
              </Tooltip>
            </Can>
          )}

          <Can do="CATEGORY_MANAGE">
            <Tooltip title="Edit Category">
              <Button
                type="text"
                icon={<EditOutlined />}
                onClick={() => handleOpenEdit(category)}
              />
            </Tooltip>
          </Can>

          <Can do="CATEGORY_MANAGE">
            <Popconfirm
              title="Delete Category"
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
        title="Category & Sub-Category Manager"
        subtitle="Super Admin Commerce Taxonomy: Organize main categories, sub-categories, storefront menu icons, and display ordering."
        actions={
          <Space>
            <Can do="CATEGORY_CREATE">
              <Button
                icon={<SubnodeOutlined />}
                onClick={() => handleOpenAddSub()}
              >
                + Add Sub-Category
              </Button>
            </Can>
            <Can do="CATEGORY_CREATE">
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleOpenAddMain}
              >
                + Add Main Category
              </Button>
            </Can>
          </Space>
        }
      />

      {/* Summary Widgets */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Total Taxonomy Nodes"
              value={metrics.total}
              prefix={<AppstoreOutlined style={{ color: '#1677ff' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Main Parent Categories"
              value={metrics.mainCount}
              prefix={<FolderOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Sub-Categories"
              value={metrics.subCount}
              prefix={<SubnodeOutlined style={{ color: '#fa8c16' }} />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Visible on Storefront"
              value={metrics.activeCount}
              prefix={<TagOutlined style={{ color: '#722ed1' }} />}
            />
          </Card>
        </Col>
      </Row>

      {/* Main Content & Tabs */}
      <Card bodyStyle={{ padding: 16 }} style={{ borderRadius: 8 }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Row gutter={[12, 12]} align="middle" justify="space-between">
            <Col xs={24} md={12}>
              <Tabs
                activeKey={activeTab}
                onChange={(key) => setActiveTab(key as any)}
                items={[
                  { key: 'all', label: `All Categories (${metrics.total})` },
                  { key: 'main', label: `Main Categories (${metrics.mainCount})` },
                  { key: 'sub', label: `Sub-Categories (${metrics.subCount})` },
                ]}
              />
            </Col>

            <Col xs={24} md={12}>
              <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                <Input
                  placeholder="Search categories..."
                  prefix={<SearchOutlined />}
                  allowClear
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ width: 220 }}
                />
                <Select
                  value={statusFilter}
                  onChange={(val) => setStatusFilter(val)}
                  options={[
                    { value: 'all', label: 'All Statuses' },
                    { value: 'active', label: 'Visible Only' },
                    { value: 'hidden', label: 'Hidden Only' },
                  ]}
                  style={{ width: 140 }}
                />
              </Space>
            </Col>
          </Row>

          <Table<Category>
            columns={columns}
            dataSource={filteredRows}
            rowKey="id"
            loading={categoriesQuery.isLoading}
            pagination={{ pageSize: 12, showSizeChanger: true }}
            size="middle"
            scroll={{ x: 800 }}
          />
        </Space>
      </Card>

      {/* Category & Sub-Category Form Modal */}
      <CategoryFormModal
        open={formOpen}
        category={editingCategory}
        defaultParentId={defaultParentId}
        onClose={() => setFormOpen(false)}
      />
    </Space>
  );
}
