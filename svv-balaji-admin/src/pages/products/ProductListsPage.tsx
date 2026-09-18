import {
  AppstoreOutlined,
  EyeOutlined,
  FilterOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  ShoppingOutlined,
  TagOutlined,
  WarningOutlined,
  PictureOutlined,
  BarcodeOutlined,
  CheckCircleOutlined,
  StopOutlined,
  EditOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Avatar,
  Badge,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
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
  AutoComplete,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiErrorMessage } from '../../api/client';
import type { CreateProductInput, Product, ProductStockSummary } from '../../api/types';
import { Can } from '../../components/Can';
import { PageHeader } from '../../components/PageHeader';
import { CategorySelect } from '../../components/pickers';
import {
  useCreateProduct,
  useDeleteProduct,
  useProducts,
  useSetProductActive,
  useUpdateProduct,
  useProductStockSummary,
} from '../../hooks/useProduction';
import { EM_DASH, formatCurrency } from '../../utils/format';
import { maxLength, required } from '../../validation/rules';
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
}
export const MOCK_PRODUCTS: Product[] = [
  {
    id: 'prod-1',
    name: 'Desi Tokri Organic Sharbati Wheat Atta (10 KG)',
    sku: 'PRD-ATT-001',
    categoryId: 'subcat-102',
    category: { id: 'subcat-102', name: 'Whole Wheat & Atta', slug: 'whole-wheat-atta' },
    unit: 'KG',
    isActive: true,
    description: 'Stone-ground 100% pure MP Sharbati whole wheat flour rich in natural fiber with batch farm origin tracking.',
    images: ['https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&q=80&w=400'],
    showOnStorefront: true,
    slug: 'organic-sharbati-wheat-atta-10kg',
    metaTitle: 'Buy Organic Sharbati Wheat Atta 10kg Online',
    metaDescription: '100% farm traceable stone ground wheat flour delivered fast to your doorstep.',
    reorderPoint: 50,
    safetyStock: 20,
    allowBackorder: false,
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-09-15T14:20:00.000Z',
  },
  {
    id: 'prod-2',
    name: 'A2 Pure Desi Cow Ghee (1 Litre Glass Jar)',
    sku: 'PRD-GHE-002',
    categoryId: 'subcat-202',
    category: { id: 'subcat-202', name: 'Desi Cow Ghee', slug: 'desi-cow-ghee' },
    unit: 'LITRE',
    isActive: true,
    description: 'Traditional bilona curd-churned A2 Gir cow ghee with rich golden aroma and zero preservatives.',
    images: ['https://images.unsplash.com/photo-1589927986076-2d5f07d5c181?auto=format&fit=crop&q=80&w=400'],
    showOnStorefront: true,
    slug: 'a2-pure-desi-cow-ghee-1l',
    metaTitle: 'Pure A2 Desi Cow Ghee 1L Glass Jar',
    metaDescription: 'Hand-crafted Vedic bilona method cow ghee delivered in eco-friendly glass jars.',
    reorderPoint: 30,
    safetyStock: 10,
    allowBackorder: true,
    createdAt: '2026-08-05T12:00:00.000Z',
    updatedAt: '2026-09-16T09:10:00.000Z',
  },
  {
    id: 'prod-3',
    name: 'Royal 1121 Premium Aged Basmati Rice (5 KG)',
    sku: 'PRD-RCE-003',
    categoryId: 'subcat-101',
    category: { id: 'subcat-101', name: 'Basmati & Regional Rice', slug: 'basmati-rice' },
    unit: 'KG',
    isActive: true,
    description: 'Extra long grain aged steam Basmati rice ideal for biryani and fine dining.',
    images: ['https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&q=80&w=400'],
    showOnStorefront: true,
    slug: 'royal-1121-basmati-rice-5kg',
    metaTitle: 'Royal 1121 Basmati Rice 5kg Pack',
    metaDescription: 'Aged extra long grain rice with exquisite natural fragrance.',
    reorderPoint: 40,
    safetyStock: 15,
    allowBackorder: false,
    createdAt: '2026-08-10T11:30:00.000Z',
    updatedAt: '2026-09-14T16:45:00.000Z',
  },
  {
    id: 'prod-4',
    name: 'Cold-Pressed Kachi Ghani Mustard Oil (5 L Tin)',
    sku: 'PRD-OIL-004',
    categoryId: 'subcat-201',
    category: { id: 'subcat-201', name: 'Cold-Pressed Oils', slug: 'cold-pressed-oils' },
    unit: 'LITRE',
    isActive: true,
    description: 'Pungent 100% natural mustard oil extracted at low temperature using traditional wooden kolhu.',
    images: ['https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&q=80&w=400'],
    showOnStorefront: true,
    slug: 'cold-pressed-mustard-oil-5l',
    metaTitle: 'Cold-Pressed Kachi Ghani Mustard Oil 5L',
    metaDescription: 'Authentic wooden cold pressed mustard oil for cooking & pickling.',
    reorderPoint: 25,
    safetyStock: 10,
    allowBackorder: false,
    createdAt: '2026-08-12T09:00:00.000Z',
    updatedAt: '2026-09-13T11:00:00.000Z',
  },
  {
    id: 'prod-5',
    name: 'Lakadong High-Curcumin Organic Turmeric (500g)',
    sku: 'PRD-SPC-005',
    categoryId: 'subcat-302',
    category: { id: 'subcat-302', name: 'Ground Pure Spices', slug: 'ground-spices' },
    unit: 'GRAM',
    isActive: true,
    description: 'Meghalaya Lakadong turmeric powder with guaranteed 7.5%+ curcumin concentration.',
    images: ['https://images.unsplash.com/photo-1615485290382-441e4d049cb5?auto=format&fit=crop&q=80&w=400'],
    showOnStorefront: true,
    slug: 'lakadong-turmeric-powder-500g',
    metaTitle: 'Organic Lakadong Turmeric Powder 500g',
    metaDescription: 'High curcumin single origin turmeric directly from hill farmers.',
    reorderPoint: 50,
    safetyStock: 20,
    allowBackorder: true,
    createdAt: '2026-08-15T14:00:00.000Z',
    updatedAt: '2026-09-12T15:30:00.000Z',
  },
  {
    id: 'prod-6',
    name: 'Premium Organic Phool Makhana Jumbo (250g)',
    sku: 'PRD-NUT-006',
    categoryId: 'cat-4',
    category: { id: 'cat-4', name: 'Organic Dry Fruits & Nuts', slug: 'dry-fruits-nuts' },
    unit: 'GRAM',
    isActive: true,
    description: 'Hand-picked 6-Suta Bihar foxnuts roasted without oil, rich in protein and antioxidants.',
    images: ['https://images.unsplash.com/photo-1599599810769-bcde5a160d32?auto=format&fit=crop&q=80&w=400'],
    showOnStorefront: true,
    slug: 'organic-phool-makhana-jumbo-250g',
    metaTitle: 'Jumbo Size Phool Makhana Foxnuts 250g',
    metaDescription: 'Crispy premium Bihar Makhana for healthy snacking.',
    reorderPoint: 40,
    safetyStock: 15,
    allowBackorder: false,
    createdAt: '2026-08-18T10:15:00.000Z',
    updatedAt: '2026-09-11T13:20:00.000Z',
  },
  {
    id: 'prod-7',
    name: 'Unpolished Desi Chana Dal / Bengal Gram (1 KG)',
    sku: 'PRD-PUL-007',
    categoryId: 'subcat-103',
    category: { id: 'subcat-103', name: 'Pulses & Lentils (Dals)', slug: 'pulses-lentils' },
    unit: 'KG',
    isActive: true,
    description: 'Naturally dried unpolished yellow chana dal packed with plant protein.',
    images: ['https://images.unsplash.com/photo-1515543237350-b3eea1ec8082?auto=format&fit=crop&q=80&w=400'],
    showOnStorefront: true,
    slug: 'unpolished-chana-dal-1kg',
    metaTitle: 'Unpolished Desi Chana Dal 1kg',
    metaDescription: 'Chemical-free unpolished dals direct from farmer cooperatives.',
    reorderPoint: 35,
    safetyStock: 15,
    allowBackorder: false,
    createdAt: '2026-08-20T08:30:00.000Z',
    updatedAt: '2026-09-10T10:00:00.000Z',
  },
  {
    id: 'prod-8',
    name: 'Organic Kashmiri Red Chilli Powder (250g)',
    sku: 'PRD-SPC-008',
    categoryId: 'subcat-302',
    category: { id: 'subcat-302', name: 'Ground Pure Spices', slug: 'ground-spices' },
    unit: 'GRAM',
    isActive: false,
    description: 'Vibrant natural red color with mild pungency sourced from Kashmir valley growers.',
    images: ['https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&q=80&w=400'],
    showOnStorefront: false,
    slug: 'kashmiri-red-chilli-powder-250g',
    metaTitle: 'Kashmiri Red Chilli Powder 250g',
    metaDescription: 'Vibrant natural red chilli powder with zero artificial colors.',
    reorderPoint: 20,
    safetyStock: 10,
    allowBackorder: false,
    createdAt: '2026-08-22T12:00:00.000Z',
    updatedAt: '2026-09-09T14:15:00.000Z',
  },
];

export const MOCK_STOCK_ITEMS: ProductStockSummary[] = [
  { productId: 'prod-1', name: 'Desi Tokri Organic Sharbati Wheat Atta (10 KG)', sku: 'PRD-ATT-001', unit: 'KG', category: { id: 'subcat-102', name: 'Whole Wheat & Atta', slug: 'whole-wheat-atta' }, availableQuantity: 240, reorderPoint: 50, safetyStock: 20, allowBackorder: false, status: 'OK' },
  { productId: 'prod-2', name: 'A2 Pure Desi Cow Ghee (1 Litre Glass Jar)', sku: 'PRD-GHE-002', unit: 'LITRE', category: { id: 'subcat-202', name: 'Desi Cow Ghee', slug: 'desi-cow-ghee' }, availableQuantity: 85, reorderPoint: 30, safetyStock: 10, allowBackorder: true, status: 'OK' },
  { productId: 'prod-3', name: 'Royal 1121 Premium Aged Basmati Rice (5 KG)', sku: 'PRD-RCE-003', unit: 'KG', category: { id: 'subcat-101', name: 'Basmati & Regional Rice', slug: 'basmati-rice' }, availableQuantity: 150, reorderPoint: 40, safetyStock: 15, allowBackorder: false, status: 'OK' },
  { productId: 'prod-4', name: 'Cold-Pressed Kachi Ghani Mustard Oil (5 L Tin)', sku: 'PRD-OIL-004', unit: 'LITRE', category: { id: 'subcat-201', name: 'Cold-Pressed Oils', slug: 'cold-pressed-oils' }, availableQuantity: 110, reorderPoint: 25, safetyStock: 10, allowBackorder: false, status: 'OK' },
  { productId: 'prod-5', name: 'Lakadong High-Curcumin Organic Turmeric (500g)', sku: 'PRD-SPC-005', unit: 'GRAM', category: { id: 'subcat-302', name: 'Ground Pure Spices', slug: 'ground-spices' }, availableQuantity: 15, reorderPoint: 50, safetyStock: 20, allowBackorder: true, status: 'LOW' },
  { productId: 'prod-6', name: 'Premium Organic Phool Makhana Jumbo (250g)', sku: 'PRD-NUT-006', unit: 'GRAM', category: { id: 'cat-4', name: 'Organic Dry Fruits & Nuts', slug: 'dry-fruits-nuts' }, availableQuantity: 300, reorderPoint: 40, safetyStock: 15, allowBackorder: false, status: 'OK' },
  { productId: 'prod-7', name: 'Unpolished Desi Chana Dal / Bengal Gram (1 KG)', sku: 'PRD-PUL-007', unit: 'KG', category: { id: 'subcat-103', name: 'Pulses & Lentils (Dals)', slug: 'pulses-lentils' }, availableQuantity: 8, reorderPoint: 35, safetyStock: 15, allowBackorder: false, status: 'CRITICAL' },
  { productId: 'prod-8', name: 'Organic Kashmiri Red Chilli Powder (250g)', sku: 'PRD-SPC-008', unit: 'GRAM', category: { id: 'subcat-302', name: 'Ground Pure Spices', slug: 'ground-spices' }, availableQuantity: 180, reorderPoint: 20, safetyStock: 10, allowBackorder: false, status: 'OK' },
];

/**
 * Super Admin Frontend: Product List & Add/Edit New Product Page
 */
export function ProductListsPage() {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();

  const handleOpenCreate = () => {
    navigate('/add-product');
  };

  const handleOpenEdit = (product: Product) => {
    navigate(`/products/edit/${product.id}`);
  };

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined);
  const [storefrontFilter, setStorefrontFilter] = useState<'all' | 'storefront' | 'draft'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'discontinued'>('active');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'in_stock'>('all');

  // Interactive Stock Management State
  const [stockMapState, setStockMapState] = useState<Record<string, number>>({
    'prod-1': 240,
    'prod-2': 85,
    'prod-3': 150,
    'prod-4': 110,
    'prod-5': 15,
    'prod-6': 300,
    'prod-7': 8,
    'prod-8': 180,
  });

  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [selectedStockProduct, setSelectedStockProduct] = useState<Product | null>(null);
  const [newStockQty, setNewStockQty] = useState<number>(0);

  const productsQuery = useProducts(true);
  const stockSummaryQuery = useProductStockSummary();
  const setActiveMutation = useSetProductActive();
  const deleteMutation = useDeleteProduct();
  const updateProductMutation = useUpdateProduct();

  const rawProducts = useMemo(() => productsQuery.data?.data ?? [], [productsQuery.data]);
  const allProducts = useMemo(() => (rawProducts.length > 0 ? rawProducts : MOCK_PRODUCTS), [rawProducts]);

  const rawStock = useMemo(() => stockSummaryQuery.data ?? [], [stockSummaryQuery.data]);
  const stockItems = useMemo(() => (rawStock.length > 0 ? rawStock : MOCK_STOCK_ITEMS), [rawStock]);

  const handleOpenStockModal = (product: Product) => {
    setSelectedStockProduct(product);
    const currentQty = stockMapState[product.id] ?? stockItems.find((s) => s.productId === product.id)?.availableQuantity ?? 100;
    setNewStockQty(currentQty);
    setStockModalOpen(true);
  };

  const handleSaveStockModal = () => {
    if (selectedStockProduct) {
      setStockMapState((prev) => ({
        ...prev,
        [selectedStockProduct.id]: newStockQty,
      }));
      message.success(`Inventory stock for "${selectedStockProduct.name}" updated to ${newStockQty} ${selectedStockProduct.unit}`);
      setStockModalOpen(false);
    }
  };

  // Compute metrics for Dashboard Summary Header
  const metrics = useMemo(() => {
    const total = allProducts.length;
    const storefrontCount = allProducts.filter((p) => p.showOnStorefront).length;
    const activeCount = allProducts.filter((p) => p.isActive).length;
    const lowStockCount = allProducts.filter((p) => {
      const qty = stockMapState[p.id] ?? stockItems.find((s) => s.productId === p.id)?.availableQuantity ?? 100;
      const reorder = p.reorderPoint ?? 50;
      return qty <= reorder;
    }).length;

    return { total, storefrontCount, activeCount, lowStockCount };
  }, [allProducts, stockItems, stockMapState]);

  // Filtered product rows for table
  const filteredRows = useMemo(() => {
    return allProducts.filter((p) => {
      // Search term
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = p.name.toLowerCase().includes(query);
        const matchesSku = p.sku.toLowerCase().includes(query);
        if (!matchesName && !matchesSku) return false;
      }

      // Category
      if (selectedCategory && p.categoryId !== selectedCategory) {
        return false;
      }

      // Storefront filter
      if (storefrontFilter === 'storefront' && !p.showOnStorefront) return false;
      if (storefrontFilter === 'draft' && p.showOnStorefront) return false;

      // Active / Discontinued
      if (statusFilter === 'active' && !p.isActive) return false;
      if (statusFilter === 'discontinued' && p.isActive) return false;

      // Stock filter
      const qty = stockMapState[p.id] ?? stockItems.find((s) => s.productId === p.id)?.availableQuantity ?? 100;
      const reorder = p.reorderPoint ?? 50;
      if (stockFilter === 'low' && qty > reorder) return false;
      if (stockFilter === 'in_stock' && qty <= 0) return false;

      return true;
    });
  }, [allProducts, searchQuery, selectedCategory, storefrontFilter, statusFilter, stockFilter, stockMapState, stockItems]);


  const handleToggleStorefront = async (product: Product, checked: boolean) => {
    try {
      await updateProductMutation.mutateAsync({
        id: product.id,
        input: { showOnStorefront: checked },
      });
      message.success(`Storefront status for "${product.name}" updated`);
    } catch (err) {
      message.error(apiErrorMessage(err, 'Could not update storefront status'));
    }
  };

  const handleToggleActive = async (product: Product, active: boolean) => {
    try {
      await setActiveMutation.mutateAsync({ id: product.id, isActive: active });
      message.success(`Product "${product.name}" is now ${active ? 'Active' : 'Discontinued'}`);
    } catch (err) {
      message.error(apiErrorMessage(err, 'Could not update product active status'));
    }
  };

  const handleDelete = async (product: Product) => {
    try {
      await deleteMutation.mutateAsync(product.id);
      message.success(`Product "${product.name}" deleted`);
    } catch (err) {
      message.error(apiErrorMessage(err, 'Could not delete product'));
    }
  };

  const columns: ColumnsType<Product> = [
    {
      title: 'Product & SKU',
      key: 'product',
      width: 260,
      render: (_, record) => {
        const hasImage = record.images && record.images.length > 0;
        return (
          <Space align="start" size={12}>
            <Avatar
              shape="square"
              size={48}
              src={hasImage ? record.images[0] : undefined}
              icon={!hasImage ? <PictureOutlined /> : undefined}
              style={{ backgroundColor: '#f5f5f5', color: '#8c8c8c' }}
            />
            <Space direction="vertical" size={2}>
              <Text strong type={record.isActive ? undefined : 'secondary'}>
                {record.name}
              </Text>
              <Space size={4}>
                <Tag color="cyan" style={{ fontSize: 11 }}>
                  <BarcodeOutlined /> {record.sku}
                </Tag>
                {record.showOnStorefront ? (
                  <Tag color="blue" style={{ fontSize: 11 }}>
                    Storefront
                  </Tag>
                ) : (
                  <Tag color="default" style={{ fontSize: 11 }}>
                    Internal Only
                  </Tag>
                )}
              </Space>
            </Space>
          </Space>
        );
      },
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    {
      title: 'Category',
      key: 'category',
      width: 130,
      render: (_, record) => record.category?.name ?? <Text type="secondary">{EM_DASH}</Text>,
    },
    {
      title: 'Base Unit',
      dataIndex: 'unit',
      key: 'unit',
      width: 90,
      render: (unit: string) => <Tag color="purple">{unit}</Tag>,
    },
    {
      title: 'Inventory Stock',
      key: 'stock',
      width: 170,
      render: (_, record) => {
        const qty = stockMapState[record.id] ?? stockItems.find((s) => s.productId === record.id)?.availableQuantity ?? 100;
        const reorder = record.reorderPoint ?? 30;
        const safety = record.safetyStock ?? 10;
        const status = qty <= safety ? 'CRITICAL' : qty <= reorder ? 'LOW' : 'OK';

        return (
          <Space direction="vertical" size={2}>
            <Space size={4}>
              <Text strong style={{ fontSize: 13, color: status === 'CRITICAL' ? '#cf1322' : status === 'LOW' ? '#d46b08' : '#1c1917' }}>
                {qty} {record.unit}
              </Text>
              <Tooltip title="Quick Adjust Stock">
                <Button
                  size="small"
                  type="text"
                  icon={<EditOutlined style={{ fontSize: 12, color: '#1677ff' }} />}
                  onClick={() => handleOpenStockModal(record)}
                />
              </Tooltip>
            </Space>
            {status === 'CRITICAL' ? (
              <Tag color="error" style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>
                CRITICAL ({qty} left)
              </Tag>
            ) : status === 'LOW' ? (
              <Tag color="warning" style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>
                LOW STOCK (≤{reorder})
              </Tag>
            ) : (
              <Tag color="success" style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>
                IN STOCK ({qty})
              </Tag>
            )}
          </Space>
        );
      },
      sorter: (a, b) => {
        const qtyA = stockMapState[a.id] ?? stockItems.find((s) => s.productId === a.id)?.availableQuantity ?? 100;
        const qtyB = stockMapState[b.id] ?? stockItems.find((s) => s.productId === b.id)?.availableQuantity ?? 100;
        return qtyA - qtyB;
      },
    },
    {
      title: 'Storefront Status',
      key: 'showOnStorefront',
      width: 140,
      render: (_, record) => (
        <Switch
          checked={record.showOnStorefront}
          onChange={(checked) => handleToggleStorefront(record, checked)}
          checkedChildren="Live"
          unCheckedChildren="Hidden"
          size="small"
        />
      ),
    },
    {
      title: 'Lifecycle Status',
      key: 'isActive',
      width: 120,
      render: (_, record) =>
        record.isActive ? (
          <Badge status="success" text="Active" />
        ) : (
          <Badge status="error" text="Discontinued" />
        ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 140,
      fixed: 'right',
      render: (_, record) => (
        <Space size={4}>
          <Can do="PRODUCT_MANAGE">
            <Tooltip title="Edit Product & Stock">
              <Button
                type="text"
                icon={<EditOutlined />}
                onClick={() => handleOpenEdit(record)}
              />
            </Tooltip>
          </Can>

          <Can do="PRODUCT_MANAGE">
            <Tooltip title={record.isActive ? 'Discontinue Product' : 'Reactivate Product'}>
              <Button
                type="text"
                icon={record.isActive ? <StopOutlined style={{ color: '#fa8c16' }} /> : <CheckCircleOutlined style={{ color: '#52c41a' }} />}
                onClick={() => handleToggleActive(record, !record.isActive)}
              />
            </Tooltip>
          </Can>

          <Can do="PRODUCT_MANAGE">
            <Popconfirm
              title="Delete Product"
              description={`Are you sure you want to delete ${record.name}?`}
              onConfirm={() => handleDelete(record)}
              okText="Delete"
              cancelText="Cancel"
              okButtonProps={{ danger: true }}
            >
              <Tooltip title="Delete">
                <Button danger type="text" icon={<CopyOutlined style={{ display: 'none' }} />} />
              </Tooltip>
            </Popconfirm>
          </Can>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {/* Top Header */}
      <PageHeader
        title="Product List & Catalog Editor"
        subtitle="Super Admin Commerce hub: Manage SKUs, inventory stock levels, pricing variants, storefront publishing, and inventory metadata."
        actions={
          <Can do="PRODUCT_CREATE">
            <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate} size="large">
              Add New Product
            </Button>
          </Can>
        }
      />

      {/* Summary Widgets */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Total SKUs"
              value={metrics.total}
              prefix={<AppstoreOutlined style={{ color: '#1677ff' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Published on Storefront"
              value={metrics.storefrontCount}
              prefix={<ShoppingOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Active Lifecycle SKUs"
              value={metrics.activeCount}
              prefix={<TagOutlined style={{ color: '#fa8c16' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Low Stock Alerts"
              value={metrics.lowStockCount}
              prefix={<WarningOutlined style={{ color: '#ff4d4f' }} />}
              valueStyle={{ color: metrics.lowStockCount > 0 ? '#ff4d4f' : undefined }}
            />
          </Card>
        </Col>
      </Row>

      {/* Filters & Data Table */}
      <Card bodyStyle={{ padding: 16 }} style={{ borderRadius: 8 }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Row gutter={[12, 12]} align="middle">
            <Col xs={24} md={7}>
              <Input
                placeholder="Search by Product Name or SKU..."
                prefix={<SearchOutlined />}
                allowClear
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </Col>
            <Col xs={12} md={5}>
              <CategorySelect
                allowClear
                placeholder="Filter by Category"
                value={selectedCategory}
                onChange={(cat) => setSelectedCategory(cat)}
              />
            </Col>
            <Col xs={12} md={4}>
              <Select
                style={{ width: '100%' }}
                value={stockFilter}
                onChange={(val) => setStockFilter(val)}
                options={[
                  { value: 'all', label: 'All Stock Levels' },
                  { value: 'low', label: 'Low / Critical Stock' },
                  { value: 'in_stock', label: 'In Stock Only' },
                ]}
              />
            </Col>
            <Col xs={12} md={4}>
              <Select
                style={{ width: '100%' }}
                value={storefrontFilter}
                onChange={(val) => setStorefrontFilter(val)}
                options={[
                  { value: 'all', label: 'All Storefront' },
                  { value: 'storefront', label: 'Storefront Live' },
                  { value: 'draft', label: 'Internal Draft' },
                ]}
              />
            </Col>
            <Col xs={12} md={4}>
              <Select
                style={{ width: '100%' }}
                value={statusFilter}
                onChange={(val) => setStatusFilter(val)}
                options={[
                  { value: 'active', label: 'Active Products' },
                  { value: 'discontinued', label: 'Discontinued' },
                  { value: 'all', label: 'All Statuses' },
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
            scroll={{ x: 1100 }}
          />
        </Space>
      </Card>

      {/* Quick Stock Adjustment Modal */}
      <Modal
        title={`Adjust Inventory Stock: ${selectedStockProduct?.name}`}
        open={stockModalOpen}
        onOk={handleSaveStockModal}
        onCancel={() => setStockModalOpen(false)}
        okText="Update Stock"
      >
        <Space direction="vertical" style={{ width: '100%', marginTop: 12 }} size={16}>
          <Alert
            type="info"
            message={`SKU: ${selectedStockProduct?.sku} | Unit: ${selectedStockProduct?.unit}`}
            description="Adjust available sellable quantity in main central warehouse."
          />

          <Form layout="vertical">
            <Form.Item label={`Available Stock (${selectedStockProduct?.unit})`}>
              <InputNumber
                min={0}
                style={{ width: '100%' }}
                value={newStockQty}
                onChange={(val) => setNewStockQty(val || 0)}
              />
            </Form.Item>
          </Form>
        </Space>
      </Modal>
    </Space>
  );
}
