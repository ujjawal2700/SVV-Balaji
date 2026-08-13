import { Alert, App as AntApp, Form, Input, InputNumber, Modal, Typography } from 'antd';
import { useEffect } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { FinishedGoodsBatch, StockFinishedGoodsInput } from '../../api/types';
import { WarehouseSelect } from '../../components/pickers';
import { useStockFinishedGoods } from '../../hooks/usePackaging';
import { positiveNumber, required } from '../../validation/rules';

interface StockFinishedGoodsModalProps {
  batch: FinishedGoodsBatch | null;
  onClose: () => void;
}

/** Booking packed goods into a finished-goods warehouse (FRD Section 23). */
export function StockFinishedGoodsModal({ batch, onClose }: StockFinishedGoodsModalProps) {
  const [form] = Form.useForm<StockFinishedGoodsInput>();
  const { message } = AntApp.useApp();
  const stockIn = useStockFinishedGoods();

  useEffect(() => {
    if (batch) {
      form.resetFields();
      form.setFieldValue('quantity', batch.packCount);
    }
  }, [batch, form]);

  const handleSubmit = async () => {
    if (!batch) return;
    const values = await form.validateFields();
    try {
      await stockIn.mutateAsync({ id: batch.id, input: values });
      message.success(`${values.quantity} packs of ${batch.fgBatchNumber} booked in`);
      onClose();
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not stock the batch'), 8);
    }
  };

  return (
    <Modal
      open={Boolean(batch)}
      title={batch ? `Stock ${batch.fgBatchNumber}` : 'Stock finished goods'}
      okText="Book in"
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={stockIn.isPending}
      destroyOnClose
    >
      <Form form={form} layout="vertical" requiredMark preserve={false}>
        {batch && !batch.qaReleased ? (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
            message="Not QA-released"
            description="Only a released batch may enter finished goods stock. Record a passing finished-goods inspection and release it first."
          />
        ) : (
          <Typography.Paragraph type="secondary">
            {batch?.packCount} packs were produced in this batch. Book in what physically arrived at
            the warehouse.
          </Typography.Paragraph>
        )}

        <Form.Item name="warehouseId" label="Warehouse" rules={[required('Warehouse')]}>
          <WarehouseSelect />
        </Form.Item>

        <Form.Item
          name="quantity"
          label="Number of packs"
          rules={[required('Quantity'), positiveNumber('Quantity')]}
        >
          <InputNumber style={{ width: '100%' }} min={1} step={1} />
        </Form.Item>

        <Form.Item name="storageLocation" label="Storage location">
          <Input placeholder="Optional — e.g. FG Rack 2" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
