import { Alert, App as AntApp, Col, DatePicker, Descriptions, Form, InputNumber, Modal, Row, Statistic, Typography } from 'antd';
import dayjs from 'dayjs';
import { useEffect } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import type { PriceList } from '@shared/api/types';
import { useSupersedePrice } from '@shared/hooks/usePricing';
import { formatCurrency, formatDate, toIsoDate } from '@shared/utils/format';
import { positiveNumber, required } from '@shared/validation/rules';

/**
 * Changing a price.
 *
 * Presented as "change the price from a date", never as an edit, because that
 * is what actually happens: the current rule is closed with an `effectiveTo`
 * and a new one opens from the date given. An invoice raised last quarter still
 * resolves to last quarter's rate.
 *
 * The old rate is shown alongside the new one, with the movement spelled out,
 * because a rate typed into an empty box is how a decimal point goes missing.
 */
export function SupersedePriceModal({
  price,
  onClose,
}: {
  price: PriceList | null;
  onClose: () => void;
}) {
  const [form] = Form.useForm();
  const { message } = AntApp.useApp();
  const supersede = useSupersedePrice();

  const nextPrice = Form.useWatch('unitPrice', form);
  const current = price ? Number(price.unitPrice) : 0;
  const delta = typeof nextPrice === 'number' && current > 0 ? ((nextPrice - current) / current) * 100 : null;

  useEffect(() => {
    if (!price) return;
    form.resetFields();
    form.setFieldsValue({
      unitPrice: Number(price.unitPrice),
      gstRatePercent: Number(price.gstRatePercent),
      // Tomorrow, not today: a rate changed mid-day would reprice orders already
      // placed this morning. The user can pull it back to today deliberately.
      effectiveFrom: dayjs().add(1, 'day'),
    });
  }, [price, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (!price) return;

    try {
      await supersede.mutateAsync({
        id: price.id,
        input: {
          unitPrice: values.unitPrice,
          gstRatePercent: values.gstRatePercent,
          effectiveFrom: toIsoDate(values.effectiveFrom) as string,
        },
      });
      message.success(`New rate applies from ${formatDate(toIsoDate(values.effectiveFrom))}`);
      onClose();
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not change the price'), 8);
    }
  };

  return (
    <Modal
      open={Boolean(price)}
      width={620}
      title={price ? `Change price — ${price.product?.name ?? 'product'}` : 'Change price'}
      okText="Change price"
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={supersede.isPending}
      destroyOnClose
    >
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="The current rate is kept, not overwritten"
        description="It closes the day before the new one starts. Orders already placed keep the rate they were placed at; drafts are re-priced when they are placed."
      />

      <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Channel">{price?.channel}</Descriptions.Item>
        <Descriptions.Item label="Applies to">
          {price?.customerType
            ? price.customerType.charAt(0) + price.customerType.slice(1).toLowerCase()
            : 'All types'}
        </Descriptions.Item>
        <Descriptions.Item label="Current rate">
          <Typography.Text strong>{formatCurrency(price?.unitPrice)}</Typography.Text>
        </Descriptions.Item>
        <Descriptions.Item label="In force since">
          {formatDate(price?.effectiveFrom)}
        </Descriptions.Item>
        <Descriptions.Item label="Quantity break" span={2}>
          {price && price.minQuantity > 1
            ? `Applies from ${price.minQuantity} units. Carried over unchanged — a different break is a different rule.`
            : 'Any quantity'}
        </Descriptions.Item>
      </Descriptions>

      <Form form={form} layout="vertical" requiredMark preserve={false}>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item
              name="unitPrice"
              label="New unit price (₹)"
              rules={[required('Unit price'), positiveNumber('Unit price')]}
            >
              <InputNumber min={0} step={1} precision={2} style={{ width: '100%' }} autoFocus />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="gstRatePercent" label="GST %" rules={[required('GST rate')]}>
              <InputNumber min={0} max={28} step={0.5} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>

        {delta !== null && Math.abs(delta) > 0.001 ? (
          <Statistic
            title="Movement"
            value={Math.abs(delta)}
            precision={1}
            suffix="%"
            prefix={delta > 0 ? '▲' : '▼'}
            valueStyle={{ color: delta > 0 ? '#cf1322' : '#3f8600', fontSize: 20 }}
            style={{ marginBottom: 16 }}
          />
        ) : null}

        <Form.Item
          name="effectiveFrom"
          label="New rate applies from"
          rules={[required('Effective from')]}
          extra="Defaults to tomorrow so today's orders are not re-priced under the customer"
        >
          <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
