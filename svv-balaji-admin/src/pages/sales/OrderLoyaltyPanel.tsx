import { RollbackOutlined } from '@ant-design/icons';
import { Alert, App as AntApp, Button, Descriptions, Empty, Form, Input, InputNumber, Modal, Skeleton, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import type { LoyaltyOrderBreakdown, LoyaltyOrderLine } from '@shared/api/loyalty';
import { LOYALTY_CALCULATION_BASE_LABELS } from '@shared/api/loyalty';
import { useLoyaltyOrderBreakdown, useRecordReturn } from '@shared/hooks/useLoyalty';
import { Can } from '../../components/Can';
import { formatDateTime } from '../../utils/format';

const { Text } = Typography;

const REASON_TEXT: Record<string, string> = {
  PRODUCT_NOT_ELIGIBLE: 'Product not eligible',
  DISCOUNTED: 'Discounted product',
  BELOW_MIN_ITEM: 'Below minimum item value',
  PROGRAM_OFF: 'Loyalty program was paused',
  NO_RATE: 'Earn rate is 0%',
  NO_ELIGIBLE_ITEMS: 'No eligible items',
  BELOW_MIN_ORDER: 'Below minimum eligible order value',
};

const SOURCE_TEXT: Record<string, string> = {
  PRODUCT: 'product setting',
  CATEGORY: 'category rule',
  PARENT_CATEGORY: 'parent category rule',
  DEFAULT: 'program default',
};

interface OrderItemLite {
  id: string;
  quantity: number;
  product?: { name?: string } | null;
}

/**
 * What this order earned in loyalty points (or why nothing), the returns
 * recorded against it, and the form to record a new one. Everything shown is
 * the server's frozen record of the credit, not a recalculation.
 */
export function OrderLoyaltyPanel({
  orderId,
  orderNumber,
  status,
  items,
}: {
  orderId: string;
  orderNumber: string;
  status: string;
  items: OrderItemLite[];
}) {
  const { message } = AntApp.useApp();
  const [returnOpen, setReturnOpen] = useState(false);
  const [form] = Form.useForm<{ reason: string; refundAmount?: number; qty: Record<string, number> }>();
  const breakdown = useLoyaltyOrderBreakdown(orderNumber);
  const recordReturn = useRecordReturn();

  if (breakdown.isLoading) return <Skeleton active paragraph={{ rows: 5 }} />;
  if (breakdown.error || !breakdown.data) {
    return <Alert type="warning" showIcon message={apiErrorMessage(breakdown.error, 'Loyalty details are not available for this order')} />;
  }

  const data: LoyaltyOrderBreakdown = breakdown.data;
  const returnedByProduct = new Map<string, number>();
  for (const r of data.returns) returnedByProduct.set(r.product, (returnedByProduct.get(r.product) ?? 0) + r.quantity);
  const remaining = (item: OrderItemLite) => item.quantity - (returnedByProduct.get(item.product?.name ?? '') ?? 0);
  const returnable = status === 'DELIVERED' ? items.filter((i) => remaining(i) > 0) : [];

  const submitReturn = async () => {
    const values = await form.validateFields();
    const lines = Object.entries(values.qty ?? {})
      .filter(([, quantity]) => (quantity ?? 0) > 0)
      .map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
    if (lines.length === 0) {
      message.warning('Enter a quantity for at least one item');
      return;
    }
    try {
      const result = await recordReturn.mutateAsync({
        orderId,
        input: { items: lines, reason: values.reason, refundAmount: values.refundAmount },
      });
      message.success(
        result.loyaltyPointsReversed > 0
          ? `Return recorded — ${result.loyaltyPointsReversed} loyalty points reversed`
          : 'Return recorded — no loyalty points were affected',
      );
      form.resetFields();
      setReturnOpen(false);
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not record the return'), 8);
    }
  };

  const earn = data.earn;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {status !== 'DELIVERED' ? (
        <Alert type="info" showIcon message="Loyalty points are credited once this order is delivered." />
      ) : !data.credited ? (
        <Alert type="warning" showIcon message="Delivered, but not credited yet — it is picked up automatically by the hourly catch-up." />
      ) : null}

      {earn ? (
        <>
          <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }} title="Points credited">
            <Descriptions.Item label="Points">
              <Text strong style={{ fontSize: 16 }}>{earn.points}</Text> {earn.cappedByMax ? <Tag color="orange">capped by max per order</Tag> : null}
            </Descriptions.Item>
            <Descriptions.Item label="Reward value">₹{earn.rewardInr.toFixed(2)}</Descriptions.Item>
            <Descriptions.Item label="Eligible amount">₹{earn.eligibleAmount.toFixed(2)}</Descriptions.Item>
            <Descriptions.Item label="Rate applied">{earn.percentApplied}% · 1 point = ₹{earn.pointValueApplied}</Descriptions.Item>
            <Descriptions.Item label="Calculated on" span={2}>{LOYALTY_CALCULATION_BASE_LABELS[earn.calculationBase]}</Descriptions.Item>
            {earn.skipReason ? (
              <Descriptions.Item label="Why nothing was earned" span={2}>
                <Tag color="default">{REASON_TEXT[earn.skipReason] ?? earn.skipReason}</Tag>
              </Descriptions.Item>
            ) : null}
          </Descriptions>

          <Table<LoyaltyOrderLine>
            size="small"
            rowKey={(l) => l.sku + l.product}
            pagination={false}
            dataSource={earn.lines}
            columns={[
              { title: 'Item', dataIndex: 'product' },
              { title: 'Qty', dataIndex: 'quantity', align: 'right', width: 60 },
              { title: 'Amount', dataIndex: 'baseAmount', align: 'right', render: (v: number) => `₹${v.toFixed(2)}` },
              {
                title: 'Eligible',
                key: 'eligible',
                render: (_: unknown, l) =>
                  l.eligible ? (
                    <Tag color="green">Yes · {SOURCE_TEXT[l.eligibilitySource]}</Tag>
                  ) : (
                    <Tag color="default">{REASON_TEXT[l.ineligibleReason ?? ''] ?? 'No'}</Tag>
                  ),
              },
              { title: 'Points', dataIndex: 'points', align: 'right', width: 70 },
              {
                title: 'Reversed',
                dataIndex: 'reversedPoints',
                align: 'right',
                width: 80,
                render: (v: number) => (v > 0 ? <Text type="danger">−{v}</Text> : '—'),
              },
            ]}
          />
        </>
      ) : null}

      <div>
        <Space style={{ marginBottom: 8, width: '100%', justifyContent: 'space-between' }}>
          <Text strong>Returns</Text>
          <Can do="ORDER_RETURN">
            <Button icon={<RollbackOutlined />} size="small" disabled={returnable.length === 0} onClick={() => setReturnOpen(true)}>
              Record return
            </Button>
          </Can>
        </Space>
        <Table
          size="small"
          rowKey={(r) => r.product + r.createdAt}
          pagination={false}
          dataSource={data.returns}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={status === 'DELIVERED' ? 'No returns' : 'Returns can be recorded once delivered'} /> }}
          columns={[
            { title: 'Item', dataIndex: 'product' },
            { title: 'Qty', dataIndex: 'quantity', align: 'right', width: 60 },
            { title: 'Reason', dataIndex: 'reason' },
            { title: 'By', dataIndex: 'recordedBy' },
            { title: 'When', dataIndex: 'createdAt', render: (v: string) => formatDateTime(v) },
          ]}
        />
      </div>

      <div>
        <Text strong>Points ledger for this order</Text>
        <Table
          size="small"
          style={{ marginTop: 8 }}
          rowKey="id"
          pagination={false}
          dataSource={data.ledger}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No ledger entries" /> }}
          columns={[
            { title: 'Event', dataIndex: 'reason', render: (v: string) => v.replace('LOYALTY_', '').toLowerCase() },
            { title: 'Points', dataIndex: 'amount', align: 'right', render: (v: number) => <Text type={v < 0 ? 'danger' : 'success'}>{v > 0 ? `+${v}` : v}</Text> },
            { title: 'Note', dataIndex: 'note' },
            { title: 'When', dataIndex: 'createdAt', render: (v: string) => formatDateTime(v) },
          ]}
        />
      </div>

      <Modal
        open={returnOpen}
        title={`Record return — ${orderNumber}`}
        okText="Record return"
        confirmLoading={recordReturn.isPending}
        onOk={() => void submitReturn()}
        onCancel={() => setReturnOpen(false)}
        destroyOnClose
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="Loyalty points earned by the returned items are reversed automatically, in proportion to the quantity."
        />
        <Form form={form} layout="vertical">
          {returnable.map((item) => (
            <Form.Item key={item.id} label={`${item.product?.name ?? 'Item'} (up to ${remaining(item)})`} name={['qty', item.id]}>
              <InputNumber min={0} max={remaining(item)} precision={0} style={{ width: 140 }} placeholder="0" />
            </Form.Item>
          ))}
          <Form.Item name="reason" label="Reason" rules={[{ required: true, min: 3, message: 'Give a reason' }]}>
            <Input.TextArea rows={2} maxLength={300} showCount />
          </Form.Item>
          <Form.Item name="refundAmount" label="Refund amount (optional)">
            <InputNumber min={0} precision={2} addonBefore="₹" style={{ width: 200 }} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
