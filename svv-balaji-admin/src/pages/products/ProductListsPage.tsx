import {
  AppstoreOutlined,
  BarcodeOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  PictureOutlined,
  PlusOutlined,
  SearchOutlined,
  ShoppingOutlined,
  StopOutlined,
  TagOutlined,
  WarningOutlined,
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
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiErrorMessage } from '../../api/client';
import type { Product } from '../../api/types';
import { Can } from '../../components/Can';
import { PageHeader } from '../../components/PageHeader';
import { CategorySelect } from '../../components/pickers';
import {
  useDeleteProduct,
  useProducts,
  useProductStockSummary,
  useSetProductActive,
  useUpdateProduct,
} from '../../hooks/useProduction';
import { EM_DASH, formatCurrency } from '../../utils/format';

const { Text } = Typography;

/**
 * Super Admin's catalogue hub: every product the storefront can show, with the
 * two prices a shopper and a retailer see, where it is filed, and its real
 * stock position.
 *
 * Everything here is live data. It used to fall back to eight placeholder rows
 * when the catalogue was empty and let an operator "adjust stock" into local
 * component state - so the screen could show figures that existed nowhere. Stock
 * is counted from finished-goods batches and is not typed in, so it is only
 * displayed here.
 */
export function ProductListsPage() {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined);
  const [storefrontFilter, setStorefrontFilter] = useState<'all' | 'storefront' | 'draft'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'discontinued'>('active');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'in_stock'>('all');

  const productsQuery = useProducts(true);
  const stockSummaryQuery = useProductStockSummary();
  const setActiveMutation = useSetProductActive();
  const deleteMutation = useDeleteProduct();
  const updateProductMutation = useUpdateProduct();

  const allProducts = useMemo(() => productsQuery.data?.data ?? [], [productsQuery.data]);
  const stockById = useMemo(
    () => new Map((stockSummaryQuery.data ?? []).map((s) => [s.productId, s])),
    [stockSummaryQuery.data],
  );

  const metrics = useMemo(
    () => ({
      total: allProducts.length,
      storefrontCount: allProducts.filter((p) => p.showOnStorefront).length,
      activeCount: allProducts.filter((p) => p.isActive).length,
      lowStockCount: allProducts.filter((p) => {
        const status = stockById.get(p.id)?.status;
        return status === 'LOW' || status === 'CRITICAL';
      }).length,
    }),
    [allProducts, stockById],
  );

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return allProducts.filter((p) => {
      if (query && !p.name.toLowerCase().includes(query) && !p.sku.toLowerCase().includes(query)) return false;

      // A main category matches its subcategories' products too - the same rule
      // the storefront applies, so the filter shows what a shopper would see.
      if (selectedCategory && p.categoryId !== selectedCategory && p.category?.parent?.id !== selectedCategory) {
        return false;
      }

      if (storefrontFilter === 'storefront' && !p.showOnStorefront) return false;
      if (storefrontFilter === 'draft' && p.showOnStorefront) return false;
      if (statusFilter === 'active' && !p.isActive) return false;
      if (statusFilter === 'discontinued' && p.isActive) return false;

      const stock = stockById.get(p.id);
      if (stockFilter === 'low' && !(stock?.status === 'LOW' || stock?.status === 'CRITICAL')) return false;
      if (stockFilter === 'in_stock' && !((stock?.availableQuantity ?? 0) > 0)) return false;
      return true;
    });
  }, [allProducts, searchQuery, selectedCategory, storefrontFilter, statusFilter, stockFilter, stockById]);

  const handleToggleStorefront = async (product: Product, checked: boolean) => {
    try {
      await updateProductMutation.mutateAsync({ id: product.id, input: { showOnStorefront: checked } });
      message.success(`“${product.name}” is now ${checked ? 'published' : 'a draft'}`);
    } catch (err) {
      message.error(apiErrorMessage(err, 'Could not update storefront status'));
    }
  };

  const handleToggleActive = async (product: Product, active: boolean) => {
    try {
      await setActiveMutation.mutateAsync({ id: product.id, isActive: active });
      message.success(`“${product.name}” is now ${active ? 'active' : 'discontinued'}`);
    } catch (err) {
      message.error(apiErrorMessage(err, 'Could not update product status'));
    }
  };

  const handleDelete = async (product: Product) => {
    try {
      await deleteMutation.mutateAsync(product.id);
      message.success(`“${product.name}” deleted`);
    } catch (err) {
      // The server names what is blocking it (price rules, batches, orders), which is the whole point of the message.
      message.error(apiErrorMessage(err, 'Could not delete product'));
    }
  };

  const columns: ColumnsType<Product> = [
    {
      title: 'Product & SKU',
      key: 'product',
      width: 300,
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (_, record) => {
        const image = record.images?.[0];
        return (
          <Space align="start" size={12}>
            <Avatar
              shape="square"
              size={48}
              src={image}
              icon={!image ? <PictureOutlined /> : undefined}
              style={{ backgroundColor: '#f5f5f5', color: '#8c8c8c' }}
            />
            <Space direction="vertical" size={2}>
              <Text strong type={record.isActive ? undefined : 'secondary'}>
                {record.name}
              </Text>
              <Space size={4} wrap>
                <Tag color="cyan" style={{ fontSize: 11, margin: 0 }}>
                  <BarcodeOutlined /> {record.sku}
                </Tag>
                {record.packLabel ? <Tag style={{ fontSize: 11, margin: 0 }}>{record.packLabel}</Tag> : null}
                {record._count?.variants ? (
                  <Tag color="purple" style={{ fontSize: 11, margin: 0 }}>
                    +{record._count.variants} pack size{record._count.variants > 1 ? 's' : ''}
                  </Tag>
                ) : null}
              </Space>
            </Space>
          </Space>
        );
      },
    },
    {
      title: 'Category',
      key: 'category',
      width: 170,
      render: (_, record) => {
        if (!record.category) return <Tag color="warning">Uncategorised</Tag>;
        const { parent, name } = record.category;
        return parent ? (
          <Space direction="vertical" size={0}>
            <Text type="secondary" style={{ fontSize: 12 }}>{parent.name}</Text>
            <Text>{name}</Text>
          </Space>
        ) : (
          <Text>{name}</Text>
        );
      },
    },
    {
      title: 'Consumer price',
      key: 'b2c',
      width: 130,
      render: (_, r) =>
        r.b2cPrice != null ? (
          <Tooltip title="Excluding GST">{formatCurrency(r.b2cPrice)}</Tooltip>
        ) : (
          <Text type="secondary">{EM_DASH}</Text>
        ),
    },
    {
      title: 'Wholesale from',
      key: 'b2b',
      width: 130,
      render: (_, r) =>
        r.b2bPrice != null ? (
          <Tooltip title="Lowest quantity tier, excluding GST">{formatCurrency(r.b2bPrice)}</Tooltip>
        ) : (
          <Text type="secondary">{EM_DASH}</Text>
        ),
    },
    {
      title: 'Stock',
      key: 'stock',
      width: 170,
      sorter: (a, b) => (stockById.get(a.id)?.availableQuantity ?? 0) - (stockById.get(b.id)?.availableQuantity ?? 0),
      render: (_, record) => {
        const stock = stockById.get(record.id);
        // A discontinued product is not in the summary at all - say so rather than show "0".
        if (!stock) return <Text type="secondary">{EM_DASH}</Text>;
        return (
          <Space direction="vertical" size={2}>
            <Text strong>
              {stock.availableQuantity} {record.unit}
            </Text>
            <Space size={4}>
              <Tag
                color={stock.status === 'OK' ? 'success' : stock.status === 'LOW' ? 'warning' : 'error'}
                style={{ fontSize: 10, margin: 0 }}
              >
                {stock.status}
              </Tag>
              {record.allowBackorder ? (
                <Tag style={{ fontSize: 10, margin: 0 }}>Backorder OK</Tag>
              ) : null}
            </Space>
          </Space>
        );
      },
    },
    {
      title: 'Storefront',
      key: 'showOnStorefront',
      width: 110,
      render: (_, record) => (
        <Can do="PRODUCT_MANAGE" fallback={<Tag>{record.showOnStorefront ? 'Live' : 'Hidden'}</Tag>}>
          <Switch
            checked={record.showOnStorefront}
            onChange={(checked) => handleToggleStorefront(record, checked)}
            checkedChildren="Live"
            unCheckedChildren="Hidden"
            size="small"
          />
        </Can>
      ),
    },
    {
      title: 'Status',
      key: 'isActive',
      width: 120,
      render: (_, record) =>
        record.isActive ? <Badge status="success" text="Active" /> : <Badge status="error" text="Discontinued" />,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 130,
      fixed: 'right',
      render: (_, record) => (
        <Space size={2}>
          <Can do="PRODUCT_MANAGE">
            <Tooltip title="Edit product">
              <Button type="text" icon={<EditOutlined />} onClick={() => navigate(`/products/edit/${record.id}`)} />
            </Tooltip>
            <Tooltip title={record.isActive ? 'Discontinue' : 'Reactivate'}>
              <Button
                type="text"
                icon={
                  record.isActive ? (
                    <StopOutlined style={{ color: '#fa8c16' }} />
                  ) : (
                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                  )
                }
                onClick={() => handleToggleActive(record, !record.isActive)}
              />
            </Tooltip>
          </Can>
          <Can do="PRODUCT_DELETE">
            <Popconfirm
              title="Delete product"
              description={`Delete “${record.name}”? This only works while nothing references it — otherwise discontinue it.`}
              onConfirm={() => handleDelete(record)}
              okText="Delete"
              okButtonProps={{ danger: true }}
            >
              <Tooltip title="Delete">
                <Button danger type="text" icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          </Can>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="Product List & Catalog Editor"
        subtitle="Everything shoppers and retailers see is managed here: details, prices, pack sizes, category placement and publishing."
        actions={
          <Can do="PRODUCT_CREATE">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/add-product')} size="large">
              Add New Product
            </Button>
          </Can>
        }
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic title="Total products" value={metrics.total} prefix={<AppstoreOutlined style={{ color: '#1677ff' }} />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Published on storefront"
              value={metrics.storefrontCount}
              prefix={<ShoppingOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic title="Active" value={metrics.activeCount} prefix={<TagOutlined style={{ color: '#fa8c16' }} />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Low / critical stock"
              value={metrics.lowStockCount}
              prefix={<WarningOutlined style={{ color: '#ff4d4f' }} />}
              valueStyle={{ color: metrics.lowStockCount > 0 ? '#ff4d4f' : undefined }}
            />
          </Card>
        </Col>
      </Row>

      <Card bodyStyle={{ padding: 16 }} style={{ borderRadius: 8 }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Row gutter={[12, 12]} align="middle">
            <Col xs={24} md={7}>
              <Input
                placeholder="Search by name or SKU…"
                prefix={<SearchOutlined />}
                allowClear
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </Col>
            <Col xs={12} md={5}>
              <CategorySelect
                allowClear
                placeholder="Filter by category"
                value={selectedCategory}
                onChange={(cat) => setSelectedCategory(cat)}
              />
            </Col>
            <Col xs={12} md={4}>
              <Select
                style={{ width: '100%' }}
                value={stockFilter}
                onChange={setStockFilter}
                options={[
                  { value: 'all', label: 'All stock levels' },
                  { value: 'low', label: 'Low / critical' },
                  { value: 'in_stock', label: 'In stock only' },
                ]}
              />
            </Col>
            <Col xs={12} md={4}>
              <Select
                style={{ width: '100%' }}
                value={storefrontFilter}
                onChange={setStorefrontFilter}
                options={[
                  { value: 'all', label: 'Live & draft' },
                  { value: 'storefront', label: 'Live on storefront' },
                  { value: 'draft', label: 'Hidden / draft' },
                ]}
              />
            </Col>
            <Col xs={12} md={4}>
              <Select
                style={{ width: '100%' }}
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'discontinued', label: 'Discontinued' },
                  { value: 'all', label: 'All statuses' },
                ]}
              />
            </Col>
          </Row>

          <Table<Product>
            columns={columns}
            dataSource={filteredRows}
            rowKey="id"
            loading={productsQuery.isLoading}
            pagination={{ pageSize: 10, showSizeChanger: true }}
            size="middle"
            scroll={{ x: 1150 }}
            locale={{
              emptyText: productsQuery.isError
                ? apiErrorMessage(productsQuery.error, 'Could not load products')
                : 'No products match. Use “Add New Product” to create one.',
            }}
          />
        </Space>
      </Card>
    </Space>
  );
}
