import { App as AntApp, Form, Input, InputNumber, Modal } from 'antd';
import { useEffect } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { CreateWarehouseInput, Warehouse } from '../../api/types';
import { BranchSelect } from '../../components/pickers';
import { useCreateWarehouse, useUpdateWarehouse } from '../../hooks/useWarehouses';
import { maxLength, positiveNumber, required } from '../../validation/rules';

interface WarehouseFormModalProps {
  open: boolean;
  /** Present means edit; absent means create. */
  warehouse?: Warehouse | null;
  onClose: () => void;
}

export function WarehouseFormModal({ open, warehouse, onClose }: WarehouseFormModalProps) {
  const [form] = Form.useForm<CreateWarehouseInput>();
  const { message } = AntApp.useApp();
  const createWarehouse = useCreateWarehouse();
  const updateWarehouse = useUpdateWarehouse();

  const isEdit = Boolean(warehouse);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (warehouse) {
      form.setFieldsValue({
        name: warehouse.name,
        location: warehouse.location,
        branchId: warehouse.branchId,
        // Capacity is a Prisma Decimal and arrives as a string.
        capacity: warehouse.capacity === null ? undefined : Number(warehouse.capacity),
      });
    }
  }, [open, warehouse, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      if (warehouse) {
        const updated = await updateWarehouse.mutateAsync({ id: warehouse.id, input: values });
        message.success(`${updated.name} updated`);
      } else {
        const created = await createWarehouse.mutateAsync(values);
        message.success(`${created.name} created`);
      }
      onClose();
    } catch (error) {
      message.error(
        apiErrorMessage(error, `Could not ${isEdit ? 'update' : 'create'} the warehouse`),
        8,
      );
    }
  };

  return (
    <Modal
      open={open}
      title={isEdit ? `Edit ${warehouse?.name}` : 'New warehouse'}
      okText={isEdit ? 'Save changes' : 'Create warehouse'}
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={createWarehouse.isPending || updateWarehouse.isPending}
      destroyOnClose
    >
      <Form form={form} layout="vertical" requiredMark preserve={false}>
        <Form.Item name="name" label="Name" rules={[required('Name'), maxLength(120)]}>
          <Input placeholder="Main Store" />
        </Form.Item>

        <Form.Item name="location" label="Location" rules={[required('Location'), maxLength(120)]}>
          <Input placeholder="Hyderabad" />
        </Form.Item>

        <Form.Item name="branchId" label="Branch" rules={[required('Branch')]}>
          <BranchSelect />
        </Form.Item>

        <Form.Item
          name="capacity"
          label="Capacity"
          rules={[positiveNumber('Capacity')]}
          extra="Optional, and unit-less — the occupancy view compares it against stock held. Only meaningful if this warehouse stores in a single unit."
        >
          <InputNumber style={{ width: '100%' }} min={0} step={1000} placeholder="Optional" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
