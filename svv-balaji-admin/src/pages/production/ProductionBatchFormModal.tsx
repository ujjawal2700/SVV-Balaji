import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Button,
  Col,
  DatePicker,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { useEffect, useMemo } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { CreateProductionBatchInput } from '../../api/types';
import { BranchSelect, WarehouseSelect } from '../../components/pickers';
import { useWarehouseStock } from '../../hooks/useWarehouses';
import { useCreateProductionBatch, useRecipes, useUpdateProductionBatch } from '../../hooks/useProduction';
import { formatQuantity, toIsoDate } from '../../utils/format';
import type { ProductionBatch } from '../../api/types';
import { positiveNumber, required } from '../../validation/rules';

interface ProductionBatchFormModalProps {
  open: boolean;
  batch?: ProductionBatch | null;
  onClose: () => void;
}

interface ProductionForm extends Omit<CreateProductionBatchInput, 'productionDate'> {
  productionDate: Dayjs;
}

/**
 * Starting a production run (FRD Section 20).
 *
 * This form has more guard rails than most because the server has more rules,
 * and each one is expensive to hit blind:
 *
 *   - only APPROVED recipes may be used, so only those are offered
 *   - MULTI_GRAIN is refused entirely until A-05 is settled, so those recipes
 *     are shown but explained rather than silently failing on submit
 *   - every consumed batch must be an ingredient of the recipe, matched on crop
 *     name, so the batch picker filters to the recipe's crops
 *   - consumption draws from one nominated warehouse, so stock is read from
 *     there and the available figure shown per batch
 */
export function ProductionBatchFormModal({ open, batch, onClose }: ProductionBatchFormModalProps) {
  const [form] = Form.useForm<ProductionForm>();
  const { message } = AntApp.useApp();

  const recipes = useRecipes({ status: 'APPROVED' });
  const createBatch = useCreateProductionBatch();
  const updateBatch = useUpdateProductionBatch();

  const isEdit = Boolean(batch);

  const initialValues = batch ? {
    recipeId: batch.recipeId,
    branchId: batch.branchId,
    productionDate: dayjs(batch.productionDate),
    plannedQuantity: Number(batch.plannedQuantity),
    machineName: batch.machineName ?? undefined,
    machineNumber: batch.machineNumber ?? undefined,
    operatorName: batch.operatorName ?? undefined,
    productionLine: batch.productionLine ?? undefined,
  } : undefined;

  const recipeId = Form.useWatch('recipeId', form);
  const warehouseId = Form.useWatch('warehouseId', form);

  const recipe = (recipes.data?.data ?? []).find((r) => r.id === recipeId);
  const multigrain = recipe?.productionType === 'MULTI_GRAIN';

  const stock = useWarehouseStock(warehouseId ? { warehouseId } : {});

  /** Only batches whose crop is an ingredient of the chosen recipe. */
  const eligible = useMemo(() => {
    if (!recipe || !warehouseId) return [];
    const crops = new Set(
      (recipe.ingredients ?? []).map((i) => i.cropName.trim().toLowerCase()),
    );
    return (stock.data?.data ?? []).filter((row) => {
      const crop = row.batch?.cropName?.trim().toLowerCase();
      const available = Number(row.quantity) - Number(row.reservedQuantity);
      return crop && crops.has(crop) && available > 0 && row.batch?.status !== 'REJECTED';
    });
  }, [recipe, warehouseId, stock.data]);

  useEffect(() => {
    if (open) {
      if (!batch) {
        form.resetFields();
        form.setFieldsValue({ consumptions: [{ rawMaterialBatchId: '', quantityUsed: 0 }] } as never);
      } else {
        form.resetFields();
      }
    }
  }, [open, form, batch]);

  // Switching recipe or warehouse invalidates any batch already chosen.
  useEffect(() => {
    if (!isEdit) {
      form.setFieldValue('consumptions', [{ rawMaterialBatchId: undefined, quantityUsed: undefined }]);
    }
  }, [recipeId, warehouseId, form, isEdit]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      const payload = {
        ...values,
        productionDate: toIsoDate(values.productionDate) as string,
      };

      if (isEdit && batch) {
        await updateBatch.mutateAsync({ id: batch.id, input: payload });
        message.success('Production run updated', 6);
      } else {
        const created = await createBatch.mutateAsync(payload);
        message.success(`Production run ${created.productionBatchNumber} started`, 6);
      }
      onClose();
    } catch (error) {
      message.error(apiErrorMessage(error, `Could not ${isEdit ? 'update' : 'start'} the run`), 8);
    }
  };

  return (
    <Modal
      open={open}
      title={isEdit ? 'Edit production run' : 'Start production run'}
      okText={isEdit ? 'Save changes' : 'Start run & consume stock'}
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={createBatch.isPending || updateBatch.isPending}
      okButtonProps={{ disabled: multigrain }}
      width={800}
      destroyOnClose
    >
      <Form form={form} layout="vertical" requiredMark preserve={false} initialValues={initialValues}>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item
              name="recipeId"
              label="Recipe"
              rules={[required('Recipe')]}
              extra={isEdit ? 'Recipe cannot be changed after run has started.' : 'Approved recipes only. The version is pinned to this run.'}
            >
              <Select
                disabled={isEdit}
                showSearch
                optionFilterProp="label"
                loading={recipes.isLoading}
                placeholder="Select an approved recipe"
                notFoundContent={
                  recipes.isLoading ? undefined : 'No approved recipes — approve one first'
                }
                options={(recipes.data?.data ?? []).map((r) => ({
                  value: r.id,
                  label: `${r.recipeCode} v${r.version} — ${r.name}`,
                }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={6}>
            <Form.Item name="branchId" label="Branch" rules={[required('Branch')]}>
              <BranchSelect />
            </Form.Item>
          </Col>
          {!isEdit && (
            <Col xs={24} md={6}>
              <Form.Item
                name="warehouseId"
                label="Draw stock from"
                rules={[required('Warehouse')]}
                extra="Consumption decrements this warehouse."
              >
                <WarehouseSelect />
              </Form.Item>
            </Col>
          )}
        </Row>

        {multigrain ? (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
            message="Multigrain production is disabled"
            description="The blend is defined and approved, but the ratio engine is pending client scope confirmation (action A-05). The server will refuse this run, so it cannot be started here."
          />
        ) : null}

        {recipe ? (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message={`Ingredients of ${recipe.recipeCode} v${recipe.version}`}
            description={
              <>
                {(recipe.ingredients ?? []).map((i) => (
                  <Tag key={i.id}>
                    {i.cropName} · {formatQuantity(i.quantity, i.unit)}
                    {i.percentage ? ` · ${i.percentage}%` : ''}
                  </Tag>
                ))}
                <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                  Only batches of these crops can be consumed — the server checks each one against
                  the formula.
                </Typography.Paragraph>
              </>
            }
          />
        ) : null}

        <Row gutter={16}>
          <Col xs={24} md={8}>
            <Form.Item
              name="productionDate"
              label="Production date"
              rules={[required('Production date')]}
              extra="Sets the run number's date part (PB-YYYYMMDD-NNN)."
            >
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item
              name="plannedQuantity"
              label="Planned output"
              rules={[required('Planned output'), positiveNumber('Planned output')]}
            >
              <InputNumber style={{ width: '100%' }} min={0} step={10} />
            </Form.Item>
          </Col>
        </Row>

        {!isEdit && (
          <>
            <Divider orientation="left" plain>
              Raw material consumed (FRD 20.5)
            </Divider>

            {!recipeId || !warehouseId ? (
              <Alert
                type="warning"
                showIcon
                message="Choose a recipe and a warehouse first"
                description="The batch list is filtered to the recipe's crops held in that warehouse."
              />
            ) : eligible.length === 0 ? (
              <Alert
                type="warning"
                showIcon
                message="No eligible stock in that warehouse"
                description="Nothing held there matches this recipe's crops, or what is there is reserved or QA-rejected."
              />
            ) : (
              <Form.List name="consumptions">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map((field) => (
                      <Row gutter={8} key={field.key} align="middle">
                        <Col xs={24} md={14}>
                          <Form.Item
                            name={[field.name, 'rawMaterialBatchId']}
                            rules={[required('Batch')]}
                            label={field.name === 0 ? 'Batch' : undefined}
                          >
                            <Select
                              showSearch
                              optionFilterProp="label"
                              placeholder="Select a batch"
                              options={eligible.map((row) => ({
                                value: row.batchId,
                                label: `${row.batch?.batchNumber} — ${row.batch?.cropName} · ${formatQuantity(
                                  Number(row.quantity) - Number(row.reservedQuantity),
                                  row.unit,
                                )!} available`,
                              }))}
                            />
                          </Form.Item>
                        </Col>
                        <Col xs={20} md={8}>
                          <Form.Item
                            name={[field.name, 'quantityUsed']}
                            rules={[required('Quantity'), positiveNumber('Quantity')]}
                            label={field.name === 0 ? 'Quantity used' : undefined}
                          >
                            <InputNumber style={{ width: '100%' }} min={0} step={1} />
                          </Form.Item>
                        </Col>
                        <Col xs={4} md={2}>
                          <Form.Item label={field.name === 0 ? ' ' : undefined}>
                            <Button
                              type="text"
                              danger
                              icon={<MinusCircleOutlined />}
                              disabled={fields.length === 1}
                              onClick={() => remove(field.name)}
                            />
                          </Form.Item>
                        </Col>
                      </Row>
                    ))}
                    <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add()}>
                      Add another batch
                    </Button>
                  </>
                )}
              </Form.List>
            )}
          </>
        )}

        <Divider orientation="left" plain>
          Machine & operator (FRD 20.6)
        </Divider>

        <Row gutter={16}>
          <Col xs={12} md={6}>
            <Form.Item name="machineName" label="Machine">
              <Input placeholder="Optional" />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="machineNumber" label="Machine no.">
              <Input placeholder="Optional" />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="operatorName" label="Operator">
              <Input placeholder="Optional" />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="productionLine" label="Line">
              <Input placeholder="Optional" />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}
