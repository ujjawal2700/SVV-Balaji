import { Alert, App as AntApp, Descriptions, Form, Input, InputNumber, Modal, Typography } from 'antd';
import { useEffect } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { WarehouseStock } from '../../api/types';
import { WarehouseSelect } from '../../components/pickers';
import { useTransferStock } from '../../hooks/useWarehouses';
import { formatQuantity } from '../../utils/format';
import { positiveNumber, required } from '../../validation/rules';

interface TransferStockModalProps {
  row: WarehouseStock | null;
  onClose: () => void;
}

interface TransferForm {
  toWarehouseId: string;
  quantity: number;
  reason?: string;
}

/**
 * Inter-warehouse transfer (FRD 16.4).
 *
 * Batch identity is preserved across the move — the same RM- number arrives at
 * the destination — which is what keeps the traceability chain intact when
 * stock is shuffled between stores.
 */
export function TransferStockModal({ row, onClose }: TransferStockModalProps) {
  const [form] = Form.useForm<TransferForm>();
  const { message } = AntApp.useApp();
  const transfer = useTransferStock();

  const available = row ? Number(row.quantity) - Number(row.reservedQuantity) : 0;

  useEffect(() => {
    if (row) form.resetFields();
  }, [row, form]);

  const handleSubmit = async () => {
    if (!row) return;
    const values = await form.validateFields();

    if (values.toWarehouseId === row.warehouseId) {
      message.error('Source and destination must be different warehouses');
      return;
    }

    try {
      await transfer.mutateAsync({
        batchId: row.batchId,
        fromWarehouseId: row.warehouseId,
        toWarehouseId: values.toWarehouseId,
        quantity: values.quantity,
        reason: values.reason,
      });
      message.success('Stock transferred');
      onClose();
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not transfer the stock'));
    }
  };

  return (
    <Modal
      open={Boolean(row)}
      title="Transfer stock"
      okText="Transfer"
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={transfer.isPending}
      destroyOnClose
    >
      <Form form={form} layout="vertical" requiredMark preserve={false}>
        {row ? (
          <Descriptions size="small" bordered column={1} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Batch">
              <Typography.Text code>{row.batch?.batchNumber ?? row.batchId}</Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="From">{row.warehouse?.name}</Descriptions.Item>
            <Descriptions.Item label="Available to move">
              <Typography.Text strong>{formatQuantity(available, row.unit)}</Typography.Text>
            </Descriptions.Item>
          </Descriptions>
        ) : null}

        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="The batch number travels with the stock"
          description="A transfer moves quantity between warehouses without changing batch identity, so the trace back to the farmer is unaffected."
        />

        <Form.Item name="toWarehouseId" label="To warehouse" rules={[required('Destination')]}>
          <WarehouseSelect placeholder="Select the destination" />
        </Form.Item>

        <Form.Item
          name="quantity"
          label={`Quantity (${row?.unit ?? 'KG'})`}
          rules={[
            required('Quantity'),
            positiveNumber('Quantity'),
            {
              validator: (_rule, value: number) =>
                value === undefined || value <= available
                  ? Promise.resolve()
                  : Promise.reject(
                      new Error(`Only ${available} available — reserved stock cannot be moved`),
                    ),
            },
          ]}
        >
          <InputNumber style={{ width: '100%' }} min={0} step={1} />
        </Form.Item>

        <Form.Item name="reason" label="Reason">
          <Input.TextArea rows={2} placeholder="Optional" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
