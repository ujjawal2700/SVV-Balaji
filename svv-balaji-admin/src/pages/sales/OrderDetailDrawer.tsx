import { CheckCircleOutlined, StopOutlined } from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Button,
  Descriptions,
  Divider,
  Drawer,
  Empty,
  Input,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useState } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import type {
  AllocationShortfall,
  OrderAllocation,
  OrderItem,
  PaymentStatus,
} from '@shared/api/types';
import { Can } from '@shared/components/Can';
import {
  PAYMENT_STATUS_COLOUR,
  PAYMENT_STATUS_LABEL,
  SETTABLE_PAYMENT_STATUSES,
} from '@shared/utils/paymentStatus';
import { useCan } from '@shared/auth/useCan';
import {
  useAllocateOrder,
  useCancelOrder,
  useConfirmOrder,
  useDeliverOrder,
  useDispatchOrder,
  useOrder,
  usePackOrder,
  usePlaceOrder,
  useSetOrderPaymentStatus,
} from '@shared/hooks/useSales';
import { EM_DASH, formatCurrency, formatDate, formatDateTime } from '@shared/utils/format';
import { CANCELLABLE, NEXT_STEP, ORDER_STATUS_COLOUR, ORDER_STATUS_LABEL } from './orderStatus';

/**
 * One order, end to end.
 *
 * The lifecycle is presented as a single next action rather than a row of
 * buttons for every possible transition. At any moment there is exactly one
 * thing to do to an order, and offering six buttons of which five will be
 * refused server-side is not a choice — it is a quiz.
 */
export function OrderDetailDrawer({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const { message, modal } = AntApp.useApp();
  const [cancelReason, setCancelReason] = useState('');
  const [repriced, setRepriced] = useState<Array<{ orderItemId: string; from: number; to: number }>>([]);
  /**
   * Lines allocation could not fill (FRD 25.4).
   *
   * Held in state and shown until dismissed, because allocation now succeeds
   * partially rather than refusing — and a partial success that scrolls past in
   * a toast is exactly how an order ends up looking allocated and shipping
   * short.
   */
  const [shortfalls, setShortfalls] = useState<AllocationShortfall[]>([]);

  const order = useOrder(orderId ?? undefined);
  const place = usePlaceOrder();
  const confirm = useConfirmOrder();
  const allocate = useAllocateOrder();
  const pack = usePackOrder();
  const dispatch = useDispatchOrder();
  const deliver = useDeliverOrder();
  const cancel = useCancelOrder();
  const setPayment = useSetOrderPaymentStatus();

  const canCancel = useCan('ORDER_CANCEL');

  const data = order.data;
  const step = data ? NEXT_STEP[data.status] : undefined;

  /**
   * Delivered against promised.
   *
   * Only computed when there is actually a promise to measure against — an
   * order with no `requiredByDate` is not late, it is unscheduled, and
   * colouring it green would be inventing a target nobody set. Days are
   * compared at whole-day granularity because that is the unit the commitment
   * was made in.
   */
  const lateness = (() => {
    if (!data?.deliveredAt || !data.requiredByDate) return null;
    const days = dayjs(data.deliveredAt).startOf('day').diff(dayjs(data.requiredByDate).startOf('day'), 'day');
    if (days > 0) return { late: true, label: `${days} day${days === 1 ? '' : 's'} late` };
    if (days === 0) return { late: false, label: 'On the promised day' };
    return { late: false, label: `${-days} day${days === -1 ? '' : 's'} early` };
  })();

  const busy =
    place.isPending ||
    confirm.isPending ||
    allocate.isPending ||
    pack.isPending ||
    dispatch.isPending ||
    deliver.isPending;

  const runStep = async () => {
    if (!data || !step) return;

    try {
      switch (data.status) {
        case 'DRAFT': {
          const result = await place.mutateAsync(data.id);
          setRepriced(result.repriced ?? []);
          message.success(
            result.repriced?.length
              ? `Order placed — ${result.repriced.length} line${result.repriced.length === 1 ? '' : 's'} re-priced`
              : 'Order placed',
          );
          break;
        }
        case 'PLACED':
          await confirm.mutateAsync(data.id);
          message.success('Order confirmed');
          break;
        case 'CONFIRMED': {
          const result = await allocate.mutateAsync(data.id);
          setShortfalls(result.shortfalls ?? []);
          if (result.complete) {
            message.success(
              `Allocated ${result.allocations.length} batch${result.allocations.length === 1 ? '' : 'es'}`,
            );
          } else {
            message.warning(
              `Partially allocated — ${result.shortfalls.length} line` +
                `${result.shortfalls.length === 1 ? '' : 's'} could not be filled in full`,
              8,
            );
          }
          break;
        }
        case 'ALLOCATED':
          await pack.mutateAsync(data.id);
          message.success('Marked packed');
          break;
        case 'PACKED':
          await dispatch.mutateAsync(data.id);
          message.success('Dispatched — stock has left the warehouse');
          break;
        case 'DISPATCHED':
          await deliver.mutateAsync(data.id);
          message.success('Marked delivered');
          break;
        default:
          break;
      }
    } catch (error) {
      // Credit limit breaches and insufficient stock both surface here, and
      // both say exactly which customer or which product is the problem.
      message.error(apiErrorMessage(error, `Could not ${step.label.toLowerCase()}`), 10);
    }
  };

  const confirmStep = () => {
    if (!step) return;
    modal.confirm({
      title: `${step.label}?`,
      content: step.effect,
      okText: step.label,
      width: 520,
      onOk: runStep,
    });
  };

  const handleCancel = () => {
    if (!data) return;
    setCancelReason('');
    modal.confirm({
      title: `Cancel ${data.orderNumber}?`,
      width: 520,
      content: (
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Typography.Text>
            Every live reservation goes back to available stock. The allocation rows are kept and
            marked released, so what was reserved and then given back stays answerable.
          </Typography.Text>
          <Input.TextArea
            rows={2}
            placeholder="Reason — required"
            onChange={(event) => setCancelReason(event.target.value)}
          />
        </Space>
      ),
      okText: 'Cancel order',
      okButtonProps: { danger: true },
      onOk: async () => {
        const reason = cancelReason.trim();
        if (!reason) {
          message.error('A reason is required');
          throw new Error('reason required');
        }
        try {
          await cancel.mutateAsync({ id: data.id, reason });
          message.success(`${data.orderNumber} cancelled`);
        } catch (error) {
          message.error(apiErrorMessage(error, 'Could not cancel the order'), 8);
          throw error;
        }
      },
    });
  };

  const handlePayment = (paymentStatus: PaymentStatus) => {
    if (!data) return;
    void (async () => {
      try {
        await setPayment.mutateAsync({ id: data.id, paymentStatus });
        message.success(`Payment marked ${paymentStatus.toLowerCase()}`);
      } catch (error) {
        message.error(apiErrorMessage(error, 'Could not update the payment status'), 8);
      }
    })();
  };

  const itemColumns: ColumnsType<OrderItem> = [
    {
      title: 'Product',
      key: 'product',
      render: (_, item) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{item.product?.name ?? EM_DASH}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {item.product?.sku ?? EM_DASH}
          </Typography.Text>
        </Space>
      ),
    },
    { title: 'Qty', dataIndex: 'quantity', key: 'quantity', align: 'right', width: 70 },
    {
      title: 'Rate',
      key: 'unitPrice',
      align: 'right',
      width: 130,
      render: (_, item) => (
        <Tooltip
          title={
            item.priceList
              ? `From the rule effective ${formatDate(item.priceList.effectiveFrom)}`
              : 'No price rule recorded on this line'
          }
        >
          <span>{formatCurrency(item.unitPrice)}</span>
        </Tooltip>
      ),
    },
    {
      title: 'GST',
      key: 'gst',
      align: 'right',
      width: 90,
      render: (_, item) => `${item.gstRatePercent}%`,
    },
    {
      title: 'Total',
      dataIndex: 'lineTotal',
      key: 'lineTotal',
      align: 'right',
      width: 130,
      render: (value: string) => <Typography.Text strong>{formatCurrency(value)}</Typography.Text>,
    },
  ];

  const allocationColumns: ColumnsType<OrderAllocation> = [
    {
      title: 'Batch',
      key: 'batch',
      render: (_, allocation) => (
        <Typography.Text
          code
          delete={Boolean(allocation.releasedAt)}
          type={allocation.releasedAt ? 'secondary' : undefined}
        >
          {allocation.fgBatch?.fgBatchNumber ?? allocation.fgBatchId}
        </Typography.Text>
      ),
    },
    {
      title: 'Expires',
      key: 'expiry',
      width: 130,
      render: (_, allocation) => formatDate(allocation.fgBatch?.expiryDate),
    },
    { title: 'Qty', dataIndex: 'quantity', key: 'quantity', align: 'right', width: 70 },
    {
      title: 'State',
      key: 'state',
      width: 220,
      render: (_, allocation) =>
        allocation.releasedAt ? (
          <Tooltip title={`Released ${formatDateTime(allocation.releasedAt)}`}>
            <Tag>{allocation.releasedReason ?? 'Released'}</Tag>
          </Tooltip>
        ) : (
          <Tag color="green">Reserved</Tag>
        ),
    },
  ];

  const live = (data?.allocations ?? []).filter((allocation) => !allocation.releasedAt);
  const released = (data?.allocations ?? []).filter((allocation) => allocation.releasedAt);

  return (
    <Drawer
      open={Boolean(orderId)}
      onClose={() => {
        setRepriced([]);
        setShortfalls([]);
        onClose();
      }}
      width={860}
      title={
        data ? (
          <Space>
            <Typography.Text code>{data.orderNumber}</Typography.Text>
            <Tag color={ORDER_STATUS_COLOUR[data.status]}>{ORDER_STATUS_LABEL[data.status]}</Tag>
            <Tag color={data.channel === 'B2B' ? 'blue' : 'purple'}>{data.channel}</Tag>
          </Space>
        ) : (
          'Order'
        )
      }
      extra={
        data ? (
          <Space>
            {CANCELLABLE.includes(data.status) && canCancel ? (
              <Button danger icon={<StopOutlined />} loading={cancel.isPending} onClick={handleCancel}>
                Cancel
              </Button>
            ) : null}
            {step ? (
              <Can do={step.permission}>
                <Button type="primary" icon={<CheckCircleOutlined />} loading={busy} onClick={confirmStep}>
                  {step.label}
                </Button>
              </Can>
            ) : null}
          </Space>
        ) : null
      }
    >
      {order.isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', padding: 64 }}>
          <Spin size="large" />
        </div>
      ) : order.error ? (
        <Alert
          type="error"
          showIcon
          message="Could not load the order"
          description={apiErrorMessage(order.error)}
        />
      ) : data ? (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {shortfalls.length > 0 ? (
            <Alert
              type="warning"
              showIcon
              closable
              onClose={() => setShortfalls([])}
              message="Allocated short"
              description={
                <Space direction="vertical" size={2}>
                  <Typography.Text>
                    There was not enough QA-released stock in this warehouse to fill every line.
                    What exists has been reserved; the rest is outstanding.
                  </Typography.Text>
                  {shortfalls.map((line) => (
                    <Typography.Text key={line.orderItemId}>
                      • {line.productName}
                      {line.sku ? ` (${line.sku})` : ''}: {line.requested} needed,{' '}
                      <strong>{line.allocated} reserved</strong>, {line.short} short
                    </Typography.Text>
                  ))}
                </Space>
              }
            />
          ) : null}

          {repriced.length > 0 ? (
            <Alert
              type="warning"
              showIcon
              closable
              onClose={() => setRepriced([])}
              message="Lines re-priced at placement"
              description={
                <Space direction="vertical" size={2}>
                  <Typography.Text>
                    The price list moved between saving this draft and placing it. The order was
                    committed at today’s rates:
                  </Typography.Text>
                  {repriced.map((line) => {
                    const item = data.items.find((row) => row.id === line.orderItemId);
                    return (
                      <Typography.Text key={line.orderItemId}>
                        • {item?.product?.name ?? line.orderItemId}: {formatCurrency(line.from)} →{' '}
                        <strong>{formatCurrency(line.to)}</strong>
                      </Typography.Text>
                    );
                  })}
                </Space>
              }
            />
          ) : null}

          {data.status === 'CANCELLED' ? (
            <Alert
              type="error"
              showIcon
              message={`Cancelled ${formatDateTime(data.cancelledAt)}`}
              description={data.cancelledReason ?? undefined}
            />
          ) : null}

          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="Customer">
              {data.customer ? (
                <Space direction="vertical" size={0}>
                  <Typography.Text strong>{data.customer.name}</Typography.Text>
                  <Typography.Text code style={{ fontSize: 12 }}>
                    {data.customer.customerCode}
                  </Typography.Text>
                </Space>
              ) : (
                EM_DASH
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Dispatch from">
              {data.warehouse?.name ?? EM_DASH}
            </Descriptions.Item>
            <Descriptions.Item label="Order date">{formatDate(data.orderDate)}</Descriptions.Item>
            <Descriptions.Item label="Required by">
              {formatDate(data.requiredByDate)}
            </Descriptions.Item>
            <Descriptions.Item label="Dispatched">
              {data.dispatchedAt ? formatDateTime(data.dispatchedAt) : EM_DASH}
            </Descriptions.Item>
            <Descriptions.Item label="Delivered">
              {data.deliveredAt ? (
                <Space direction="vertical" size={0}>
                  <span>{formatDateTime(data.deliveredAt)}</span>
                  {lateness ? (
                    <Typography.Text
                      type={lateness.late ? 'danger' : 'success'}
                      style={{ fontSize: 12 }}
                    >
                      {lateness.label}
                    </Typography.Text>
                  ) : null}
                </Space>
              ) : (
                EM_DASH
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Payment terms">
              {data.paymentTerms.replace('_', ' ')}
            </Descriptions.Item>
            <Descriptions.Item label="Payment">
              <Space>
                <Tag color={PAYMENT_STATUS_COLOUR[data.paymentStatus]}>
                  {PAYMENT_STATUS_LABEL[data.paymentStatus]}
                </Tag>
                <Can do="ORDER_PAYMENT">
                  <Select<PaymentStatus>
                    size="small"
                    style={{ width: 130 }}
                    value={data.paymentStatus}
                    loading={setPayment.isPending}
                    onChange={handlePayment}
                    // REFUNDED is deliberately not offered: a refund is a money
                    // movement, and until there is a payment record to attach
                    // it to (FRD 26.2) ticking it would assert something the
                    // system cannot evidence.
                    options={SETTABLE_PAYMENT_STATUSES.map((value) => ({
                      value,
                      label: PAYMENT_STATUS_LABEL[value],
                    }))}
                  />
                </Can>
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="Delivery address" span={2}>
              {data.deliveryAddress ?? (
                <Typography.Text type="secondary">
                  Not recorded — this order predates delivery addresses being captured
                </Typography.Text>
              )}
            </Descriptions.Item>
            {data.notes ? (
              <Descriptions.Item label="Notes" span={2}>
                {data.notes}
              </Descriptions.Item>
            ) : null}
          </Descriptions>

          <div>
            <Typography.Title level={5}>Lines</Typography.Title>
            <Table<OrderItem>
              size="small"
              rowKey="id"
              pagination={false}
              columns={itemColumns}
              dataSource={data.items}
              summary={() => (
                <Table.Summary>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={4} align="right">
                      Subtotal
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={1} align="right">
                      {formatCurrency(data.subtotal)}
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={4} align="right">
                      Tax
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={1} align="right">
                      {formatCurrency(data.taxTotal)}
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={4} align="right">
                      <Typography.Text strong>Total</Typography.Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={1} align="right">
                      <Typography.Text strong>{formatCurrency(data.total)}</Typography.Text>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                </Table.Summary>
              )}
            />
          </div>

          <div>
            <Typography.Title level={5}>
              Allocated batches{' '}
              <Typography.Text type="secondary" style={{ fontSize: 13, fontWeight: 400 }}>
                — this is the picking slip
              </Typography.Text>
            </Typography.Title>
            {data.allocations.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  data.status === 'DRAFT' || data.status === 'PLACED'
                    ? 'Nothing reserved yet — confirm the order, then allocate'
                    : 'Nothing reserved yet'
                }
              />
            ) : (
              <>
                <Table<OrderAllocation>
                  size="small"
                  rowKey="id"
                  pagination={false}
                  columns={allocationColumns}
                  dataSource={live}
                  locale={{ emptyText: 'No live reservations' }}
                />
                {released.length > 0 ? (
                  <>
                    <Divider plain style={{ marginBottom: 8 }}>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        Released — kept for the audit trail
                      </Typography.Text>
                    </Divider>
                    <Table<OrderAllocation>
                      size="small"
                      rowKey="id"
                      pagination={false}
                      showHeader={false}
                      columns={allocationColumns}
                      dataSource={released}
                    />
                  </>
                ) : null}
              </>
            )}
          </div>
        </Space>
      ) : null}
    </Drawer>
  );
}
