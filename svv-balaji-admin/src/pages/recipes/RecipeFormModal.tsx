import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Button,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Typography,
} from 'antd';
import { useEffect } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { CreateRecipeInput, ProductionType } from '../../api/types';
import { useCreateRecipe, useProducts } from '../../hooks/useProduction';
import { positiveNumber, required } from '../../validation/rules';

interface RecipeFormModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Recipe creation (FRD 19), Super Admin only.
 *
 * Two server rules drive this form:
 *
 *   - a SINGLE_GRAIN recipe must have exactly one ingredient; a MULTI_GRAIN one
 *     needs at least two, each with a percentage, summing to 100 (±0.05). The
 *     running total is shown live so the user is not told after submitting.
 *   - reusing an existing recipeCode creates a NEW VERSION rather than editing.
 *     Production batches pin the version they used, so an approved recipe is
 *     never mutated.
 */
export function RecipeFormModal({ open, onClose }: RecipeFormModalProps) {
  const [form] = Form.useForm<CreateRecipeInput>();
  const { message } = AntApp.useApp();
  const products = useProducts();
  const createRecipe = useCreateRecipe();

  const productionType = Form.useWatch('productionType', form) as ProductionType | undefined;
  const ingredients = Form.useWatch('ingredients', form) as
    | Array<{ percentage?: number }>
    | undefined;

  const percentTotal = (ingredients ?? []).reduce(
    (sum, row) => sum + Number(row?.percentage ?? 0),
    0,
  );
  const multigrain = productionType === 'MULTI_GRAIN';
  const percentOk = !multigrain || Math.abs(percentTotal - 100) <= 0.05;

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({
        productionType: 'SINGLE_GRAIN',
        unit: 'KG',
        ingredients: [{ cropName: '', quantity: 0, unit: 'KG' }],
      } as CreateRecipeInput);
    }
  }, [open, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();

    if (values.productionType === 'MULTI_GRAIN' && !percentOk) {
      message.error(`Ingredient percentages must total 100 — currently ${percentTotal.toFixed(2)}`);
      return;
    }

    try {
      const recipe = await createRecipe.mutateAsync(values);
      message.success(
        `${recipe.recipeCode} v${recipe.version} created as DRAFT — a Super Admin must approve it before production`,
        6,
      );
      onClose();
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not create the recipe'));
    }
  };

  return (
    <Modal
      open={open}
      title="New recipe"
      okText="Create recipe"
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={createRecipe.isPending}
      width={820}
      destroyOnClose
    >
      <Form form={form} layout="vertical" requiredMark preserve={false}>
        <Row gutter={16}>
          <Col xs={24} md={8}>
            <Form.Item
              name="recipeCode"
              label="Recipe code"
              rules={[required('Recipe code')]}
              extra="Reusing an existing code creates a new version."
            >
              <Input placeholder="MG-ATTA" style={{ textTransform: 'uppercase' }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="name" label="Recipe name" rules={[required('Name')]}>
              <Input placeholder="Multigrain Atta — standard blend" />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="productId" label="Product" rules={[required('Product')]}>
              <Select
                showSearch
                optionFilterProp="label"
                loading={products.isLoading}
                placeholder="Select a product"
                options={(products.data?.data ?? []).map((product) => ({
                  value: product.id,
                  label: `${product.name} (${product.sku})`,
                }))}
              />
            </Form.Item>
          </Col>

          <Col xs={24} md={8}>
            <Form.Item name="productionType" label="Type" rules={[required('Type')]}>
              <Select
                options={[
                  { value: 'SINGLE_GRAIN', label: 'Single grain' },
                  { value: 'MULTI_GRAIN', label: 'Multigrain (blend)' },
                ]}
              />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item
              name="batchYieldQuantity"
              label="Expected yield per batch"
              rules={[positiveNumber('Yield')]}
            >
              <InputNumber style={{ width: '100%' }} min={0} step={10} placeholder="Optional" />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="unit" label="Unit">
              <Select
                options={['KG', 'LITRE', 'PACK'].map((unit) => ({ value: unit, label: unit }))}
              />
            </Form.Item>
          </Col>
        </Row>

        {multigrain ? (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message="Multigrain production is not enabled yet"
            description="The blend can be defined and approved, but starting a production run from it will be refused until the client confirms the ratio engine is in scope (action A-05)."
          />
        ) : null}

        <Divider orientation="left" plain>
          Ingredients{' '}
          {multigrain ? (
            <Typography.Text type={percentOk ? 'success' : 'danger'}>
              — {percentTotal.toFixed(2)}% of 100
            </Typography.Text>
          ) : null}
        </Divider>

        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="Crop names must match raw material batches exactly"
          description="Production validates that every batch consumed is an ingredient of the recipe, comparing on crop name. A mismatch means the run is refused."
        />

        <Form.List name="ingredients">
          {(fields, { add, remove }) => (
            <>
              {fields.map((field) => (
                <Row gutter={8} key={field.key} align="middle">
                  <Col xs={24} md={8}>
                    <Form.Item
                      name={[field.name, 'cropName']}
                      rules={[required('Crop')]}
                      label={field.name === 0 ? 'Crop' : undefined}
                    >
                      <Input placeholder="Wheat" />
                    </Form.Item>
                  </Col>
                  <Col xs={8} md={5}>
                    <Form.Item
                      name={[field.name, 'quantity']}
                      rules={[required('Quantity'), positiveNumber('Quantity')]}
                      label={field.name === 0 ? 'Quantity' : undefined}
                    >
                      <InputNumber style={{ width: '100%' }} min={0} step={1} />
                    </Form.Item>
                  </Col>
                  <Col xs={8} md={4}>
                    <Form.Item
                      name={[field.name, 'unit']}
                      label={field.name === 0 ? 'Unit' : undefined}
                      initialValue="KG"
                    >
                      <Select
                        options={['KG', 'GRAM', 'LITRE'].map((u) => ({ value: u, label: u }))}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={6} md={5}>
                    <Form.Item
                      name={[field.name, 'percentage']}
                      label={field.name === 0 ? '% of blend' : undefined}
                      rules={
                        multigrain
                          ? [{ required: true, message: 'Required for a blend' }]
                          : undefined
                      }
                    >
                      <InputNumber
                        style={{ width: '100%' }}
                        min={0}
                        max={100}
                        step={0.5}
                        disabled={!multigrain}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={2} md={2}>
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

              <Button
                type="dashed"
                block
                icon={<PlusOutlined />}
                disabled={!multigrain && fields.length >= 1}
                onClick={() => add({ unit: 'KG' })}
              >
                {!multigrain && fields.length >= 1
                  ? 'A single-grain recipe has exactly one ingredient'
                  : 'Add ingredient'}
              </Button>
            </>
          )}
        </Form.List>

        <Divider orientation="left" plain>
          Production formula (FRD 19.3)
        </Divider>

        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="mixingRatio" label="Mixing ratio">
              <Input placeholder="Optional — e.g. 4:3:2:1" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="processingSequence" label="Processing sequence">
              <Input placeholder="Optional — e.g. clean → grind → blend" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="grindingInstructions" label="Grinding">
              <Input.TextArea rows={2} placeholder="Optional" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="roastingInstructions" label="Roasting">
              <Input.TextArea rows={2} placeholder="Optional" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="oilExtractionProcess" label="Oil extraction">
              <Input.TextArea rows={2} placeholder="Optional" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="packagingInstructions" label="Packaging">
              <Input.TextArea rows={2} placeholder="Optional" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="description" label="Description">
          <Input.TextArea rows={2} placeholder="Optional" />
        </Form.Item>

        <Space />
      </Form>
    </Modal>
  );
}
