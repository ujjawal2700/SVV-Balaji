import { Alert, App as AntApp, Col, DatePicker, Form, InputNumber, Modal, Row, Select, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import { useEffect } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { CreateFinishedGoodsBatchInput } from '../../api/types';
import { useCreateFinishedGoods } from '../../hooks/usePackaging';
import { useProductionBatches } from '../../hooks/useProduction';
import { formatQuantity, toIsoDate } from '../../utils/format';
import { dateAfter, positiveNumber, required } from '../../validation/rules';

interface FinishedGoodsFormModalProps {
  open: boolean;
  onClose: () => void;
}

interface PackagingForm
  extends Omit<
    CreateFinishedGoodsBatchInput,
    'packagingDate' | 'manufacturingDate' | 'expiryDate'
  > {
  packagingDate: Dayjs;
  manufacturingDate: Dayjs;
  expiryDate?: Dayjs;
}

const PACKAGING_TYPES = ['pouch', 'box', 'bottle', 'jar', 'sack'];

/**
 * Packaging a completed run into a finished-goods batch (FRD Section 22).
 *
 * Only COMPLETED runs can be packed, so only those are offered. The server also
 * refuses to pack more than the run yielded — counting what has already been
 * packed from it — so the form shows the run's actual output alongside the
 * running total the user is about to commit.
 */
export function FinishedGoodsFormModal({ open, onClose }: FinishedGoodsFormModalProps) {
  const [form] = Form.useForm<PackagingForm>();
  const { message } = AntApp.useApp();
  const createBatch = useCreateFinishedGoods();
  const runs = useProductionBatches({ status: 'COMPLETED' });

  const productionBatchId = Form.useWatch('productionBatchId', form);
  const netWeight = Form.useWatch('netWeight', form);
  const packCount = Form.useWatch('packCount', form);

  const run = (runs.data?.data ?? []).find((r) => r.id === productionBatchId);
  const packedTotal = Number(netWeight ?? 0) * Number(packCount ?? 0);
  const produced = run?.actualQuantity ? Number(run.actualQuantity) : null;
  const overPacking = produced !== null && packedTotal > produced + 0.001;

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({ weightUnit: 'KG', packagingType: 'pouch' } as PackagingForm);
    }
  }, [open, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      const batch = await createBatch.mutateAsync({
        ...values,
        packagingDate: toIsoDate(values.packagingDate) as string,
        manufacturingDate: toIsoDate(values.manufacturingDate) as string,
        expiryDate: toIsoDate(values.expiryDate),
      });
      message.success(
        `${batch.fgBatchNumber} packed — it must pass a finished-goods inspection and be released before it can be stocked`,
        7,
      );
      onClose();
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not pack the run'), 8);
    }
  };

  return (
    <Modal
      open={open}
      title="Pack a production run"
      okText="Create pack batch"
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={createBatch.isPending}
      width={700}
      destroyOnClose
    >
      <Form form={form} layout="vertical" requiredMark preserve={false}>
        <Form.Item
          name="productionBatchId"
          label="Production run"
          rules={[required('Production run')]}
          extra="Completed runs only — output has to be known before it can be packed."
        >
          <Select
            showSearch
            optionFilterProp="label"
            loading={runs.isLoading}
            placeholder="Select a completed run"
            notFoundContent={
              runs.isLoading ? undefined : 'No completed runs — complete one first'
            }
            options={(runs.data?.data ?? []).map((r) => ({
              value: r.id,
              label: `${r.productionBatchNumber} — ${r.product?.name ?? ''} · ${formatQuantity(r.actualQuantity, r.unit)} produced`,
            }))}
          />
        </Form.Item>

        {run ? (
          <Alert
            type={overPacking ? 'error' : 'info'}
            showIcon
            style={{ marginBottom: 16 }}
            message={
              overPacking
                ? 'This exceeds what the run produced'
                : `Run produced ${formatQuantity(run.actualQuantity, run.unit)}`
            }
            description={
              <Typography.Text>
                Packing {formatQuantity(packedTotal, run.unit)} here
                {overPacking
                  ? ' — the server will refuse this. Reduce the pack count or net weight.'
                  : '. Note the server also counts anything already packed from this run.'}
              </Typography.Text>
            }
          />
        ) : null}

        <Row gutter={16}>
          <Col xs={12} md={8}>
            <Form.Item name="packagingType" label="Pack type" rules={[required('Pack type')]}>
              <Select options={PACKAGING_TYPES.map((t) => ({ value: t, label: t }))} />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item
              name="netWeight"
              label="Net weight per pack"
              rules={[required('Net weight'), positiveNumber('Net weight')]}
            >
              <InputNumber style={{ width: '100%' }} min={0.001} step={0.5} />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="weightUnit" label="Unit">
              <Select options={['KG', 'GRAM', 'LITRE'].map((u) => ({ value: u, label: u }))} />
            </Form.Item>
          </Col>

          <Col xs={12} md={8}>
            <Form.Item
              name="packCount"
              label="Number of packs"
              rules={[required('Pack count'), positiveNumber('Pack count')]}
            >
              <InputNumber style={{ width: '100%' }} min={1} step={1} />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="mrp" label="MRP (₹)" rules={[positiveNumber('MRP')]}>
              <InputNumber style={{ width: '100%' }} min={0} step={1} placeholder="Optional" />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item
              name="shelfLifeDays"
              label="Shelf life (days)"
              rules={[positiveNumber('Shelf life')]}
              extra="Expiry is derived from this if not set directly."
            >
              <InputNumber style={{ width: '100%' }} min={1} step={30} placeholder="Optional" />
            </Form.Item>
          </Col>

          <Col xs={24} md={8}>
            <Form.Item
              name="manufacturingDate"
              label="Manufactured"
              rules={[required('Manufacturing date')]}
            >
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item
              name="packagingDate"
              label="Packed"
              rules={[required('Packaging date')]}
              extra="Sets the batch number's date part."
            >
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item
              name="expiryDate"
              label="Expires"
              dependencies={['manufacturingDate']}
              rules={[dateAfter('manufacturingDate', 'the manufacturing date')]}
            >
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}
