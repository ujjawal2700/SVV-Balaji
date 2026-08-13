import { Alert, App as AntApp, Descriptions, Form, Input, InputNumber, Modal, Select, Typography } from 'antd';
import { useEffect } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { WarehouseStock } from '../../api/types';
import { useBatches } from '../../hooks/useCollections';
import { useAdjustStock, useStockIn, useStockOut } from '../../hooks/useWarehouses';
import { formatQuantity } from '../../utils/format';
import { positiveNumber, required } from '../../validation/rules';

export type StockAction = 'in' | 'out' | 'adjust';

interface StockActionModalProps {
  action: StockAction | null;
  /** Set for out/adjust, which always operate on an existing stock row. */
  row?: WarehouseStock | null;
  /** Set for stock-in, where the warehouse is chosen on the page. */
  warehouseId?: string;
  onClose: () => void;
}

interface StockForm {
  batchId: string;
  quantity: number;
  newQuantity: number;
  storageLocation?: string;
  reason?: string;
}

const TITLES: Record<StockAction, string> = {
  in: 'Stock in',
  out: 'Stock out',
  adjust: 'Adjust to physical count',
};

/**
 * The three single-warehouse stock actions.
 *
 * Stock-in picks a batch, because the batch may not be in this warehouse yet.
 * Stock-out and adjust always start from a row that already exists, so the
 * batch and warehouse are fixed and only the number is in question.
 *
 * Adjust takes an ABSOLUTE new quantity, not a delta — it reconciles the system
 * to a physical count. The server derives the delta and refuses a no-op.
 */
export function StockActionModal({ action, row, warehouseId, onClose }: StockActionModalProps) {
  const [form] = Form.useForm<StockForm>();
  const { message } = AntApp.useApp();

  const batches = useBatches({});
  const stockIn = useStockIn();
  const stockOut = useStockOut();
  const adjust = useAdjustStock();

  const targetWarehouseId = row?.warehouseId ?? warehouseId;
  const available = row ? Number(row.quantity) - Number(row.reservedQuantity) : undefined;

  useEffect(() => {
    if (action) form.resetFields();
  }, [action, form]);

  const pending = stockIn.isPending || stockOut.isPending || adjust.isPending;

  const handleSubmit = async () => {
    if (!action || !targetWarehouseId) return;
    const values = await form.validateFields();

    try {
      if (action === 'in') {
        await stockIn.mutateAsync({
          warehouseId: targetWarehouseId,
          input: {
            batchId: values.batchId,
            quantity: values.quantity,
            storageLocation: values.storageLocation,
            reason: values.reason,
          },
        });
        message.success('Stock booked in');
      } else if (action === 'out') {
        await stockOut.mutateAsync({
          warehouseId: targetWarehouseId,
          input: { batchId: row!.batchId, quantity: values.quantity, reason: values.reason },
        });
        message.success('Stock taken out');
      } else {
        await adjust.mutateAsync({
          warehouseId: targetWarehouseId,
          input: {
            batchId: row!.batchId,
            newQuantity: values.newQuantity,
            reason: values.reason as string,
          },
        });
        message.success('Stock reconciled to the counted figure');
      }
      onClose();
    } catch (error) {
      // The server's message is specific - "Insufficient unreserved stock:
      // requested 500, available 320" tells the user far more than we could.
      message.error(apiErrorMessage(error, 'That did not go through'));
    }
  };

  return (
    <Modal
      open={Boolean(action)}
      title={action ? TITLES[action] : ''}
      okText={action === 'adjust' ? 'Record adjustment' : 'Confirm'}
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={pending}
      destroyOnClose
    >
      <Form form={form} layout="vertical" requiredMark preserve={false}>
        {row ? (
          <Descriptions size="small" bordered column={1} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Batch">
              <Typography.Text code>{row.batch?.batchNumber ?? row.batchId}</Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="Warehouse">{row.warehouse?.name}</Descriptions.Item>
            <Descriptions.Item label="On hand">
              {formatQuantity(row.quantity, row.unit)}
            </Descriptions.Item>
            <Descriptions.Item label="Reserved">
              {formatQuantity(row.reservedQuantity, row.unit)}
            </Descriptions.Item>
            <Descriptions.Item label="Available to withdraw">
              <Typography.Text strong>{formatQuantity(available, row.unit)}</Typography.Text>
            </Descriptions.Item>
          </Descriptions>
        ) : null}

        {action === 'in' ? (
          <>
            <Form.Item name="batchId" label="Batch" rules={[required('Batch')]}>
              <Select
                showSearch
                optionFilterProp="label"
                loading={batches.isLoading}
                placeholder="Select a batch"
                options={(batches.data?.data ?? []).map((batch) => ({
                  value: batch.id,
                  label: `${batch.batchNumber} — ${batch.cropName} · ${batch.farmer?.fullName ?? ''}`,
                }))}
              />
            </Form.Item>
            <Form.Item name="storageLocation" label="Storage location">
              <Input placeholder="Optional — e.g. Rack B3" />
            </Form.Item>
          </>
        ) : null}

        {action === 'adjust' ? (
          <>
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message="Enter the counted figure, not the difference"
              description="This sets on-hand stock to whatever you enter and logs the delta. Adjustments are the movement type most likely to be hiding a process problem, so the reason is mandatory and permanent."
            />
            <Form.Item
              name="newQuantity"
              label={`Counted quantity (${row?.unit ?? ''})`}
              rules={[required('Counted quantity'), positiveNumber('Counted quantity', true)]}
            >
              <InputNumber style={{ width: '100%' }} min={0} step={1} />
            </Form.Item>
          </>
        ) : (
          <Form.Item
            name="quantity"
            label={`Quantity (${row?.unit ?? 'KG'})`}
            rules={[
              required('Quantity'),
              positiveNumber('Quantity'),
              ...(action === 'out' && available !== undefined
                ? [
                    {
                      validator: (_rule: unknown, value: number) =>
                        value === undefined || value <= available
                          ? Promise.resolve()
                          : Promise.reject(
                              new Error(
                                `Only ${available} available — reserved stock cannot be withdrawn`,
                              ),
                            ),
                    },
                  ]
                : []),
            ]}
          >
            <InputNumber style={{ width: '100%' }} min={0} step={1} />
          </Form.Item>
        )}

        <Form.Item
          name="reason"
          label="Reason"
          rules={
            action === 'adjust'
              ? [{ required: true, message: 'A reason is required for an adjustment' }]
              : undefined
          }
          extra={
            action === 'out'
              ? 'e.g. consumed by production, wastage, dispatch'
              : action === 'adjust'
                ? 'Written to the ledger permanently.'
                : undefined
          }
        >
          <Input.TextArea rows={2} placeholder={action === 'adjust' ? 'Required' : 'Optional'} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
