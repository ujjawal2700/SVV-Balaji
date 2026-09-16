import { PlusOutlined } from '@ant-design/icons';
import { App as AntApp, Button, Card, Space, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { Supplier, QuerySupplierDto, SupplierStatus } from '../../../../shared/api/suppliers';
import { useCan } from '../../auth/useCan';
import { Can } from '../../components/Can';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { RowActions } from '../../components/RowActions';
import { useDeleteSupplier, useSetSupplierStatus, useSuppliers } from '../../hooks/useSuppliers';
import { SupplierFormModal } from './SupplierFormModal';
import { SupplierDetailDrawer } from './SupplierDetailDrawer';
import { SUPPLIER_STATUS_LABELS, SupplierCodeCell, SupplierStatusTag } from './supplierStatus';
import { VerifySupplierModal } from './VerifySupplierModal';

export function SuppliersPage() {
  const { message } = AntApp.useApp();
  const [query, setQuery] = useState<QuerySupplierDto>({});
  const [registerOpen, setRegisterOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<Supplier | null>(null);

  const suppliers = useSuppliers(query);
  const setStatus = useSetSupplierStatus();
  const remove = useDeleteSupplier();

  const openEdit = (supplier: Supplier) => {
    setEditing(supplier);
    setRegisterOpen(true);
  };

  const closeForm = () => {
    setRegisterOpen(false);
    setEditing(null);
  };

  const canApprove = useCan('SUPPLIER_APPROVE');
  const canSetStatus = useCan('SUPPLIER_SET_STATUS');
  const canDelete = useCan('SUPPLIER_DELETE');

  const handleStatusChange = async (supplier: Supplier, status: SupplierStatus) => {
    try {
      await setStatus.mutateAsync({ id: supplier.id, status });
      message.success(`${supplier.fullName} is now ${SUPPLIER_STATUS_LABELS[status]}`);
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not change the status'));
    }
  };

  const columns: ColumnsType<Supplier> = [
    {
      title: 'Traceability Code',
      dataIndex: 'supplierCode',
      key: 'supplierCode',
      width: 180,
      render: (code: string | null) => <SupplierCodeCell code={code} />,
    },
    {
      title: 'Supplier',
      dataIndex: 'fullName',
      key: 'fullName',
      render: (name: string, supplier) => (
        <Space direction="vertical" size={0}>
          <Typography.Link onClick={() => setDetailId(supplier.id)}>{name}</Typography.Link>
          <Typography.Text type="secondary">{supplier.mobile}</Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Company',
      dataIndex: 'companyName',
      key: 'companyName',
      render: (name: string | null) => name || '-',
    },
    {
      title: 'Location',
      key: 'location',
      render: (_, supplier) => (
        <Space direction="vertical" size={0}>
          <span>{supplier.city || '-'}</span>
          <Typography.Text type="secondary">
            {supplier.state || '-'}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 150,
      render: (status: SupplierStatus) => <SupplierStatusTag status={status} />,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      fixed: 'right',
      align: 'center',
      render: (_, supplier) => {
        const extraItems = [];
        if (supplier.status === 'PENDING_VERIFICATION' && canApprove) {
          extraItems.push({
            key: 'verify',
            label: 'Verify Supplier',
            onClick: () => setVerifying(supplier),
          });
        }
        return (
          <RowActions
            label={supplier.fullName}
            entity="supplier"
            onEdit={() => openEdit(supplier)}
            can="SUPPLIER_EDIT"
            canDelete="SUPPLIER_DELETE"
            isActive={supplier.status === 'ACTIVE'}
            onSetActive={
              canSetStatus
                ? (nextActive) => handleStatusChange(supplier, nextActive ? 'ACTIVE' : 'SUSPENDED')
                : undefined
            }
            onDelete={
              supplier.status === 'PENDING_VERIFICATION'
                ? async () => {
                    await remove.mutateAsync(supplier.id);
                  }
                : undefined
            }
            extraItems={extraItems}
          />
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Suppliers"
        subtitle="Manage supplier registry and issue traceability codes"
        actions={
          <Can do="SUPPLIER_CREATE">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setRegisterOpen(true)}>
              Register Supplier
            </Button>
          </Can>
        }
      />
      <Card bodyStyle={{ padding: 0 }}>
        <DataTable<Supplier>
          rows={suppliers.data}
          columns={columns}
          rowKey="id"
          isLoading={suppliers.isLoading}
          error={suppliers.error}
          onRetry={() => suppliers.refetch()}
        />
      </Card>

      <SupplierFormModal open={registerOpen} onClose={closeForm} editing={editing} />
      <SupplierDetailDrawer
        supplierId={detailId}
        onClose={() => setDetailId(null)}
      />
      {verifying && (
        <VerifySupplierModal
          supplier={verifying}
          open={true}
          onClose={() => setVerifying(null)}
        />
      )}
    </>
  );
}

