import { App as AntApp, Form, InputNumber, Modal, Switch } from 'antd';
import { useEffect } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import type { ProductStockSummary } from '@shared/api/types';
import { useUpdateProduct } from '@shared/hooks/useProduction';

interface ThresholdForm {
  reorderPoint: number;
  safetyStock: number;
  allowBackorder: boolean;
}

/**
 * Just the three inventory fields, not the full product editor - quicker to
 * reach from a screen about stock levels than opening the catalogue editor
 * for one number. Goes through the same PATCH /products/:id as the catalogue
 * form (there is no separate inventory permission), so it still needs
 * PRODUCT_MANAGE - this only narrows what is shown, not who may use it.
 */
export function ThresholdEditModal({
  row,
  onClose,
}: {
  row: ProductStockSummary | null;
  onClose: () => void;
}) {
  const [form] = Form.useForm<ThresholdForm>();
  const { message } = AntApp.useApp();
  const updateProduct = useUpdateProduct();

  useEffect(() => {
    if (!row) return;
    form.setFieldsValue({
      reorderPoint: row.reorderPoint,
      safetyStock: row.safetyStock,
      allowBackorder: row.allowBackorder,
    });
  }, [row, form]);

  const handleSubmit = async () => {
    if (!row) return;
    const values = await form.validateFields();
    try {
      await updateProduct.mutateAsync({ id: row.productId, input: values });
      message.success(`Thresholds updated for ${row.name}`);
      onClose();
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not update thresholds'), 8);
    }
  };

  return (
    <Modal
      open={Boolean(row)}
      title={row ? `Inventory thresholds — ${row.name}` : 'Inventory thresholds'}
      okText="Save"
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={updateProduct.isPending}
      destroyOnClose
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item
          name="reorderPoint"
          label="Reorder point"
          extra="Available quantity at or below this flags the product LOW."
        >
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          name="safetyStock"
          label="Safety stock"
          extra="At or below this flags CRITICAL — the buffer meant to survive a supply hiccup is already eaten into."
        >
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          name="allowBackorder"
          label="Allow backorder"
          valuePropName="checked"
          extra="Whether a storefront order may be placed once available stock is exhausted."
        >
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}
