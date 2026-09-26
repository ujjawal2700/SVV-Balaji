import { EditOutlined, EnvironmentOutlined, PlusOutlined, ThunderboltOutlined } from '@ant-design/icons';
import {
  Alert, App as AntApp, Button, Card, Col, Divider, Drawer, Form, Input, InputNumber, Popconfirm, Row, Select, Space, Switch, Table, Tag, TimePicker, Tooltip, Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import { deliveryApi, type DeliveryZone, type OpeningWindow, type ZoneInput } from '@shared/api/delivery';
import { useCan } from '@shared/auth/useCan';
import { PageHeader } from '@shared/components/PageHeader';
import { useCategories } from '@shared/hooks/useCategories';
import { useDeliveryMutation, useZones } from '@shared/hooks/useDelivery';
import { useWarehouses } from '../../hooks/useWarehouses';
import { ZoneMapEditor, type LatLng } from './ZoneMapEditor';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const listOf = <T,>(x: unknown): T[] => (Array.isArray(x) ? x : ((x as { data?: T[] })?.data ?? [])) as T[];

/** Super Admin: which areas get Quick Delivery, from which outlet, how fast, when, and what happens otherwise. */
export function DeliveryZonesPage() {
  const zones = useZones();
  const canManage = useCan('DELIVERY_ZONES_MANAGE');
  const [editing, setEditing] = useState<DeliveryZone | 'new' | null>(null);
  const { message } = AntApp.useApp();
  const remove = useDeliveryMutation((id: string) => deliveryApi.removeZone(id));
  const toggle = useDeliveryMutation(({ id, quickEnabled }: { id: string; quickEnabled: boolean }) => deliveryApi.updateZone(id, { quickEnabled }));

  const columns: ColumnsType<DeliveryZone> = [
    {
      title: 'Zone',
      key: 'zone',
      render: (_, z) => (
        <div>
          <div style={{ fontWeight: 600 }}>{z.name} {!z.isActive ? <Tag>Inactive</Tag> : null}</div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{z.code} · priority {z.priority}</Typography.Text>
        </div>
      ),
    },
    {
      title: 'Quick Delivery',
      key: 'quick',
      render: (_, z) => (
        <Space>
          <Switch size="small" checked={z.quickEnabled} disabled={!canManage || !z.isActive} loading={toggle.isPending}
            onChange={(v) => toggle.mutate({ id: z.id, quickEnabled: v }, { onError: (e) => message.error(apiErrorMessage(e)) })} />
          {z.quickEnabled ? <Tag color="orange" icon={<ThunderboltOutlined />}>{z.targetMinMinutes}–{z.targetMaxMinutes} min</Tag> : <Tag>Normal delivery</Tag>}
        </Space>
      ),
    },
    { title: 'Serving outlet', key: 'wh', render: (_, z) => z.warehouse?.name },
    {
      title: 'Coverage',
      key: 'cov',
      render: (_, z) => (
        <Space size={4} wrap>
          {z.boundary ? <Tag color="blue">Boundary · {z.boundary.length} pts</Tag> : null}
          {z.pincodes.length ? <Tooltip title={z.pincodes.join(', ')}><Tag>{z.pincodes.length} pincode{z.pincodes.length === 1 ? '' : 's'}</Tag></Tooltip> : null}
          {z.maxRadiusKm ? <Tag>≤ {Number(z.maxRadiusKm)} km</Tag> : null}
        </Space>
      ),
    },
    {
      title: 'Hours',
      key: 'hours',
      render: (_, z) => (z.operatingHours.length ? <Tooltip title={z.operatingHours.map((w) => `${DAYS[w.day]} ${w.open}–${w.close}`).join(', ')}><span>{z.operatingHours.length} window(s)</span></Tooltip> : 'Always'),
    },
    { title: 'Fee', key: 'fee', render: (_, z) => (Number(z.quickFee) ? `₹${Number(z.quickFee)}${z.quickFreeAbove ? ` (free ≥ ₹${Number(z.quickFreeAbove)})` : ''}` : 'Free') },
    { title: 'Otherwise', key: 'fb', render: (_, z) => (z.fallback === 'COURIER' ? 'Courier' : 'Standard') },
    { title: 'Orders', key: 'orders', align: 'right', render: (_, z) => z._count?.orders ?? 0 },
    {
      title: '',
      key: 'act',
      width: 150,
      render: (_, z) =>
        canManage ? (
          <Space>
            <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(z)}>Edit</Button>
            <Popconfirm title="Remove this zone?" description="A zone that served orders is switched off instead." onConfirm={() => remove.mutate(z.id, { onSuccess: (r) => message.success(r.deleted ? 'Zone deleted' : 'Zone deactivated'), onError: (e) => message.error(apiErrorMessage(e)) })}>
              <Button size="small" danger>Remove</Button>
            </Popconfirm>
          </Space>
        ) : null,
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="Delivery Zones"
        subtitle="Where Quick Delivery runs. A customer sees the Quick option only when their pinned location (or pincode) falls in a zone with Quick on, it is open, and the serving outlet has every item."
        actions={canManage ? <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>New zone</Button> : null}
      />
      <TestAddress />
      <Card size="small" style={{ borderRadius: 10 }}>
        <Table<DeliveryZone> rowKey="id" columns={columns} dataSource={zones.data ?? []} loading={zones.isLoading} pagination={false} scroll={{ x: 1000 }}
          locale={{ emptyText: 'No zones yet - every customer gets normal delivery.' }} />
      </Card>
      {editing ? <ZoneDrawer zone={editing === 'new' ? null : editing} all={zones.data ?? []} onClose={() => setEditing(null)} /> : null}
    </Space>
  );
}

function TestAddress() {
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [pin, setPin] = useState('');
  const [res, setRes] = useState<Awaited<ReturnType<typeof deliveryApi.testZone>> | null>(null);
  const { message } = AntApp.useApp();
  const run = async () => {
    try {
      setRes(await deliveryApi.testZone({ latitude: lat ?? undefined, longitude: lng ?? undefined, pincode: pin || undefined }));
    } catch (e) {
      message.error(apiErrorMessage(e));
    }
  };
  return (
    <Card size="small" style={{ borderRadius: 10 }} title={<Space><EnvironmentOutlined /> Check an address</Space>}>
      <Space wrap>
        <InputNumber placeholder="Latitude" value={lat} onChange={(v) => setLat(v === null ? null : Number(v))} style={{ width: 150 }} />
        <InputNumber placeholder="Longitude" value={lng} onChange={(v) => setLng(v === null ? null : Number(v))} style={{ width: 150 }} />
        <Input placeholder="Pincode" value={pin} onChange={(e) => setPin(e.target.value)} style={{ width: 120 }} />
        <Button onClick={() => void run()}>Check</Button>
        {res ? (
          res.zone ? (
            <Space>
              <Tag color="green">{res.zone.name}</Tag>
              <span>matched by {res.matchedBy?.toLowerCase()}{res.distanceKm !== null ? `, ${res.distanceKm} km from ${res.servingOutlet}` : ''}</span>
              {res.quickEnabled ? (res.openNow ? <Tag color="orange">Quick open now</Tag> : <Tag>Quick closed now</Tag>) : <Tag>Quick off</Tag>}
            </Space>
          ) : <Tag>Not in any zone - normal delivery</Tag>
        ) : null}
      </Space>
    </Card>
  );
}

interface FormValues {
  name: string; code: string; isActive: boolean; quickEnabled: boolean; warehouseId: string;
  pincodesText: string; maxRadiusKm: number | null; targetMinMinutes: number; targetMaxMinutes: number;
  timezone: string; productScope: 'ALL_PRODUCTS' | 'SELECTED_CATEGORIES'; categoryIds: string[]; fallback: 'STANDARD' | 'COURIER';
  quickFee: number; quickFreeAbove: number | null; priority: number;
}

function ZoneDrawer({ zone, all, onClose }: { zone: DeliveryZone | null; all: DeliveryZone[]; onClose: () => void }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = AntApp.useApp();
  const warehouses = useWarehouses();
  const categories = useCategories();
  const [boundary, setBoundary] = useState<LatLng[]>(zone?.boundary ?? []);
  const [hours, setHours] = useState<OpeningWindow[]>(zone?.operatingHours ?? []);
  const save = useDeliveryMutation((b: ZoneInput) => (zone ? deliveryApi.updateZone(zone.id, b) : deliveryApi.createZone(b)));
  const whId = Form.useWatch('warehouseId', form);
  const radius = Form.useWatch('maxRadiusKm', form);
  const scope = Form.useWatch('productScope', form);

  const whList = listOf<{ id: string; name: string; kind?: string; isActive: boolean; latitude?: string | null; longitude?: string | null }>(warehouses.data);
  const outlets = useMemo(
    () => whList.filter((w) => w.isActive && w.latitude && w.longitude).map((w) => ({ id: w.id, name: w.name, lat: Number(w.latitude), lng: Number(w.longitude) })),
    [whList],
  );
  const others = useMemo(() => all.filter((z) => z.id !== zone?.id && z.isActive && z.boundary).map((z) => ({ name: z.name, boundary: z.boundary as LatLng[] })), [all, zone?.id]);

  const submit = async () => {
    const v = await form.validateFields();
    const pincodes = v.pincodesText.split(/[\s,]+/).map((p) => p.trim()).filter(Boolean);
    if (boundary.length > 0 && boundary.length < 3) return message.error('A boundary needs at least 3 points (or clear it)');
    try {
      await save.mutateAsync({
        name: v.name, code: v.code.toUpperCase(), isActive: v.isActive, quickEnabled: v.quickEnabled, warehouseId: v.warehouseId,
        boundary: boundary.length ? boundary : null, pincodes, maxRadiusKm: v.maxRadiusKm ?? null,
        targetMinMinutes: v.targetMinMinutes, targetMaxMinutes: v.targetMaxMinutes, operatingHours: hours, timezone: v.timezone,
        productScope: v.productScope, categoryIds: v.productScope === 'SELECTED_CATEGORIES' ? v.categoryIds ?? [] : [],
        fallback: v.fallback, quickFee: v.quickFee ?? 0, quickFreeAbove: v.quickFreeAbove ?? null, priority: v.priority ?? 0,
      });
      message.success(zone ? 'Zone updated' : 'Zone created');
      onClose();
    } catch (e) {
      message.error(apiErrorMessage(e, 'Could not save the zone'));
    }
  };

  return (
    <Drawer open width={Math.min(980, window.innerWidth)} title={zone ? `Edit zone · ${zone.name}` : 'New delivery zone'} onClose={onClose} destroyOnClose
      extra={<Space><Button onClick={onClose}>Cancel</Button><Button type="primary" loading={save.isPending} onClick={() => void submit()}>Save zone</Button></Space>}>
      <Form<FormValues> form={form} layout="vertical" requiredMark={false}
        initialValues={{
          name: zone?.name, code: zone?.code, isActive: zone?.isActive ?? true, quickEnabled: zone?.quickEnabled ?? true, warehouseId: zone?.warehouseId,
          pincodesText: (zone?.pincodes ?? []).join(', '), maxRadiusKm: zone?.maxRadiusKm ? Number(zone.maxRadiusKm) : null,
          targetMinMinutes: zone?.targetMinMinutes ?? 15, targetMaxMinutes: zone?.targetMaxMinutes ?? 20, timezone: zone?.timezone ?? 'Asia/Kolkata',
          productScope: zone?.productScope ?? 'ALL_PRODUCTS', categoryIds: zone?.categoryIds ?? [], fallback: zone?.fallback ?? 'STANDARD',
          quickFee: zone ? Number(zone.quickFee) : 0, quickFreeAbove: zone?.quickFreeAbove ? Number(zone.quickFreeAbove) : null, priority: zone?.priority ?? 0,
        }}>
        <Row gutter={16}>
          <Col xs={24} md={10}><Form.Item name="name" label="Zone name" rules={[{ required: true, min: 2 }]}><Input placeholder="e.g. Arera Colony" /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item name="code" label="Code" rules={[{ required: true, pattern: /^[A-Za-z0-9-]{2,30}$/, message: 'Letters, digits, dashes' }]}><Input placeholder="BPL-ARERA" disabled={Boolean(zone)} /></Form.Item></Col>
          <Col xs={6} md={4}><Form.Item name="quickEnabled" label="Quick Delivery" valuePropName="checked"><Switch /></Form.Item></Col>
          <Col xs={6} md={4}><Form.Item name="isActive" label="Zone active" valuePropName="checked"><Switch /></Form.Item></Col>
        </Row>
        <Form.Item name="warehouseId" label="Serving outlet / warehouse" rules={[{ required: true }]} extra="Quick orders in this zone are picked up here; its stock decides what can go Quick. Only warehouses with map coordinates can serve.">
          <Select showSearch optionFilterProp="label" loading={warehouses.isLoading}
            options={whList.filter((w) => w.isActive).map((w) => ({ value: w.id, label: `${w.name}${w.kind ? ` (${w.kind.toLowerCase()})` : ''}${w.latitude ? '' : ' - no coordinates'}`, disabled: !w.latitude }))} />
        </Form.Item>

        <Divider orientation="left" plain>Coverage</Divider>
        <ZoneMapEditor value={boundary} onChange={setBoundary} outlets={outlets} servingOutletId={whId} radiusKm={radius} otherZones={others} />
        <Row gutter={16} style={{ marginTop: 16 }}>
          <Col xs={24} md={14}>
            <Form.Item name="pincodesText" label="Pincodes" extra="Used for addresses without a map pin (and when no boundary is drawn). Comma or space separated.">
              <Input.TextArea rows={2} placeholder="462016, 462011" />
            </Form.Item>
          </Col>
          <Col xs={24} md={10}>
            <Form.Item name="maxRadiusKm" label="Maximum delivery radius (km)" extra="Hard cap from the outlet, even inside the boundary. Empty = no cap.">
              <InputNumber min={0.1} max={100} step={0.5} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left" plain>Promise</Divider>
        <Row gutter={16}>
          <Col xs={12} md={6}><Form.Item name="targetMinMinutes" label="Delivery time from (min)" rules={[{ required: true }]}><InputNumber min={1} max={240} style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item name="targetMaxMinutes" label="to (min)" rules={[{ required: true }]}><InputNumber min={1} max={240} style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item name="quickFee" label="Quick fee (₹)"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item name="quickFreeAbove" label="Free above (₹)" extra="Empty = never free"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
        </Row>

        <Divider orientation="left" plain>Operating hours</Divider>
        <HoursEditor value={hours} onChange={setHours} />
        <Form.Item name="timezone" label="Time zone" style={{ marginTop: 12, maxWidth: 260 }}><Input /></Form.Item>

        <Divider orientation="left" plain>Products & fallback</Divider>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="productScope" label="Quick Delivery covers">
              <Select options={[{ value: 'ALL_PRODUCTS', label: 'All products stocked at the outlet' }, { value: 'SELECTED_CATEGORIES', label: 'Only chosen categories (still must be in stock)' }]} />
            </Form.Item>
            {scope === 'SELECTED_CATEGORIES' ? (
              <Form.Item name="categoryIds" label="Categories" rules={[{ required: true, type: 'array', min: 1 }]}>
                <Select mode="multiple" optionFilterProp="label" options={listOf<{ id: string; name: string; parentId: string | null }>(categories.data).map((c) => ({ value: c.id, label: c.parentId ? `  ${c.name}` : c.name }))} />
              </Form.Item>
            ) : null}
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="fallback" label="When Quick is not possible" extra="Closed, not in stock, or product not covered.">
              <Select options={[{ value: 'STANDARD', label: 'Normal routing (local if possible, else courier)' }, { value: 'COURIER', label: 'Always courier' }]} />
            </Form.Item>
          </Col>
          <Col xs={24} md={4}><Form.Item name="priority" label="Priority" extra="Overlaps: higher wins"><InputNumber min={-100} max={100} style={{ width: '100%' }} /></Form.Item></Col>
        </Row>
        <Alert type="info" showIcon message="Nothing is hard-coded: times, fees, hours and coverage all come from this form. Changes apply to the next checkout." />
      </Form>
    </Drawer>
  );
}

function HoursEditor({ value, onChange }: { value: OpeningWindow[]; onChange: (v: OpeningWindow[]) => void }) {
  const add = () => onChange([...value, { day: 1, open: '08:00', close: '22:00' }]);
  const everyDay = () => onChange([0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: '08:00', close: '22:00' })));
  const set = (i: number, patch: Partial<OpeningWindow>) => onChange(value.map((w, k) => (k === i ? { ...w, ...patch } : w)));
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {value.length === 0 ? <Typography.Text type="secondary">Open all the time. Add windows to limit Quick Delivery to set hours.</Typography.Text> : null}
      {value.map((w, i) => (
        <Space key={i} wrap>
          <Select value={w.day} style={{ width: 90 }} onChange={(d) => set(i, { day: d })} options={DAYS.map((d, k) => ({ value: k, label: d }))} />
          <TimePicker format="HH:mm" value={dayjs(w.open, 'HH:mm')} allowClear={false} onChange={(t) => t && set(i, { open: t.format('HH:mm') })} />
          <span>to</span>
          <TimePicker format="HH:mm" value={dayjs(w.close, 'HH:mm')} allowClear={false} onChange={(t) => t && set(i, { close: t.format('HH:mm') })} />
          {w.close < w.open ? <Tag>runs past midnight</Tag> : null}
          <Button size="small" danger onClick={() => onChange(value.filter((_, k) => k !== i))}>Remove</Button>
        </Space>
      ))}
      <Space>
        <Button size="small" onClick={add}>Add window</Button>
        <Button size="small" onClick={everyDay}>Every day 08:00–22:00</Button>
        {value.length ? <Button size="small" onClick={() => onChange([])}>Always open</Button> : null}
      </Space>
    </Space>
  );
}
