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
    id: 'cat-1',
    name: 'Staples & Grains',
    slug: 'staples-grains',
    description: 'Farm-fresh unpolished dals, premium basmati rice, whole wheat flour, and coarse grains.',
    imageUrl: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&q=80&w=200',
    displayOrder: 1,
    isActive: true,
    parentId: null,
    _count: { children: 3, products: 85 },
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-09-15T12:00:00.000Z',
  },
  {
    id: 'cat-2',
    name: 'Edible Oils & Ghee',
    slug: 'edible-oils-ghee',
    description: 'Cold-pressed wooden kolhu oils, A2 bilona cow ghee, and refined cooking oils.',
    imageUrl: 'https://images.unsplash.com/photo-1589927986076-2d5f07d5c181?auto=format&fit=crop&q=80&w=200',
    displayOrder: 2,
    isActive: true,
    parentId: null,
    _count: { children: 2, products: 42 },
    createdAt: '2026-08-02T10:00:00.000Z',
    updatedAt: '2026-09-15T12:00:00.000Z',
  },
  {
    id: 'cat-3',
    name: 'Spices & Seasonings',
    slug: 'spices-seasonings',
    description: 'Single-origin high curcumin Lakadong turmeric, unadulterated whole spices & ground masalas.',
    imageUrl: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?auto=format&fit=crop&q=80&w=200',
    displayOrder: 3,
    isActive: true,
    parentId: null,
    _count: { children: 2, products: 68 },
    createdAt: '2026-08-03T10:00:00.000Z',
    updatedAt: '2026-09-15T12:00:00.000Z',
  },
  {
    id: 'cat-4',
    name: 'Organic Dry Fruits & Nuts',
    slug: 'dry-fruits-nuts',
    description: 'Bihar Phool Makhana, jumbo Cashews, Afghan Almonds, and Organic Dates.',
    imageUrl: 'https://images.unsplash.com/photo-1599599810769-bcde5a160d32?auto=format&fit=crop&q=80&w=200',
    displayOrder: 4,
    isActive: true,
    parentId: null,
    _count: { children: 1, products: 30 },
    createdAt: '2026-08-04T10:00:00.000Z',
    updatedAt: '2026-09-15T12:00:00.000Z',
  },
  {
    id: 'cat-5',
    name: 'Beverages & Herbal Teas',
    slug: 'beverages-tea',
    description: 'Assam CTC whole leaf tea, organic tulsi green tea, and filter coffee blends.',
    imageUrl: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&q=80&w=200',
    displayOrder: 5,
    isActive: true,
    parentId: null,
    _count: { children: 1, products: 24 },
    createdAt: '2026-08-05T10:00:00.000Z',
    updatedAt: '2026-09-15T12:00:00.000Z',
  },

  // --- Sub Categories ---
  {
    id: 'subcat-101',
    name: 'Basmati & Regional Rice',
    slug: 'basmati-rice',
    description: 'Aged 1121, 1509 Basmati, Sonam, Sona Masoori, and Black Rice.',
    imageUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&q=80&w=200',
    displayOrder: 1,
    isActive: true,
    parentId: 'cat-1',
    parent: { id: 'cat-1', name: 'Staples & Grains' },
    _count: { children: 0, products: 24 },
    createdAt: '2026-08-06T10:00:00.000Z',
    updatedAt: '2026-09-15T12:00:00.000Z',
  },
  {
    id: 'subcat-102',
    name: 'Whole Wheat & Atta',
    slug: 'whole-wheat-atta',
    description: 'MP Sharbati, Lokwan wheat flour, multi-grain atta, and chakki fresh atta.',
    imageUrl: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&q=80&w=200',
    displayOrder: 2,
    isActive: true,
    parentId: 'cat-1',
    parent: { id: 'cat-1', name: 'Staples & Grains' },
    _count: { children: 0, products: 18 },
    createdAt: '2026-08-07T10:00:00.000Z',
    updatedAt: '2026-09-15T12:00:00.000Z',
  },
  {
    id: 'subcat-103',
    name: 'Pulses & Lentils (Dals)',
    slug: 'pulses-lentils',
    description: 'Unpolished Toor Dal, Chana Dal, Moong Chilka, Urad Sabut, and Rajma.',
    imageUrl: 'https://images.unsplash.com/photo-1515543237350-b3eea1ec8082?auto=format&fit=crop&q=80&w=200',
    displayOrder: 3,
    isActive: true,
    parentId: 'cat-1',
    parent: { id: 'cat-1', name: 'Staples & Grains' },
    _count: { children: 0, products: 32 },
    createdAt: '2026-08-08T10:00:00.000Z',
    updatedAt: '2026-09-15T12:00:00.000Z',
  },
  {
    id: 'subcat-201',
    name: 'Cold-Pressed Oils',
    slug: 'cold-pressed-oils',
    description: 'Kachi Ghani Mustard Oil, Groundnut Oil, Sesame Til Oil, and Virgin Coconut Oil.',
    imageUrl: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&q=80&w=200',
    displayOrder: 1,
    isActive: true,
    parentId: 'cat-2',
    parent: { id: 'cat-2', name: 'Edible Oils & Ghee' },
    _count: { children: 0, products: 15 },
    createdAt: '2026-08-09T10:00:00.000Z',
    updatedAt: '2026-09-15T12:00:00.000Z',
  },
  {
    id: 'subcat-202',
    name: 'Desi Cow Ghee',
    slug: 'desi-cow-ghee',
    description: 'A2 Gir Cow Ghee, Vedic Bilona Ghee, Buffalo Ghee.',
    imageUrl: 'https://images.unsplash.com/photo-1589927986076-2d5f07d5c181?auto=format&fit=crop&q=80&w=200',
    displayOrder: 2,
    isActive: true,
    parentId: 'cat-2',
    parent: { id: 'cat-2', name: 'Edible Oils & Ghee' },
    _count: { children: 0, products: 12 },
    createdAt: '2026-08-10T10:00:00.000Z',
    updatedAt: '2026-09-15T12:00:00.000Z',
  },
  {
    id: 'subcat-301',
    name: 'Whole Spices (Khada Masala)',
    slug: 'whole-spices',
    description: 'Black Pepper, Green Cardamom, Cumin (Jeera), Clove, Cinnamon.',
    imageUrl: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&q=80&w=200',
    displayOrder: 1,
    isActive: true,
    parentId: 'cat-3',
    parent: { id: 'cat-3', name: 'Spices & Seasonings' },
    _count: { children: 0, products: 35 },
    createdAt: '2026-08-11T10:00:00.000Z',
    updatedAt: '2026-09-15T12:00:00.000Z',
  },
  {
    id: 'subcat-302',
    name: 'Ground Pure Spices',
    slug: 'ground-spices',
    description: 'Lakadong Turmeric, Kashmiri Mirch, Coriander (Dhania) Powder, Garam Masala.',
    imageUrl: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?auto=format&fit=crop&q=80&w=200',
    displayOrder: 2,
    isActive: true,
    parentId: 'cat-3',
    parent: { id: 'cat-3', name: 'Spices & Seasonings' },
    _count: { children: 0, products: 28 },
    createdAt: '2026-08-12T10:00:00.000Z',
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
