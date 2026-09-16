import { App as AntApp, Col, DatePicker, Form, Input, InputNumber, Modal, Row, Select } from 'antd';
import dayjs from 'dayjs';
import { useEffect } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { CreatePurchaseOrderDto, PurchaseOrder } from '../../../../shared/api/purchaseOrders';
import { useCreatePurchaseOrder, useUpdatePurchaseOrder } from '../../hooks/usePurchaseOrders';
import { useSuppliers } from '../../hooks/useSuppliers';

interface POFormValues {
  supplierId: string;
  materialName: string;
  expectedQuantity: number;
  unit: string;
  purchaseRate: number;
  totalAmount: number;
  orderDate: dayjs.Dayjs;
  deliveryDate?: dayjs.Dayjs;
  qualityStandards?: string;
  terms?: string;
}

export function PurchaseOrderFormModal({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing: PurchaseOrder | null;
}) {
  const [form] = Form.useForm<POFormValues>();
  const { message } = AntApp.useApp();
  const create = useCreatePurchaseOrder();
  const update = useUpdatePurchaseOrder();
  const suppliers = useSuppliers();

  useEffect(() => {
    if (open) {
      if (editing) {
        form.setFieldsValue({
          supplierId: editing.supplierId,
          materialName: editing.materialName,
          expectedQuantity: Number(editing.expectedQuantity),
          unit: editing.unit || 'KG',
          purchaseRate: Number(editing.purchaseRate),
          totalAmount: Number(editing.totalAmount),
          orderDate: editing.orderDate ? dayjs(editing.orderDate) : dayjs(),
          deliveryDate: editing.deliveryDate ? dayjs(editing.deliveryDate) : undefined,
          qualityStandards: editing.qualityStandards || undefined,
          terms: editing.terms || undefined,
        });
      } else {
        form.resetFields();
        form.setFieldsValue({
          unit: 'KG',
          orderDate: dayjs(),
          expectedQuantity: 1000,
          purchaseRate: 0,
          totalAmount: 0,
        });
      }
    }
  }, [open, editing, form]);

  const handleValuesChange = (changedValues: Partial<POFormValues>, allValues: POFormValues) => {
    if ('expectedQuantity' in changedValues || 'purchaseRate' in changedValues) {
      const qty = Number(allValues.expectedQuantity) || 0;
      const rate = Number(allValues.purchaseRate) || 0;
      form.setFieldsValue({
        totalAmount: Number((qty * rate).toFixed(2)),
      });
    }
  };

  const handleSubmit = async (values: POFormValues) => {
    try {
      const payload: CreatePurchaseOrderDto = {
        supplierId: values.supplierId,
        materialName: values.materialName,
        expectedQuantity: Number(values.expectedQuantity),
        unit: values.unit || 'KG',
        purchaseRate: Number(values.purchaseRate),
        totalAmount: Number(values.totalAmount),
        orderDate: values.orderDate.toISOString(),
        deliveryDate: values.deliveryDate ? values.deliveryDate.toISOString() : undefined,
        qualityStandards: values.qualityStandards,
        terms: values.terms,
      };

      if (editing) {
        await update.mutateAsync({ id: editing.id, data: payload });
        message.success('Purchase Order updated');
      } else {
        await create.mutateAsync(payload);
        message.success('Purchase Order created successfully');
      }
      onClose();
    } catch (e) {
      message.error(apiErrorMessage(e, 'Could not save purchase order'));
    }
  };

  const supplierOptions = (suppliers.data ?? []).map((s) => ({
    value: s.id,
    label: `${s.fullName}${s.supplierCode ? ` (${s.supplierCode})` : ''}${s.companyName ? ` — ${s.companyName}` : ''}`,
  }));

  return (
    <Modal
      title={editing ? `Edit Purchase Order (${editing.poNumber})` : 'Create Purchase Order'}
      open={open}
      onCancel={onClose}
      onOk={form.submit}
      confirmLoading={create.isPending || update.isPending}
      width={720}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        onValuesChange={handleValuesChange}
      >
        <Row gutter={16}>
          <Col span={14}>
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
          <Col span={10}>
            <Form.Item
              name="materialName"
              label="Material / Crop"
              rules={[{ required: true, message: 'Please specify material' }]}
            >
              <Input placeholder="e.g. Raw Sesame, Mustard Seed" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              name="expectedQuantity"
              label="Expected Quantity"
              rules={[{ required: true, message: 'Enter quantity' }]}
            >
              <InputNumber style={{ width: '100%' }} min={0.01} step={100} />
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
          <Col span={6}>
            <Form.Item
              name="purchaseRate"
              label="Rate (₹ per unit)"
              rules={[{ required: true, message: 'Enter unit rate' }]}
            >
              <InputNumber style={{ width: '100%' }} min={0} step={0.5} />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="totalAmount" label="Total (₹)">
              <InputNumber style={{ width: '100%' }} min={0} disabled />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="orderDate" label="Order Date" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="deliveryDate" label="Target Delivery Date">
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="qualityStandards" label="Quality Standards / Grade Requirement">
          <Input.TextArea rows={2} placeholder="e.g. Moisture < 8%, Foreign matter < 1%, Grade A" />
        </Form.Item>

        <Form.Item name="terms" label="Commercial & Payment Terms">
          <Input.TextArea rows={2} placeholder="e.g. 50% advance against dispatch, balance on warehouse delivery QA pass" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
