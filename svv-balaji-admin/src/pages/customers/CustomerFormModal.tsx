import { Alert, App as AntApp, Col, Form, Input, InputNumber, Modal, Row, Select } from 'antd';
import { useEffect } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import type { CreateCustomerInput, Customer, SalesChannel } from '@shared/api/types';
import { CUSTOMER_TYPES, PAYMENT_TERMS, SALES_CHANNELS } from '@shared/api/types';
import { useCan } from '@shared/auth/useCan';
import { BranchSelect } from '@shared/components/pickers';
import { useCreateCustomer, useUpdateCustomer } from '@shared/hooks/useCustomers';
import { useUsers } from '@shared/hooks/useUsers';
import { email, gstin, maxLength, mobile, pincode, required } from '@shared/validation/rules';

/** Which customer types belong to which channel. The server enforces the same pairing. */
const TYPES_BY_CHANNEL: Record<SalesChannel, readonly string[]> = {
  B2B: ['DISTRIBUTOR', 'RETAILER', 'INSTITUTIONAL'],
  B2C: ['CONSUMER'],
};

const CHANNEL_LABELS: Record<SalesChannel, string> = {
  B2B: 'B2B — distributors, retailers, institutions',
  B2C: 'B2C — individual consumers',
};

const TERM_LABELS: Record<string, string> = {
  PREPAID: 'Prepaid — payment before dispatch',
  CREDIT_7: 'Credit — 7 days',
  CREDIT_15: 'Credit — 15 days',
  CREDIT_30: 'Credit — 30 days',
  CREDIT_45: 'Credit — 45 days',
};

interface CustomerFormModalProps {
  open: boolean;
  /** Present means edit; absent means create. */
  customer?: Customer | null;
  onClose: () => void;
}

/**
 * One registry, two shapes.
 *
 * Channel is chosen first and drives the rest of the form: B2B asks for a
 * GSTIN, a credit limit, payment terms and an assigned executive; B2C asks for
 * none of them, because a consumer has none of them. Asking anyway would be
 * asking for data that does not exist, and would then have to be explained away
 * on every screen that reads it back.
 *
 * On edit the channel control is disabled. That is not a UI preference — the
 * server rejects a channel change outright. A customer's channel decides which
 * price list resolves for their orders, so changing it would retroactively
 * reprice a trading history.
 */
export function CustomerFormModal({ open, customer, onClose }: CustomerFormModalProps) {
  const [form] = Form.useForm<CreateCustomerInput>();
  const { message } = AntApp.useApp();
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();

  const isEdit = Boolean(customer);
  const channel = Form.useWatch('channel', form) ?? customer?.channel ?? 'B2B';
  const isB2B = channel === 'B2B';

  /**
   * Sales executives, to own the account. B2B only.
   *
   * Gated on USER_VIEW because GET /users is not open to the Sales Team, who
   * are the people most likely to be on this form. Without the gate every
   * customer they register would fire a 403 in the background. When they cannot
   * read the list the field simply is not offered — a Branch Manager assigns
   * the account afterwards.
   */
  const canListUsers = useCan('USER_VIEW');
  const users = useUsers({ status: 'ACTIVE' }, canListUsers);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (customer) {
      form.setFieldsValue({
        channel: customer.channel,
        type: customer.type,
        name: customer.name,
        contactName: customer.contactName ?? undefined,
        phone: customer.phone,
        email: customer.email ?? undefined,
        gstin: customer.gstin ?? undefined,
        billingAddress: customer.billingAddress,
        shippingAddress: customer.shippingAddress ?? undefined,
        city: customer.city ?? undefined,
        district: customer.district ?? undefined,
        state: customer.state ?? undefined,
        pincode: customer.pincode ?? undefined,
        creditLimit: customer.creditLimit ? Number(customer.creditLimit) : undefined,
        paymentTerms: customer.paymentTerms,
        branchId: customer.branchId ?? undefined,
        assignedToId: customer.assignedToId ?? undefined,
      });
    } else {
      form.setFieldsValue({ channel: 'B2B', paymentTerms: 'PREPAID' });
    }
  }, [open, customer, form]);

  /**
   * Changing channel mid-form clears the fields that belong to the other one.
   * Leaving a stale GSTIN in a hidden field and posting it is how a consumer
   * ends up with a tax number.
   */
  const handleChannelChange = (next: SalesChannel) => {
    form.setFieldsValue({
      type: next === 'B2C' ? 'CONSUMER' : undefined,
      gstin: undefined,
      creditLimit: undefined,
      assignedToId: undefined,
      paymentTerms: next === 'B2C' ? 'PREPAID' : 'PREPAID',
    });
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      if (customer) {
        // `channel` is stripped rather than sent-and-ignored: the server's
        // ValidationPipe runs forbidNonWhitelisted, so an unexpected property
        // is a 400, not a shrug.
        const { channel: _channel, ...rest } = values;
        const updated = await updateCustomer.mutateAsync({ id: customer.id, input: rest });
        message.success(`${updated.name} updated`);
      } else {
        const created = await createCustomer.mutateAsync(values);
        message.success(`${created.name} registered as ${created.customerCode}`);
      }
      onClose();
    } catch (error) {
      message.error(
        apiErrorMessage(error, `Could not ${isEdit ? 'update' : 'register'} the customer`),
        8,
      );
    }
  };

  return (
    <Modal
      open={open}
      width={760}
      title={isEdit ? `Edit ${customer?.name}` : 'Register a customer'}
      okText={isEdit ? 'Save changes' : 'Register customer'}
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={createCustomer.isPending || updateCustomer.isPending}
      destroyOnClose
    >
      <Form form={form} layout="vertical" requiredMark preserve={false}>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item
              name="channel"
              label="Sales channel"
              rules={[required('Sales channel')]}
              extra={
                isEdit
                  ? 'Fixed at registration — it decides which price list applies'
                  : 'Choose this first: it decides which of the fields below apply'
              }
            >
              <Select
                disabled={isEdit}
                onChange={handleChannelChange}
                options={SALES_CHANNELS.map((value) => ({
                  value,
                  label: CHANNEL_LABELS[value],
                }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="type" label="Customer type" rules={[required('Customer type')]}>
              <Select
                options={CUSTOMER_TYPES.filter((type) =>
                  TYPES_BY_CHANNEL[channel as SalesChannel].includes(type),
                ).map((value) => ({ value, label: value.charAt(0) + value.slice(1).toLowerCase() }))}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item
              name="name"
              label={isB2B ? 'Business name' : 'Full name'}
              rules={[required('Name'), maxLength(160)]}
            >
              <Input placeholder={isB2B ? 'Sri Lakshmi Traders' : 'Ramesh Kumar'} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="contactName"
              label="Contact person"
              rules={[maxLength(120)]}
              extra={isB2B ? 'Who to call at the business' : undefined}
            >
              <Input placeholder="Optional" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="phone" label="Phone" rules={[required('Phone'), mobile()]}>
              <Input placeholder="9876543210" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="email" label="Email" rules={[email(), maxLength(160)]}>
              <Input placeholder="Optional" />
            </Form.Item>
          </Col>
        </Row>

        {isB2B ? (
          <Form.Item
            name="gstin"
            label="GSTIN"
            // Required on create, not on edit — the server enforces exactly
            // that split, so a B2B record registered before this rule existed
            // can still be corrected without inventing a tax number.
            rules={isEdit ? [gstin(), maxLength(15)] : [required('GSTIN'), gstin(), maxLength(15)]}
            extra="Goes on the tax invoice. A B2B customer cannot be registered without one."
          >
            <Input placeholder="36AABCS1429B1ZQ" style={{ textTransform: 'uppercase' }} />
          </Form.Item>
        ) : null}

        <Form.Item
          name="billingAddress"
          label="Billing address"
          rules={[required('Billing address')]}
        >
          <Input.TextArea rows={2} />
        </Form.Item>

        <Form.Item
          name="shippingAddress"
          label="Shipping address"
          extra="Leave blank if goods go to the billing address"
        >
          <Input.TextArea rows={2} placeholder="Optional" />
        </Form.Item>

        <Row gutter={16}>
          <Col xs={12} md={6}>
            <Form.Item name="city" label="City" rules={[maxLength(80)]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="district" label="District" rules={[maxLength(80)]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="state" label="State" rules={[maxLength(80)]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="pincode" label="PIN code" rules={[pincode()]}>
              <Input placeholder="500001" />
            </Form.Item>
          </Col>
        </Row>

        {isB2B ? (
          <>
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message="Credit terms"
              description="The limit is checked when an order is confirmed, against everything unpaid. Leave it blank to keep the account strictly prepaid."
            />
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item name="creditLimit" label="Credit limit (₹)">
                  <InputNumber
                    min={0}
                    step={1000}
                    style={{ width: '100%' }}
                    placeholder="No limit — prepaid only"
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="paymentTerms" label="Payment terms">
                  <Select
                    options={PAYMENT_TERMS.map((value) => ({
                      value,
                      label: TERM_LABELS[value] ?? value,
                    }))}
                  />
                </Form.Item>
              </Col>
            </Row>
          </>
        ) : null}

        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="branchId" label="Branch" extra="Which branch services this account">
              <BranchSelect allowClear placeholder="Optional" />
            </Form.Item>
          </Col>
          {isB2B && canListUsers ? (
            <Col xs={24} md={12}>
              <Form.Item name="assignedToId" label="Assigned executive">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="Optional"
                  loading={users.isLoading}
                  options={(users.data?.data ?? [])
                    .filter((user) => user.role === 'SALES_TEAM' || user.role === 'BRANCH_MANAGER')
                    .map((user) => ({ value: user.id, label: user.fullName }))}
                />
              </Form.Item>
            </Col>
          ) : null}
        </Row>
      </Form>
    </Modal>
  );
}
