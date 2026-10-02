import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App as AntApp, Button, Card, Checkbox, Col, Form, Input, InputNumber, Modal, Row, Select, Skeleton, Space, Switch, Table, Tabs, Tag, Typography,
} from 'antd';
import { useEffect, useState } from 'react';
import { categoriesApi } from '@shared/api/categories';
import { apiErrorMessage } from '@shared/api/client';
import { REFUND_METHOD_LABEL, returnsApi, type RefundMethod, type ReturnChannel, type ReturnReason, type ReturnSettings } from '@shared/api/returns';
import { useCan } from '@shared/auth/useCan';
import { PageHeader } from '@shared/components/PageHeader';
import { useProducts } from '@shared/hooks/useProduction';

const { Text } = Typography;

/**
 * Super Admin: the return & exchange policy, configured separately for
 * customers (B2C) and retailers (B2B), and the reason list both draw from.
 */
export function ReturnSettingsPage() {
  const canManage = useCan('RETURN_SETTINGS_MANAGE');
  const settings = useQuery({ queryKey: ['return-settings'], queryFn: returnsApi.settings });
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader title="Return & Exchange Settings" subtitle="Windows, eligibility, QC, refund and exchange rules - customers and retailers are configured separately." />
      {settings.isLoading || !settings.data ? <Card><Skeleton active /></Card> : (
        <Tabs
          items={[
            { key: 'B2C', label: 'Customers (B2C)', children: <PolicyForm channel="B2C" value={settings.data.B2C} canManage={canManage} /> },
            { key: 'B2B', label: 'Retailers (B2B)', children: <PolicyForm channel="B2B" value={settings.data.B2B} canManage={canManage} /> },
            { key: 'reasons', label: 'Reasons', children: <ReasonsTable canManage={canManage} /> },
          ]}
        />
      )}
    </Space>
  );
}

function PolicyForm({ channel, value, canManage }: { channel: ReturnChannel; value: ReturnSettings; canManage: boolean }) {
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm<ReturnSettings>();
  const [saving, setSaving] = useState(false);
  const products = useProducts();
  const categories = useQuery({ queryKey: ['categories', 'all'], queryFn: () => categoriesApi.list(true) });
  useEffect(() => form.setFieldsValue(value), [form, value]);

  const productOptions = (products.data?.data ?? []).map((p: { id: string; name: string; sku: string }) => ({ value: p.id, label: `${p.name} (${p.sku})` }));
  const categoryOptions = (categories.data?.data ?? []).map((c) => ({ value: c.id, label: c.name }));
  const methods: RefundMethod[] = channel === 'B2B' ? ['CREDIT_NOTE', 'WALLET', 'UPI', 'BANK'] : ['WALLET', 'UPI', 'BANK'];

  const save = async () => {
    const v = await form.validateFields();
    setSaving(true);
    try {
      await returnsApi.updateSettings(channel, {
        returnEnabled: v.returnEnabled, exchangeEnabled: v.exchangeEnabled, returnWindowHours: v.returnWindowHours, exchangeWindowHours: v.exchangeWindowHours,
        mediaRequired: v.mediaRequired, minMediaCount: v.minMediaCount, maxMediaCount: v.maxMediaCount, qcRequired: v.qcRequired, autoApprove: v.autoApprove,
        allowedRefundMethods: v.allowedRefundMethods, defaultRefundMethod: v.defaultRefundMethod, returnShippingPayer: v.returnShippingPayer,
        returnShippingFee: v.returnShippingFee, restockingFeePercent: v.restockingFeePercent, exchangeSameProductOnly: v.exchangeSameProductOnly,
        exchangeSameCategoryOnly: v.exchangeSameCategoryOnly, exchangeLowerPriceAction: v.exchangeLowerPriceAction, restockOnQcPass: v.restockOnQcPass,
        nonReturnableCategoryIds: v.nonReturnableCategoryIds, nonReturnableProductIds: v.nonReturnableProductIds,
        nonExchangeableCategoryIds: v.nonExchangeableCategoryIds, nonExchangeableProductIds: v.nonExchangeableProductIds, policyText: v.policyText || undefined,
      });
      message.success(`${channel === 'B2C' ? 'Customer' : 'Retailer'} policy saved - applies to new requests`);
      void qc.invalidateQueries({ queryKey: ['return-settings'] });
    } catch (e) {
      message.error(apiErrorMessage(e, 'Could not save'), 8);
    } finally {
      setSaving(false);
    }
  };

  const hours = (name: keyof ReturnSettings, label: string) => (
    <Form.Item name={name} label={label} extra="Counted from the actual delivery time" rules={[{ required: true }]}>
      <InputNumber min={1} max={8760} addonAfter="hours" style={{ width: 200 }} />
    </Form.Item>
  );

  return (
    <Form form={form} layout="vertical" disabled={!canManage}>
      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <Card title="Availability & windows" size="small">
            <Space size={24}>
              <Form.Item name="returnEnabled" label="Returns" valuePropName="checked"><Switch /></Form.Item>
              <Form.Item name="exchangeEnabled" label="Exchanges" valuePropName="checked"><Switch /></Form.Item>
              <Form.Item name="autoApprove" label="Auto-approve" valuePropName="checked"><Switch /></Form.Item>
            </Space>
            <Space size={24} wrap>
              {hours('returnWindowHours', 'Return window')}
              {hours('exchangeWindowHours', 'Exchange window')}
            </Space>
          </Card>
          <Card title="Evidence & QC" size="small" style={{ marginTop: 16 }}>
            <Space size={24} wrap>
              <Form.Item name="mediaRequired" label="Photos/videos always required" valuePropName="checked"><Switch /></Form.Item>
              <Form.Item name="minMediaCount" label="Minimum"><InputNumber min={0} max={10} /></Form.Item>
              <Form.Item name="maxMediaCount" label="Maximum"><InputNumber min={1} max={10} /></Form.Item>
            </Space>
            <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>A reason can also demand photos (Reasons tab).</Text>
            <Space size={24} wrap>
              <Form.Item name="qcRequired" label="QC before refund / replacement" valuePropName="checked" extra="Off: receipt at the warehouse counts as passed"><Switch /></Form.Item>
              <Form.Item name="restockOnQcPass" label="QC-passed packs back to sellable stock" valuePropName="checked" extra="Off: every returned pack goes to damaged"><Switch /></Form.Item>
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Refunds" size="small">
            <Form.Item name="allowedRefundMethods" label="Allowed refund methods" rules={[{ required: true }]}>
              <Checkbox.Group options={methods.map((m) => ({ value: m, label: REFUND_METHOD_LABEL[m] }))} />
            </Form.Item>
            <Form.Item name="defaultRefundMethod" label="Default"><Select options={methods.map((m) => ({ value: m, label: REFUND_METHOD_LABEL[m] }))} style={{ width: 240 }} /></Form.Item>
            <Space size={16} wrap>
              <Form.Item name="returnShippingPayer" label="Return shipping paid by">
                <Select style={{ width: 160 }} options={[{ value: 'COMPANY', label: 'Company' }, { value: 'CUSTOMER', label: 'Customer' }]} />
              </Form.Item>
              <Form.Item name="returnShippingFee" label="Return shipping fee"><InputNumber min={0} addonBefore="₹" /></Form.Item>
              <Form.Item name="restockingFeePercent" label="Restocking fee"><InputNumber min={0} max={100} addonAfter="%" /></Form.Item>
            </Space>
            <Text type="secondary" style={{ fontSize: 12 }}>Fees are never charged when the reason is the company&apos;s fault (damaged, wrong item, defective). Refunds are always based on what was actually paid after coupons and coins.</Text>
          </Card>
          <Card title="Exchanges" size="small" style={{ marginTop: 16 }}>
            <Space size={24} wrap>
              <Form.Item name="exchangeSameProductOnly" label="Same product only" valuePropName="checked"><Switch /></Form.Item>
              <Form.Item name="exchangeSameCategoryOnly" label="Same category only" valuePropName="checked"><Switch /></Form.Item>
            </Space>
            <Form.Item name="exchangeLowerPriceAction" label="Cheaper replacement" extra="A dearer one is always paid for by the customer before it ships">
              <Select style={{ width: 300 }} options={[{ value: 'REFUND_TO_WALLET', label: 'Credit the difference to the Refund Wallet' }, { value: 'NO_REFUND', label: 'No refund of the difference' }]} />
            </Form.Item>
          </Card>
        </Col>
      </Row>
      <Card title="Eligibility" size="small" style={{ marginTop: 16 }}>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="nonReturnableCategoryIds" label="Categories that cannot be returned"><Select mode="multiple" allowClear options={categoryOptions} optionFilterProp="label" /></Form.Item>
            <Form.Item name="nonReturnableProductIds" label="Products that cannot be returned"><Select mode="multiple" allowClear options={productOptions} optionFilterProp="label" /></Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="nonExchangeableCategoryIds" label="Categories that cannot be exchanged"><Select mode="multiple" allowClear options={categoryOptions} optionFilterProp="label" /></Form.Item>
            <Form.Item name="nonExchangeableProductIds" label="Products that cannot be exchanged"><Select mode="multiple" allowClear options={productOptions} optionFilterProp="label" /></Form.Item>
          </Col>
        </Row>
        <Form.Item name="policyText" label="Policy shown to the customer"><Input.TextArea rows={3} maxLength={4000} /></Form.Item>
      </Card>
      {canManage ? <Button type="primary" loading={saving} onClick={() => void save()} style={{ marginTop: 16 }}>Save {channel === 'B2C' ? 'customer' : 'retailer'} policy</Button> : null}
    </Form>
  );
}

function ReasonsTable({ canManage }: { canManage: boolean }) {
  const { message } = AntApp.useApp();
  const q = useQuery({ queryKey: ['return-settings', 'reasons'], queryFn: returnsApi.reasons });
  const [editing, setEditing] = useState<Partial<ReturnReason> | null>(null);
  const [form] = Form.useForm<ReturnReason>();

  const save = async () => {
    const v = await form.validateFields();
    try {
      if (editing?.id) {
        const { code: _code, ...rest } = v;
        await returnsApi.updateReason(editing.id, { ...rest, channel: rest.channel ?? null });
      } else await returnsApi.createReason({ ...v, channel: v.channel ?? null });
      setEditing(null);
      void q.refetch();
    } catch (e) {
      message.error(apiErrorMessage(e), 6);
    }
  };

  return (
    <Card size="small" extra={canManage ? <Button icon={<PlusOutlined />} onClick={() => { form.resetFields(); form.setFieldsValue({ forReturn: true, forExchange: true, isActive: true, sortOrder: 100 }); setEditing({}); }}>Add reason</Button> : null}>
      <Table<ReturnReason>
        size="small" rowKey="id" loading={q.isLoading} dataSource={q.data ?? []} pagination={false}
        columns={[
          { title: 'Reason', key: 'l', render: (_, r) => <div>{r.label}<div><Text type="secondary" style={{ fontSize: 12 }}>{r.code}</Text></div></div> },
          { title: 'For', key: 'f', render: (_, r) => <Space size={4}>{r.forReturn ? <Tag>Return</Tag> : null}{r.forExchange ? <Tag>Exchange</Tag> : null}</Space> },
          { title: 'Channel', dataIndex: 'channel', render: (c: string | null) => c ?? 'Both' },
          { title: 'Company fault', dataIndex: 'companyFault', render: (v: boolean) => (v ? <Tag color="red">yes - no fees</Tag> : 'no') },
          { title: 'Photos', dataIndex: 'requiresMedia', render: (v: boolean) => (v ? 'required' : 'optional') },
          { title: 'Active', dataIndex: 'isActive', render: (v: boolean) => (v ? <Tag color="green">active</Tag> : <Tag>off</Tag>) },
          ...(canManage ? [{ title: '', key: 'e', render: (_: unknown, r: ReturnReason) => <a onClick={() => { form.setFieldsValue(r); setEditing(r); }}>Edit</a> }] : []),
        ]}
      />
      <Modal open={editing !== null} title={editing?.id ? 'Edit reason' : 'Add reason'} onCancel={() => setEditing(null)} onOk={() => void save()} destroyOnClose>
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="code" label="Code" rules={[{ required: true, pattern: /^[A-Z0-9_]{2,40}$/, message: 'Capitals, digits, underscores' }]}><Input disabled={Boolean(editing?.id)} /></Form.Item>
          <Form.Item name="label" label="Shown as" rules={[{ required: true, min: 2 }]}><Input /></Form.Item>
          <Space size={24} wrap>
            <Form.Item name="forReturn" label="For returns" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="forExchange" label="For exchanges" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="companyFault" label="Company fault" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="requiresMedia" label="Needs photos" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="isActive" label="Active" valuePropName="checked"><Switch /></Form.Item>
          </Space>
          <Space size={24}>
            <Form.Item name="channel" label="Channel"><Select allowClear placeholder="Both" style={{ width: 160 }} options={[{ value: 'B2C', label: 'Customers' }, { value: 'B2B', label: 'Retailers' }]} /></Form.Item>
            <Form.Item name="sortOrder" label="Order"><InputNumber /></Form.Item>
          </Space>
        </Form>
      </Modal>
    </Card>
  );
}
