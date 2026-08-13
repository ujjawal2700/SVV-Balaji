import { CheckCircleFilled, WarningFilled } from '@ant-design/icons';
import { Alert, Space, Table, Typography } from 'antd';
import type { RecipeIngredient } from '../../api/types';
import { formatQuantity } from '../../utils/format';

/**
 * How far a blend may drift from its recipe before the server refuses the run,
 * in percentage points of the total input.
 *
 * Mirrors `BLEND_TOLERANCE_POINTS` in the backend's production.service.ts. If
 * it changes there, change it here — this figure is shown to the operator and
 * decides whether the submit button is enabled, so a mismatch would either
 * promise a run the server rejects or block one it would accept.
 */
export const BLEND_TOLERANCE_POINTS = 0.5;

export interface BlendLine {
  cropName: string;
  /** Share the recipe calls for. */
  requiredPercent: number;
  /** What this crop should weigh for the planned output. */
  targetQuantity: number;
  /** What has actually been selected so far. */
  inMix: number;
  /** That as a share of everything selected so far. */
  actualPercent: number;
  drift: number;
  ok: boolean;
}

export interface BlendCheck {
  lines: BlendLine[];
  totalInput: number;
  /** Grains in the formula with nothing selected against them yet. */
  missing: string[];
  /** True once every grain is present and every share is within tolerance. */
  balanced: boolean;
  started: boolean;
}

const normalise = (crop: string) => crop.trim().toLowerCase();

/**
 * Works out where the operator's selection stands against the recipe.
 *
 * Shares are computed against the TOTAL INPUT, not the planned output — the
 * same basis the server uses. That matters: a run that inputs 1,020 kg for a
 * 1,000 kg plan is fine as long as the proportions hold, and checking against
 * the plan instead would fail it for no reason.
 */
export function checkBlend(
  ingredients: RecipeIngredient[],
  selected: Array<{ cropName: string; quantity: number }>,
  plannedQuantity: number,
): BlendCheck {
  const usedByCrop = new Map<string, number>();
  let totalInput = 0;

  for (const item of selected) {
    if (!item.cropName || !item.quantity) continue;
    const key = normalise(item.cropName);
    usedByCrop.set(key, (usedByCrop.get(key) ?? 0) + item.quantity);
    totalInput += item.quantity;
  }

  const started = totalInput > 0;

  const lines: BlendLine[] = ingredients.map((ingredient) => {
    const requiredPercent = Number(ingredient.percentage ?? 0);
    const inMix = usedByCrop.get(normalise(ingredient.cropName)) ?? 0;
    const actualPercent = started ? (inMix / totalInput) * 100 : 0;
    const drift = started ? Math.abs(actualPercent - requiredPercent) : requiredPercent;

    return {
      cropName: ingredient.cropName,
      requiredPercent,
      targetQuantity: (requiredPercent / 100) * (plannedQuantity || 0),
      inMix,
      actualPercent,
      drift,
      ok: started && drift <= BLEND_TOLERANCE_POINTS,
    };
  });

  const missing = lines.filter((line) => line.inMix === 0).map((line) => line.cropName);

  return {
    lines,
    totalInput,
    missing,
    balanced: started && missing.length === 0 && lines.every((line) => line.ok),
    started,
  };
}

interface BlendPlannerProps {
  check: BlendCheck;
  unit: string;
  recipeCode: string;
}

/**
 * The blend worksheet shown while a multigrain run is being set up.
 *
 * Its job is to make the ratio arithmetic visible before submit rather than
 * after a 400. The server enforces the same rule — this is the operator's view
 * of it, not a substitute for it.
 */
export function BlendPlanner({ check, unit, recipeCode }: BlendPlannerProps) {
  const { lines, totalInput, missing, balanced, started } = check;

  return (
    <Space direction="vertical" size={12} style={{ width: '100%', marginBottom: 16 }}>
      <Alert
        type={balanced ? 'success' : started ? 'warning' : 'info'}
        showIcon
        message={
          balanced
            ? `The mix matches ${recipeCode}`
            : !started
              ? `${recipeCode} is a blend — the quantities below have to hold its ratio`
              : missing.length > 0
                ? `Nothing selected yet for ${missing.join(' and ')}`
                : 'The mix is off ratio'
        }
        description={
          balanced ? (
            `Every grain is within ${BLEND_TOLERANCE_POINTS} percentage points of the formula.`
          ) : (
            <>
              An approved recipe fixes a ratio, and the server refuses a run that drifts more than{' '}
              {BLEND_TOLERANCE_POINTS} percentage points from it — a 60/40 blend produced from 90/10
              stock would still be labelled and sold as the approved blend.
              {started ? ' Adjust the quantities until every row below is green.' : ''}
            </>
          )
        }
      />

      <Table<BlendLine>
        size="small"
        rowKey="cropName"
        pagination={false}
        dataSource={lines}
        columns={[
          {
            title: 'Grain',
            dataIndex: 'cropName',
            key: 'cropName',
            render: (crop: string) => <Typography.Text strong>{crop}</Typography.Text>,
          },
          {
            title: 'Recipe',
            key: 'required',
            align: 'right',
            width: 90,
            render: (_, line) => `${line.requiredPercent.toFixed(2)}%`,
          },
          {
            title: 'Target',
            key: 'target',
            align: 'right',
            width: 120,
            render: (_, line) =>
              line.targetQuantity > 0 ? (
                formatQuantity(line.targetQuantity, unit)
              ) : (
                <Typography.Text type="secondary">enter planned output</Typography.Text>
              ),
          },
          {
            title: 'In the mix',
            key: 'inMix',
            align: 'right',
            width: 120,
            render: (_, line) =>
              line.inMix > 0 ? (
                formatQuantity(line.inMix, unit)
              ) : (
                <Typography.Text type="secondary">nothing yet</Typography.Text>
              ),
          },
          {
            title: 'Share',
            key: 'share',
            align: 'right',
            width: 140,
            render: (_, line) => {
              if (!started) return <Typography.Text type="secondary">—</Typography.Text>;
              return (
                <Space size={4}>
                  {line.ok ? (
                    <CheckCircleFilled style={{ color: '#52c41a' }} />
                  ) : (
                    <WarningFilled style={{ color: '#faad14' }} />
                  )}
                  <Typography.Text type={line.ok ? undefined : 'warning'}>
                    {line.actualPercent.toFixed(2)}%
                  </Typography.Text>
                </Space>
              );
            },
          },
        ]}
        summary={() => (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0}>
              <Typography.Text type="secondary">Total input</Typography.Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={1} align="right">
              100.00%
            </Table.Summary.Cell>
            <Table.Summary.Cell index={2} align="right" />
            <Table.Summary.Cell index={3} align="right">
              <Typography.Text strong>{formatQuantity(totalInput, unit)}</Typography.Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={4} align="right" />
          </Table.Summary.Row>
        )}
      />

      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Shares are of the total input, not of the planned output — process loss applies to the whole
        mix and is only known when the run is completed. A larger or smaller run is fine as long as
        the proportions hold.
      </Typography.Text>
    </Space>
  );
}
