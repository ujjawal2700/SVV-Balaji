import { CarOutlined } from '@ant-design/icons';
import { App as AntApp, Button, Card, Col, InputNumber, Row, Select, Skeleton, Switch, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import type { CheckoutSettings, UpdateCheckoutSettingsInput } from '@shared/api/checkout';
import { useCan } from '@shared/auth/useCan';
import { PageHeader } from '@shared/components/PageHeader';
import { useCheckoutSettings, useUpdateCheckoutSettings } from '@shared/hooks/useCheckoutAdmin';
import { useWarehouses } from '../../hooks/useWarehouses';

type Draft = Required<Omit<UpdateCheckoutSettingsInput, never>>;
const n = (v: string | null) => (v === null ? null : Number(v));
const toDraft = (s: CheckoutSettings): Draft => ({
  localRadiusKm: Number(s.localRadiusKm), centralWarehouseId: s.centralWarehouseId,
  localBaseFee: Number(s.localBaseFee), localFreeAbove: n(s.localFreeAbove),
  shipBaseFee: Number(s.shipBaseFee), shipFreeAbove: n(s.shipFreeAbove),
  b2bBaseFee: Number(s.b2bBaseFee), b2bFreeAbove: n(s.b2bFreeAbove),
  prepMinutes: s.prepMinutes, minutesPerKm: s.minutesPerKm, shipMinDays: s.shipMinDays, shipMaxDays: s.shipMaxDays,
  codEnabled: s.codEnabled, codMaxAmount: n(s.codMaxAmount),
  reservationTtlMinutes: s.reservationTtlMinutes, deliveryOtpDigits: s.deliveryOtpDigits,
});

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>{label}</Typography.Text>
      {children}
      {hint ? <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>{hint}</Typography.Text> : null}
    </div>
  );
}

/**
 * Super Admin: how orders are routed, priced for delivery and held. Which
 * outlets exist, and where, is on the Warehouses screen (role = Franchise outlet).
 */
export function CheckoutSettingsPage() {
  const { message } = AntApp.useApp();
  const canManage = useCan('CHECKOUT_SETTINGS_MANAGE');
  const settings = useCheckoutSettings();
  const update = useUpdateCheckoutSettings();
  const warehouses = useWarehouses();
  const [d, setD] = useState<Draft | null>(null);

  useEffect(() => { if (settings.data) setD(toDraft(settings.data)); }, [settings.data]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => (x ? { ...x, [k]: v } : x));
  const dirty = d !== null && settings.data !== undefined && JSON.stringify(d) !== JSON.stringify(toDraft(settings.data));

  const save = async () => {
    if (!d) return;
    try {
      await update.mutateAsync(d);
      message.success('Checkout settings saved — applies to every new checkout');
    } catch (e) {
      message.error(apiErrorMessage(e, 'Could not save'), 8);
    }
  };

  const num = (key: keyof Draft, props: Record<string, unknown> = {}) => (
    <InputNumber style={{ width: '100%' }} disabled={!canManage} value={d?.[key] as number | null} onChange={(v) => set(key, v as never)} {...props} />
  );
  const depots = (warehouses.data?.data ?? []).filter((w) => w.isActive && (w.kind ?? 'CENTRAL') === 'CENTRAL');

  return (
    <Card>
      <PageHeader title="Checkout & Delivery" subtitle="The customer never chooses how an order is delivered: the server routes it from the address using these rules. Outlets and their radius are set on the Warehouses screen." />
      {settings.isLoading || !d ? <Skeleton active paragraph={{ rows: 8 }} /> : (
        <div style={{ maxWidth: 820 }}>
          <Typography.Title level={5}>1. Routing</Typography.Title>
          <Row gutter={[24, 16]} style={{ marginBottom: 28 }}>
            <Col xs={24} sm={8}><Field label="Local delivery radius (km)" hint="Used by outlets with no radius of their own.">{num('localRadiusKm', { min: 0.5, max: 100, step: 0.5 })}</Field></Col>
            <Col xs={24} sm={16}>
              <Field label="Central warehouse (ships by courier)" hint="Fulfils everything outside local range, and all B2B bulk orders.">
                <Select style={{ width: '100%' }} disabled={!canManage} allowClear placeholder="First active central warehouse" value={d.centralWarehouseId ?? undefined}
                  onChange={(v) => set('centralWarehouseId', v ?? null)} options={depots.map((w) => ({ value: w.id, label: `${w.name} — ${w.location}` }))} />
              </Field>
            </Col>
          </Row>

          <Typography.Title level={5}>2. Delivery fees (free above the threshold; empty = never free)</Typography.Title>
          <Row gutter={[24, 16]} style={{ marginBottom: 28 }}>
            <Col xs={12} sm={8}><Field label="Local fee">{num('localBaseFee', { min: 0, addonBefore: '₹' })}</Field></Col>
            <Col xs={12} sm={8}><Field label="Local free above">{num('localFreeAbove', { min: 0, addonBefore: '₹' })}</Field></Col>
            <Col xs={0} sm={8} />
            <Col xs={12} sm={8}><Field label="Courier fee">{num('shipBaseFee', { min: 0, addonBefore: '₹' })}</Field></Col>
            <Col xs={12} sm={8}><Field label="Courier free above">{num('shipFreeAbove', { min: 0, addonBefore: '₹' })}</Field></Col>
            <Col xs={0} sm={8} />
            <Col xs={12} sm={8}><Field label="B2B bulk fee">{num('b2bBaseFee', { min: 0, addonBefore: '₹' })}</Field></Col>
            <Col xs={12} sm={8}><Field label="B2B free above">{num('b2bFreeAbove', { min: 0, addonBefore: '₹' })}</Field></Col>
          </Row>

          <Typography.Title level={5}>3. Delivery time (ETA shown to the customer)</Typography.Title>
          <Row gutter={[24, 16]} style={{ marginBottom: 28 }}>
            <Col xs={12} sm={6}><Field label="Store prep (min)" hint="Local: prep + travel.">{num('prepMinutes', { min: 0, max: 600 })}</Field></Col>
            <Col xs={12} sm={6}><Field label="Travel (min per km)">{num('minutesPerKm', { min: 0, max: 60 })}</Field></Col>
            <Col xs={12} sm={6}><Field label="Courier min days">{num('shipMinDays', { min: 0, max: 60 })}</Field></Col>
            <Col xs={12} sm={6}><Field label="Courier max days">{num('shipMaxDays', { min: 0, max: 60 })}</Field></Col>
          </Row>

          <Typography.Title level={5}>4. Payment & stock holds</Typography.Title>
          <Row gutter={[24, 16]} style={{ marginBottom: 28 }}>
            <Col xs={24} sm={8}>
              <Field label="Cash on delivery">
                <Switch checked={d.codEnabled} disabled={!canManage} onChange={(v) => set('codEnabled', v)} />
              </Field>
            </Col>
            <Col xs={12} sm={8}><Field label="COD limit" hint="Empty = no limit.">{num('codMaxAmount', { min: 0, addonBefore: '₹' })}</Field></Col>
            <Col xs={12} sm={8}><Field label="Stock hold while paying (min)" hint="Released automatically if payment fails or is abandoned.">{num('reservationTtlMinutes', { min: 1, max: 120 })}</Field></Col>
            <Col xs={12} sm={8}><Field label="Delivery OTP digits">{num('deliveryOtpDigits', { min: 4, max: 6 })}</Field></Col>
          </Row>

          {canManage ? <Button type="primary" size="large" icon={<CarOutlined />} loading={update.isPending} disabled={!dirty} onClick={() => void save()}>Save Changes</Button> : <Typography.Text type="secondary">View only — Super Admin can change these.</Typography.Text>}
        </div>
      )}
    </Card>
  );
}
