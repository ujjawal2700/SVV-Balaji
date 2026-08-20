import { Alert, App as AntApp, Col, DatePicker, Form, InputNumber, Modal, Row, Select } from 'antd';
import dayjs from 'dayjs';
import { useEffect } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import type { CreatePriceListInput } from '@shared/api/types';
import { CUSTOMER_TYPES, SALES_CHANNELS } from '@shared/api/types';
import { ProductSelect } from '@shared/components/pickers';
import { useCreatePrice } from '@shared/hooks/usePricing';
import { toIsoDate } from '@shared/utils/format';
import { positiveNumber, required } from '@shared/validation/rules';

/** Types that can carry their own rule, per channel. */
const TYPES_BY_CHANNEL: Record<string, readonly string[]> = {
  B2B: ['DISTRIBUTOR', 'RETAILER', 'INSTITUTIONAL'],
  B2C: ['CONSUMER'],
};

/**
 * Opening a new price rule for a product that has none.
 *
 * Changing an existing rate does NOT come through here — that is supersede, on
 * the row itself. This form only opens the first rule for a product-and-channel
 * pair, or a narrower rule for one customer type within a channel.
 */
export function PriceFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form] = Form.useForm();
  const { message } = AntApp.useApp();
  const createPrice = useCreatePrice();

  const channel = Form.useWatch('channel', form) ?? 'B2B';

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({
      channel: 'B2B',
      effectiveFrom: dayjs(),
      gstRatePercent: 5,
      minQuantity: 1,
    });
  }, [open, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const input: CreatePriceListInput = {
      productId: values.productId,
      channel: values.channel,
      customerType: values.customerType || undefined,
      unitPrice: values.unitPrice,
      gstRatePercent: values.gstRatePercent,
      minQuantity: values.minQuantity,
      // Required, so the non-null assertion is safe — validateFields already
      // refused an empty date.
      effectiveFrom: toIsoDate(values.effectiveFrom) as string,
    };

    try {
      await createPrice.mutateAsync(input);
      message.success('Price rule created');
      onClose();
    } catch (error) {
      // The server refuses an overlapping rule for the same product, channel
      // and type. Its message names the clash; ours could not.
      message.error(apiErrorMessage(error, 'Could not create the price rule'), 8);
    }
  };

  return (
    <Modal
      open={open}
      width={640}
      title="New price rule"
      okText="Create rule"
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={createPrice.isPending}
      destroyOnClose
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="This opens a rule, it does not change one"
        description="To change a rate that already exists, use Change price on the row — that closes the old rule and opens a new one, so past invoices still reproduce."
      />

      <Form form={form} layout="vertical" requiredMark preserve={false}>
        <Form.Item name="productId" label="Product" rules={[required('Product')]}>
          <ProductSelect />
        </Form.Item>

        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="channel" label="Channel" rules={[required('Channel')]}>
              <Select
                onChange={() => form.setFieldsValue({ customerType: undefined })}
                options={SALES_CHANNELS.map((value) => ({ value, label: value }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="customerType"
              label="Customer type"
              extra="Leave blank to apply to every type in the channel"
            >
              <Select
                allowClear
                placeholder="All types"
                options={CUSTOMER_TYPES.filter((type) =>
                  (TYPES_BY_CHANNEL[channel] ?? []).includes(type),
                ).map((value) => ({
                  value,
                  label: value.charAt(0) + value.slice(1).toLowerCase(),
                }))}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col xs={24} md={8}>
            <Form.Item
              name="unitPrice"
              label="Unit price (₹)"
              rules={[required('Unit price'), positiveNumber('Unit price')]}
            >
              <InputNumber min={0} step={1} precision={2} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="gstRatePercent" label="GST %" rules={[required('GST rate')]}>
              <InputNumber min={0} max={28} step={0.5} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item
              name="minQuantity"
              label="Minimum quantity"
              extra="Slab pricing: this rate applies at or above this quantity"
            >
              <InputNumber min={1} step={1} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          name="effectiveFrom"
          label="Effective from"
          rules={[required('Effective from')]}
          extra="Orders placed on or after this date resolve to this rate"
        >
          <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
