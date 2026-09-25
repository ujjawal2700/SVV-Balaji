import { PrinterOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Skeleton, Space } from 'antd';
import { useRef, type CSSProperties, type ReactNode } from 'react';
import { apiErrorMessage } from '../api/client';
import type { FieldReport, FieldReportRisk, FieldReportSeverity, HarvestStage } from '../api/types';
import { useFieldVisitReport } from '../hooks/useFieldVisits';
import { EM_DASH, formatDate, formatDateTime } from '../utils/format';

/**
 * FRD 12.7 - the field report for one visit, as a document.
 *
 * Styled inline and in plain colours on purpose: "Print / Save PDF" copies this
 * DOM into a clean window, so the report has to look right without antd's
 * stylesheet and on paper. Both the field app (right after a visit is saved)
 * and the admin panel (procurement/production) render this same component.
 */
export function FieldReportView({ visitId, toolbar = true }: { visitId: string; toolbar?: boolean }) {
  const report = useFieldVisitReport(visitId);
  const docRef = useRef<HTMLDivElement>(null);

  if (report.isLoading) return <Skeleton active paragraph={{ rows: 12 }} />;
  if (report.error || !report.data) {
    return (
      <Alert
        type="error"
        showIcon
        message={apiErrorMessage(report.error, 'Could not generate the field report')}
        action={<Button size="small" onClick={() => void report.refetch()}>Retry</Button>}
      />
    );
  }

  const r = report.data;
  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {toolbar ? (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button icon={<ReloadOutlined />} onClick={() => void report.refetch()} loading={report.isFetching}>
            Refresh
          </Button>
          <Button
            type="primary"
            icon={<PrinterOutlined />}
            onClick={() => docRef.current && printFieldReport(docRef.current, `${r.reportNumber} - ${r.farmer.fullName}`)}
          >
            Print / Save PDF
          </Button>
        </div>
      ) : null}
      <div ref={docRef}>
        <FieldReportDocument report={r} />
      </div>
    </Space>
  );
}

/** Opens the report alone in a new window and prints it. */
export function printFieldReport(node: HTMLElement, title: string) {
  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) return;
  win.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
      '<style>body{margin:0;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;background:#fff}' +
      '@page{size:A4;margin:14mm}@media print{body{padding:0}.fr-section{break-inside:avoid}}img{max-width:100%}</style>' +
      `</head><body>${node.innerHTML}</body></html>`,
  );
  win.document.close();
  win.focus();
  // Give images a moment to load before the print dialog snapshots the page.
  setTimeout(() => win.print(), 400);
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const RISK: Record<FieldReportRisk, { label: string; fg: string; bg: string }> = {
  LOW: { label: 'Low risk', fg: '#166534', bg: '#dcfce7' },
  MEDIUM: { label: 'Medium risk', fg: '#92400e', bg: '#fef3c7' },
  HIGH: { label: 'High risk', fg: '#991b1b', bg: '#fee2e2' },
};

const SEVERITY: Record<FieldReportSeverity, { fg: string; bg: string; label: string }> = {
  HIGH: { fg: '#991b1b', bg: '#fef2f2', label: 'High' },
  MEDIUM: { fg: '#92400e', bg: '#fffbeb', label: 'Medium' },
  INFO: { fg: '#334155', bg: '#f8fafc', label: 'Note' },
};

const STAGE: Record<HarvestStage, { label: string; fg: string }> = {
  NOT_READY: { label: 'Growing — not ready', fg: '#1d4ed8' },
  APPROACHING: { label: 'Harvest approaching', fg: '#b45309' },
  READY: { label: 'Ready for harvest', fg: '#15803d' },
  OVERDUE: { label: 'Harvest overdue', fg: '#b91c1c' },
  UNKNOWN: { label: 'Not enough data', fg: '#64748b' },
};

const kg = (n: number | null) => (n === null ? EM_DASH : `${n.toLocaleString('en-IN')} kg`);
const text = (v: string | null | undefined) => (v && v.trim() ? v : EM_DASH);

const S = {
  doc: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24, color: '#0f172a', fontSize: 13, lineHeight: 1.55 } as CSSProperties,
  h2: { fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#475569', margin: '0 0 8px' } as CSSProperties,
  section: { marginTop: 18, paddingTop: 14, borderTop: '1px solid #e2e8f0' } as CSSProperties,
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '8px 16px' } as CSSProperties,
  label: { fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em' } as CSSProperties,
  value: { fontWeight: 600, color: '#0f172a', wordBreak: 'break-word' } as CSSProperties,
  pill: (fg: string, bg: string): CSSProperties => ({ display: 'inline-block', padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, color: fg, background: bg }),
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div style={S.label}>{label}</div>
      <div style={S.value}>{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="fr-section" style={S.section}>
      <h3 style={S.h2}>{title}</h3>
      {children}
    </div>
  );
}

export function FieldReportDocument({ report: r }: { report: FieldReport }) {
  const risk = RISK[r.riskLevel];
  const stage = STAGE[r.harvestOutlook.stage];
  const photos = r.visit.documents.filter((d) => /\.(jpe?g|png|webp)(\?|$)/i.test(d.fileUrl));
  const otherDocs = r.visit.documents.filter((d) => !photos.includes(d));

  return (
    <div style={S.doc}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, letterSpacing: '0.05em' }}>
            SVV BALAJI FOOD &amp; BEVERAGES · FIELD MONITORING
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2 }}>Field Report</div>
          <div style={{ color: '#475569' }}>
            {r.farmer.fullName} · {text(r.visit.cropName)} · visit {formatDate(r.visit.visitDate)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontWeight: 700 }}>{r.reportNumber}</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>Generated {formatDateTime(r.generatedAt)}</div>
          <div style={{ marginTop: 6 }}>
            <span style={S.pill(risk.fg, risk.bg)}>{risk.label}</span>
          </div>
        </div>
      </div>

      {/* Harvest outlook - the part procurement reads first */}
      <div className="fr-section" style={{ marginTop: 16, padding: 14, borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          <span style={{ fontWeight: 800, color: stage.fg, fontSize: 15 }}>{stage.label}</span>
          {r.harvestOutlook.hasHarvestInspection ? <span style={S.pill('#166534', '#dcfce7')}>Inspection raised</span> : null}
        </div>
        <div style={S.grid}>
          <Field label="Predicted yield">{kg(r.harvestOutlook.predictedYieldKg)}</Field>
          <Field label="Contracted">{kg(r.harvestOutlook.contractedKg)}</Field>
          <Field label="Of contract">{r.harvestOutlook.percentOfContract === null ? EM_DASH : `${r.harvestOutlook.percentOfContract}%`}</Field>
          <Field label="Expected harvest">
            {r.harvestOutlook.expectedHarvestDate ? formatDate(r.harvestOutlook.expectedHarvestDate) : EM_DASH}
            {r.harvestOutlook.daysToHarvest !== null ? (
              <span style={{ fontWeight: 400, color: '#64748b' }}>
                {' '}({r.harvestOutlook.daysToHarvest < 0 ? `${Math.abs(r.harvestOutlook.daysToHarvest)}d ago` : `in ${r.harvestOutlook.daysToHarvest}d`})
              </span>
            ) : null}
          </Field>
        </div>
        <div style={{ marginTop: 8, color: '#334155' }}>{r.harvestOutlook.summary}</div>
      </div>

      <Section title="Visit">
        <div style={S.grid}>
          <Field label="Visit date">{formatDate(r.visit.visitDate)}</Field>
          <Field label="Visited by">{r.visit.expert?.fullName ?? EM_DASH}</Field>
          <Field label="Branch">{r.visit.branch?.name ?? EM_DASH}</Field>
          <Field label="Visit to this farmer">#{r.visitNumber}</Field>
          {r.plan ? <Field label="Planned for">{formatDate(r.plan.plannedDate)}{r.plan.purpose ? ` — ${r.plan.purpose}` : ''}</Field> : null}
        </div>
      </Section>

      <Section title="Farmer & land">
        <div style={S.grid}>
          <Field label="Farmer">{r.farmer.fullName}</Field>
          <Field label="Farmer ID">{r.farmer.farmerCode ?? 'Not yet issued'}</Field>
          <Field label="Mobile">{r.farmer.mobile}</Field>
          <Field label="Location">{r.farmer.village}, {r.farmer.district}, {r.farmer.state}</Field>
          <Field label="Land / irrigation">{text(r.farmer.landType)} / {text(r.farmer.irrigationType)}</Field>
          <Field label="Area (registered / mapped)">
            {r.land.registeredAcres === null ? EM_DASH : `${r.land.registeredAcres} ac`} / {r.land.mappedAcres} ac in {r.land.plotCount} plot{r.land.plotCount === 1 ? '' : 's'}
          </Field>
          <Field label="Quality rating">{r.farmer.qualityRating === null ? 'Not rated yet' : `${r.farmer.qualityRating} / 100`}</Field>
          <Field label="GPS">{text(r.farmer.gpsLocation)}</Field>
        </div>
        {r.agreement ? (
          <div style={{ marginTop: 10, color: '#334155' }}>
            <strong>Agreement:</strong> {r.agreement.cropName}{r.agreement.variety ? ` (${r.agreement.variety})` : ''} · {kg(r.agreement.expectedQuantity)} at ₹{r.agreement.purchaseRate ?? EM_DASH}/kg · harvest {r.agreement.harvestDate ? formatDate(r.agreement.harvestDate) : EM_DASH} · {r.agreement.status.toLowerCase()}
          </div>
        ) : null}
      </Section>

      <Section title="Crop observations (FRD 12.2)">
        <div style={S.grid}>
          <Field label="Crop">{text(r.visit.cropName)}</Field>
          <Field label="Growth stage">{text(r.visit.cropGrowthStage)}</Field>
          <Field label="Health">{text(r.visit.cropHealth)}</Field>
          <Field label="Pests">{text(r.visit.pestStatus)}</Field>
        </div>
        {r.visit.diseaseObservation ? <div style={{ marginTop: 8 }}><strong>Disease / remarks:</strong> {r.visit.diseaseObservation}</div> : null}
        {r.previousVisit ? (
          <div style={{ marginTop: 10, fontSize: 12, color: '#475569', background: '#f8fafc', borderRadius: 8, padding: '8px 10px' }}>
            <strong>Since the last visit</strong> ({formatDate(r.previousVisit.visitDate)}, {r.previousVisit.daysBefore} days earlier): health {text(r.previousVisit.cropHealth)} → {text(r.visit.cropHealth)}; stage {text(r.previousVisit.cropGrowthStage)} → {text(r.visit.cropGrowthStage)}; forecast {kg(r.previousVisit.yieldPredictionQty)} → {kg(r.visit.yieldPredictionQty)}.
          </div>
        ) : null}
      </Section>

      <Section title="Recommendations given (FRD 12.3)">
        <div style={S.grid}>
          <Field label="Fertiliser">{text(r.recommendations.fertilizer)}</Field>
          <Field label="Irrigation">{text(r.recommendations.irrigation)}</Field>
          <Field label="Pest control">{text(r.recommendations.pestControl)}</Field>
          <Field label="Harvest preparation">{text(r.recommendations.harvestPreparation)}</Field>
        </div>
      </Section>

      <Section title="Observations & risks">
        {r.flags.length === 0 ? (
          <div style={{ color: '#166534' }}>Nothing of concern was recorded on this visit.</div>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {r.flags.map((f, i) => (
              <div key={i} style={{ padding: '6px 10px', borderRadius: 8, background: SEVERITY[f.severity].bg, color: SEVERITY[f.severity].fg }}>
                <strong>{SEVERITY[f.severity].label}:</strong> {f.message}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Next steps">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          <StepList title="Procurement team" items={r.nextSteps.procurement} />
          <StepList title="Production team" items={r.nextSteps.production} />
        </div>
      </Section>

      <Section title={`Evidence (${r.visit.documents.length})`}>
        {r.visit.documents.length === 0 ? (
          <div style={{ color: '#64748b' }}>No photos or documents attached.</div>
        ) : (
          <>
            {photos.length ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {photos.map((d) => (
                  <img key={d.id} src={d.fileUrl} alt="" style={{ width: 140, height: 105, objectFit: 'cover', borderRadius: 8, border: '1px solid #e2e8f0' }} />
                ))}
              </div>
            ) : null}
            {otherDocs.map((d) => (
              <div key={d.id} style={{ marginTop: 6 }}>
                <a href={d.fileUrl} target="_blank" rel="noreferrer">{d.fileType}: {d.fileUrl.split('/').pop()}</a>
              </div>
            ))}
          </>
        )}
      </Section>

      <div style={{ marginTop: 20, fontSize: 11, color: '#94a3b8' }}>
        Generated automatically from field visit recorded {formatDateTime(r.visit.recordedAt)}. Figures are taken from the
        visit, the farmer record, their land plots and their agreement; editing the visit updates this report.
      </div>
    </div>
  );
}

function StepList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{title}</div>
      {items.length === 0 ? (
        <div style={{ color: '#64748b' }}>No action needed yet.</div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {items.map((s, i) => <li key={i}>{s}</li>)}
        </ul>
      )}
    </div>
  );
}
