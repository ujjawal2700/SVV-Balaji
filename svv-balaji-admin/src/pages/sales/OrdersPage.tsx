import { Alert, Card, Col, Row, Select, Space, Tag, Typography, Button } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import type { Order, OrderQuery, OrderStatus, PaymentStatus, SalesChannel } from '@shared/api/types';
import { ORDER_STATUSES, PAYMENT_STATUSES, SALES_CHANNELS } from '@shared/api/types';
import { Can } from '@shared/components/Can';
import { PAYMENT_STATUS_COLOUR, PAYMENT_STATUS_LABEL } from '@shared/utils/paymentStatus';
import { DataTable } from '@shared/components/DataTable';
import { PageHeader } from '@shared/components/PageHeader';
import { CustomerSelect } from '@shared/components/pickers';
import { useOrders } from '@shared/hooks/useSales';
import { EM_DASH, formatCurrency, formatDate } from '@shared/utils/format';
import { OrderDetailDrawer } from './OrderDetailDrawer';
import { OrderFormModal } from './OrderFormModal';
import { ORDER_STATUS_COLOUR, ORDER_STATUS_LABEL } from './orderStatus';

/**
 * Sales orders (FRD Sections 26–28).
 *
 * The list is a way in, not the work: everything an order can have done to it
 * happens in the drawer, where the lifecycle and the allocations are visible
 * together. So the whole row opens it, and there are no per-row action buttons
 * competing with that.
 */
export function OrdersPage() {
  const [query, setQuery] = useState<OrderQuery>({});
  const [formOpen, setFormOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  /**
   * Narrowed here, not on the server: GET /orders has no paymentStatus
   * parameter. Sending one would be dropped and the filter would look broken in
   * the least helpful way — by appearing to work.
   */
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | undefined>();

  const orders = useOrders(query);

  const patchQuery = (patch: Partial<OrderQuery>) => setQuery((prev) => ({ ...prev, ...patch }));

  const rows = (orders.data?.data ?? []).filter(
    (order) => !paymentStatus || order.paymentStatus === paymentStatus,
  );
  const drafts = rows.filter((order) => order.status === 'DRAFT').length;

  const columns: ColumnsType<Order> = [
    {
      title: 'Order',
      key: 'orderNumber',
      width: 170,
      render: (_, order) => (
        <Space direction="vertical" size={0}>
          <Typography.Text code>{order.orderNumber}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {formatDate(order.orderDate)}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Customer',
      key: 'customer',
      render: (_, order) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{order.customer?.name ?? EM_DASH}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {order.customer?.customerCode ?? EM_DASH}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Channel',
      dataIndex: 'channel',
      key: 'channel',
      width: 90,
      render: (channel: SalesChannel) => (
        <Tag color={channel === 'B2B' ? 'blue' : 'purple'}>{channel}</Tag>
      ),
    },
    {
      title: 'Dispatch from',
      key: 'warehouse',
      render: (_, order) => order.warehouse?.name ?? EM_DASH,
    },
    {
      title: 'Required by',
      dataIndex: 'requiredByDate',
      key: 'requiredByDate',
      width: 130,
      render: (value: string | null) => formatDate(value),
      sorter: (a, b) => (a.requiredByDate ?? '').localeCompare(b.requiredByDate ?? ''),
    },
    {
      title: 'Total',
      dataIndex: 'total',
      key: 'total',
      align: 'right',
      width: 130,
      render: (value: string) => <Typography.Text strong>{formatCurrency(value)}</Typography.Text>,
      sorter: (a, b) => Number(a.total) - Number(b.total),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: OrderStatus) => (
        <Tag color={ORDER_STATUS_COLOUR[status]}>{ORDER_STATUS_LABEL[status]}</Tag>
      ),
    },
    {
      title: 'Payment',
      dataIndex: 'paymentStatus',
      key: 'paymentStatus',
      width: 110,
      render: (status: PaymentStatus) => (
        <Tag color={PAYMENT_STATUS_COLOUR[status]}>{PAYMENT_STATUS_LABEL[status]}</Tag>
      ),
    },
  ];

  const toolbar = (
    <Row gutter={[12, 12]}>
      <Col xs={24} md={7}>
        <CustomerSelect
          allowClear
          placeholder="All customers"
          value={query.customerId}
          onChange={(value) => patchQuery({ customerId: value })}
        />
      </Col>
      <Col xs={12} md={5}>
        <Select<OrderStatus>
          allowClear
          style={{ width: '100%' }}
          placeholder="Status"
          value={query.status}
          onChange={(value) => patchQuery({ status: value })}
          options={ORDER_STATUSES.map((value) => ({ value, label: ORDER_STATUS_LABEL[value] }))}
        />
      </Col>
      <Col xs={12} md={4}>
        <Select<SalesChannel>
          allowClear
          style={{ width: '100%' }}
          placeholder="Channel"
          value={query.channel}
          onChange={(value) => patchQuery({ channel: value })}
          options={SALES_CHANNELS.map((value) => ({ value, label: value }))}
        />
      </Col>
      <Col xs={12} md={4}>
        <Select<PaymentStatus>
          allowClear
          style={{ width: '100%' }}
          placeholder="Payment"
          value={paymentStatus}
          onChange={(value) => setPaymentStatus(value)}
          options={PAYMENT_STATUSES.map((value) => ({
            value,
            label: PAYMENT_STATUS_LABEL[value],
          }))}
        />
      </Col>
    </Row>
  );

  return (
    <Card>
      <PageHeader
        title="Orders"
        subtitle="Channel-aware orders with a forward-only lifecycle (FRD Sections 26–28). Allocation is a server action, not a form: it picks batches first-expiry-first-out from QA-released stock and returns exactly what goes on the picking slip."
        actions={
          <Can do="ORDER_CREATE">
            <Button type="primary" onClick={() => setFormOpen(true)}>
              New order
            </Button>
          </Can>
        }
      />

      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        {drafts > 0 ? (
          <Alert
            type="info"
            showIcon
            message={`${drafts} draft${drafts === 1 ? '' : 's'} not yet placed`}
            description="A draft holds no stock and reserves nothing. It is re-priced against the current price list at the moment it is placed."
          />
        ) : null}

        <DataTable<Order>
          rows={rows}
          columns={columns}
          rowKey="id"
          isLoading={orders.isLoading}
          isFetching={orders.isFetching}
          error={orders.error}
          onRetry={() => void orders.refetch()}
          toolbar={toolbar}
          emptyText="No orders yet"
          onRow={(order) => ({
            onClick: () => setOpenId(order.id),
            style: { cursor: 'pointer' },
          })}
        />
      </Space>

      <OrderFormModal open={formOpen} onClose={() => setFormOpen(false)} />
      <OrderDetailDrawer orderId={openId} onClose={() => setOpenId(null)} />
    </Card>
  );
}
