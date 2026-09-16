import { Drawer, Descriptions, Typography, Skeleton, Space, Tag } from 'antd';
import { useTransport } from '../../hooks/useTransports';
import { TransportStatusTag } from './transportStatus';
import { formatDate, formatDateTime, formatQuantity } from '../../utils/format';

export function TransportDetailDrawer({
  transportId,
  onClose,
}: {
  transportId: string | null;
  onClose: () => void;
}) {
  const { data: transport, isPending } = useTransport(transportId);

  return (
    <Drawer
      open={!!transportId}
      onClose={onClose}
      title="Transport Details"
      width={540}
    >
      {isPending ? (
        <Skeleton active />
      ) : transport ? (
        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label="Transport ID">
            <Typography.Text copyable>{transport.id}</Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="Status">
            <TransportStatusTag status={transport.status} />
          </Descriptions.Item>
          <Descriptions.Item label="Supplier">
            <Space direction="vertical" size={0}>
              <Typography.Text strong>{transport.supplier?.fullName || '-'}</Typography.Text>
              {transport.supplier?.supplierCode && (
                <Typography.Text type="secondary">
                  Code: {transport.supplier.supplierCode}
                </Typography.Text>
              )}
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="Material Name">
            <Typography.Text strong>{transport.materialName}</Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="Quantity">
            {formatQuantity(transport.quantity, transport.unit)}
          </Descriptions.Item>
          <Descriptions.Item label="Scheduled Date">
            {formatDate(transport.scheduledDate)}
          </Descriptions.Item>
          <Descriptions.Item label="Dispatched At">
            {formatDateTime(transport.dispatchedAt)}
          </Descriptions.Item>
          <Descriptions.Item label="Delivered At">
            {formatDateTime(transport.deliveredAt)}
          </Descriptions.Item>
          <Descriptions.Item label="Receiving Warehouse">
            {transport.warehouse?.name || (transport.warehouseId ? transport.warehouseId : '-')}
          </Descriptions.Item>
          <Descriptions.Item label="Delivery Location">
            {transport.deliveryLocation || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Vehicle Number">
            {transport.vehicleNumber ? <Tag>{transport.vehicleNumber}</Tag> : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Driver Details">
            {transport.driverName || transport.driverPhone ? (
              <span>
                {transport.driverName || 'Driver'} {transport.driverPhone ? `(${transport.driverPhone})` : ''}
              </span>
            ) : (
              '-'
            )}
          </Descriptions.Item>
          {transport.receiptNumber && (
            <Descriptions.Item label="Receipt / GRN">
              <Typography.Text code>{transport.receiptNumber}</Typography.Text>
            </Descriptions.Item>
          )}
          <Descriptions.Item label="Remarks">
            {transport.remarks || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Created At">
            {formatDateTime(transport.createdAt)}
          </Descriptions.Item>
        </Descriptions>
      ) : (
        <Typography.Text type="secondary">Transport record not found</Typography.Text>
      )}
    </Drawer>
  );
}
