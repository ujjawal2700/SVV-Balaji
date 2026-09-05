import { Alert, Card, Col, Descriptions, Drawer, Progress, Row, Space, Spin, Statistic, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { DatePicker } from 'antd';
import { apiErrorMessage } from '@shared/api/client';
import type { Branch } from '@shared/api/types';
import { useBranchPerformance } from '@shared/hooks/useBranches';
import { EM_DASH, formatCurrency, toIsoDate } from '@shared/utils/format';

const { RangePicker } = DatePicker;

/** Green above 80, amber above 50, red below. Grey when there is nothing to score. */
function toneFor(value: number | null): string {
  if (value === null) return '#bfbfbf';
  if (value >= 80) return '#389e0d';
  if (value >= 50) return '#d48806';
  return '#cf1322';
}

/**
 * A rate, with its name and an honest empty state.
 *
 * The label matters as much as the number: "on-time delivery" with no bar
 * should read as "we have not shipped anything measurable", not as zero.
 */
function Rate({ title, value, hint }: { title: string; value: number | null; hint: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Tooltip title={hint}>
          <Typography.Text strong>{title}</Typography.Text>
        </Tooltip>
        <Typography.Text style={{ color: toneFor(value) }} strong>
          {value === null ? 'No data' : `${value}%`}
        </Typography.Text>
      </Space>
      <Progress
        percent={value ?? 0}
        showInfo={false}
        strokeColor={toneFor(value)}
        trailColor="#f0f0f0"
        size="small"
      />
    </div>
  );
}

/** Quantities never summed across units — see the note on the service. */
function ByUnit({ values }: { values: Record<string, number> }) {
  const entries = Object.entries(values);
  if (entries.length === 0) return <>{EM_DASH}</>;
  return (
    <Space direction="vertical" size={0}>
      {entries.map(([unit, qty]) => (
        <span key={unit}>
          {qty.toLocaleString()} {unit}
        </span>
      ))}
    </Space>
  );
}

/**
 * FRD 6.4 Branch Performance and the Branch Manager's half of 6.5.
 *
 * Everything is scoped to a period, because a performance figure with no window
 * is a running total that only ever goes up and cannot show whether anything
 * improved.
 */
export function BranchPerformanceDrawer({
  branch,
  onClose,
}: {
  branch: Branch | null;
  onClose: () => void;
}) {
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(30, 'day'),
    dayjs(),
  ]);

  const query = { from: toIsoDate(range[0]), to: toIsoDate(range[1]) };
  const performance = useBranchPerformance(branch?.id, query);
  const data = performance.data;

  return (
    <Drawer
      open={Boolean(branch)}
      onClose={onClose}
      width={820}
      title={branch ? `Performance — ${branch.name}` : 'Performance'}
      extra={
        <RangePicker
          value={range}
          allowClear={false}
          format="DD MMM YYYY"
          onChange={(values) => {
            if (values?.[0] && values[1]) setRange([values[0], values[1]]);
          }}
        />
      }
    >
      {performance.isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', padding: 64 }}>
          <Spin size="large" />
        </div>
      ) : performance.error ? (
        <Alert
          type="error"
          showIcon
          message="Could not load performance"
          description={apiErrorMessage(performance.error)}
        />
      ) : data ? (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card size="small">
            <Descriptions column={2} size="small">
              <Descriptions.Item label="Manager">
                {data.managerName ?? (
                  <Typography.Text type="secondary">Not assigned</Typography.Text>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Period">
                {dayjs(data.from).format('DD MMM')} – {dayjs(data.to).format('DD MMM YYYY')}
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Card size="small" title="Operational efficiency (FRD 6.4)">
            <Row gutter={16} style={{ marginBottom: 12 }}>
              <Col xs={24}>
                <Statistic
                  title="Overall"
                  value={data.efficiency.overallPercent ?? 0}
                  suffix="%"
                  valueStyle={{ color: toneFor(data.efficiency.overallPercent), fontSize: 28 }}
                />
                {data.efficiency.overallPercent === null ? (
                  <Typography.Text type="secondary">
                    Nothing measurable in this period.
                  </Typography.Text>
                ) : null}
              </Col>
            </Row>
            <Rate
              title="Production yield"
              value={data.efficiency.productionYieldPercent}
              hint="Output as a share of the raw material consumed. How much of what was bought survived processing."
            />
            <Rate
              title="Inspection approval rate"
              value={data.efficiency.inspectionApprovalPercent}
              hint="Approved harvest inspections over all of them — how well this branch's farmers are performing, and how well the branch is advising them."
            />
            <Rate
              title="On-time delivery"
              value={data.efficiency.onTimeDeliveryPercent}
              hint="Orders delivered on or before the promised date. Only measurable for orders shipped since delivery timestamps were added on 19 Aug."
            />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              The FRD names operational efficiency without defining it. It is the mean of whichever
              of these three have data — a component with no input is excluded, not scored zero.
            </Typography.Text>
          </Card>

          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <Card size="small" title="Procurement">
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="Collections">
                    {data.procurement.collections}
                  </Descriptions.Item>
                  <Descriptions.Item label="Received">
                    <ByUnit values={data.procurement.quantityByUnit} />
                  </Descriptions.Item>
                  <Descriptions.Item label="Value">
                    {formatCurrency(data.procurement.totalValue)}
                  </Descriptions.Item>
                  <Descriptions.Item label="Farmers / Suppliers supplying">
                    {data.procurement.farmersSupplying}
                  </Descriptions.Item>
                  <Descriptions.Item label="Inspections">
                    {data.procurement.inspectionsApproved} approved of{' '}
                    {data.procurement.inspections}
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            </Col>

            <Col xs={24} md={12}>
              <Card size="small" title="Production">
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="Runs">
                    {data.production.completed} completed of {data.production.batches}
                  </Descriptions.Item>
                  <Descriptions.Item label="Planned">
                    {data.production.plannedQuantity.toLocaleString()}
                  </Descriptions.Item>
                  <Descriptions.Item label="Actual output">
                    {data.production.actualQuantity.toLocaleString()}
                  </Descriptions.Item>
                  <Descriptions.Item label="Process loss">
                    {data.production.totalLoss.toLocaleString()}
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            </Col>

            <Col xs={24} md={12}>
              <Card size="small" title="Sales">
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="Orders">
                    {data.sales.orders} ({data.sales.delivered} delivered,{' '}
                    {data.sales.cancelled} cancelled)
                  </Descriptions.Item>
                  <Descriptions.Item label="Revenue">
                    {formatCurrency(data.sales.revenue)}
                  </Descriptions.Item>
                  <Descriptions.Item label="Outstanding">
                    <Typography.Text type={data.sales.outstanding > 0 ? 'warning' : undefined}>
                      {formatCurrency(data.sales.outstanding)}
                    </Typography.Text>
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            </Col>

            <Col xs={24} md={12}>
              <Card size="small" title="Inventory">
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="Warehouses">
                    {data.inventory.warehouses}
                  </Descriptions.Item>
                  <Descriptions.Item label="Raw material held">
                    <ByUnit values={data.inventory.rawMaterialByUnit} />
                  </Descriptions.Item>
                  <Descriptions.Item label="Finished goods">
                    {data.inventory.finishedGoodsPacks.toLocaleString()} packs
                  </Descriptions.Item>
                  <Descriptions.Item label="Utilisation">
                    {data.inventory.utilisationPercent === null ? (
                      <Tooltip title="This branch holds stock in more than one unit, so occupancy against capacity would be arithmetic on incompatible numbers.">
                        <Typography.Text type="secondary">
                          Not comparable — mixed units
                        </Typography.Text>
                      </Tooltip>
                    ) : (
                      `${data.inventory.utilisationPercent}% of ${data.inventory.totalCapacity.toLocaleString()}`
                    )}
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            </Col>
          </Row>
        </Space>
      ) : null}
    </Drawer>
  );
}
