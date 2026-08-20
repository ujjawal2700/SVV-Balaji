import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, App as AntApp, Button, Col, DatePicker, Form, Input, InputNumber, Modal, Row, Space, Typography } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import type { CreateOrderInput } from '@shared/api/types';
import { CustomerSelect, ProductSelect, WarehouseSelect } from '@shared/components/pickers';
import { useCustomers } from '@shared/hooks/useCustomers';
import { useCreateOrder } from '@shared/hooks/useSales';
import { toIsoDate } from '@shared/utils/format';
import { positiveNumber, required } from '@shared/validation/rules';

/**
 * Raising an order.
 *
 * No prices anywhere on this form, deliberately. Quantity and product are the
 * only things a salesperson decides; the rate comes from the price list
 * server-side, resolved against the customer's channel and type on the order
 * date. A price typed here would be a price nobody could later justify.
 *
 * Save as draft when the customer has not committed. Placing re-reads the price
 * list, so a draft held for a week is placed at the rate in force that day and
 * the screen says which lines moved.
 */
export function OrderFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form] = Form.useForm();
  const { message } = AntApp.useApp();
  const createOrder = useCreateOrder();
  const [submittingAs, setSubmittingAs] = useState<'DRAFT' | 'PLACED' | null>(null);

  const customerId = Form.useWatch('customerId', form);
  // Only to show the channel back — the server resolves pricing itself.
  const customers = useCustomers({ status: 'ACTIVE' });
  const customer = (customers.data?.data ?? []).find((row) => row.id === customerId);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ orderDate: dayjs(), items: [{}] });
  }, [open, form]);

  const submit = async (status: 'DRAFT' | 'PLACED') => {
    const values = await form.validateFields();
    const input: CreateOrderInput = {
      customerId: values.customerId,
      warehouseId: values.warehouseId,
      orderDate: toIsoDate(values.orderDate),
      requiredByDate: toIsoDate(values.requiredByDate),
      items: (values.items ?? []).map((item: { productId: string; quantity: number }) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
      deliveryAddress: values.deliveryAddress || undefined,
      notes: values.notes || undefined,
      status,
    };

    setSubmittingAs(status);
    try {
      const order = await createOrder.mutateAsync(input);
      message.success(
        status === 'DRAFT' ? `Draft ${order.orderNumber} saved` : `Order ${order.orderNumber} placed`,
      );
      onClose();
    } catch (error) {
      // "No price found for product X in channel B2B" is the common one, and it
      // is precisely the guidance needed — pass it straight through.
      message.error(apiErrorMessage(error, 'Could not create the order'), 8);
    } finally {
      setSubmittingAs(null);
    }
  };

  return (
    <Modal
      open={open}
      width={780}
      title="New order"
      onCancel={onClose}
      destroyOnClose
      footer={[
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Button
          key="draft"
          loading={submittingAs === 'DRAFT'}
          onClick={() => void submit('DRAFT')}
        >
          Save as draft
        </Button>,
        <Button
          key="place"
          type="primary"
          loading={submittingAs === 'PLACED'}
          onClick={() => void submit('PLACED')}
        >
          Place order
        </Button>,
      ]}
    >
      <Form form={form} layout="vertical" requiredMark preserve={false}>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="customerId" label="Customer" rules={[required('Customer')]}>
              <CustomerSelect />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="warehouseId"
              label="Dispatch from"
              rules={[required('Warehouse')]}
              extra="Allocation picks batches from this warehouse only"
            >
              <WarehouseSelect />
            </Form.Item>
          </Col>
        </Row>

        {customer ? (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message={`${customer.channel} pricing applies`}
            description={`Rates resolve from the ${customer.channel} price list for ${customer.type.toLowerCase()} customers, on the order date. Terms: ${customer.paymentTerms.replace('_', ' ').toLowerCase()}.`}
          />
        ) : null}

        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="orderDate" label="Order date" rules={[required('Order date')]}>
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="requiredByDate" label="Required by">
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" placeholder="Optional" />
            </Form.Item>
          </Col>
        </Row>

        <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
          Lines
        </Typography.Text>

        <Form.List name="items">
          {(fields, { add, remove }) => (
            <Space direction="vertical" size={8} style={{ width: '100%', marginBottom: 16 }}>
              {fields.map((field) => (
                <Row key={field.key} gutter={8} align="middle">
                  <Col flex="auto">
                    <Form.Item
                      name={[field.name, 'productId']}
                      rules={[required('Product')]}
                      style={{ marginBottom: 0 }}
                    >
                      <ProductSelect />
                    </Form.Item>
                  </Col>
                  <Col flex="130px">
                    <Form.Item
                      name={[field.name, 'quantity']}
                      rules={[required('Quantity'), positiveNumber('Quantity')]}
                      style={{ marginBottom: 0 }}
                    >
                      <InputNumber min={1} step={1} placeholder="Qty" style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col flex="40px">
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      // The last line stays: an order with no lines is not a
                      // thing the server will accept, so do not let it be built.
                      disabled={fields.length === 1}
                      onClick={() => remove(field.name)}
                    />
                  </Col>
                </Row>
              ))}
              <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({})}>
                Add a line
              </Button>
            </Space>
          )}
        </Form.List>

        <Form.Item
          name="deliveryAddress"
          label="Delivery address"
          extra="Leave blank to use the customer's shipping address. Recorded on the order, so editing the customer later will not change it."
        >
          <Input.TextArea rows={2} placeholder="Optional — defaults to the customer's address" />
        </Form.Item>

        <Form.Item name="notes" label="Notes">
          <Input.TextArea rows={2} placeholder="Optional — delivery instructions, PO reference" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
