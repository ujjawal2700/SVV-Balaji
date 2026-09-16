import { Drawer, Descriptions, Typography, Skeleton } from 'antd';
import { useSupplier } from '../../hooks/useSuppliers';
import { SupplierStatusTag } from './supplierStatus';

export function SupplierDetailDrawer({
  supplierId,
  onClose,
}: {
  supplierId: string | null;
  onClose: () => void;
}) {
  const { data: supplier, isPending } = useSupplier(supplierId);

  return (
    <Drawer
      open={!!supplierId}
      onClose={onClose}
      title="Supplier Details"
      width={500}
    >
      {isPending ? (
        <Skeleton active />
      ) : supplier ? (
        <Descriptions column={1} bordered>
          <Descriptions.Item label="Full Name">{supplier.fullName}</Descriptions.Item>
          <Descriptions.Item label="Code">{supplier.supplierCode || 'Pending'}</Descriptions.Item>
          <Descriptions.Item label="Status">
            <SupplierStatusTag status={supplier.status} />
          </Descriptions.Item>
          <Descriptions.Item label="Mobile">{supplier.mobile}</Descriptions.Item>
          <Descriptions.Item label="Company">{supplier.companyName || '-'}</Descriptions.Item>
          <Descriptions.Item label="GSTIN">{supplier.gstin || '-'}</Descriptions.Item>
          <Descriptions.Item label="City">{supplier.city || '-'}</Descriptions.Item>
          <Descriptions.Item label="State">{supplier.state || '-'}</Descriptions.Item>
        </Descriptions>
      ) : (
        <Typography.Text type="secondary">Supplier not found</Typography.Text>
      )}
    </Drawer>
  );
}
