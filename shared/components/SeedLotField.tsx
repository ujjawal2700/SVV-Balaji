import { Alert, Form, Select, Typography } from 'antd';
import type { Rule } from 'antd/es/form';
import type { SeedStockLot } from '../api/types';
import { useCan } from '../auth/useCan';
import { useSeedStock } from '../hooks/useSeedStock';

/** A handout being edited: its own quantity is still "available" to itself. */
export interface EditingHandout {
  seedStockId?: string | null;
  quantity: number;
}

/**
 * Lots a handout can be issued from: active, with stock, at the farmer's branch.
 * Only fetched when the user may see seed stock and a branch is known.
 */
export function useIssuableLots(branchId: string | undefined, editing?: EditingHandout | null) {
  const canView = useCan('SEED_STOCK_VIEW');
  const query = useSeedStock({ branchId, availableOnly: true }, { enabled: canView && Boolean(branchId) });
  // The lot an edited handout already came from stays selectable even if it is now empty.
  const linked = useSeedStock({ branchId, includeInactive: true }, {
    enabled: canView && Boolean(branchId) && Boolean(editing?.seedStockId),
  });
  const lots = [...(query.data?.data ?? [])];
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

/**
 * FRD 10.2 - "Issue from seed stock". Choosing a lot copies its seed name,
 * variety, batch and unit into the form (the server takes them from the lot
 * anyway) and the handout is deducted from it. Leaving it empty records a
 * handout that did not come out of company stock, as before.
 */
export function SeedLotField({
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
  const selectedId = Form.useWatch('seedStockId', form) as string | undefined;
  const selected = lots.find((l) => l.id === selectedId);

  if (!canView) return null;

  return (
    <>
      <Form.Item
        name="seedStockId"
        label="Issue from seed stock"
        extra={
          !branchId
            ? 'Choose the farmer first — stock is held per branch.'
            : selected
              ? `The quantity will be deducted from this lot. ${availableFor(selected, editing)} ${selected.unit} available.`
              : 'Leave empty only for inputs that did not come out of company stock — nothing is deducted.'
        }
      >
        <Select
          // A handout already issued from stock can move to another lot, not leave stock.
          allowClear={!editing?.seedStockId}
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
              // Re-run the quantity check against the new lot.
              void form.validateFields(['quantity']).catch(() => undefined);
            }
          }}
        />
      </Form.Item>
      {branchId && !loading && lots.length === 0 ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={
            <Typography.Text style={{ fontSize: 13 }}>
              No seed stock is recorded at this farmer&apos;s branch yet. The handout will be recorded without a stock
              deduction. Stock is received under <strong>Seed Stock</strong> in the admin panel.
            </Typography.Text>
          }
        />
      ) : null}
    </>
  );
}
