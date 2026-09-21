import { PlusOutlined } from '@ant-design/icons';
import { App as AntApp, Button, Card, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import type { ServerCoupon, ServerCouponInput } from '@shared/api/checkout';
import { useCan } from '@shared/auth/useCan';
import { PageHeader } from '@shared/components/PageHeader';
import { useSaveCoupon, useServerCoupons } from '@shared/hooks/useCheckoutAdmin';

interface FormValues extends Omit<ServerCouponInput, 'expiresAt'> {
  expiresAt?: dayjs.Dayjs | null;
}

/** Coupons are validated by the SERVER at checkout against the server's own subtotal: the code, limits and dates here are the only source of truth. */
export function CouponsPage() {
  const { message } = AntApp.useApp();
  const canManage = useCan('COUPONS_MANAGE');
  const coupons = useServerCoupons();
  const save = useSaveCoupon();
  const [editing, setEditing] = useState<ServerCoupon | null>(null);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<FormValues>();

  const openForm = (c: ServerCoupon | null) => {
    setEditing(c);
    form.resetFields();
    form.setFieldsValue(
      c
        ? { code: c.code, title: c.title, description: c.description, type: c.type, value: Number(c.value), minOrderValue: Number(c.minOrderValue),
            maxDiscount: c.maxDiscount ? Number(c.maxDiscount) : null, audience: c.audience, usageLimit: c.usageLimit, perCustomerLimit: c.perCustomerLimit,
            expiresAt: c.expiresAt ? dayjs(c.expiresAt) : null, isActive: c.isActive }
        : { type: 'FIXED', audience: 'ALL', isActive: true, minOrderValue: 0 },
    );
    setOpen(true);
  };

  const submit = async () => {
    const v = await form.validateFields();
    const input: ServerCouponInput = { ...v, expiresAt: v.expiresAt ? v.expiresAt.endOf('day').toISOString() : null };
    try {
      await save.mutateAsync({ id: editing?.id, input });
      message.success(editing ? 'Coupon updated' : 'Coupon created');
      setOpen(false);
    } catch (e) {
      message.error(apiErrorMessage(e, 'Could not save the coupon'), 8);
    }
  };

  return (
    <Card>
      <PageHeader
        title="Coupons"
        subtitle="Codes customers can apply at checkout. Every rule is enforced on the server."
        actions={canManage ? <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm(null)}>New coupon</Button> : undefined}
      />
      <Table<ServerCoupon>
        rowKey="id"
        loading={coupons.isLoading}
        dataSource={coupons.data ?? []}
        pagination={false}
        columns={[
          { title: 'Code', dataIndex: 'code', render: (v: string) => <Tag color="orange">{v}</Tag> },
          { title: 'Offer', render: (_: unknown, c) => `${c.title} — ${c.type === 'PERCENT' ? `${Number(c.value)}%${c.maxDiscount ? ` (max ₹${Number(c.maxDiscount)})` : ''}` : `₹${Number(c.value)} off`}` },
          { title: 'Min order', dataIndex: 'minOrderValue', render: (v: string) => `₹${Number(v)}` },
          { title: 'Audience', dataIndex: 'audience' },
          { title: 'Used', render: (_: unknown, c) => `${c.usedCount}${c.usageLimit ? ` / ${c.usageLimit}` : ''}` },
          { title: 'Expires', dataIndex: 'expiresAt', render: (v: string | null) => (v ? new Date(v).toLocaleDateString('en-IN') : 'Never') },
          { title: 'Status', dataIndex: 'isActive', render: (v: boolean) => (v ? <Tag color="green">Active</Tag> : <Tag>Off</Tag>) },
          { title: '', render: (_: unknown, c) => (canManage ? <Button size="small" onClick={() => openForm(c)}>Edit</Button> : null) },
        ]}
      />
      <Modal open={open} title={editing ? `Edit ${editing.code}` : 'New coupon'} onCancel={() => setOpen(false)} onOk={() => void submit()} confirmLoading={save.isPending} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="code" label="Code" rules={[{ required: true, pattern: /^[A-Za-z0-9_-]{3,24}$/, message: '3-24 letters, digits, - or _' }]}><Input disabled={Boolean(editing)} style={{ textTransform: 'uppercase' }} /></Form.Item>
          <Form.Item name="title" label="Title" rules={[{ required: true, min: 2 }]}><Input /></Form.Item>
          <Form.Item name="description" label="Description"><Input.TextArea rows={2} /></Form.Item>
          <Space align="start" style={{ width: '100%' }} wrap>
            <Form.Item name="type" label="Type"><Select style={{ width: 130 }} options={[{ value: 'FIXED', label: '₹ off' }, { value: 'PERCENT', label: '% off' }]} /></Form.Item>
            <Form.Item name="value" label="Value" rules={[{ required: true }]}><InputNumber min={0.01} /></Form.Item>
            <Form.Item name="maxDiscount" label="Max discount (₹, % only)"><InputNumber min={0} /></Form.Item>
            <Form.Item name="minOrderValue" label="Min order (₹)"><InputNumber min={0} /></Form.Item>
          </Space>
          <Space align="start" wrap>
            <Form.Item name="audience" label="For"><Select style={{ width: 120 }} options={['ALL', 'B2C', 'B2B'].map((v) => ({ value: v, label: v }))} /></Form.Item>
            <Form.Item name="usageLimit" label="Total uses"><InputNumber min={1} placeholder="No limit" /></Form.Item>
            <Form.Item name="perCustomerLimit" label="Per customer"><InputNumber min={1} placeholder="No limit" /></Form.Item>
            <Form.Item name="expiresAt" label="Expires"><DatePicker /></Form.Item>
          </Space>
          <Form.Item name="isActive" label="Active" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
