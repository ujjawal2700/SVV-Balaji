import { CheckCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { App as AntApp, Button, Card, Col, Row, Select, Space, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { apiErrorMessage } from '../../api/client';
import { RECIPE_STATUSES, type Recipe, type RecipeStatus } from '../../api/types';
import { Can } from '../../components/Can';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { useApproveRecipe, useProducts, useRecipes } from '../../hooks/useProduction';
import { EM_DASH, formatQuantity } from '../../utils/format';
import { RecipeFormModal } from './RecipeFormModal';
import { RecipeVersionsDrawer } from './RecipeVersionsDrawer';

const STATUS_COLOURS: Record<RecipeStatus, string> = {
  DRAFT: 'default',
  PENDING_APPROVAL: 'gold',
  APPROVED: 'green',
  INACTIVE: 'default',
};

const label = (value: string) =>
  value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');

export function RecipesPage() {
  const { message, modal } = AntApp.useApp();
  const [filters, setFilters] = useState<{ status?: RecipeStatus; productId?: string }>({});
  const [formOpen, setFormOpen] = useState(false);
  const [versionsOf, setVersionsOf] = useState<string | null>(null);

  const recipes = useRecipes(filters);
  const products = useProducts();
  const approve = useApproveRecipe();

  const handleApprove = (recipe: Recipe) => {
    modal.confirm({
      title: `Approve ${recipe.recipeCode} v${recipe.version}?`,
      content:
        'This makes it the live formula for production and retires any previously approved version of the same code. Batches already made keep the version they were made from.',
      okText: 'Approve',
      onOk: async () => {
        try {
          await approve.mutateAsync(recipe.id);
          message.success(`${recipe.recipeCode} v${recipe.version} approved`);
        } catch (error) {
          message.error(apiErrorMessage(error, 'Could not approve the recipe'));
        }
      },
    });
  };

  const columns: ColumnsType<Recipe> = [
    {
      title: 'Code',
      key: 'recipeCode',
      width: 160,
      render: (_, recipe) => (
        <Typography.Link onClick={() => setVersionsOf(recipe.recipeCode)}>
          <Typography.Text code>{recipe.recipeCode}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {' '}
            v{recipe.version}
          </Typography.Text>
        </Typography.Link>
      ),
    },
    { title: 'Name', dataIndex: 'name', key: 'name' },
    {
      title: 'Product',
      key: 'product',
      render: (_, recipe) => recipe.product?.name ?? EM_DASH,
    },
    {
      title: 'Type',
      dataIndex: 'productionType',
      key: 'productionType',
      width: 140,
      render: (type: Recipe['productionType']) =>
        type === 'MULTI_GRAIN' ? (
          <Tooltip title="Production from a blend is disabled until the client confirms scope (A-05)">
            <Tag color="purple">Multigrain</Tag>
          </Tooltip>
        ) : (
          <Tag>Single grain</Tag>
        ),
    },
    {
      title: 'Ingredients',
      key: 'ingredients',
      align: 'center',
      width: 110,
      render: (_, recipe) => recipe.ingredients?.length ?? 0,
    },
    {
      title: 'Yield',
      key: 'yield',
      align: 'right',
      render: (_, recipe) => formatQuantity(recipe.batchYieldQuantity, recipe.unit),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status: RecipeStatus) => <Tag color={STATUS_COLOURS[status]}>{label(status)}</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 170,
      fixed: 'right',
      render: (_, recipe) => (
        <Space size={4}>
          <Button size="small" onClick={() => setVersionsOf(recipe.recipeCode)}>
            Versions
          </Button>
          {recipe.status !== 'APPROVED' ? (
            <Can do="RECIPE_APPROVE">
              <Button
                size="small"
                type="primary"
                icon={<CheckCircleOutlined />}
                loading={approve.isPending}
                onClick={() => handleApprove(recipe)}
              >
                Approve
              </Button>
            </Can>
          ) : null}
        </Space>
      ),
    },
  ];

  const toolbar = (
    <Row gutter={[12, 12]}>
      <Col xs={24} md={8}>
        <Select
          allowClear
          style={{ width: '100%' }}
          showSearch
          optionFilterProp="label"
          placeholder="Filter by product"
          loading={products.isLoading}
          value={filters.productId}
          onChange={(productId) => setFilters((f) => ({ ...f, productId }))}
          options={(products.data?.data ?? []).map((product) => ({
            value: product.id,
            label: `${product.name} (${product.sku})`,
          }))}
        />
      </Col>
      <Col xs={24} md={6}>
        <Select<RecipeStatus>
          allowClear
          style={{ width: '100%' }}
          placeholder="Status"
          value={filters.status}
          onChange={(status) => setFilters((f) => ({ ...f, status }))}
          options={RECIPE_STATUSES.map((value) => ({ value, label: label(value) }))}
        />
      </Col>
    </Row>
  );

  return (
    <Card>
      <PageHeader
        title="Recipes"
        subtitle="Versioned formulas with an approval gate (FRD Section 19). Production refuses an unapproved recipe, and a run pins the version it used — so an approved recipe is never edited, only superseded by a new version."
        actions={
          <Can do="RECIPE_CREATE">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
              New recipe
            </Button>
          </Can>
        }
      />

      <DataTable<Recipe>
        rows={recipes.data?.data}
        columns={columns}
        rowKey="id"
        isLoading={recipes.isLoading}
        isFetching={recipes.isFetching}
        error={recipes.error}
        onRetry={() => void recipes.refetch()}
        toolbar={toolbar}
        emptyText="No recipes yet — a product is needed first"
      />

      <RecipeFormModal open={formOpen} onClose={() => setFormOpen(false)} />
      <RecipeVersionsDrawer recipeCode={versionsOf} onClose={() => setVersionsOf(null)} />
    </Card>
  );
}
