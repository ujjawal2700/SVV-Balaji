import {
  CheckCircleFilled,
  CloseCircleFilled,
  EnvironmentOutlined,
  ExperimentOutlined,
  SafetyCertificateOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, Skeleton, Space, Tag, Typography } from 'antd';
import type { ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { usePackTrace, type PackTrace, type RecalledPackTrace } from '../hooks/usePackTrace';

/**
 * The QR destination — FRD 30.
 *
 * The URL on the pack is `svvbalaji.com/trace/FG-20260807-001`, the one URL in
 * this system that cannot be changed later (packaging is printed ahead of the
 * software). It reads `GET /storefront/trace/:fgBatchNumber`, a PUBLIC
 * projection: region-level origin, lab quality and milling dates. Farmer names,
 * contacts, bank details and rates never leave the server on this route.
 */
const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDate = (iso: string | null) => (iso ? dateFmt.format(new Date(iso)) : '—');
const pct = (v: number | null) => (v === null ? 'Not recorded' : `${v}%`);

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Card size="small" style={{ borderRadius: 14 }}>
      <Space align="center" style={{ marginBottom: 12, color: '#065f46' }}>
        {icon}
        <Typography.Text strong>{title}</Typography.Text>
      </Space>
      {children}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '4px 0' }}>
      <Typography.Text type="secondary">{label}</Typography.Text>
      <Typography.Text strong style={{ textAlign: 'right' }}>
        {value}
      </Typography.Text>
    </div>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Tag
      icon={ok ? <CheckCircleFilled /> : <CloseCircleFilled />}
      color={ok ? 'success' : 'default'}
      style={{ marginBottom: 6 }}
    >
      {label}
    </Tag>
  );
}

function TraceResult({ trace }: { trace: PackTrace }) {
  const { product, pack, origin, quality, processing } = trace;
  const regions = origin.regions
    .map((r) => [r.village, r.district, r.state].filter(Boolean).join(', '))
    .filter(Boolean);

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={2} style={{ marginBottom: 2 }}>
          {product.name}
        </Typography.Title>
        <Typography.Text type="secondary">
          Batch {trace.fgBatchNumber} · {pack.netWeight} · {pack.packagingType}
        </Typography.Text>
      </div>

      {trace.status === 'ON_HOLD' ? (
        <Alert
          type="warning"
          showIcon
          message="This batch is under review"
          description="SVV Balaji has paused sale of this batch while a quality check is completed. Please hold the pack and contact customer support before consuming it."
        />
      ) : (
        <Alert
          type="success"
          showIcon
          message="Verified genuine SVV Balaji batch"
          description="This batch passed final quality inspection and was released for sale."
        />
      )}

      <Section icon={<SafetyCertificateOutlined />} title="Product">
        <Row label="Manufactured" value={fmtDate(pack.manufacturingDate)} />
        <Row label="Packed" value={fmtDate(pack.packagingDate)} />
        <Row label="Best before" value={fmtDate(pack.expiryDate)} />
      </Section>

      <Section icon={<EnvironmentOutlined />} title="Where it was grown">
        <Row label="Crop" value={origin.crops.join(', ') || '—'} />
        <Row
          label="Region"
          value={regions.length ? regions.map((r) => <div key={r}>{r}</div>) : 'Not recorded'}
        />
        {origin.growerCount > 0 && (
          <Row
            label="Sourced from"
            value={`${origin.growerCount} ${origin.growerCount === 1 ? 'farm' : 'farms'}`}
          />
        )}
        {origin.firstHarvest && (
          <Row
            label="Harvested"
            value={
              origin.lastHarvest && origin.lastHarvest !== origin.firstHarvest
                ? `${fmtDate(origin.firstHarvest)} – ${fmtDate(origin.lastHarvest)}`
                : fmtDate(origin.firstHarvest)
            }
          />
        )}
      </Section>

      <Section icon={<ExperimentOutlined />} title="Lab quality">
        <Row label="Moisture" value={pct(quality.moisturePercent)} />
        <Row label="Purity" value={pct(quality.purityPercent)} />
        <Row label="Foreign matter" value={pct(quality.foreignMatterPercent)} />
        <div style={{ marginTop: 10 }}>
          <Check ok={quality.rawMaterialPassed} label="Raw material tested" />
          <Check ok={quality.inProcessPassed} label="In-process check" />
          <Check ok={quality.finishedGoodsPassed} label="Final inspection" />
          {quality.shelfLifeVerified && <Check ok label="Shelf life verified" />}
        </div>
      </Section>

      <Section icon={<ToolOutlined />} title="Milling & packing">
        {processing.facility && <Row label="Facility" value={processing.facility} />}
        <Row label="Milled" value={fmtDate(processing.milledOn)} />
        <Row label="Packed" value={fmtDate(processing.packedOn)} />
        <Row label="Quality sign-off" value={quality.qaReleased ? 'Released' : 'Pending'} />
      </Section>
    </Space>
  );
}

function RecalledResult({ trace }: { trace: RecalledPackTrace }) {
  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Typography.Title level={2} style={{ marginBottom: 2 }}>
        {trace.product.name}
      </Typography.Title>
      <Typography.Text type="secondary">Batch {trace.fgBatchNumber}</Typography.Text>
      <Alert type="error" showIcon message="This batch has been recalled" description={trace.notice} />
    </Space>
  );
}

export function TracePage() {
  const params = useParams<{ fgBatchNumber: string }>();
  // `/trace?batch=FG-…` is the URL form in the product spec; `/trace/FG-…` is what packs print.
  const [searchParams] = useSearchParams();
  const fgBatchNumber = params.fgBatchNumber ?? searchParams.get('batch')?.trim() ?? undefined;
  const navigate = useNavigate();
  const { data, isLoading, error } = usePackTrace(fgBatchNumber);

  return (
    <div className="store-container store-container--narrow">
      <Space direction="vertical" size={16} style={{ width: '100%', paddingTop: 16, paddingBottom: 24 }}>
        {!fgBatchNumber && (
          <div>
            <Typography.Title level={2} style={{ marginBottom: 4 }}>
              Trace a pack
            </Typography.Title>
            <Typography.Text type="secondary">
              Enter the batch number printed on the pack, next to the QR code.
            </Typography.Text>
          </div>
        )}


        {fgBatchNumber && isLoading && <Skeleton active paragraph={{ rows: 8 }} />}
        {fgBatchNumber && error && (
          <Alert
            type="error"
            showIcon
            message="Batch not found"
            description={(error as Error).message}
          />
        )}
        {data?.status === 'RECALLED' && <RecalledResult trace={data} />}
        {data && data.status !== 'RECALLED' && <TraceResult trace={data} />}

        <Form
          key={fgBatchNumber ?? ''}
          layout="vertical"
          requiredMark={false}
          initialValues={{ batch: fgBatchNumber }}
          onFinish={({ batch }: { batch: string }) =>
            navigate(`/trace/${encodeURIComponent(batch.trim().toUpperCase())}`)
          }
        >
          <Form.Item
            name="batch"
            label={fgBatchNumber ? 'Check another batch' : 'Batch number'}
            rules={[{ required: true, whitespace: true, message: 'Enter the batch number from the pack' }]}
          >
            <Input placeholder="FG-20260807-001" autoCapitalize="characters" />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large">
            Trace this pack
          </Button>
        </Form>
      </Space>
    </div>
  );
}
