import { TrophyOutlined } from '@ant-design/icons';
import { Alert, App as AntApp, Button, Card, Col, InputNumber, Radio, Row, Skeleton, Switch, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import type { LoyaltyCalculationBase, LoyaltySettings, UpdateLoyaltySettingsInput } from '@shared/api/loyalty';
import { LOYALTY_CALCULATION_BASE_LABELS } from '@shared/api/loyalty';
import { useCan } from '@shared/auth/useCan';
import { PageHeader } from '@shared/components/PageHeader';
import { useLoyaltySettings, useUpdateLoyaltySettings } from '@shared/hooks/useLoyalty';

interface Draft {
  isActive: boolean;
  earnPercentB2C: number;
  earnPercentB2B: number;
  pointValueInr: number;
  calculationBase: LoyaltyCalculationBase;
  defaultEligible: boolean;
  appliesToDiscountedProducts: boolean;
  minEligibleItemAmount: number | null;
  minEligibleOrderAmount: number | null;
  maxRewardPerOrderInr: number | null;
  pointsExpiryMonths: number | null;
}

const asNumber = (v: string | null) => (v === null ? null : Number(v));

const toDraft = (s: LoyaltySettings): Draft => ({
  isActive: s.isActive,
  earnPercentB2C: Number(s.earnPercentB2C),
  earnPercentB2B: Number(s.earnPercentB2B),
  pointValueInr: Number(s.pointValueInr),
  calculationBase: s.calculationBase,
  defaultEligible: s.defaultEligible,
  appliesToDiscountedProducts: s.appliesToDiscountedProducts,
  minEligibleItemAmount: asNumber(s.minEligibleItemAmount),
  minEligibleOrderAmount: asNumber(s.minEligibleOrderAmount),
  maxRewardPerOrderInr: asNumber(s.maxRewardPerOrderInr),
  pointsExpiryMonths: s.pointsExpiryMonths,
});

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
        {label}
      </Typography.Text>
      {children}
      {hint ? (
        <Typography.Text type="secondary" style={{ display: 'block', marginTop: 6, fontSize: 12 }}>
          {hint}
        </Typography.Text>
      ) : null}
    </div>
  );
}

function ToggleRow({
  checked,
  disabled,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
      <Switch checked={checked} disabled={disabled} onChange={onChange} style={{ marginTop: 3 }} />
      <div>
        <Typography.Text strong>{title}</Typography.Text>
        <Typography.Text type="secondary" style={{ display: 'block', fontSize: 13 }}>
          {description}
        </Typography.Text>
      </div>
    </div>
  );
}

/**
 * Super Admin's control panel for the loyalty program. Every value here is
 * read by the server when an order is DELIVERED and frozen on that order's
 * earn record, so changing a rule never restates an order already credited.
 * Products and categories carry their own eligibility (Add Product / Category
 * screens); this screen holds the program-wide rules and the fallback.
 */
export function LoyaltySettingsPage() {
  const { message } = AntApp.useApp();
  const canManage = useCan('LOYALTY_MANAGE');
  const settings = useLoyaltySettings();
  const update = useUpdateLoyaltySettings();
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    if (settings.data) setDraft(toDraft(settings.data));
  }, [settings.data]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  const dirty =
    draft !== null && settings.data !== undefined && JSON.stringify(draft) !== JSON.stringify(toDraft(settings.data));

  const save = async () => {
    if (!draft) return;
    const input: UpdateLoyaltySettingsInput = { ...draft, pointsExpiryMonths: draft.pointsExpiryMonths ?? 0 };
    try {
      await update.mutateAsync(input);
      message.success('Loyalty settings saved — applies to orders delivered from now on');
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not save loyalty settings'), 8);
    }
  };

  // Display-only illustration of the rule as configured (the server does the real calculation).
  const example = draft
    ? (() => {
        const reward = (1000 * draft.earnPercentB2C) / 100;
        return { reward, points: Math.floor(reward / (draft.pointValueInr || 1)) };
      })()
    : null;

  const perPoint = draft && draft.pointValueInr > 0 ? 1 / draft.pointValueInr : null;

  return (
    <Card>
      <PageHeader
        title="Loyalty Rewards"
        subtitle="Customers earn a percentage of the eligible amount of each order, credited when the order is delivered and reversed if eligible items are returned. Applies to orders delivered from now on; past orders are never restated."
      />

      {settings.isLoading || !draft ? (
        <Skeleton active paragraph={{ rows: 10 }} />
      ) : (
        <div style={{ maxWidth: 760 }}>
          {!canManage ? (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 24 }}
              message="View only"
              description="Only Super Admin can change the loyalty program."
            />
          ) : null}

          <section style={{ marginBottom: 32 }}>
            <Typography.Title level={5}>1. Program</Typography.Title>
            <ToggleRow
              checked={draft.isActive}
              disabled={!canManage}
              onChange={(v) => set('isActive', v)}
              title={`Loyalty program ${draft.isActive ? 'active' : 'paused'}`}
              description="While paused, delivered orders earn nothing (and are recorded as such — they are not paid retroactively when you switch it back on)."
            />
          </section>

          <section style={{ marginBottom: 32 }}>
            <Typography.Title level={5}>2. Earning rate</Typography.Title>
            <Row gutter={[24, 16]}>
              <Col xs={24} sm={8}>
                <Field label="Customers (B2C)" hint="0 switches earning off for this channel.">
                  <InputNumber
                    size="large"
                    min={0}
                    max={100}
                    step={0.5}
                    precision={2}
                    addonAfter="%"
                    style={{ width: '100%' }}
                    disabled={!canManage}
                    value={draft.earnPercentB2C}
                    onChange={(v) => set('earnPercentB2C', v ?? 0)}
                  />
                </Field>
              </Col>
              <Col xs={24} sm={8}>
                <Field label="Retailers (B2B)" hint="Usually lower: wholesale margins are thinner.">
                  <InputNumber
                    size="large"
                    min={0}
                    max={100}
                    step={0.5}
                    precision={2}
                    addonAfter="%"
                    style={{ width: '100%' }}
                    disabled={!canManage}
                    value={draft.earnPercentB2B}
                    onChange={(v) => set('earnPercentB2B', v ?? 0)}
                  />
                </Field>
              </Col>
              <Col xs={24} sm={8}>
                <Field
                  label="1 point is worth"
                  hint={
                    perPoint
                      ? `${perPoint === 1 ? '1 point = ₹1' : `${+perPoint.toFixed(2)} points = ₹1`}. Points are the same currency as referral coins.`
                      : undefined
                  }
                >
                  <InputNumber
                    size="large"
                    min={0.0001}
                    step={0.25}
                    precision={4}
                    addonBefore="₹"
                    style={{ width: '100%' }}
                    disabled={!canManage}
                    value={draft.pointValueInr}
                    onChange={(v) => set('pointValueInr', v ?? 1)}
                  />
                </Field>
              </Col>
            </Row>
            {example ? (
              <Alert
                style={{ marginTop: 16 }}
                type="success"
                showIcon
                message={`Example: ₹1,000 of eligible items at ${draft.earnPercentB2C}% = ₹${example.reward.toFixed(2)} reward = ${example.points} points`}
              />
            ) : null}
          </section>

          <section style={{ marginBottom: 32 }}>
            <Typography.Title level={5}>3. What the percentage is applied to</Typography.Title>
            <Radio.Group
              disabled={!canManage}
              value={draft.calculationBase}
              onChange={(e) => set('calculationBase', e.target.value)}
            >
              <Row gutter={[8, 8]}>
                {(Object.keys(LOYALTY_CALCULATION_BASE_LABELS) as LoyaltyCalculationBase[]).map((base) => (
                  <Col xs={24} key={base}>
                    <Radio value={base}>
                      {LOYALTY_CALCULATION_BASE_LABELS[base]}
                      {base === 'EXCLUDING_TAX' ? ' (recommended)' : ''}
                    </Radio>
                  </Col>
                ))}
              </Row>
            </Radio.Group>
            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 13 }}>
              Only eligible items count, at the price actually charged. Delivery and shipping charges are never
              part of the calculation.
            </Typography.Text>
          </section>

          <section style={{ marginBottom: 32 }}>
            <Typography.Title level={5}>4. Eligibility</Typography.Title>
            <ToggleRow
              checked={draft.defaultEligible}
              disabled={!canManage}
              onChange={(v) => set('defaultEligible', v)}
              title="Products with no rule earn points"
              description="The fallback. Each category and each product can override it (Products → Add/Edit Product, Categories). Product setting beats category, category beats this default."
            />
            <ToggleRow
              checked={draft.appliesToDiscountedProducts}
              disabled={!canManage}
              onChange={(v) => set('appliesToDiscountedProducts', v)}
              title="Discounted products earn points"
              description="A line counts as discounted when it is sold below the product's MRP (price including GST). Turn off to exclude them."
            />
          </section>

          <section style={{ marginBottom: 32 }}>
            <Typography.Title level={5}>5. Limits</Typography.Title>
            <Row gutter={[24, 16]}>
              <Col xs={24} sm={8}>
                <Field label="Minimum eligible item value" hint="A line below this earns nothing. Empty = no minimum.">
                  <InputNumber
                    min={0}
                    precision={2}
                    addonBefore="₹"
                    style={{ width: '100%' }}
                    disabled={!canManage}
                    value={draft.minEligibleItemAmount}
                    onChange={(v) => set('minEligibleItemAmount', v)}
                  />
                </Field>
              </Col>
              <Col xs={24} sm={8}>
                <Field label="Minimum eligible order value" hint="Total of eligible items. Empty = no minimum.">
                  <InputNumber
                    min={0}
                    precision={2}
                    addonBefore="₹"
                    style={{ width: '100%' }}
                    disabled={!canManage}
                    value={draft.minEligibleOrderAmount}
                    onChange={(v) => set('minEligibleOrderAmount', v)}
                  />
                </Field>
              </Col>
              <Col xs={24} sm={8}>
                <Field label="Maximum reward per order" hint="Cap on the rupee value earned. Empty = no cap.">
                  <InputNumber
                    min={0}
                    precision={2}
                    addonBefore="₹"
                    style={{ width: '100%' }}
                    disabled={!canManage}
                    value={draft.maxRewardPerOrderInr}
                    onChange={(v) => set('maxRewardPerOrderInr', v)}
                  />
                </Field>
              </Col>
            </Row>
          </section>

          <section style={{ marginBottom: 32 }}>
            <Typography.Title level={5}>6. Expiry</Typography.Title>
            <div style={{ maxWidth: 260 }}>
              <Field label="Points expire after" hint="0 = points never expire. Unused points lapse this long after delivery.">
                <InputNumber
                  min={0}
                  max={120}
                  precision={0}
                  addonAfter="months"
                  style={{ width: '100%' }}
                  disabled={!canManage}
                  value={draft.pointsExpiryMonths ?? 0}
                  onChange={(v) => set('pointsExpiryMonths', v ?? 0)}
                />
              </Field>
            </div>
          </section>

          {canManage ? (
            <Button
              type="primary"
              size="large"
              icon={<TrophyOutlined />}
              loading={update.isPending}
              disabled={!dirty}
              onClick={() => void save()}
            >
              Save Changes
            </Button>
          ) : null}
        </div>
      )}
    </Card>
  );
}
