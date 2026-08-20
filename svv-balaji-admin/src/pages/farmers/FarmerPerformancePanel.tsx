import { ReloadOutlined } from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Col,
  Empty,
  Progress,
  Rate,
  Row,
  Space,
  Spin,
  Statistic,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { apiErrorMessage } from '@shared/api/client';
import type { PerformanceComponent } from '@shared/api/types';
import { Can } from '@shared/components/Can';
import { useFarmerPerformance, useRecalculatePerformance } from '@shared/hooks/useFarmers';
import { formatDateTime, formatQuantity } from '@shared/utils/format';

/** Green above 80, amber above 50, red below. Grey when there is nothing to score. */
function toneFor(score: number | null): string {
  if (score === null) return '#bfbfbf';
  if (score >= 80) return '#389e0d';
  if (score >= 50) return '#d48806';
  return '#cf1322';
}

/**
 * One FRD 7.6 parameter.
 *
 * The explanation always shows, including — especially — when there is no
 * score. "No harvest inspections yet" tells the user why the bar is empty;
 * an empty bar on its own reads as a zero.
 */
function ComponentRow({
  title,
  weight,
  component,
}: {
  title: string;
  weight: string;
  component: PerformanceComponent;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Space size={6}>
          <Typography.Text strong>{title}</Typography.Text>
          <Tooltip title="Share of the overall rating, renormalised over the components that have data">
            <Tag style={{ fontSize: 11 }}>{weight}</Tag>
          </Tooltip>
        </Space>
        <Typography.Text style={{ color: toneFor(component.score) }} strong>
          {component.score === null ? 'Not rated' : `${component.score}`}
        </Typography.Text>
      </Space>

      <Progress
        percent={component.score ?? 0}
        showInfo={false}
        strokeColor={toneFor(component.score)}
        // A null score draws an empty rail, not a zero-length red bar.
        trailColor="#f0f0f0"
        size="small"
      />

      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {component.explanation}
      </Typography.Text>
    </div>
  );
}

/**
 * FRD 7.6 — Farmer Performance.
 *
 * Every figure here is derived from the farmer's own inspections and
 * collections; nothing is entered by hand. That is what makes it defensible
 * when a farmer disputes a rating, which is why each component carries its
 * sample size and a sentence rather than just a number.
 */
export function FarmerPerformancePanel({ farmerId }: { farmerId: string }) {
  const { message } = AntApp.useApp();
  const performance = useFarmerPerformance(farmerId);
  const recalculate = useRecalculatePerformance();

  const handleRecalculate = async () => {
    try {
      await recalculate.mutateAsync(farmerId);
      message.success('Performance recalculated');
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not recalculate'), 8);
    }
  };

  if (performance.isLoading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', padding: 48 }}>
        <Spin />
      </div>
    );
  }

  if (performance.error) {
    return (
      <Alert
        type="error"
        showIcon
        message="Could not load performance"
        description={apiErrorMessage(performance.error)}
      />
    );
  }

  const data = performance.data;
  if (!data) return null;

  const unrated = data.overallRating === null;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card size="small">
        <Row gutter={16} align="middle">
          <Col xs={24} sm={10}>
            {unrated ? (
              <Space direction="vertical" size={2}>
                <Typography.Text type="secondary">Overall rating</Typography.Text>
                <Typography.Text strong style={{ fontSize: 18 }}>
                  Not yet rated
                </Typography.Text>
              </Space>
            ) : (
              <Statistic
                title="Overall rating"
                value={data.overallRating as number}
                suffix="/ 100"
                valueStyle={{ color: toneFor(data.overallRating), fontSize: 30 }}
              />
            )}
            {data.stars !== null ? (
              <Rate disabled allowHalf value={data.stars} style={{ fontSize: 15 }} />
            ) : null}
          </Col>
          <Col xs={12} sm={7}>
            <Statistic title="Delivered" value={formatQuantity(data.totalDelivered, 'KG')} />
          </Col>
          <Col xs={12} sm={7}>
            <Statistic title="Collections" value={data.totalCollections} />
          </Col>
        </Row>
      </Card>

      {unrated ? (
        <Alert
          type="info"
          showIcon
          message="No procurement history yet"
          description="A rating appears once this farmer has been inspected or has supplied a harvest. Unrated is not the same as poorly rated — nothing has been measured yet."
        />
      ) : null}

      <Card size="small" title="FRD 7.6 parameters">
        <ComponentRow title="Crop quality" weight="50%" component={data.cropQuality} />
        <ComponentRow
          title="Delivery timeliness"
          weight="25%"
          component={data.deliveryTimeliness}
        />
        <ComponentRow
          title="Procurement quantity"
          weight="25%"
          component={data.procurementQuantity}
        />

        <div style={{ marginTop: 4 }}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space size={6}>
              <Typography.Text type="secondary">Complaint records</Typography.Text>
              <Tag style={{ fontSize: 11 }}>excluded</Tag>
            </Space>
          </Space>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {data.complaintRecords.explanation}
          </Typography.Text>
        </div>
      </Card>

      {data.totalCollections === 0 && data.cropQuality.sampleSize === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Nothing to score from yet"
          style={{ margin: 0 }}
        />
      ) : null}

      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Computed {formatDateTime(data.computedAt)} — refreshes automatically whenever an
          inspection or collection changes.
        </Typography.Text>
        <Can do="FARMER_EDIT">
          <Button
            size="small"
            icon={<ReloadOutlined />}
            loading={recalculate.isPending}
            onClick={() => void handleRecalculate()}
          >
            Recalculate
          </Button>
        </Can>
      </Space>
    </Space>
  );
}
