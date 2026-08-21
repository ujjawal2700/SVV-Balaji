import { Alert, Descriptions, Drawer, Empty, Space, Spin, Table, Tag, Typography } from 'antd';
import { apiErrorMessage } from '../../api/client';
import type { Recipe, RecipeIngredient } from '../../api/types';
import { useRecipeVersions } from '../../hooks/useProduction';
import { EM_DASH, formatDate, formatQuantity } from '../../utils/format';

interface RecipeVersionsDrawerProps {
  recipeCode: string | null;
  onClose: () => void;
}

const STATUS_COLOURS: Record<string, string> = {
  DRAFT: 'default',
  PENDING_APPROVAL: 'gold',
  APPROVED: 'green',
  INACTIVE: 'default',
};

/**
 * Version history for a recipe code (FRD 19.6).
 *
 * Exactly one version of a code is APPROVED at a time — approving a new one
 * retires its predecessor to INACTIVE. Older versions are kept rather than
 * deleted because production batches pin the version they were made from, and a
 * finished pack has to be able to say which formula produced it.
 */
export function RecipeVersionsDrawer({ recipeCode, onClose }: RecipeVersionsDrawerProps) {
  const versions = useRecipeVersions(recipeCode ?? undefined);
  const rows = versions.data?.data ?? [];
  const approved = rows.find((row) => row.status === 'APPROVED');

  return (
    <Drawer
      open={Boolean(recipeCode)}
      onClose={onClose}
      width={720}
      title={recipeCode ? `Versions — ${recipeCode}` : 'Recipe versions'}
    >
      {versions.isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', padding: 48 }}>
          <Spin />
        </div>
      ) : versions.error ? (
        <Alert type="error" showIcon message={apiErrorMessage(versions.error)} />
      ) : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {approved ? (
            <Alert
              type="success"
              showIcon
              message={`Version ${approved.version} is live`}
              description="Production runs started now will pin this version. Earlier versions stay on record because batches already made from them refer back to their formula."
            />
          ) : (
            <Alert
              type="warning"
              showIcon
              message="No approved version"
              description="Production is refused until a Super Admin approves a version of this recipe."
            />
          )}

          {rows.map((recipe) => (
            <div key={recipe.id}>
              <Space align="center" style={{ marginBottom: 8 }}>
                <Typography.Text strong>Version {recipe.version}</Typography.Text>
                <Tag color={STATUS_COLOURS[recipe.status]}>{recipe.status.replace('_', ' ')}</Tag>
                <Tag>{recipe.productionType === 'MULTI_GRAIN' ? 'Multigrain' : 'Single grain'}</Tag>
              </Space>

              <Descriptions bordered column={2} size="small" style={{ marginBottom: 8 }}>
                <Descriptions.Item label="Name">{recipe.name}</Descriptions.Item>
                <Descriptions.Item label="Yield">
                  {formatQuantity(recipe.batchYieldQuantity, recipe.unit)}
                </Descriptions.Item>
                <Descriptions.Item label="Mixing ratio">
                  {recipe.mixingRatio ?? EM_DASH}
                </Descriptions.Item>
                <Descriptions.Item label="Approved">
                  {recipe.approvedAt
                    ? `${formatDate(recipe.approvedAt)}${recipe.approvedBy ? ` by ${recipe.approvedBy.fullName}` : ''}`
                    : EM_DASH}
                </Descriptions.Item>
              </Descriptions>

              <Table<RecipeIngredient>
                size="small"
                rowKey="id"
                dataSource={recipe.ingredients ?? []}
                pagination={false}
                locale={{ emptyText: <Empty description="No ingredients recorded" /> }}
                columns={[
                  { title: 'Crop', dataIndex: 'cropName' },
                  {
                    title: 'Quantity',
                    key: 'quantity',
                    align: 'right',
                    render: (_, row) => formatQuantity(row.quantity, row.unit),
                  },
                  {
                    title: '% of blend',
                    dataIndex: 'percentage',
                    align: 'right',
                    render: (value: string | null) => (value === null ? EM_DASH : `${value}%`),
                  },
                ]}
              />
            </div>
          ))}

          {rows.length === 0 ? <Empty description="No versions found" /> : null}
        </Space>
      )}
    </Drawer>
  );
}
