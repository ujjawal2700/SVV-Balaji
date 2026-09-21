import {
  FolderOutlined,
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

const { Text } = Typography;

/**
 * Super Admin Dedicated Main Categories Page
 */
export const MOCK_CATEGORIES: Category[] = [
  // --- Main Parent Categories ---
  {
    id: 'cat-atta-flour',
    name: 'Atta & Flour',
    slug: 'atta-flour',
    description: 'Fresh chakki atta, premium maida, pure besan and grain flours.',
    imageUrl: '/images/cat_atta_flour.jpg',
    displayOrder: 1,
    isActive: true,
    parentId: null,
    _count: { children: 3, products: 45 },
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-09-15T12:00:00.000Z',
  },
  {
    id: 'cat-namkeen',
    name: 'Namkeen',
    slug: 'namkeen',
    description: 'Crispy, savory traditional namkeens, bhujia, and sev.',
    imageUrl: '/images/cat_namkeen.jpg',
    displayOrder: 2,
    isActive: true,
    parentId: null,
    _count: { children: 3, products: 38 },
    createdAt: '2026-08-02T10:00:00.000Z',
    updatedAt: '2026-09-15T12:00:00.000Z',
  },
  {
    id: 'cat-wafers',
    name: 'Wafers',
    slug: 'wafers',
    description: 'Light, crunchy potato, banana and tortilla chips.',
    imageUrl: '/images/cat_wafers.jpg',
    displayOrder: 3,
    isActive: true,
    parentId: null,
    _count: { children: 3, products: 22 },
    createdAt: '2026-08-03T10:00:00.000Z',
    updatedAt: '2026-09-15T12:00:00.000Z',
  },
  {
    id: 'cat-spices',
    name: 'Spices',
    slug: 'spices',
    description: 'Pure, aromatic whole spices, ground powders, and blended masalas.',
    imageUrl: '/images/cat_spices.jpg',
    displayOrder: 4,
    isActive: true,
    parentId: null,
    _count: { children: 3, products: 50 },
    createdAt: '2026-08-04T10:00:00.000Z',
    updatedAt: '2026-09-15T12:00:00.000Z',
  },

  // --- Sub Categories ---
  {
    id: 'subcat-chakki-atta',
    name: 'Chakki Atta',
    slug: 'chakki-atta',
    description: 'Fresh stone-ground chakki wheat atta.',
    imageUrl: '/images/premium_atta.jpg',
    displayOrder: 1,
    isActive: true,
    parentId: 'cat-atta-flour',
    parent: { id: 'cat-atta-flour', name: 'Atta & Flour' },
    _count: { children: 0, products: 20 },
    createdAt: '2026-08-05T10:00:00.000Z',
    updatedAt: '2026-09-15T12:00:00.000Z',
  },
  {
    id: 'subcat-maida',
    name: 'Maida',
    slug: 'maida',
    description: 'Refined wheat flour for baking and cooking.',
    imageUrl: '/images/cat_atta_flour.jpg',
    displayOrder: 2,
    isActive: true,
    parentId: 'cat-atta-flour',
    parent: { id: 'cat-atta-flour', name: 'Atta & Flour' },
    _count: { children: 0, products: 12 },
    createdAt: '2026-08-06T10:00:00.000Z',
    updatedAt: '2026-09-15T12:00:00.000Z',
  },
  {
    id: 'subcat-besan',
    name: 'Besan',
    slug: 'besan',
    description: 'Pure unadulterated gram flour.',
    imageUrl: '/images/cat_spices.jpg',
    displayOrder: 3,
    isActive: true,
    parentId: 'cat-atta-flour',
    parent: { id: 'cat-atta-flour', name: 'Atta & Flour' },
    _count: { children: 0, products: 13 },
    createdAt: '2026-08-07T10:00:00.000Z',
    updatedAt: '2026-09-15T12:00:00.000Z',
  },
  {
    id: 'subcat-bhujia',
    name: 'Bhujia',
    slug: 'bhujia',
    description: 'Spicy crispy Bikaneri and aloo bhujia.',
    imageUrl: '/images/aloo_bhujia.jpg',
    displayOrder: 1,
    isActive: true,
    parentId: 'cat-namkeen',
    parent: { id: 'cat-namkeen', name: 'Namkeen' },
    _count: { children: 0, products: 15 },
    createdAt: '2026-08-08T10:00:00.000Z',
    updatedAt: '2026-09-15T12:00:00.000Z',
  },
  {
    id: 'subcat-mixtures',
    name: 'Mixtures',
    slug: 'mixtures',
    description: 'Crunchy traditional mixed farsan.',
    imageUrl: '/images/classic_namkeen.jpg',
    displayOrder: 2,
    isActive: true,
    parentId: 'cat-namkeen',
    parent: { id: 'cat-namkeen', name: 'Namkeen' },
    _count: { children: 0, products: 11 },
    createdAt: '2026-08-09T10:00:00.000Z',
    updatedAt: '2026-09-15T12:00:00.000Z',
  },
  {
    id: 'subcat-sev',
    name: 'Sev & Gathiya',
    slug: 'sev',
    description: 'Traditional Gujarati and Rajasthani sev & gathiya.',
    imageUrl: '/images/cat_namkeen.jpg',
    displayOrder: 3,
    isActive: true,
    parentId: 'cat-namkeen',
    parent: { id: 'cat-namkeen', name: 'Namkeen' },
    _count: { children: 0, products: 12 },
    createdAt: '2026-08-10T10:00:00.000Z',
    updatedAt: '2026-09-15T12:00:00.000Z',
  },
  {
    id: 'subcat-potato-chips',
    name: 'Potato Chips',
    slug: 'potato-chips',
    description: 'Crispy salted and masala potato chips.',
    imageUrl: '/images/cat_wafers.jpg',
    displayOrder: 1,
    isActive: true,
    parentId: 'cat-wafers',
    parent: { id: 'cat-wafers', name: 'Wafers' },
    _count: { children: 0, products: 8 },
    createdAt: '2026-08-11T10:00:00.000Z',
    updatedAt: '2026-09-15T12:00:00.000Z',
  },
  {
    id: 'subcat-banana-chips',
    name: 'Banana Chips',
    slug: 'banana-chips',
    description: 'Kerala style crispy banana wafers in pure oil.',
    imageUrl: '/images/cat_wafers.jpg',
    displayOrder: 2,
    isActive: true,
    parentId: 'cat-wafers',
    parent: { id: 'cat-wafers', name: 'Wafers' },
    _count: { children: 0, products: 7 },
    createdAt: '2026-08-12T10:00:00.000Z',
    updatedAt: '2026-09-15T12:00:00.000Z',
  },
  {
    id: 'subcat-tortilla',
    name: 'Tortilla Chips',
    slug: 'tortilla',
    description: 'Corn tortilla chips for nachos and dips.',
    imageUrl: '/images/tonys_chips.jpg',
    displayOrder: 3,
    isActive: true,
    parentId: 'cat-wafers',
    parent: { id: 'cat-wafers', name: 'Wafers' },
    _count: { children: 0, products: 7 },
    createdAt: '2026-08-13T10:00:00.000Z',
    updatedAt: '2026-09-15T12:00:00.000Z',
  },
  {
    id: 'subcat-whole-spices',
    name: 'Whole Spices',
    slug: 'whole-spices',
    description: 'Khada masala: black pepper, cardamom, cloves, cinnamon.',
    imageUrl: '/images/cat_spices.jpg',
    displayOrder: 1,
    isActive: true,
    parentId: 'cat-spices',
    parent: { id: 'cat-spices', name: 'Spices' },
    _count: { children: 0, products: 20 },
    createdAt: '2026-08-14T10:00:00.000Z',
    updatedAt: '2026-09-15T12:00:00.000Z',
  },
  {
    id: 'subcat-powdered-spices',
    name: 'Powdered Spices',
    slug: 'powdered-spices',
    description: 'Turmeric, red chilli powder, coriander powder, cumin powder.',
    imageUrl: '/images/cat_spices.jpg',
    displayOrder: 2,
    isActive: true,
    parentId: 'cat-spices',
    parent: { id: 'cat-spices', name: 'Spices' },
    _count: { children: 0, products: 18 },
    createdAt: '2026-08-15T10:00:00.000Z',
    updatedAt: '2026-09-15T12:00:00.000Z',
  },
  {
    id: 'subcat-blended-spices',
    name: 'Blended Masalas',
    slug: 'blended-spices',
    description: 'Garam masala, kitchen king, chaat masala and special blends.',
    imageUrl: '/images/cat_spices.jpg',
    displayOrder: 3,
    isActive: true,
    parentId: 'cat-spices',
    parent: { id: 'cat-spices', name: 'Spices' },
    _count: { children: 0, products: 12 },
    createdAt: '2026-08-16T10:00:00.000Z',
    updatedAt: '2026-09-15T12:00:00.000Z',
  },
];

export function MainCategoriesPage() {
  const { message, modal } = AntApp.useApp();
  const [formOpen, setFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [defaultParentId, setDefaultParentId] = useState<string | null>(null);

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'hidden'>('all');

  const categoriesQuery = useCategories(true);
  const setActiveMutation = useSetCategoryActive();
  const deleteMutation = useDeleteCategory();

  const rawCategories = useMemo(() => categoriesQuery.data?.data ?? [], [categoriesQuery.data]);
  const allCategories = useMemo(() => (rawCategories.length > 0 ? rawCategories : MOCK_CATEGORIES), [rawCategories]);

  // Main Categories only (no parentId)
  const mainCategories = useMemo(() => {
    return allCategories.filter((c) => !c.parentId);
  }, [allCategories]);

  // Metrics
  const metrics = useMemo(() => {
    const total = mainCategories.length;
    const activeCount = mainCategories.filter((c) => c.isActive).length;
    const hiddenCount = mainCategories.filter((c) => !c.isActive).length;
    return { total, activeCount, hiddenCount };
  }, [mainCategories]);

  const handleOpenAddMain = () => {
    setEditingCategory(null);
    setDefaultParentId(null);
    setFormOpen(true);
  };

  const handleOpenAddSub = (parentId: string) => {
    setEditingCategory(null);
    setDefaultParentId(parentId);
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
      message.success(`Main Category "${category.name}" is now ${isActive ? 'Visible' : 'Hidden'}`);
    } catch (err) {
      message.error(apiErrorMessage(err, 'Could not update category status'));
    }
  };

  const handleDelete = async (category: Category) => {
    try {
      await deleteMutation.mutateAsync(category.id);
      message.success(`Main Category "${category.name}" deleted successfully`);
    } catch (error) {
      modal.error({
        title: 'Could not delete category',
        content: apiErrorMessage(error, 'Ensure no sub-categories or products are linked first.'),
      });
    }
  };

  // Filtered rows
  const filteredRows = useMemo(() => {
    return mainCategories.filter((c) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!c.name.toLowerCase().includes(q) && !c.slug.toLowerCase().includes(q)) {
          return false;
        }
      }
      if (statusFilter === 'active' && !c.isActive) return false;
      if (statusFilter === 'hidden' && c.isActive) return false;
      return true;
    });
  }, [mainCategories, searchQuery, statusFilter]);

  const columns: ColumnsType<Category> = [
    {
      title: 'Main Category & Slug',
      key: 'name',
      width: 320,
      render: (_, category) => (
        <Space align="start" size={12}>
          <Avatar
            shape="square"
            size={40}
            src={category.imageUrl || undefined}
            icon={<FolderOutlined />}
            style={{ backgroundColor: '#f6ffed', color: '#52c41a' }}
          />
          <Space direction="vertical" size={0}>
            <Space size={6}>
              <Text strong type={category.isActive ? undefined : 'secondary'}>
                {category.name}
              </Text>
              <Tag color="green" style={{ fontSize: 10 }}>
                Main Category
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
      title: 'Sub-Categories & Products',
      key: 'counts',
      width: 220,
      render: (_, category) => (
        <Space size={6} wrap>
          {category._count?.children ? (
            <Tag color="purple">{category._count.children} Sub-categories</Tag>
          ) : (
            <Tag color="default">0 Sub-categories</Tag>
          )}
          {category._count?.products ? (
            <Tag color="geekblue">{category._count.products} Products</Tag>
          ) : null}
        </Space>
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
      width: 180,
      fixed: 'right',
      render: (_, category) => (
        <Space size={4}>
          <Can do="CATEGORY_CREATE">
            <Tooltip title="Add Sub-Category under this main category">
              <Button
                type="text"
                icon={<SubnodeOutlined style={{ color: '#1677ff' }} />}
                onClick={() => handleOpenAddSub(category.id)}
              />
            </Tooltip>
          </Can>

          <Can do="CATEGORY_MANAGE">
            <Tooltip title="Edit Main Category">
              <Button
                type="text"
                icon={<EditOutlined />}
                onClick={() => handleOpenEdit(category)}
              />
            </Tooltip>
          </Can>

          <Can do="CATEGORY_MANAGE">
            <Popconfirm
              title="Delete Main Category"
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
        title="Main Categories"
        subtitle="Manage primary top-level storefront categories and parent collection structure."
        actions={
          <Can do="CATEGORY_CREATE">
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleOpenAddMain}
              size="large"
            >
              Add Main Category
            </Button>
          </Can>
        }
      />

      {/* Summary Widgets */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Total Main Categories"
              value={metrics.total}
              prefix={<FolderOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a' }}
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
              title="Hidden Categories"
              value={metrics.hiddenCount}
              prefix={<FolderOpenOutlined style={{ color: '#fa8c16' }} />}
            />
          </Card>
        </Col>
      </Row>

      {/* Data Table */}
      <Card bodyStyle={{ padding: 16 }} style={{ borderRadius: 8 }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Row gutter={[12, 12]} align="middle" justify="space-between">
            <Col xs={24} md={10}>
              <Input
                placeholder="Search Main Categories..."
                prefix={<SearchOutlined />}
                allowClear
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </Col>

            <Col xs={24} md={6}>
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
        defaultParentId={defaultParentId}
        onClose={() => setFormOpen(false)}
      />
    </Space>
  );
}
