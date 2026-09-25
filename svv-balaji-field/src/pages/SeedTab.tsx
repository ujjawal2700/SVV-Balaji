import { CalendarOutlined, ExperimentOutlined, TeamOutlined } from '@ant-design/icons';
import { Button, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import type { SeedDistribution } from '@shared/api/types';
import { useAuth } from '@shared/auth/useAuth';
import { useCan } from '@shared/auth/useCan';
import { useSeedStock } from '@shared/hooks/useSeedStock';
import { SeedSourceTag } from '@shared/components/SeedLotField';
import { useIsMobile } from '@shared/hooks/useIsMobile';
import { useSeedDistribution } from '@shared/hooks/useSeedDistribution';
import { formatDate, formatQuantity } from '@shared/utils/format';
import { SeedDistributionFormModal } from './SeedDistributionFormModal';
import { FieldCard, FieldFab, FieldList } from './pieces';
import { MineToggle, useMineFilter } from './MineToggle';

export function FieldSeedTab() {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SeedDistribution | null>(null);

  const { mineOnly, setMineOnly } = useMineFilter();

  // Server-side - see the note in VisitsTab. A client-side filter breaks the
  // moment this endpoint is paginated.
  const seed = useSeedDistribution(mineOnly && user ? { distributedById: user.id } : {});
  const everyone = useSeedDistribution();

  const rows = seed.data?.data ?? [];

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const openEdit = (record: SeedDistribution) => {
    setEditing(record);
    setFormOpen(true);
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {/* Page Navigation & Title Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div>
            <Typography.Title level={4} style={{ margin: 0, color: '#0f172a', fontWeight: 700 }}>
              Seed & Agri-Input Handouts
            </Typography.Title>
            <Typography.Text style={{ color: '#64748b', fontSize: 13 }}>
              Traceable record of certified seed and inputs distributed to farmers
            </Typography.Text>
          </div>
        </div>

        {!isMobile && (
          <Button
            type="primary"
            icon={<ExperimentOutlined />}
            onClick={() => setFormOpen(true)}
            style={{
              borderRadius: 10,
              height: 40,
              fontWeight: 600,
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              border: 'none',
              boxShadow: '0 2px 8px 0 rgba(16, 185, 129, 0.3)',
            }}
          >
            Record Handout
          </Button>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#fff',
          padding: isMobile ? '12px 14px' : '14px 18px',
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 2px 0 rgba(15, 23, 42, 0.03)',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <MineToggle
          mineOnly={mineOnly}
          onChange={setMineOnly}
          total={everyone.data?.data?.length ?? 0}
          shown={rows.length}
        />
      </div>

      <SeedSummary rows={rows} loading={seed.isLoading} mineOnly={mineOnly} />

      <SeedStockStrip />

      <FieldList<SeedDistribution>
        rows={rows}
        isLoading={seed.isLoading}
        error={seed.error}
        onRetry={() => void seed.refetch()}
        keyOf={(row) => row.id}
        emptyText={
          mineOnly
            ? 'You have not handed anything out yet'
            : 'No seed or input distribution recorded yet'
        }
        renderCard={(row) => (
          // Tapping opens the edit sheet rather than a read-only view: unlike a
          // visit, a handout has nothing extra to show, so "open" would only
          // repeat the card back at the user.
          <FieldCard
            title={row.seedName}
            onOpen={() => openEdit(row)}
            extra={
              <Typography.Text strong style={{ fontSize: 15, whiteSpace: 'nowrap' }}>
                {formatQuantity(row.quantity, row.unit)}
              </Typography.Text>
            }
            tags={
              <>
                <SeedSourceTag seedSource={row.seedSource} seedStockId={row.seedStockId} />
                {row.seedVariety ? <Tag>{row.seedVariety}</Tag> : null}
                {row.batchNumber ? <Tag color="purple">{row.batchNumber}</Tag> : null}
              </>
            }
            meta={
              <>
                {row.farmer?.fullName ?? 'Unknown farmer'}
                {row.farmer?.farmerCode ? ` · ${row.farmer.farmerCode}` : ''}
                <br />
                <CalendarOutlined /> {formatDate(row.distributionDate)}
                {!mineOnly && row.distributedBy?.fullName ? ` · ${row.distributedBy.fullName}` : ''}
              </>
            }
          />
        )}
      />

      <FieldFab label="Record handout" onClick={() => setFormOpen(true)} />

      <SeedDistributionFormModal open={formOpen} record={editing} onClose={closeForm} />
    </Space>
  );
}

/**
 * FRD 10.2 - what is left to hand out at the executive's branch. Read-only here;
 * stock is received and adjusted in the admin panel. Handouts logged "from
 * stock" deduct from these lots.
 */
function SeedStockStrip() {
  const canView = useCan('SEED_STOCK_VIEW');
  const stock = useSeedStock({}, { enabled: canView });
  if (!canView) return null;
  const lots = stock.data?.data ?? [];

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px' }}>
      <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
        Seed stock at your branch
      </Typography.Text>
      {stock.isLoading ? (
        <Typography.Text type="secondary">Loading…</Typography.Text>
      ) : lots.length === 0 ? (
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          No seed stock recorded yet. Handouts are still recorded, but nothing is deducted until stock is received
          in the admin panel.
        </Typography.Text>
      ) : (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {lots.map((lot) => {
            const empty = Number(lot.quantityOnHand) === 0;
            return (
              <div
                key={lot.id}
                style={{
                  flex: '0 0 auto',
                  minWidth: 150,
                  border: `1px solid ${empty ? '#fecaca' : '#e2e8f0'}`,
                  background: empty ? '#fef2f2' : '#f8fafc',
                  borderRadius: 10,
                  padding: '8px 10px',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{lot.seedName}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  {[lot.seedVariety, lot.batchNumber].filter(Boolean).join(' · ') || '\u00a0'}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: empty ? '#dc2626' : '#047857', marginTop: 2 }}>
                  {Number(lot.quantityOnHand).toLocaleString('en-IN')} {lot.unit}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * The seed & agri-input report at the top of the tab: how much went out, to how
 * many farmers, and of what - for the same rows the list below shows (Mine or
 * Everyone). Quantities are summed per seed and unit, never across units.
 */
function SeedSummary({ rows, loading, mineOnly }: { rows: SeedDistribution[]; loading: boolean; mineOnly: boolean }) {
  const summary = useMemo(() => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const bySeed = new Map<string, { name: string; unit: string; qty: number; farmers: Set<string> }>();
    for (const r of rows) {
      const key = `${r.seedName.trim().toLowerCase()}|${r.unit}`;
      const e = bySeed.get(key) ?? { name: r.seedName, unit: r.unit, qty: 0, farmers: new Set<string>() };
      e.qty += Number(r.quantity) || 0;
      e.farmers.add(r.farmerId);
      bySeed.set(key, e);
    }
    return {
      handouts: rows.length,
      thisMonth: rows.filter((r) => new Date(r.distributionDate) >= monthStart).length,
      farmers: new Set(rows.map((r) => r.farmerId)).size,
      company: rows.filter((r) => (r.seedSource ?? (r.seedStockId ? 'COMPANY_STOCK' : null)) === 'COMPANY_STOCK').length,
      external: rows.filter((r) => r.seedSource === 'EXTERNAL').length,
      seeds: Array.from(bySeed.values()).sort((a, b) => b.qty - a.qty),
    };
  }, [rows]);

  if (loading || rows.length === 0) return null;

  const tile = (label: string, value: number, hint?: string) => (
    <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 12px', flex: '1 1 120px' }}>
      <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>{value.toLocaleString('en-IN')}</div>
      {hint ? <div style={{ fontSize: 11, color: '#94a3b8' }}>{hint}</div> : null}
    </div>
  );

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px' }}>
      <Typography.Text strong style={{ display: 'block', marginBottom: 10 }}>
        Seed & agri-input report {mineOnly ? '· my handouts' : '· everyone'}
      </Typography.Text>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {tile('Handouts', summary.handouts, `${summary.thisMonth} this month`)}
        {tile('Farmers reached', summary.farmers)}
        {tile('Company stock', summary.company, 'deducted from stock')}
        {tile('External', summary.external, 'farmer provided / outside')}
        {summary.handouts - summary.company - summary.external > 0
          ? tile('Source not recorded', summary.handouts - summary.company - summary.external, 'older handouts')
          : null}
      </div>
      <div style={{ marginTop: 12 }}>
        {summary.seeds.slice(0, 6).map((s) => {
          const max = summary.seeds[0].qty || 1;
          return (
            <div key={`${s.name}|${s.unit}`} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                <span style={{ color: '#0f172a', fontWeight: 500 }}>{s.name}</span>
                <span style={{ color: '#475569', whiteSpace: 'nowrap' }}>
                  {s.qty.toLocaleString('en-IN')} {s.unit} · <TeamOutlined /> {s.farmers.size}
                </span>
              </div>
              <div style={{ height: 6, background: '#f1f5f9', borderRadius: 999, marginTop: 4 }}>
                <div style={{ width: `${Math.max(4, (s.qty / max) * 100)}%`, height: '100%', background: '#10b981', borderRadius: 999 }} />
              </div>
            </div>
          );
        })}
        {summary.seeds.length > 6 ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>+{summary.seeds.length - 6} more inputs</Typography.Text>
        ) : null}
      </div>
    </div>
  );
}
