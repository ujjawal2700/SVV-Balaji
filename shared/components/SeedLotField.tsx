import { Alert, Form, Radio, Select, Tag, Typography } from 'antd';
import type { Rule } from 'antd/es/form';
import type { SeedSource, SeedStockLot } from '../api/types';
import { useCan } from '../auth/useCan';
import { useSeedStock } from '../hooks/useSeedStock';

/** A handout being edited: its own quantity is still "available" to itself. */
export interface EditingHandout {
  seedStockId?: string | null;
  seedSource?: SeedSource | null;
  quantity: number;
}

/**
 * Lots a handout can be issued from: active, with stock, at the farmer's branch.
 * Only fetched when the user may see seed stock and a branch is known.
 */
export function useIssuableLots(branchId: string | undefined, editing?: EditingHandout | null) {
  const canView = useCan('SEED_STOCK_VIEW');
  const query = useSeedStock({ branchId, availableOnly: true }, { enabled: canView && Boolean(branchId) });
  // The lot an edited handout already came from stays selectable even if it is
  // now empty, expired or withdrawn - reducing or re-dating it must still work.
  const linked = useSeedStock({ branchId, includeInactive: true }, {
    enabled: canView && Boolean(branchId) && Boolean(editing?.seedStockId),
  });
  const today = new Date().toISOString().slice(0, 10);
  const lots = (query.data?.data ?? []).filter((l) => !l.expiryDate || l.expiryDate.slice(0, 10) >= today);
  const current = (linked.data?.data ?? []).find((l) => l.id === editing?.seedStockId);
  if (current && !lots.some((l) => l.id === current.id)) lots.push(current);
  return { lots, loading: query.isLoading, canView };
}

/** How much of `lot` this handout may take. */
export function availableFor(lot: SeedStockLot, editing?: EditingHandout | null) {
  const own = editing && editing.seedStockId === lot.id ? editing.quantity : 0;
  return Number(lot.quantityOnHand) + own;
}

/** Quantity validator: refuses more than the chosen lot holds (the server re-checks). */
export function withinLotRule(lots: SeedStockLot[], editing?: EditingHandout | null): Rule {
  return ({ getFieldValue }) => ({
    validator(_, value) {
      if (getFieldValue('seedSource') !== 'COMPANY_STOCK') return Promise.resolve();
      const lot = lots.find((l) => l.id === getFieldValue('seedStockId'));
      if (!lot || value === undefined || value === null) return Promise.resolve();
      const max = availableFor(lot, editing);
      return Number(value) > max
        ? Promise.reject(new Error(`Only ${max} ${lot.unit} left in this lot`))
        : Promise.resolve();
    },
  });
}

const lotLabel = (lot: SeedStockLot, editing?: EditingHandout | null) =>
  `${lot.seedName}${lot.seedVariety ? ` · ${lot.seedVariety}` : ''}${lot.batchNumber ? ` · ${lot.batchNumber}` : ''} — ${availableFor(lot, editing)} ${lot.unit} available`;

/** The source an existing handout should open with. Old handouts have none. */
export function initialSeedSource(record?: { seedSource?: SeedSource | null; seedStockId?: string | null } | null) {
  if (!record) return undefined;
  return record.seedSource ?? (record.seedStockId ? 'COMPANY_STOCK' : undefined);
}

/**
 * Seed Source - the first question on a handout.
 *
 *   Company stock  -> a lot at the farmer's branch must be chosen; its particulars
 *                     fill the form and the quantity is deducted from it.
 *   External       -> farmer-provided or bought outside; no lot, nothing deducted.
 *
 * Required on every new handout. An old handout recorded before the source
 * existed may be saved without one, which leaves it as it was.
 */
export function SeedSourceField({
  branchId,
  lots,
  loading,
  editing,
}: {
  branchId: string | undefined;
  lots: SeedStockLot[];
  loading?: boolean;
  editing?: EditingHandout | null;
}) {
  const form = Form.useFormInstance();
  const canView = useCan('SEED_STOCK_VIEW');
  const source = Form.useWatch('seedSource', form) as SeedSource | undefined;
  const selectedId = Form.useWatch('seedStockId', form) as string | undefined;
  const selected = lots.find((l) => l.id === selectedId);
  const legacy = Boolean(editing) && !editing?.seedSource && !editing?.seedStockId;

  return (
    <>
      <Form.Item
        name="seedSource"
        label="Seed source"
        rules={legacy ? [] : [{ required: true, message: 'Choose where the seed came from' }]}
        extra={legacy ? 'This older handout has no source recorded. Choose one to record it, or leave it as it is.' : undefined}
      >
        <Radio.Group
          optionType="button"
          buttonStyle="solid"
          onChange={(e) => {
            if (e.target.value === 'EXTERNAL') form.setFieldValue('seedStockId', undefined);
            void form.validateFields(['quantity']).catch(() => undefined);
          }}
          options={[
            { value: 'COMPANY_STOCK', label: 'Company stock', disabled: !canView },
            { value: 'EXTERNAL', label: 'External / farmer provided' },
          ]}
        />
      </Form.Item>

      {source === 'COMPANY_STOCK' ? (
        <>
          <Form.Item
            name="seedStockId"
            label="Seed stock lot"
            rules={[{ required: true, message: 'Choose the lot this seed is issued from' }]}
            extra={
              !branchId
                ? 'Choose the farmer first — stock is held per branch.'
                : selected
                  ? `Deducted from this lot. ${availableFor(selected, editing)} ${selected.unit} available.`
                  : 'Only lots at the farmer’s branch that are in date and have stock are listed.'
            }
          >
            <Select
              showSearch
              optionFilterProp="label"
              loading={loading}
              disabled={!branchId}
              placeholder={lots.length ? 'Select a lot' : 'No seed stock at this branch'}
              options={lots.map((lot) => ({ value: lot.id, label: lotLabel(lot, editing) }))}
              onChange={(id?: string) => {
                const lot = lots.find((l) => l.id === id);
                if (lot) {
                  form.setFieldsValue({
                    seedName: lot.seedName,
                    seedVariety: lot.seedVariety ?? undefined,
                    batchNumber: lot.batchNumber ?? undefined,
                    unit: lot.unit,
                  });
                  void form.validateFields(['quantity']).catch(() => undefined);
                }
              }}
            />
          </Form.Item>
          {branchId && !loading && lots.length === 0 ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message={
                <Typography.Text style={{ fontSize: 13 }}>
                  No issuable seed stock at this farmer&apos;s branch. Receive stock under <strong>Seed Stock</strong> in the
                  admin panel, or record this as <strong>External / farmer provided</strong>.
                </Typography.Text>
              }
            />
          ) : null}
        </>
      ) : source === 'EXTERNAL' ? (
        <Typography.Paragraph type="secondary" style={{ marginTop: -8, fontSize: 12.5 }}>
          Recorded for the farmer’s history only — nothing is deducted from company stock.
        </Typography.Paragraph>
      ) : null}
    </>
  );
}

/** The handout's source, the same way everywhere a handout is listed. */
export function SeedSourceTag({ seedSource, seedStockId }: { seedSource?: SeedSource | null; seedStockId?: string | null }) {
  const source = seedSource ?? (seedStockId ? 'COMPANY_STOCK' : null);
  if (source === 'COMPANY_STOCK') return <Tag color="green" style={{ margin: 0 }}>Company stock</Tag>;
  if (source === 'EXTERNAL') return <Tag color="blue" style={{ margin: 0 }}>External</Tag>;
  return <Tag style={{ margin: 0 }}>Source not recorded</Tag>;
}
