import {
  Descriptions,
  Drawer,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { usePurchaseOrder } from '../../hooks/usePurchaseOrders';
import { PurchaseOrderStatusTag } from './purchaseOrderStatus';
import { formatCurrency, formatDate, formatDateTime, formatQuantity } from '../../utils/format';

export function PurchaseOrderDetailDrawer({
  poId,
  onClose,
}: {
  poId: string | null;
  onClose: () => void;
}) {
  const { data: po, isPending } = usePurchaseOrder(poId);

  return (
    <Drawer
      open={!!poId}
      onClose={onClose}
      title={po ? `Purchase Order ${po.poNumber}` : 'Purchase Order Details'}
      width={600}
    >
      {isPending ? (
        <Skeleton active />
      ) : po ? (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="PO Number">
              <Typography.Text strong copyable>{po.poNumber}</Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="Status">
              <PurchaseOrderStatusTag status={po.status} />
            </Descriptions.Item>
            <Descriptions.Item label="Supplier">
              <Space direction="vertical" size={0}>
                <Typography.Text strong>{po.supplier?.fullName || '-'}</Typography.Text>
                {po.supplier?.supplierCode && (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Code: {po.supplier.supplierCode}
                  </Typography.Text>
                )}
                {po.supplier?.companyName && (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {po.supplier.companyName}
                  </Typography.Text>
                )}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="Material">
              <Typography.Text strong>{po.materialName}</Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="Expected Quantity">
              {formatQuantity(po.expectedQuantity, po.unit)}
            </Descriptions.Item>
            <Descriptions.Item label="Rate">
              {formatCurrency(po.purchaseRate)} / {po.unit}
            </Descriptions.Item>
            <Descriptions.Item label="Total Amount">
              <Typography.Text strong style={{ color: '#1677ff' }}>
                {formatCurrency(po.totalAmount)}
              </Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="Order Date">
              {formatDate(po.orderDate)}
            </Descriptions.Item>
            <Descriptions.Item label="Target Delivery Date">
              {formatDate(po.deliveryDate)}
            </Descriptions.Item>
            <Descriptions.Item label="Quality Standards">
              {po.qualityStandards || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Commercial Terms">
              {po.terms || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Created At">
              {formatDateTime(po.createdAt)}
            </Descriptions.Item>
          </Descriptions>

          {po.transports && po.transports.length > 0 && (
            <div>
              <Typography.Title level={5}>Fulfilling Transports</Typography.Title>
              <Table
                size="small"
                pagination={false}
                dataSource={po.transports}
                rowKey="id"
                columns={[
                  {
                    title: 'Transport ID',
                    key: 'id',
                    render: (_, t) => (
                      <Typography.Text code copyable={{ text: t.id }}>
                        {`TR-${t.id.slice(0, 8).toUpperCase()}`}
                      </Typography.Text>
                    ),
                  },
                  {
                    title: 'Quantity',
                    key: 'quantity',
                    render: (_, t) => formatQuantity(t.quantity, t.unit),
                  },
                  {
                    title: 'Scheduled Date',
                    dataIndex: 'scheduledDate',
                    key: 'scheduledDate',
                    render: (d: string) => formatDate(d),
                  },
                  {
                    title: 'Status',
                    dataIndex: 'status',
                    key: 'status',
                    render: (s: string) => <Tag>{s}</Tag>,
                  },
                ]}
              />
            </div>
          )}
        </Space>
      ) : (
        <Typography.Text type="secondary">Purchase order not found</Typography.Text>
      )}
    </Drawer>
  );
}
