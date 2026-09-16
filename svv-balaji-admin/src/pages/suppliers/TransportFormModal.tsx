import { App as AntApp, Col, DatePicker, Form, Input, InputNumber, Modal, Row, Select } from 'antd';
import dayjs from 'dayjs';
import { useEffect } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { CreateTransportDto, SupplierTransport } from '../../../../shared/api/transports';
import { useCreateTransport, useUpdateTransport } from '../../hooks/useTransports';
import { useSuppliers } from '../../hooks/useSuppliers';
import { WarehouseSelect } from '../../components/pickers';

interface TransportFormValues {
  supplierId: string;
  purchaseOrderId?: string;
  materialName: string;
  quantity: number;
  unit?: string;
  vehicleNumber?: string;
  driverName?: string;
  driverPhone?: string;
  scheduledDate: dayjs.Dayjs;
  deliveryLocation?: string;
  warehouseId?: string;
  remarks?: string;
}

export function TransportFormModal({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing: SupplierTransport | null;
}) {
  const [form] = Form.useForm<TransportFormValues>();
  const { message } = AntApp.useApp();
  const create = useCreateTransport();
  const update = useUpdateTransport();
  const suppliers = useSuppliers();

  useEffect(() => {
    if (open) {
      if (editing) {
        form.setFieldsValue({
          supplierId: editing.supplierId,
          purchaseOrderId: editing.purchaseOrderId || undefined,
          materialName: editing.materialName,
          quantity: editing.quantity,
          unit: editing.unit || 'KG',
          vehicleNumber: editing.vehicleNumber || undefined,
          driverName: editing.driverName || undefined,
          driverPhone: editing.driverPhone || undefined,
          scheduledDate: editing.scheduledDate ? dayjs(editing.scheduledDate) : dayjs(),
          deliveryLocation: editing.deliveryLocation || undefined,
          warehouseId: editing.warehouseId || undefined,
          remarks: editing.remarks || undefined,
        });
      } else {
        form.resetFields();
        form.setFieldsValue({
          unit: 'KG',
          scheduledDate: dayjs(),
        });
      }
    }
  }, [open, editing, form]);

  const handleSubmit = async (values: TransportFormValues) => {
    try {
      const payload: CreateTransportDto = {
        supplierId: values.supplierId,
        purchaseOrderId: values.purchaseOrderId,
        materialName: values.materialName,
        quantity: Number(values.quantity),
        unit: values.unit || 'KG',
        vehicleNumber: values.vehicleNumber,
        driverName: values.driverName,
        driverPhone: values.driverPhone,
        scheduledDate: values.scheduledDate.toISOString(),
        deliveryLocation: values.deliveryLocation,
        warehouseId: values.warehouseId,
        remarks: values.remarks,
      };

      if (editing) {
        await update.mutateAsync({ id: editing.id, data: payload });
        message.success('Transport record updated');
      } else {
        await create.mutateAsync(payload);
        message.success('Transport scheduled successfully');
      }
      onClose();
    } catch (e) {
      message.error(apiErrorMessage(e, 'Could not save transport'));
    }
  };

  const supplierOptions = (suppliers.data ?? []).map((s) => ({
    value: s.id,
    label: `${s.fullName}${s.supplierCode ? ` (${s.supplierCode})` : ''}${s.companyName ? ` — ${s.companyName}` : ''}`,
  }));

  return (
    <Modal
      title={editing ? 'Edit Transport' : 'Schedule Material Transport'}
      open={open}
      onCancel={onClose}
      onOk={form.submit}
      confirmLoading={create.isPending || update.isPending}
      width={700}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="supplierId"
              label="Supplier"
              rules={[{ required: true, message: 'Please select a supplier' }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                placeholder={suppliers.isLoading ? 'Loading suppliers…' : 'Select supplier'}
                loading={suppliers.isLoading}
                options={supplierOptions}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="scheduledDate" label="Scheduled Date" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="materialName"
              label="Material / Crop Name"
              rules={[{ required: true, message: 'Please enter material name' }]}
            >
              <Input placeholder="e.g. Raw Sesame, Mustard Seed" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="quantity"
              label="Quantity"
              rules={[{ required: true, message: 'Enter quantity' }]}
            >
              <InputNumber style={{ width: '100%' }} min={0.01} step={1} placeholder="Quantity" />
            </Form.Item>
          </Col>
          <Col span={4}>
            <Form.Item name="unit" label="Unit" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'KG', value: 'KG' },
                  { label: 'QUINTAL', value: 'QUINTAL' },
                  { label: 'TONNE', value: 'TONNE' },
                  { label: 'BAGS', value: 'BAGS' },
                ]}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="warehouseId" label="Destination Warehouse">
              <WarehouseSelect placeholder="Select receiving warehouse" allowClear />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="deliveryLocation" label="Delivery Location / Note">
              <Input placeholder="e.g. Nagpur Facility Bay 2" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="vehicleNumber" label="Vehicle Number">
              <Input placeholder="e.g. MH-31-AB-1234" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="driverName" label="Driver Name">
              <Input placeholder="Driver name" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="driverPhone" label="Driver Phone">
              <Input placeholder="Phone number" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="remarks" label="Remarks / Transport Instructions">
          <Input.TextArea rows={2} placeholder="Optional delivery instructions or notes" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
