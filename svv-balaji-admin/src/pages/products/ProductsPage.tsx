import { PlusOutlined } from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Space,
  Switch,
  Tag,
  Typography,
  AutoComplete,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { CreateProductInput, Product } from '../../api/types';
import { Can } from '../../components/Can';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { RowActions } from '../../components/RowActions';
import {
  useCreateProduct,
  useDeleteProduct,
  useProducts,
  useSetProductActive,
  useUpdateProduct,
} from '../../hooks/useProduction';
import { EM_DASH } from '../../utils/format';
import { maxLength, required } from '../../validation/rules';

const UNITS = ['KG', 'GRAM', 'LITRE', 'ML', 'PACK', 'PIECE'];

function ProductFormModal({
  open,
  product,
  onClose,
}: {
  open: boolean;
  /** Present means edit; absent means create. */
  product?: Product | null;
  onClose: () => void;
}) {
  const [form] = Form.useForm<CreateProductInput>();
  const { message } = AntApp.useApp();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();

  const isEdit = Boolean(product);

  useEffect(() => {
    if (!open) return;
    if (product) {
      form.setFieldsValue({
        name: product.name,
        sku: product.sku,
        unit: product.unit,
        category: product.category ?? undefined,
      });
    } else {
      form.resetFields();
    }
  }, [open, product, form]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isEdit) {
      const name = e.target.value;
      const prefix = name ? name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase() : 'PRD';
      const uniqueId = Math.random().toString(36).substring(2, 6).toUpperCase();
      const timestamp = Date.now().toString(36).slice(-3).toUpperCase();
      form.setFieldValue('sku', `${prefix || 'PRD'}-${uniqueId}-${timestamp}`);
    }
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const payload = { ...values, sku: values.sku.toUpperCase() };
    try {
      if (product) {
        const updated = await updateProduct.mutateAsync({ id: product.id, input: payload });
        message.success(`${updated.name} updated`);
      } else {
        const created = await createProduct.mutateAsync(payload);
        message.success(`${created.name} created`);
      }
      onClose();
    } catch (error) {
      message.error(
        apiErrorMessage(error, `Could not ${isEdit ? 'update' : 'create'} the product`),
        8,
      );
    }
  };

  return (
    <Modal
      open={open}
      title={isEdit ? `Edit ${product?.name}` : 'New product'}
      okText={isEdit ? 'Save changes' : 'Create product'}
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={createProduct.isPending || updateProduct.isPending}
      destroyOnClose
    >
      <Form form={form} layout="vertical" requiredMark preserve={false} initialValues={{ unit: 'KG' }}>
        <Form.Item name="name" label="Product name" rules={[required('Name'), maxLength(120)]}>
          <Input placeholder="Multigrain Atta" onChange={handleNameChange} />
        </Form.Item>

        <Form.Item
          name="sku"
          label="SKU"
          rules={[required('SKU'), maxLength(40)]}
          extra={
            isEdit
              ? 'Changing this changes what appears on new documents. Anything already raised keeps the SKU it was raised with.'
              : 'Must be unique across the catalogue. Stored uppercase. Auto-generated but can be modified.'
          }
        >
          <Input placeholder="MG-ATTA-1KG" style={{ textTransform: 'uppercase' }} />
        </Form.Item>

        <Form.Item
          name="unit"
          label="Base unit"
          rules={[required('Unit')]}
          extra={
            isEdit
              ? 'Changing the base unit does not convert existing batch quantities — they were recorded in the old unit.'
              : 'How this product is measured in production and packaging.'
          }
        >
          <AutoComplete 
            options={UNITS.map((unit) => ({ value: unit, label: unit }))} 
            placeholder="Type or select a unit"
            filterOption={(inputValue, option) =>
              option!.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
            }
          />
        </Form.Item>

        <Form.Item name="category" label="Category">
          <Input placeholder="Optional — e.g. Flour" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export function ProductsPage() {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [showDiscontinued, setShowDiscontinued] = useState(true);

  // The catalogue screen asks for discontinued products too - it is the only
  // screen that can reinstate one.
  const products = useProducts(true);
  const setActive = useSetProductActive();
  const remove = useDeleteProduct();

  const rows = (products.data?.data ?? []).filter((p) => showDiscontinued || p.isActive);
  const discontinuedCount = (products.data?.data ?? []).filter((p) => !p.isActive).length;

  const openEdit = (product: Product) => {
    setEditing(product);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const columns: ColumnsType<Product> = [
    {
      title: 'Product',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, product) => (
        <Typography.Text strong type={product.isActive ? undefined : 'secondary'}>
          {name}
        </Typography.Text>
      ),
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    {
      title: 'SKU',
      dataIndex: 'sku',
      key: 'sku',
      render: (sku: string) => <Typography.Text code>{sku}</Typography.Text>,
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      render: (value: string | null) => value ?? EM_DASH,
    },
    { title: 'Unit', dataIndex: 'unit', key: 'unit', width: 90 },
    {
      title: 'Status',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 130,
      render: (isActive: boolean) =>
        isActive ? <Tag color="green">Active</Tag> : <Tag>Discontinued</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      fixed: 'right',
      render: (_, product) => (
        <RowActions
          entity="product"
          label={product.name}
          can="PRODUCT_MANAGE"
          isActive={product.isActive}
          onEdit={() => openEdit(product)}
          onSetActive={(isActive) => setActive.mutateAsync({ id: product.id, isActive })}
          onDelete={() => remove.mutateAsync(product.id)}
        />
      ),
    },
  ];

  const toolbar = (
    <Space>
      <Switch size="small" checked={showDiscontinued} onChange={setShowDiscontinued} />
      <Typography.Text type="secondary">
        Show discontinued{discontinuedCount > 0 ? ` (${discontinuedCount})` : ''}
      </Typography.Text>
    </Space>
  );

  return (
    <Card>
      <PageHeader
        title="Products"
        subtitle="The catalogue. Every recipe, production run and finished pack refers to one of these."
        actions={
          <Can do="PRODUCT_CREATE">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
              New product
            </Button>
          </Can>
        }
      />

      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message="Pricing lives elsewhere"
          description="A product carries two prices — one per sales channel — held as dated rules on the Price Lists screen rather than as fields here. That is what keeps a historical invoice reproducible at the rate it was raised."
        />

        <DataTable<Product>
          rows={rows}
          columns={columns}
          rowKey="id"
          isLoading={products.isLoading}
          isFetching={products.isFetching}
          error={products.error}
          onRetry={() => void products.refetch()}
          toolbar={toolbar}
          emptyText="No products yet — one is needed before a recipe can be written"
        />
      </Space>

      <ProductFormModal open={formOpen} product={editing} onClose={closeForm} />
    </Card>
  );
}
