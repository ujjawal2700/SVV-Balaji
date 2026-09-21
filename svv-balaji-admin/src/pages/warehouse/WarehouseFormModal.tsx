import { App as AntApp, Alert, Form, Input, InputNumber, Modal, Radio } from 'antd';
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
        kind: warehouse.kind ?? 'CENTRAL',
        city: warehouse.city ?? undefined,
        state: warehouse.state ?? undefined,
        pincode: warehouse.pincode ?? undefined,
        latitude: warehouse.latitude ? Number(warehouse.latitude) : undefined,
        longitude: warehouse.longitude ? Number(warehouse.longitude) : undefined,
        serviceRadiusKm: warehouse.serviceRadiusKm ? Number(warehouse.serviceRadiusKm) : undefined,
        contactPhone: warehouse.contactPhone ?? undefined,
      });
    } else {
      form.setFieldsValue({ kind: 'CENTRAL' });
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

        <Form.Item name="kind" label="Fulfilment role" extra="Central ships nationally by courier. An outlet is a franchise store that delivers locally with its own riders.">
          <Radio.Group optionType="button" buttonStyle="solid" options={[{ value: 'CENTRAL', label: 'Central warehouse' }, { value: 'OUTLET', label: 'Franchise outlet' }]} />
        </Form.Item>
        <Form.Item noStyle shouldUpdate={(a, b) => a.kind !== b.kind}>
          {({ getFieldValue }) =>
            getFieldValue('kind') === 'OUTLET' ? (
              <>
                <Alert type="info" showIcon style={{ marginBottom: 12 }} message="An outlet needs its exact location: customers within its delivery radius are routed here automatically." />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Form.Item name="latitude" label="Latitude" rules={[required('Latitude')]}><InputNumber style={{ width: '100%' }} min={-90} max={90} step={0.0001} placeholder="23.2599" /></Form.Item>
                  <Form.Item name="longitude" label="Longitude" rules={[required('Longitude')]}><InputNumber style={{ width: '100%' }} min={-180} max={180} step={0.0001} placeholder="77.4126" /></Form.Item>
                </div>
                <Form.Item name="serviceRadiusKm" label="Delivery radius (km)" extra="Empty = the program default from Checkout & Delivery settings."><InputNumber style={{ width: '100%' }} min={0.5} max={100} step={0.5} /></Form.Item>
                <Form.Item name="contactPhone" label="Store phone"><Input /></Form.Item>
              </>
            ) : null
          }
        </Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Form.Item name="city" label="City"><Input /></Form.Item>
          <Form.Item name="state" label="State"><Input /></Form.Item>
          <Form.Item name="pincode" label="Pincode"><Input maxLength={6} /></Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
