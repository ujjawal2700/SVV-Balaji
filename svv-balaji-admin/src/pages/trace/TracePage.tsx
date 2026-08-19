import { EnvironmentOutlined, QrcodeOutlined } from '@ant-design/icons';
import {
  Alert,
  Card,
  Col,
  Descriptions,
  Empty,
  Input,
  Row,
  Space,
  Spin,
  Steps,
  Table,
  Tag,
  Typography,
} from 'antd';
import { useState } from 'react';
import axios from 'axios';
import { apiErrorMessage } from '../../api/client';
import type { FinishedGoodsTrace, TraceFarmer } from '../../api/types';
import { PageHeader } from '../../components/PageHeader';
import { useFinishedGoodsTrace } from '../../hooks/useTrace';
import { EM_DASH, formatDate, formatQuantity } from '../../utils/format';

/**
 * The consumer QR destination, read from inside the panel.
 *
 * This is the one screen that demonstrates what the whole system is for: a pack
 * number in, and out comes the production run, the recipe version, every
 * quality check it passed, and the farmers whose grain is in the bag.
 */
export function TracePage() {
  const [submitted, setSubmitted] = useState<string | undefined>();
  const trace = useFinishedGoodsTrace(submitted);

  const notFound =
    trace.error && axios.isAxiosError(trace.error) && trace.error.response?.status === 404;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <PageHeader
          title="Trace a pack"
          subtitle="Enter a finished-goods batch number to resolve it back to the farmers who grew the grain. This is what a customer sees after scanning the QR code on the packaging."
        />

        <Input.Search
          size="large"
          allowClear
          placeholder="FG-20260807-001"
          enterButton={
            <>
              <QrcodeOutlined /> Trace
            </>
          }
          style={{ maxWidth: 480 }}
          onSearch={(value) => setSubmitted(value.trim() || undefined)}
        />
      </Card>

      {!submitted ? null : trace.isLoading ? (
        <Card>
          <div style={{ display: 'grid', placeItems: 'center', padding: 48 }}>
            <Spin size="large" />
          </div>
        </Card>
      ) : notFound ? (
        <Alert
          type="warning"
          showIcon
          message={`No finished-goods batch ${submitted}`}
          description={
            <>
              Check the number, or confirm the batch has been packed. Finished-goods batches are
              created by the packaging step (FRD 22) — until production and packaging have been run,
              there is nothing here to trace.
            </>
          }
        />
      ) : trace.error ? (
        <Alert type="error" showIcon message={apiErrorMessage(trace.error)} />
      ) : trace.data ? (
        <TraceResult data={trace.data} />
      ) : null}
    </Space>
  );
}

/**
 * Where the crop actually grew.
 *
 * Worth its own column rather than being folded into "Farm", because the two
 * answer different questions and can disagree: the farmer's GPS is where they
 * live, the plot's is where this crop stood. On a scattered smallholding they
 * are kilometres apart, and it is the plot a consumer scanning a pack is really
 * asking about.
 *
 * A null plot is expected, not an error - harvests collected before plots
 * existed have none, and so does a farmer whose land was never mapped. Saying
 * so plainly is better than an empty cell that reads as missing data.
 */
function PlotOrigin({ plot }: { plot: TraceFarmer['plot'] }) {
  if (!plot) {
    return (
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Not recorded
      </Typography.Text>
    );
  }

  return (
    <Space direction="vertical" size={2}>
      <Space size={4} wrap>
        <Typography.Text strong style={{ fontSize: 13 }}>
          {plot.name}
        </Typography.Text>
        {plot.surveyNumber ? <Tag>#{plot.surveyNumber}</Tag> : null}
      </Space>

      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {plot.areaAcres} ac
        {plot.soilType ? ` · ${plot.soilType}` : ''}
        {plot.irrigationType ? ` · ${plot.irrigationType}` : ''}
      </Typography.Text>

      {plot.sowingDate ? (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Sown {formatDate(plot.sowingDate)}
        </Typography.Text>
      ) : null}

      {plot.gpsLocation ? (
        <Typography.Link
          style={{ fontSize: 12 }}
          // Opens the coordinates in whatever map app the device uses. The
          // point of capturing GPS in the field is that somebody can go back
          // to that spot; a string you have to copy out by hand does not
          // deliver that.
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(plot.gpsLocation)}`}
          target="_blank"
          rel="noreferrer noopener"
        >
          <EnvironmentOutlined /> {plot.gpsLocation}
        </Typography.Link>
      ) : (
        <Typography.Text type="warning" style={{ fontSize: 12 }}>
          No location captured
        </Typography.Text>
      )}
    </Space>
  );
}

function TraceResult({ data }: { data: FinishedGoodsTrace }) {
  const farmerColumns = [
    {
      title: 'Farmer',
      key: 'farmer',
      render: (_: unknown, farmer: TraceFarmer) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{farmer.farmerName}</Typography.Text>
          <Typography.Text code style={{ fontSize: 12 }}>
            {farmer.farmerCode ?? EM_DASH}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Farm',
      key: 'farm',
      render: (_: unknown, farmer: TraceFarmer) => (
        <Space direction="vertical" size={0}>
          <span>{farmer.village}</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {farmer.district}, {farmer.state}
          </Typography.Text>
          {farmer.gpsLocation ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              <EnvironmentOutlined /> {farmer.gpsLocation}
            </Typography.Text>
          ) : null}
        </Space>
      ),
    },
    {
      title: 'Field',
      key: 'plot',
      render: (_: unknown, farmer: TraceFarmer) => <PlotOrigin plot={farmer.plot} />,
    },
    { title: 'Crop', dataIndex: 'crop', key: 'crop' },
    {
      title: 'Raw batch',
      dataIndex: 'rawBatchNumber',
      key: 'rawBatchNumber',
      render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
    },
    {
      title: 'Used',
      dataIndex: 'quantityUsed',
      key: 'quantityUsed',
      align: 'right' as const,
      render: (value: string) => formatQuantity(value, 'KG'),
    },
    {
      title: 'Procured',
      dataIndex: 'procuredOn',
      key: 'procuredOn',
      render: (value: string | null) => formatDate(value),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {/* The chain, in the order a customer would ask about it. */}
      <Card>
        <Steps
          size="small"
          current={3}
          items={[
            {
              title: 'Farm',
              description: `${data.farmers.length} farmer${data.farmers.length === 1 ? '' : 's'}`,
            },
            {
              title: 'Raw batch',
              description: `${new Set(data.farmers.map((f) => f.rawBatchNumber)).size} batch(es)`,
            },
            { title: 'Production', description: data.production.productionBatchNumber },
            { title: 'Pack', description: data.finishedBatch.fgBatchNumber },
          ]}
        />
      </Card>

      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <Card size="small" title="Product">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Name">{data.product.name}</Descriptions.Item>
              <Descriptions.Item label="SKU">
                <Typography.Text code>{data.product.sku}</Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="Pack">
                {data.finishedBatch.packagingType} · {data.finishedBatch.netWeight}
              </Descriptions.Item>
              <Descriptions.Item label="Manufactured">
                {formatDate(data.finishedBatch.manufacturingDate)}
              </Descriptions.Item>
              <Descriptions.Item label="Expires">
                {formatDate(data.finishedBatch.expiryDate)}
              </Descriptions.Item>
              <Descriptions.Item label="QA released">
                {data.finishedBatch.qaReleased ? (
                  <Tag color="green">Released</Tag>
                ) : (
                  <Tag color="red">Not released</Tag>
                )}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card size="small" title="Production">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Batch">
                <Typography.Text code>{data.production.productionBatchNumber}</Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="Date">
                {formatDate(data.production.productionDate)}
              </Descriptions.Item>
              <Descriptions.Item label="Recipe">
                {data.production.recipe
                  ? `${data.production.recipe.name} (${data.production.recipe.recipeCode})`
                  : EM_DASH}
              </Descriptions.Item>
              <Descriptions.Item label="Recipe version">
                v{data.production.recipeVersionUsed}
              </Descriptions.Item>
              <Descriptions.Item label="Branch">
                {data.production.branch?.name ?? EM_DASH}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>

      <Card
        size="small"
        title={`Farmers behind this pack (${data.farmers.length})`}
        extra={
          data.farmers.length === 0 ? (
            <Typography.Text type="danger">Chain incomplete</Typography.Text>
          ) : null
        }
      >
        <Table<TraceFarmer>
          size="small"
          rowKey={(farmer) => `${farmer.rawBatchNumber}-${farmer.farmerCode ?? farmer.farmerName}`}
          dataSource={data.farmers}
          columns={farmerColumns}
          pagination={false}
          locale={{
            emptyText: (
              <Empty description="No raw material recorded against this production run — the chain does not resolve to a farm." />
            ),
          }}
        />
      </Card>

      <Card size="small" title={`Quality checks (${data.quality.length})`}>
        <Table
          size="small"
          rowKey={(row: { stage: string; createdAt: string }) => `${row.stage}-${row.createdAt}`}
          dataSource={data.quality}
          pagination={false}
          locale={{ emptyText: <Empty description="No inspections recorded" /> }}
          columns={[
            {
              title: 'Stage',
              dataIndex: 'stage',
              render: (stage: string) => stage.replace(/_/g, ' '),
            },
            {
              title: 'Result',
              dataIndex: 'result',
              render: (result: string) => (
                <Tag color={result === 'PASS' ? 'green' : result === 'FAIL' ? 'red' : 'gold'}>
                  {result}
                </Tag>
              ),
            },
            { title: 'When', dataIndex: 'createdAt', render: formatDate },
          ]}
        />
      </Card>

      {data.traceabilityUrl ? (
        <Alert
          type="info"
          showIcon
          message="Public traceability URL"
          description={
            <Typography.Text copyable style={{ wordBreak: 'break-all' }}>
              {data.traceabilityUrl}
            </Typography.Text>
          }
        />
      ) : null}
    </Space>
  );
}
