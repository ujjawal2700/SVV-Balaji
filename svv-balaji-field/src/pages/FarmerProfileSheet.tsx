import {
  EditOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  PhoneOutlined,
  QrcodeOutlined,
  ScheduleOutlined,
  StarFilled,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Empty,
  Progress,
  Skeleton,
  Space,
  Table,
  Tabs,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import { collectionsApi } from '@shared/api/collections';
import { procurementApi } from '@shared/api/procurement';
import { queryKeys } from '@shared/api/queryKeys';
import type {
  Farmer,
  FarmerDetail,
  HarvestInspection,
  RawMaterialCollection,
  TrainingSession,
} from '@shared/api/types';
import { useCan } from '@shared/auth/useCan';
import { useFarmer, useFarmerPerformance } from '@shared/hooks/useFarmers';
import { useFarmPlots, useFarmPlotSummary } from '@shared/hooks/useFarmPlots';
import { useFieldVisitPlans } from '@shared/hooks/useFieldVisitPlans';
import { useIsMobile } from '@shared/hooks/useIsMobile';
import { useTrainingSessions } from '@shared/hooks/useTraining';
import { EM_DASH, formatCurrency, formatDate, formatQuantity } from '@shared/utils/format';
import { FarmerStatusTag } from './farmerStatus';
import { FieldReportDrawer } from './FieldReportDrawer';
import { FieldVisitFormModal } from './FieldVisitFormModal';
import { PlannedVisitsPanel } from './PlannedVisits';
import { PlanVisitModal } from './PlanVisitModal';

/**
 * FRD 7.3 Farmer Profile - one place for everything the system knows about a
 * farmer: personal and farm details, crop history, field visits (planned and
 * logged, each with its field report), seed, training, agreements, procurement
 * and payments, land, rating and verification history.
 *
 * Every section reads an endpoint that already exists and is guarded by that
 * module's own view permission, so a role that cannot see collections does not
 * see them here either - the tab is simply absent.
 */
export function FarmerProfileSheet({
  farmer: row,
  open,
  onClose,
  onEdit,
  onMapLand,
  onShowCodes,
}: {
  farmer: Farmer | null;
  open: boolean;
  onClose: () => void;
  onEdit?: (farmer: Farmer) => void;
  onMapLand?: (farmer: Farmer) => void;
  onShowCodes?: (farmer: Farmer) => void;
}) {
  const isMobile = useIsMobile();
  const detail = useFarmer(open && row ? row.id : undefined);
  const farmer = detail.data;

  const canVisits = useCan('FIELD_VISIT_VIEW');
  const canLogVisit = useCan('FIELD_VISIT_CREATE');
  const canTraining = useCan('TRAINING_VIEW');
  const canInspections = useCan('HARVEST_INSPECTION_VIEW');
  const canCollections = useCan('COLLECTION_VIEW');
  const canEdit = useCan('FARMER_EDIT');

  const [logOpen, setLogOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [reportFor, setReportFor] = useState<string | null>(null);
  const [tab, setTab] = useState('overview');

  const title = row ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontWeight: 700 }}>{row.fullName}</span>
      <FarmerStatusTag status={row.status} />
      {row.farmerCode ? <Typography.Text code style={{ fontSize: 12 }}>{row.farmerCode}</Typography.Text> : null}
    </div>
  ) : 'Farmer profile';

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        placement={isMobile ? 'bottom' : 'right'}
        height={isMobile ? '94%' : undefined}
        width={isMobile ? undefined : 900}
        title={title}
        destroyOnClose
        afterOpenChange={(v) => { if (!v) setTab('overview'); }}
        styles={{ body: { background: '#f8fafc', padding: isMobile ? 12 : 20 } }}
      >
        {detail.isLoading || !row ? (
          <Skeleton active paragraph={{ rows: 10 }} />
        ) : detail.error || !farmer ? (
          <Alert type="error" showIcon message={apiErrorMessage(detail.error, 'Could not load the farmer')} />
        ) : (
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            <ProfileHeader
              farmer={farmer}
              actions={
                <Space wrap size={8}>
                  {canLogVisit ? (
                    <Button type="primary" icon={<EnvironmentOutlined />} onClick={() => setLogOpen(true)}>
                      Log visit
                    </Button>
                  ) : null}
                  {canLogVisit ? (
                    <Button icon={<ScheduleOutlined />} onClick={() => setPlanOpen(true)}>
                      Plan visit
                    </Button>
                  ) : null}
                  {onMapLand ? <Button onClick={() => onMapLand(farmer)}>Land</Button> : null}
                  {onEdit && canEdit ? <Button icon={<EditOutlined />} onClick={() => onEdit(farmer)}>Edit</Button> : null}
                  {onShowCodes && farmer.farmerCode ? <Button icon={<QrcodeOutlined />} onClick={() => onShowCodes(farmer)} /> : null}
                </Space>
              }
            />

            <Tabs
              activeKey={tab}
              onChange={setTab}
              size={isMobile ? 'small' : 'middle'}
              style={{ background: '#fff', borderRadius: 12, padding: '4px 14px 14px', border: '1px solid #e2e8f0' }}
              items={[
                { key: 'overview', label: 'Overview', children: <OverviewTab farmer={farmer} /> },
                { key: 'crops', label: 'Crops', children: <CropHistoryTab farmer={farmer} canInspections={canInspections} canCollections={canCollections} /> },
                canVisits
                  ? { key: 'visits', label: `Visits (${farmer.fieldVisits.length})`, children: <VisitsTabContent farmer={farmer} onReport={setReportFor} /> }
                  : null,
                { key: 'seed', label: `Seed (${farmer.seedDistributions.length})`, children: <SeedTabContent farmer={farmer} /> },
                canTraining ? { key: 'training', label: 'Training', children: <TrainingTabContent farmerId={farmer.id} /> } : null,
                { key: 'agreements', label: `Agreements (${farmer.agreements.length})`, children: <AgreementsTabContent farmer={farmer} /> },
                canInspections || canCollections
                  ? { key: 'procurement', label: 'Procurement & payments', children: <ProcurementTabContent farmerId={farmer.id} canInspections={canInspections} canCollections={canCollections} /> }
                  : null,
                { key: 'land', label: 'Land', children: <LandTabContent farmer={farmer} onMapLand={onMapLand} /> },
              ].filter(Boolean) as NonNullable<Parameters<typeof Tabs>[0]['items']>}
            />
          </Space>
        )}
      </Drawer>

      <FieldVisitFormModal open={logOpen} onClose={() => setLogOpen(false)} initialFarmerId={row?.id} />
      <PlanVisitModal open={planOpen} onClose={() => setPlanOpen(false)} farmerId={row?.id} />
      <FieldReportDrawer visitId={reportFor} onClose={() => setReportFor(null)} />
    </>
  );
}

// --- Header -----------------------------------------------------------------

function ProfileHeader({ farmer, actions }: { farmer: FarmerDetail; actions: ReactNode }) {
  const rating = farmer.qualityRating === null ? null : Number(farmer.qualityRating);
  const lastVisit = farmer.fieldVisits[0];
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: '#475569', fontSize: 13 }}>
            <PhoneOutlined /> <a href={`tel:${farmer.mobile}`}>{farmer.mobile}</a> · {farmer.village}, {farmer.district}, {farmer.state}
          </div>
          <div style={{ color: '#64748b', fontSize: 12.5, marginTop: 2 }}>
            {farmer.branch?.name ?? EM_DASH} · registered {formatDate(farmer.createdAt)}
            {lastVisit ? ` · last visited ${formatDate(lastVisit.visitDate)}` : ' · never visited'}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Quality rating</div>
          {rating === null ? (
            <div style={{ color: '#94a3b8', fontWeight: 600 }}>Not rated yet</div>
          ) : (
            <div style={{ fontSize: 20, fontWeight: 800, color: rating >= 70 ? '#15803d' : rating >= 50 ? '#b45309' : '#b91c1c' }}>
              <StarFilled style={{ fontSize: 16 }} /> {rating.toFixed(0)}<span style={{ fontSize: 12, color: '#64748b' }}>/100</span>
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, marginTop: 12 }}>
        <Stat label="Farm size" value={farmer.farmSizeAcres ? `${farmer.farmSizeAcres} ac` : EM_DASH} />
        <Stat label="Visits" value={farmer.fieldVisits.length} />
        <Stat label="Agreements" value={farmer.agreements.length} />
        <Stat label="Seed handouts" value={farmer.seedDistributions.length} />
      </div>
      <div style={{ marginTop: 12 }}>{actions}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 11, color: '#64748b' }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{value}</div>
    </div>
  );
}

const mask = (value: string | null, keep = 4) =>
  value ? `${'•'.repeat(Math.max(0, value.length - keep))}${value.slice(-keep)}` : EM_DASH;

// --- Overview ---------------------------------------------------------------

function OverviewTab({ farmer }: { farmer: FarmerDetail }) {
  const performance = useFarmerPerformance(farmer.id);
  const p = performance.data;
  const gps = farmer.gpsLocation;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Descriptions size="small" column={{ xs: 1, sm: 2 }} bordered title="Personal">
        <Descriptions.Item label="Name">{farmer.fullName}</Descriptions.Item>
        <Descriptions.Item label="Mobile">{farmer.mobile}</Descriptions.Item>
        <Descriptions.Item label="Aadhaar">{mask(farmer.aadhaarNumber)}</Descriptions.Item>
        <Descriptions.Item label="PAN">{mask(farmer.panNumber)}</Descriptions.Item>
        <Descriptions.Item label="Family details" span="filled">{farmer.familyDetails || EM_DASH}</Descriptions.Item>
      </Descriptions>

      <Descriptions size="small" column={{ xs: 1, sm: 2 }} bordered title="Address">
        <Descriptions.Item label="Village">{farmer.village}</Descriptions.Item>
        <Descriptions.Item label="District / State">{farmer.district}, {farmer.state}</Descriptions.Item>
        <Descriptions.Item label="Address" span="filled">{farmer.address || EM_DASH}</Descriptions.Item>
        <Descriptions.Item label="GPS" span="filled">
          {gps ? <a href={`https://maps.google.com/?q=${encodeURIComponent(gps)}`} target="_blank" rel="noreferrer">{gps}</a> : <Tag color="orange">Not recorded</Tag>}
        </Descriptions.Item>
      </Descriptions>

      <Descriptions size="small" column={{ xs: 1, sm: 2 }} bordered title="Farm">
        <Descriptions.Item label="Farm size">{farmer.farmSizeAcres ? `${farmer.farmSizeAcres} acres` : EM_DASH}</Descriptions.Item>
        <Descriptions.Item label="Land type">{farmer.landType || EM_DASH}</Descriptions.Item>
        <Descriptions.Item label="Irrigation">{farmer.irrigationType || EM_DASH}</Descriptions.Item>
        <Descriptions.Item label="Crops (registered)">{farmer.cropDetails || EM_DASH}</Descriptions.Item>
      </Descriptions>

      <Descriptions size="small" column={{ xs: 1, sm: 2 }} bordered title="Bank">
        <Descriptions.Item label="Account holder">{farmer.bankAccountName || EM_DASH}</Descriptions.Item>
        <Descriptions.Item label="Bank">{farmer.bankName || EM_DASH}</Descriptions.Item>
        <Descriptions.Item label="Account no.">{mask(farmer.bankAccountNo)}</Descriptions.Item>
        <Descriptions.Item label="IFSC">{farmer.ifscCode || EM_DASH}</Descriptions.Item>
      </Descriptions>

      <div>
        <Typography.Title level={5} style={{ marginTop: 0 }}>Performance (FRD 7.6)</Typography.Title>
        {performance.isLoading ? (
          <Skeleton active paragraph={{ rows: 3 }} />
        ) : !p ? (
          <Typography.Text type="secondary">Performance is not available.</Typography.Text>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            {[
              ['Crop quality', p.cropQuality],
              ['Delivery timeliness', p.deliveryTimeliness],
              ['Procurement quantity', p.procurementQuantity],
              ['Complaint records', p.complaintRecords],
            ].map(([label, c]) => {
              const comp = c as typeof p.cropQuality;
              return (
                <div key={label as string} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong>{label as string}</strong>
                    <span>{comp.score === null ? '—' : Math.round(comp.score)}</span>
                  </div>
                  {comp.score !== null ? <Progress percent={Math.round(comp.score)} showInfo={false} size="small" /> : null}
                  <div style={{ fontSize: 12, color: '#64748b' }}>{comp.explanation}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <Typography.Title level={5} style={{ marginTop: 0 }}>Verification history</Typography.Title>
        {farmer.verificationLogs.length === 0 ? (
          <Typography.Text type="secondary">Not reviewed yet.</Typography.Text>
        ) : (
          <Timeline
            items={farmer.verificationLogs.map((log) => ({
              color: log.action === 'APPROVED' ? 'green' : log.action === 'REJECTED' ? 'red' : 'orange',
              children: (
                <div>
                  <strong>{log.action.replace('_', ' ').toLowerCase()}</strong> · {formatDate(log.createdAt)}
                  {log.verifiedBy ? ` · ${log.verifiedBy.fullName}` : ''}
                  {log.remarks ? <div style={{ color: '#64748b', fontSize: 12.5 }}>{log.remarks}</div> : null}
                </div>
              ),
            }))}
          />
        )}
      </div>
    </Space>
  );
}

// --- Crop history -----------------------------------------------------------

interface CropRow {
  crop: string;
  sources: Set<string>;
  firstSeen: string | null;
  lastActivity: string | null;
  agreements: number;
  contractedKg: number;
  visits: number;
  latestStage: string | null;
  latestHealth: string | null;
  latestForecastKg: number | null;
  inspections: number;
  deliveredKg: number;
}

/**
 * One row per crop, assembled from every record that names one: registration,
 * agreements, seed handouts, visits, plots, inspections and collections. Crop
 * names are free text, so they are grouped case-insensitively.
 */
function CropHistoryTab({ farmer, canInspections, canCollections }: { farmer: FarmerDetail; canInspections: boolean; canCollections: boolean }) {
  const plots = useFarmPlots(farmer.id);
  const inspections = useFarmerInspections(farmer.id, canInspections);
  const collections = useFarmerCollections(farmer.id, canCollections);
  return (
    <CropHistoryTable
      farmer={farmer}
      plots={plots.data?.data ?? []}
      inspectionRows={inspections.data?.data ?? []}
      collectionRows={collections.data?.data ?? []}
    />
  );
}

/**
 * Inspections and collections have their own view permissions. These only
 * fetch when the caller holds them - no request, so no 403 - and share the
 * shared hooks' cache keys, so the Procurement tab reuses the same response.
 */
function useFarmerInspections(farmerId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.inspections.list({ farmerId }),
    queryFn: () => procurementApi.listInspections({ farmerId }),
    enabled,
  });
}
function useFarmerCollections(farmerId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.collections.list({ farmerId }),
    queryFn: () => collectionsApi.list({ farmerId }),
    enabled,
  });
}

function CropHistoryTable({
  farmer,
  plots,
  inspectionRows,
  collectionRows,
}: {
  farmer: FarmerDetail;
  plots: Array<{ currentCrop: string | null; createdAt: string }>;
  inspectionRows: HarvestInspection[];
  collectionRows: RawMaterialCollection[];
}) {
  const rows = useMemo(() => {
    const map = new Map<string, CropRow>();
    const touch = (name: string | null | undefined, source: string, at: string | null) => {
      const crop = name?.trim();
      if (!crop) return null;
      const key = crop.toLowerCase();
      let row = map.get(key);
      if (!row) {
        row = { crop, sources: new Set(), firstSeen: null, lastActivity: null, agreements: 0, contractedKg: 0, visits: 0, latestStage: null, latestHealth: null, latestForecastKg: null, inspections: 0, deliveredKg: 0 };
        map.set(key, row);
      }
      row.sources.add(source);
      if (at) {
        if (!row.firstSeen || dayjs(at).isBefore(row.firstSeen)) row.firstSeen = at;
        if (!row.lastActivity || dayjs(at).isAfter(row.lastActivity)) row.lastActivity = at;
      }
      return row;
    };

    (farmer.cropDetails ?? '').split(',').forEach((c) => touch(c, 'Registration', farmer.createdAt));
    farmer.agreements.forEach((a) => {
      const r = touch(a.cropName, 'Agreement', a.agreementDate);
      if (r) { r.agreements += 1; if (a.status !== 'CANCELLED') r.contractedKg += Number(a.expectedQuantity) || 0; }
    });
    farmer.seedDistributions.forEach((s) => touch(s.seedName, 'Seed', s.distributionDate));
    // fieldVisits arrive newest first, so the first one seen per crop is the latest.
    farmer.fieldVisits.forEach((v) => {
      const r = touch(v.cropName, 'Visit', v.visitDate);
      if (r) {
        r.visits += 1;
        if (r.latestStage === null && r.latestHealth === null) {
          r.latestStage = v.cropGrowthStage;
          r.latestHealth = v.cropHealth;
          r.latestForecastKg = v.yieldPredictionQty ? Number(v.yieldPredictionQty) : null;
        }
      }
    });
    plots.forEach((p) => touch(p.currentCrop, 'Plot', p.createdAt));
    inspectionRows.forEach((i) => { const r = touch(i.cropName, 'Inspection', i.inspectionDate); if (r) r.inspections += 1; });
    collectionRows.forEach((c) => { const r = touch(c.cropName, 'Collection', c.collectionDate); if (r) r.deliveredKg += Number(c.netWeight) || 0; });

    return Array.from(map.values()).sort((a, b) => dayjs(b.lastActivity ?? 0).valueOf() - dayjs(a.lastActivity ?? 0).valueOf());
  }, [farmer, plots, inspectionRows, collectionRows]);

  if (rows.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No crops recorded for this farmer yet" />;

  return (
    <Table<CropRow>
      size="small"
      rowKey="crop"
      pagination={false}
      scroll={{ x: 760 }}
      dataSource={rows}
      columns={[
        { title: 'Crop', dataIndex: 'crop', render: (v, r) => (<div><strong>{v}</strong><div style={{ fontSize: 11, color: '#64748b' }}>{Array.from(r.sources).join(' · ')}</div></div>) },
        { title: 'Latest condition', render: (_, r) => (r.latestStage || r.latestHealth ? <div>{r.latestStage ?? EM_DASH}<div style={{ fontSize: 12, color: '#64748b' }}>{r.latestHealth ?? ''}</div></div> : EM_DASH) },
        { title: 'Forecast', render: (_, r) => (r.latestForecastKg === null ? EM_DASH : formatQuantity(r.latestForecastKg, 'KG')) },
        { title: 'Contracted', render: (_, r) => (r.agreements ? `${formatQuantity(r.contractedKg, 'KG')} (${r.agreements})` : EM_DASH) },
        { title: 'Delivered', render: (_, r) => (r.deliveredKg ? formatQuantity(r.deliveredKg, 'KG') : EM_DASH) },
        { title: 'Visits', dataIndex: 'visits' },
        { title: 'Inspections', dataIndex: 'inspections' },
        { title: 'Active', render: (_, r) => (r.firstSeen ? `${formatDate(r.firstSeen)} – ${formatDate(r.lastActivity)}` : EM_DASH) },
      ]}
    />
  );
}

// --- Visits -----------------------------------------------------------------

function VisitsTabContent({ farmer, onReport }: { farmer: FarmerDetail; onReport: (visitId: string) => void }) {
  const plans = useFieldVisitPlans({ farmerId: farmer.id });
  const history = (plans.data?.data ?? []).filter((p) => p.status !== 'PLANNED');

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={5} style={{ marginTop: 0 }}>Planned</Typography.Title>
        <PlannedVisitsPanel query={{ farmerId: farmer.id }} showFarmer={false} emptyText="No visits planned for this farmer" />
      </div>
      <div>
        <Typography.Title level={5}>Logged visits (FRD 12.6)</Typography.Title>
        {farmer.fieldVisits.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Never visited" />
        ) : (
          <Timeline
            items={farmer.fieldVisits.map((v) => ({
              color: /disease|pest damaged|poor/i.test(v.cropHealth ?? '') ? 'red' : /stress|deficien/i.test(v.cropHealth ?? '') ? 'orange' : 'green',
              children: (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div>
                    <strong>{formatDate(v.visitDate)}</strong> · {v.cropName ?? 'Crop not noted'}
                    <div style={{ fontSize: 12.5, color: '#475569' }}>
                      {[v.cropGrowthStage, v.cropHealth].filter(Boolean).join(' · ') || EM_DASH}
                      {v.yieldPredictionQty ? ` · forecast ${formatQuantity(v.yieldPredictionQty, 'KG')}` : ''}
                    </div>
                    {v.fertilizerAdvice || v.irrigationAdvice || v.pestControlSuggestions ? (
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        Advice: {[v.fertilizerAdvice, v.irrigationAdvice, v.pestControlSuggestions].filter(Boolean).join(' · ')}
                      </div>
                    ) : null}
                  </div>
                  <Button size="small" icon={<FileTextOutlined />} onClick={() => onReport(v.id)}>Report</Button>
                </div>
              ),
            }))}
          />
        )}
      </div>
      {history.length ? (
        <div>
          <Typography.Title level={5}>Plan history</Typography.Title>
          {history.map((p) => (
            <div key={p.id} style={{ fontSize: 13, padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
              {formatDate(p.plannedDate)} · {p.purpose ?? 'Visit'} ·{' '}
              {p.status === 'COMPLETED' ? <Tag color="green">Completed {p.completedVisit ? formatDate(p.completedVisit.visitDate) : ''}</Tag> : <Tag>Cancelled{p.cancelReason ? `: ${p.cancelReason}` : ''}</Tag>}
            </div>
          ))}
        </div>
      ) : null}
    </Space>
  );
}

// --- Seed, training, agreements ----------------------------------------------

function SeedTabContent({ farmer }: { farmer: FarmerDetail }) {
  return (
    <Table
      size="small"
      rowKey="id"
      pagination={false}
      scroll={{ x: 520 }}
      dataSource={farmer.seedDistributions}
      locale={{ emptyText: 'No seed or inputs handed out' }}
      columns={[
        { title: 'Date', dataIndex: 'distributionDate', render: (v) => formatDate(v) },
        { title: 'Seed', dataIndex: 'seedName', render: (v, r) => `${v}${r.seedVariety ? ` (${r.seedVariety})` : ''}` },
        { title: 'Quantity', render: (_, r) => `${formatQuantity(r.quantity)} ${r.unit}` },
        { title: 'Batch', dataIndex: 'batchNumber', render: (v) => v ?? EM_DASH },
      ]}
    />
  );
}

function TrainingTabContent({ farmerId }: { farmerId: string }) {
  const sessions = useTrainingSessions({ farmerId });
  return (
    <Table<TrainingSession>
      size="small"
      rowKey="id"
      loading={sessions.isLoading}
      pagination={false}
      dataSource={sessions.data?.data ?? []}
      locale={{ emptyText: 'Has not attended any training yet' }}
      columns={[
        { title: 'Date', dataIndex: 'scheduledDate', render: (v) => formatDate(v) },
        { title: 'Session', dataIndex: 'title' },
        { title: 'Conducted by', render: (_, r) => r.conductedBy?.fullName ?? EM_DASH },
      ]}
    />
  );
}

function AgreementsTabContent({ farmer }: { farmer: FarmerDetail }) {
  const colour: Record<string, string> = { ACTIVE: 'green', PENDING: 'gold', COMPLETED: 'blue', CANCELLED: 'default' };
  return (
    <Table
      size="small"
      rowKey="id"
      pagination={false}
      scroll={{ x: 640 }}
      dataSource={farmer.agreements}
      locale={{ emptyText: 'No agreements' }}
      columns={[
        { title: 'Crop', dataIndex: 'cropName', render: (v, r) => `${v}${r.variety ? ` (${r.variety})` : ''}` },
        { title: 'Quantity', dataIndex: 'expectedQuantity', render: (v) => formatQuantity(v, 'KG') },
        { title: 'Rate', dataIndex: 'purchaseRate', render: (v) => `${formatCurrency(v)}/kg` },
        { title: 'Signed', dataIndex: 'agreementDate', render: (v) => formatDate(v) },
        { title: 'Harvest', dataIndex: 'harvestDate', render: (v) => (v ? formatDate(v) : EM_DASH) },
        { title: 'Status', dataIndex: 'status', render: (v) => <Tag color={colour[v]}>{v.toLowerCase()}</Tag> },
      ]}
    />
  );
}

// --- Procurement & payments --------------------------------------------------

function ProcurementTabContent({ farmerId, canInspections, canCollections }: { farmerId: string; canInspections: boolean; canCollections: boolean }) {
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {canInspections ? <InspectionsTable farmerId={farmerId} /> : null}
      {canCollections ? <CollectionsTable farmerId={farmerId} /> : null}
    </Space>
  );
}

function InspectionsTable({ farmerId }: { farmerId: string }) {
  const q = useFarmerInspections(farmerId, true);
  const colour: Record<string, string> = { APPROVED: 'green', REJECTED: 'red', PENDING: 'gold' };
  return (
    <div>
      <Typography.Title level={5} style={{ marginTop: 0 }}>Harvest inspections</Typography.Title>
      <Table<HarvestInspection>
        size="small"
        rowKey="id"
        loading={q.isLoading}
        pagination={false}
        scroll={{ x: 560 }}
        dataSource={q.data?.data ?? []}
        locale={{ emptyText: 'No inspections' }}
        columns={[
          { title: 'Date', dataIndex: 'inspectionDate', render: (v) => formatDate(v) },
          { title: 'Crop', dataIndex: 'cropName' },
          { title: 'Moisture', dataIndex: 'moistureLevel', render: (v) => (v ? `${v}%` : EM_DASH) },
          { title: 'Result', dataIndex: 'result', render: (v) => <Tag color={colour[v] ?? 'default'}>{String(v).toLowerCase()}</Tag> },
          { title: 'Collected', render: (_, r) => r.collection?.receiptNumber ?? EM_DASH },
        ]}
      />
    </div>
  );
}

function CollectionsTable({ farmerId }: { farmerId: string }) {
  const q = useFarmerCollections(farmerId, true);
  const rows = q.data?.data ?? [];
  const paid = rows.filter((c) => c.paymentStatus === 'PAID').reduce((s, c) => s + Number(c.totalAmount), 0);
  const total = rows.filter((c) => c.paymentStatus !== 'REFUNDED').reduce((s, c) => s + Number(c.totalAmount), 0);
  const colour: Record<string, string> = { PAID: 'green', PARTIAL: 'gold', PENDING: 'orange', FAILED: 'red', REFUNDED: 'default' };
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <Typography.Title level={5} style={{ margin: 0 }}>Procurement & payment history</Typography.Title>
        {rows.length ? (
          <Typography.Text type="secondary">
            Paid {formatCurrency(paid)} of {formatCurrency(total)} · outstanding {formatCurrency(total - paid)}
          </Typography.Text>
        ) : null}
      </div>
      <Table<RawMaterialCollection>
        size="small"
        rowKey="id"
        loading={q.isLoading}
        pagination={false}
        scroll={{ x: 640 }}
        style={{ marginTop: 8 }}
        dataSource={rows}
        locale={{ emptyText: 'Nothing collected from this farmer yet' }}
        columns={[
          { title: 'Receipt', dataIndex: 'receiptNumber' },
          { title: 'Date', dataIndex: 'collectionDate', render: (v) => formatDate(v) },
          { title: 'Crop', dataIndex: 'cropName' },
          { title: 'Net weight', render: (_, r) => formatQuantity(r.netWeight, r.unit) },
          { title: 'Amount', dataIndex: 'totalAmount', render: (v) => formatCurrency(v) },
          { title: 'Payment', dataIndex: 'paymentStatus', render: (v) => <Tag color={colour[v]}>{String(v).toLowerCase()}</Tag> },
        ]}
      />
    </div>
  );
}

// --- Land -------------------------------------------------------------------

function LandTabContent({ farmer, onMapLand }: { farmer: FarmerDetail; onMapLand?: (farmer: Farmer) => void }) {
  const plots = useFarmPlots(farmer.id);
  const summary = useFarmPlotSummary(farmer.id);
  const s = summary.data;
  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
        <Stat label="Registered" value={s?.registeredAcres ? `${s.registeredAcres} ac` : EM_DASH} />
        <Stat label="Mapped" value={s ? `${s.mappedAcres} ac` : EM_DASH} />
        <Stat label="Plots" value={s?.plotCount ?? 0} />
        <Stat label="Plots without GPS" value={s?.plotsWithoutGps ?? 0} />
      </div>
      <Table
        size="small"
        rowKey="id"
        loading={plots.isLoading}
        pagination={false}
        scroll={{ x: 560 }}
        dataSource={plots.data?.data ?? []}
        locale={{ emptyText: 'No plots mapped yet' }}
        columns={[
          { title: 'Plot', dataIndex: 'name', render: (v, r) => `${v}${r.surveyNumber ? ` · ${r.surveyNumber}` : ''}` },
          { title: 'Area', dataIndex: 'areaAcres', render: (v) => `${v} ac` },
          { title: 'Crop', dataIndex: 'currentCrop', render: (v) => v ?? EM_DASH },
          { title: 'Expected harvest', dataIndex: 'expectedHarvest', render: (v) => (v ? formatDate(v) : EM_DASH) },
          { title: 'GPS', dataIndex: 'gpsLocation', render: (v) => (v ? <Tag color="green">Mapped</Tag> : <Tag color="orange">Missing</Tag>) },
        ]}
      />
      {onMapLand ? <Button icon={<EnvironmentOutlined />} onClick={() => onMapLand(farmer)}>Open land mapping</Button> : null}
    </Space>
  );
}
