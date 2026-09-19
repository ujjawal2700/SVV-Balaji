import { DeleteOutlined, PlusOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Button, Form, InputNumber, Space, Tag, Tooltip, Typography } from 'antd';
import { formatCurrency } from '../../utils/format';
import { inclusiveOf, ladderFromMrp, perUnitOf, tierDiscount, type TierRow } from './productForm';

const { Text } = Typography;

/**
 * The wholesale price ladder for one sellable unit - the product itself or one
 * variant. Each row is a quantity break and the price that applies from it up.
 *
 * Prices are entered EXCLUSIVE of GST because that is what the pricing engine
 * stores and what the order module adds tax on top of. Because a retailer reads
 * the GST-inclusive figure, that figure and the discount against MRP are shown
 * live beside each row rather than left for the operator to work out.
 *
 * `absolutePath` is the list's full path in the form (['b2bTiers'] or
 * ['variants', 2, 'b2bTiers']) - `name` alone is relative to the parent list and
 * cannot be used to read the rows back.
 */
export function PriceTierEditor({
  name,
  absolutePath,
  mrp,
  gst,
}: {
  name: (string | number)[] | string;
  absolutePath: (string | number)[];
  mrp?: number | null;
  gst: number;
}) {
  const form = Form.useFormInstance();
  const rows = (Form.useWatch(absolutePath, form) as TierRow[] | undefined) ?? [];
  // Product-wide: how the operator types tiers (a total for the quantity, or a per-unit price).
  const totals = Boolean(Form.useWatch('b2bTiersAreTotals', form));
  const unitWord = (Form.useWatch('unit', form) as string | undefined)?.toLowerCase() === 'pack' ? 'pack' : 'unit';

  // The "applies to" label needs the NEXT break, and rows may be typed out of order.
  const sortedBreaks = rows
    .map((r) => r?.minQuantity)
    .filter((q): q is number => typeof q === 'number')
    .sort((a, b) => a - b);

  const rangeLabel = (min: number | null | undefined) => {
    if (typeof min !== 'number') return '—';
    const next = sortedBreaks.find((q) => q > min);
    return next ? `${min}–${next - 1} units` : `${min}+ units`;
  };

  const fillFromMrp = () => {
    if (typeof mrp !== 'number' || mrp <= 0) return;
    form.setFieldValue(absolutePath, ladderFromMrp(mrp, gst, totals));
  };

  return (
    <Form.List
      name={name}
      rules={[
        {
          validator: async (_, list: TierRow[] | undefined) => {
            const mins = (list ?? []).map((r) => r?.minQuantity).filter((q) => typeof q === 'number');
            const dup = mins.find((q, i) => mins.indexOf(q) !== i);
            if (dup !== undefined) {
              throw new Error(`Two tiers start at ${dup} units - each quantity break can carry one price`);
            }
          },
        },
      ]}
    >
      {(fields, { add, remove }, { errors }) => (
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          {fields.length > 0 ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '110px 150px 1fr 40px',
                gap: 10,
                padding: '0 4px',
              }}
            >
              <Text type="secondary" style={{ fontSize: 12 }}>From qty</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {totals ? 'Total for this qty (excl. GST)' : `Price / ${unitWord} (excl. GST)`}
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>What a retailer sees, per {unitWord}</Text>
              <span />
            </div>
          ) : null}

          {fields.map((field) => {
            const row = rows[field.name];
            // The engine bills per unit, so everything shown on the right is per unit
            // - derived from the typed total when the product's tiers are totals.
            const price = perUnitOf(row ?? {}, totals);
            const off = tierDiscount(mrp, price, gst);

            return (
              <div
                key={field.key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '110px 150px 1fr 40px',
                  gap: 10,
                  alignItems: 'start',
                }}
              >
                <Form.Item
                  name={[field.name, 'minQuantity']}
                  style={{ marginBottom: 0 }}
                  rules={[
                    { required: true, message: 'Required' },
                    { type: 'integer', min: 1, message: 'Whole number ≥ 1' },
                  ]}
                >
                  <InputNumber min={1} precision={0} style={{ width: '100%' }} placeholder="10" />
                </Form.Item>

                <Form.Item
                  name={[field.name, 'unitPrice']}
                  style={{ marginBottom: 0 }}
                  rules={[{ required: true, message: 'Required' }, { type: 'number', min: 0, message: '≥ 0' }]}
                >
                  <InputNumber min={0} precision={2} prefix="₹" style={{ width: '100%' }} placeholder="0.00" />
                </Form.Item>

                <Space size={6} wrap style={{ minHeight: 32 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{rangeLabel(row?.minQuantity)}</Text>
                  {price !== null ? (
                    <>
                      <Tag color="blue" style={{ margin: 0 }}>
                        {formatCurrency(price)} / {unitWord} · {formatCurrency(inclusiveOf(price, gst))} incl. {gst}% GST
                      </Tag>
                      {off !== null && off > 0 ? (
                        <Tag color="orange" style={{ margin: 0 }}>{off}% off MRP</Tag>
                      ) : null}
                    </>
                  ) : null}
                </Space>

                <Tooltip title="Remove this tier">
                  <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
                </Tooltip>
              </div>
            );
          })}

          <Form.ErrorList errors={errors} />

          <Space wrap>
            <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ minQuantity: undefined, unitPrice: undefined })}>
              Add price tier
            </Button>
            <Tooltip
              title={
                typeof mrp === 'number' && mrp > 0
                  ? 'Replaces the tiers with 1 / 10 / 50 / 100+ units at 90 / 80 / 72 / 65% of MRP - a starting point to edit'
                  : 'Enter an MRP first'
              }
            >
              <Button
                icon={<ThunderboltOutlined />}
                onClick={fillFromMrp}
                disabled={typeof mrp !== 'number' || mrp <= 0}
              >
                Fill from MRP
              </Button>
            </Tooltip>
          </Space>
        </Space>
      )}
    </Form.List>
  );
}
