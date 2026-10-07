import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, App as AntApp, Button, Card, Col, Form, Input, InputNumber, Row, Select, Skeleton, Space, Switch, Table, Tag, Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { affiliatesApi, type AffiliateSettings, type CategoryRateRow } from '@shared/api/affiliates';
import { apiErrorMessage } from '@shared/api/client';
import { useCan } from '@shared/auth/useCan';
import { PageHeader } from '@shared/components/PageHeader';

const { Text } = Typography;

/**
 * Super Admin: the affiliate program switch and rules, and the commission %
 * per product category. A sub-category without its own rate inherits its
 * parent's. Changes apply to orders placed afterwards - earned commission is
 * never re-priced.
 */
export function AffiliateSettingsPage() {
  const canManage = useCan('AFFILIATE_SETTINGS_MANAGE');
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader title="Affiliate Commission Settings" subtitle="Commission % per category, cookie window, return-window hold and payout minimum." />
      {!canManage ? <Alert type="info" showIcon message="View only - only Super Admin can change commission rates and program settings." /> : null}
      <ProgramSettings canManage={canManage} />
      <CategoryMatrix canManage={canManage} />
    </Space>
  );
}

function ProgramSettings({ canManage }: { canManage: boolean }) {
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['affiliate-settings'], queryFn: affiliatesApi.settings });
  const [form] = Form.useForm<AffiliateSettings>();
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (q.data) form.setFieldsValue(q.data); }, [q.data, form]);

  const save = async () => {
    const v = await form.validateFields();
    setSaving(true);
    try {
      await affiliatesApi.updateSettings({
        enabled: v.enabled, cookieDays: v.cookieDays, holdDays: v.holdDays, holdFrom: v.holdFrom, defaultRatePercent: v.defaultRatePercent,
        applyToB2B: v.applyToB2B, minPayoutAmount: v.minPayoutAmount, termsText: v.termsText ?? '',
      });
      message.success('Affiliate program settings saved');
      void qc.invalidateQueries({ queryKey: ['affiliate-settings'] });
      void qc.invalidateQueries({ queryKey: ['affiliate-category-rates'] });
    } catch (e) {
      message.error(apiErrorMessage(e, 'Could not save'), 6);
    } finally {
      setSaving(false);
    }
  };

  if (q.isLoading) return <Card><Skeleton active /></Card>;
  return (
    <Card title="Program" extra={canManage ? <Button type="primary" loading={saving} onClick={save}>Save</Button> : null}>
      <Form form={form} layout="vertical" disabled={!canManage}>
        <Row gutter={16}>
          <Col xs={24} md={8}><Form.Item name="enabled" label="Program on" valuePropName="checked" extra="Off: links stop tracking and no new commission is created."><Switch /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="cookieDays" label="Cookie window" rules={[{ required: true }]} extra="How long after a click a purchase still counts. Last click wins."><InputNumber min={1} max={365} addonAfter="days" style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="defaultRatePercent" label="Default rate" rules={[{ required: true }]} extra="For items whose category (and its parents) has no rate."><InputNumber min={0} max={50} step={0.5} addonAfter="%" style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="holdDays" label="Hold period" rules={[{ required: true }]} extra="Commission stays on hold this long (the return window)."><InputNumber min={0} max={90} addonAfter="days" style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={24} md={8}>
            <Form.Item name="holdFrom" label="Hold counts from" extra="Either way, nothing matures before the order is delivered.">
              <Select options={[{ value: 'ORDER_DATE', label: 'Order date' }, { value: 'DELIVERY_DATE', label: 'Delivery date' }]} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}><Form.Item name="minPayoutAmount" label="Minimum payout" rules={[{ required: true }]}><InputNumber min={0} addonBefore="₹" style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="applyToB2B" label="Retailer (B2B) orders earn" valuePropName="checked"><Switch /></Form.Item></Col>
          <Col xs={24}><Form.Item name="termsText" label="Program terms (shown to applicants)"><Input.TextArea rows={4} maxLength={5000} /></Form.Item></Col>
        </Row>
      </Form>
    </Card>
  );
}

type Draft = Record<string, number | null>;

function CategoryMatrix({ canManage }: { canManage: boolean }) {
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['affiliate-category-rates'], queryFn: affiliatesApi.categoryRates });
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  // Parents first, each followed by its sub-categories, so inheritance reads top to bottom.
  const ordered = useMemo(() => {
    const all = q.data?.categories ?? [];
    const kids = (id: string) => all.filter((c) => c.parentId === id);
    const out: Array<CategoryRateRow & { depth: number }> = [];
    const walk = (c: CategoryRateRow, depth: number) => {
      out.push({ ...c, depth });
      if (depth < 5) kids(c.id).forEach((k) => walk(k, depth + 1));
    };
    all.filter((c) => !c.parentId || !all.some((p) => p.id === c.parentId)).forEach((c) => walk(c, 0));
    const s = search.trim().toLowerCase();
    return s ? out.filter((c) => c.name.toLowerCase().includes(s) || (c.parentName ?? '').toLowerCase().includes(s)) : out;
  }, [q.data, search]);

  const changed = Object.keys(draft).filter((id) => {
    const row = q.data?.categories.find((c) => c.id === id);
    return row && (row.ratePercent ?? null) !== draft[id];
  });

  const save = async () => {
    setSaving(true);
    try {
      const res = await affiliatesApi.setCategoryRates(changed.map((categoryId) => ({ categoryId, ratePercent: draft[categoryId] })));
      qc.setQueryData(['affiliate-category-rates'], res);
      setDraft({});
      message.success(`${changed.length} rate${changed.length === 1 ? '' : 's'} saved - applies to new orders`);
    } catch (e) {
      message.error(apiErrorMessage(e, 'Could not save rates'), 6);
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<CategoryRateRow & { depth: number }> = [
    {
      title: 'Category', key: 'name',
      render: (_, c) => (
        <span style={{ paddingLeft: c.depth * 20 }}>
          {c.depth ? <Text type="secondary">└ </Text> : null}{c.name}
          {!c.isActive ? <Tag style={{ marginLeft: 6 }}>Inactive</Tag> : null}
        </span>
      ),
    },
    { title: 'Products', dataIndex: 'productCount', align: 'right', width: 100 },
    {
      title: 'Own rate', key: 'rate', width: 200,
      render: (_, c) => {
        const value = c.id in draft ? draft[c.id] : c.ratePercent;
        return (
          <Space.Compact>
            <InputNumber min={0} max={50} step={0.5} precision={2} value={value ?? undefined} placeholder="Inherit" disabled={!canManage} addonAfter="%"
              onChange={(v) => setDraft((d) => ({ ...d, [c.id]: v === null || v === undefined ? null : Number(v) }))} style={{ width: 150 }} />
            {value !== null && value !== undefined && canManage ? (
              <Button onClick={() => setDraft((d) => ({ ...d, [c.id]: null }))} title="Clear - inherit again">×</Button>
            ) : null}
          </Space.Compact>
        );
      },
    },
    {
      title: 'Earns', key: 'eff', width: 260,
      render: (_, c) => (
        <span>
          <Text strong>{c.effectiveRatePercent}%</Text>{' '}
          <Text type="secondary" style={{ fontSize: 12 }}>
            {c.effectiveSource === 'CATEGORY' ? 'own rate' : c.effectiveSource === 'PARENT_CATEGORY' ? `from ${c.inheritedFrom}` : 'program default'}
          </Text>
        </span>
      ),
    },
  ];

  return (
    <Card
      title="Commission by category"
      extra={canManage ? (
        <Space>
          {changed.length ? <Button onClick={() => setDraft({})}>Discard</Button> : null}
          <Button type="primary" disabled={!changed.length} loading={saving} onClick={save}>Save {changed.length || ''} change{changed.length === 1 ? '' : 's'}</Button>
        </Space>
      ) : null}
    >
      <Text type="secondary">
        Commission = rate × (item price × quantity − the item's share of the coupon). GST, delivery fees and coin redemptions are never commissioned.
        Typical: staples / atta / oil 1-2%, snacks / masalas 5-8%. "Earns" shows the rate after inheritance (saved values).
      </Text>
      <Input.Search placeholder="Find a category" allowClear onChange={(e) => setSearch(e.target.value)} style={{ width: 280, display: 'block', margin: '12px 0' }} />
      <Table rowKey="id" size="small" loading={q.isLoading} dataSource={ordered} columns={columns} pagination={false} scroll={{ x: 700 }} />
    </Card>
  );
}
