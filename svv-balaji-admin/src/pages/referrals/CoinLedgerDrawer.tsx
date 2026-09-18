import { MinusCircleOutlined, PlusCircleOutlined } from '@ant-design/icons';
import { App as AntApp, Button, Descriptions, Divider, Drawer, Empty, Form, Input, InputNumber, Skeleton, Space, Statistic, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import type { CoinTransaction, CoinTransactionReason } from '@shared/api/types';
import { COIN_TRANSACTION_REASON_LABELS } from '@shared/api/types';
import { useCan } from '@shared/auth/useCan';
import { useCoinLedger, useAdjustCoinBalance } from '@shared/hooks/useReferrals';
import { EM_DASH, formatDateTime } from '@shared/utils/format';

const REASON_COLOUR: Record<CoinTransactionReason, string> = {
  REFERRAL_REFERRER_REWARD: 'green',
  REFERRAL_REFEREE_REWARD: 'blue',
  MANUAL_ADJUSTMENT: 'orange',
};

interface AdjustFormValues {
  direction: 'credit' | 'debit';
  amount: number;
  note: string;
}

/**
 * A customer's complete coin history — both roles (rewards earned referring
 * people, the one reward earned by being referred) plus every manual
 * correction, and the form to make one. Opened from either side of a row on
 * the Referral Management table.
 */
export function CoinLedgerDrawer({
  customer,
  onClose,
}: {
  customer: { id: string; name: string } | null;
  onClose: () => void;
}) {
  const { message } = AntApp.useApp();
  const canAdjust = useCan('REFERRALS_ADJUST');
  const [form] = Form.useForm<AdjustFormValues>();
  const [adjusting, setAdjusting] = useState(false);

  const ledger = useCoinLedger(customer?.id ?? null);
  const adjust = useAdjustCoinBalance();

  const close = () => {
    setAdjusting(false);
    form.resetFields();
    onClose();
  };

  const handleAdjust = async (values: AdjustFormValues) => {
    if (!customer) return;
    const amount = values.direction === 'debit' ? -Math.abs(values.amount) : Math.abs(values.amount);
    try {
      await adjust.mutateAsync({ customerId: customer.id, input: { amount, note: values.note } });
      message.success('Coin balance adjusted');
      setAdjusting(false);
      form.resetFields();
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not adjust this balance'), 8);
    }
  };

  const columns: ColumnsType<CoinTransaction> = [
    {
      title: 'Date',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 150,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: 'Reason',
      dataIndex: 'reason',
      key: 'reason',
      width: 190,
      render: (reason: CoinTransactionReason) => (
        <Tag color={REASON_COLOUR[reason]}>{COIN_TRANSACTION_REASON_LABELS[reason]}</Tag>
      ),
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      width: 110,
      align: 'right',
      render: (amount: number) => (
        <Typography.Text strong style={{ color: amount >= 0 ? '#15803d' : '#dc2626' }}>
          {amount >= 0 ? '+' : ''}
          {amount.toLocaleString('en-IN')}
        </Typography.Text>
      ),
    },
    {
      title: 'Related referral',
      key: 'referral',
      render: (_, txn) =>
        txn.referral ? (
          <Typography.Text style={{ fontSize: 12 }}>
            {txn.referral.referrer?.name ?? EM_DASH} → {txn.referral.referee?.name ?? EM_DASH}
          </Typography.Text>
        ) : (
          EM_DASH
        ),
    },
    {
      title: 'Qualifying order',
      key: 'order',
      render: (_, txn) => (txn.order ? <Typography.Text code>{txn.order.orderNumber}</Typography.Text> : EM_DASH),
    },
    {
      title: 'Note / by',
      key: 'note',
      render: (_, txn) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {txn.note ?? EM_DASH}
          {txn.performedBy ? ` — ${txn.performedBy.fullName}` : ''}
        </Typography.Text>
      ),
    },
  ];

  return (
    <Drawer open={Boolean(customer)} onClose={close} width={760} title={customer ? `Coin ledger — ${customer.name}` : 'Coin ledger'}>
      {ledger.isLoading || !ledger.data ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : (
        <>
          <Descriptions column={2} size="small" style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Customer">{ledger.data.customer.name}</Descriptions.Item>
            <Descriptions.Item label="Customer code">
              <Typography.Text code>{ledger.data.customer.customerCode}</Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="Phone">{ledger.data.customer.phone}</Descriptions.Item>
            <Descriptions.Item label="Referral code">
              <Typography.Text code copyable={{ text: ledger.data.customer.referralCode }}>
                {ledger.data.customer.referralCode}
              </Typography.Text>
            </Descriptions.Item>
          </Descriptions>

          <Space size={32} style={{ marginBottom: 16 }}>
            <Statistic title="Current balance" value={ledger.data.balance} suffix="coins" />
            <Statistic title="Total earned" value={ledger.data.totalEarned} suffix="coins" valueStyle={{ color: '#15803d' }} />
            <Statistic title="Net adjustments" value={ledger.data.totalAdjusted} suffix="coins" valueStyle={{ color: ledger.data.totalAdjusted < 0 ? '#dc2626' : undefined }} />
          </Space>

          {canAdjust && (
            <>
              {adjusting ? (
                <Form<AdjustFormValues>
                  form={form}
                  layout="inline"
                  initialValues={{ direction: 'credit' }}
                  onFinish={(values) => void handleAdjust(values)}
                  style={{ marginBottom: 16, flexWrap: 'wrap', rowGap: 8 }}
                >
                  <Form.Item name="direction" rules={[{ required: true }]}>
                    <Space.Compact>
                      <Button
                        icon={<PlusCircleOutlined />}
                        type={form.getFieldValue('direction') === 'credit' ? 'primary' : 'default'}
                        onClick={() => form.setFieldValue('direction', 'credit')}
                      >
                        Credit
                      </Button>
                      <Button
                        danger
                        icon={<MinusCircleOutlined />}
                        type={form.getFieldValue('direction') === 'debit' ? 'primary' : 'default'}
                        onClick={() => form.setFieldValue('direction', 'debit')}
                      >
                        Debit
                      </Button>
                    </Space.Compact>
                  </Form.Item>
                  <Form.Item name="amount" rules={[{ required: true, message: 'Amount required' }]}>
                    <InputNumber min={1} precision={0} placeholder="Coins" style={{ width: 120 }} />
                  </Form.Item>
                  <Form.Item name="note" rules={[{ required: true, message: 'Reason required' }]} style={{ flex: 1, minWidth: 220 }}>
                    <Input placeholder="Reason — refund, reversal, correction..." />
                  </Form.Item>
                  <Form.Item>
                    <Space>
                      <Button type="primary" htmlType="submit" loading={adjust.isPending}>
                        Apply
                      </Button>
                      <Button onClick={() => { setAdjusting(false); form.resetFields(); }}>Cancel</Button>
                    </Space>
                  </Form.Item>
                </Form>
              ) : (
                <Button style={{ marginBottom: 16 }} onClick={() => setAdjusting(true)}>
                  Refund / Reverse / Adjust Balance
                </Button>
              )}
              <Divider style={{ margin: '0 0 16px' }} />
            </>
          )}

          <Table<CoinTransaction>
            size="small"
            rowKey="id"
            columns={columns}
            dataSource={ledger.data.transactions}
            pagination={ledger.data.transactions.length > 10 ? { pageSize: 10 } : false}
            locale={{ emptyText: <Empty description="No coin activity yet" /> }}
          />
        </>
      )}
    </Drawer>
  );
}
