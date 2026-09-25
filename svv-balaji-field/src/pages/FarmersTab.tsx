import {
  EnvironmentOutlined,
  FilterOutlined,
  IdcardOutlined,
  PlusOutlined,
  QrcodeOutlined,
  SearchOutlined,
  StarFilled,
  WarningOutlined,
} from '@ant-design/icons';
import { Badge, Button, Input, Segmented, Space, Tag } from 'antd';
import { useState } from 'react';
import type { Farmer, FarmerStatus } from '@shared/api/types';
import { useCan } from '@shared/auth/useCan';
import { useFarmers } from '@shared/hooks/useFarmers';
import { useIsMobile } from '@shared/hooks/useIsMobile';
import { FarmerCodesModal } from './FarmerCodesModal';
import { FarmerFormModal } from './FarmerFormModal';
import { FARMER_STATUS_LABELS, FarmerStatusTag } from './farmerStatus';
import { farmerGaps } from './readiness';
import { FieldCard, FieldFab, FieldList } from './pieces';
import { LandProfileSheet } from './LandProfileSheet';
import { FarmerProfileSheet } from './FarmerProfileSheet';
import {
  EMPTY_FILTERS,
  FarmerFilterDrawer,
  FarmerFilterFields,
  activeFilterChips,
  countActiveFilters,
  type FarmerFilters,
} from './FarmerFilters';

type Filter = 'all' | 'pending' | 'active' | 'unmapped';

export function FieldFarmersTab() {
  const isMobile = useIsMobile();
  const canRegister = useCan('FARMER_CREATE');

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Farmer | null>(null);
  const [landFor, setLandFor] = useState<Farmer | null>(null);
  const [showingCodes, setShowingCodes] = useState<Farmer | null>(null);
  const [profileFor, setProfileFor] = useState<Farmer | null>(null);

  // FRD 7.4 - crop, district, state, status and quality rating, on top of the
  // name search and the quick filters. All applied server-side.
  const [filters, setFilters] = useState<FarmerFilters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeCount = countActiveFilters(filters);

  const statusForQuery: FarmerStatus | undefined =
    filter === 'pending' ? 'PENDING_VERIFICATION' : filter === 'active' ? 'ACTIVE' : filters.status;

  const farmers = useFarmers({
    fullName: search || undefined,
    status: statusForQuery,
    crop: filters.crop || undefined,
    district: filters.district || undefined,
    state: filters.state || undefined,
    minRating: filters.minRating,
  });
  // Unfiltered list, for the district / state / crop suggestions. Same query key
  // the Home screen uses, so it is normally already cached.
  const allFarmers = useFarmers({});

  // The quick filter and the Status filter both set status; whichever was
  // touched last wins, and the other steps aside.
  const changeQuickFilter = (next: Filter) => {
    setFilter(next);
    if (next === 'pending' || next === 'active') setFilters((f) => ({ ...f, status: undefined }));
  };
  const changeFilters = (next: FarmerFilters) => {
    setFilters(next);
    if (next.status && (filter === 'pending' || filter === 'active')) setFilter('all');
  };

  const rows = (farmers.data?.data ?? []).filter((farmer) =>
    filter === 'unmapped' ? !farmer.gpsLocation : true,
  );

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {/* --- Top Bar & Sleek Filters Toolbar --- */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
          background: '#ffffff',
          padding: isMobile ? '12px 14px' : '16px 20px',
          borderRadius: 14,
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px 0 rgba(15, 23, 42, 0.04)',
        }}
      >
        {/* Search Bar with inline icon - flexible width */}
        <div style={{ flex: '1 1 280px', minWidth: isMobile ? '100%' : 220, maxWidth: isMobile ? '100%' : 420 }}>
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: '#94a3b8', fontSize: 16, marginRight: 6 }} />}
            placeholder="Search by name, village, mobile..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              height: 42,
              borderRadius: 10,
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              fontSize: 14,
            }}
          />
        </div>

        {/* Action Controls & Segmented Filters */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            justifyContent: isMobile ? 'space-between' : 'flex-end',
            flex: isMobile ? '1 1 100%' : '0 1 auto',
          }}
        >
          <div style={{ overflowX: 'auto', maxWidth: '100%', WebkitOverflowScrolling: 'touch' }}>
            <Segmented<Filter>
              value={filter}
              onChange={changeQuickFilter}
              style={{
                background: '#f1f5f9',
                padding: 3,
                borderRadius: 10,
                fontWeight: 500,
                whiteSpace: 'nowrap',
              }}
              options={[
                { label: 'All', value: 'all' },
                { label: 'Waiting', value: 'pending' },
                { label: 'Approved', value: 'active' },
                { label: 'No location', value: 'unmapped' },
              ]}
            />
          </div>

          {isMobile ? (
            <Badge count={activeCount} size="small">
              <Button icon={<FilterOutlined />} onClick={() => setFiltersOpen(true)} style={{ height: 36, borderRadius: 10 }}>
                Filters
              </Button>
            </Badge>
          ) : null}

          {!isMobile && canRegister ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setFormOpen(true)}
              style={{
                height: 42,
                paddingInline: 18,
                borderRadius: 10,
                fontWeight: 600,
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                border: 'none',
                boxShadow: '0 2px 10px 0 rgba(16, 185, 129, 0.35)',
                whiteSpace: 'nowrap',
              }}
            >
              Register farmer / supplier
            </Button>
          ) : null}
        </div>
      </div>

      {!isMobile ? (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '12px 16px' }}>
          <FarmerFilterFields value={filters} onChange={changeFilters} farmers={allFarmers.data?.data ?? []} inline />
        </div>
      ) : null}

      {activeCount > 0 ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {activeFilterChips(filters).map((chip) => (
            <Tag
              key={chip.key}
              closable
              onClose={() => changeFilters({ ...filters, [chip.key]: undefined })}
              style={{ margin: 0, padding: '2px 8px' }}
            >
              {chip.label}
            </Tag>
          ))}
          <Button type="link" size="small" onClick={() => setFilters(EMPTY_FILTERS)}>
            Clear filters
          </Button>
          <span style={{ fontSize: 12, color: '#64748b' }}>
            {rows.length} {rows.length === 1 ? 'match' : 'matches'}
          </span>
        </div>
      ) : null}

      {/* --- Farmer Cards Grid --- */}
      <FieldList<Farmer>
        rows={rows}
        isLoading={farmers.isLoading}
        error={farmers.error}
        onRetry={() => void farmers.refetch()}
        keyOf={(farmer) => farmer.id}
        emptyText={
          filter === 'unmapped' && activeCount === 0
            ? 'Every farmer / supplier has a location recorded'
            : activeCount > 0
              ? 'No farmer / supplier matches these filters'
              : search
              ? `No farmer / supplier matching "${search}"`
              : 'No farmers / suppliers yet — register the first one from the button below'
        }
        renderCard={(farmer) => {
          const blocking = farmerGaps(farmer).filter((gap) => gap.severity === 'blocking');

          return (
            <FieldCard
              title={farmer.fullName}
              onOpen={() => setLandFor(farmer)}
              extra={
                farmer.farmerCode ? (
                  <button
                    type="button"
                    aria-label="Show QR Code"
                    onClick={(event) => {
                      event.stopPropagation();
                      setShowingCodes(farmer);
                    }}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 8,
                      background: '#f1f5f9',
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#475569',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#e2e8f0';
                      e.currentTarget.style.color = '#0f172a';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#f1f5f9';
                      e.currentTarget.style.color = '#475569';
                    }}
                  >
                    <QrcodeOutlined style={{ fontSize: 16 }} />
                  </button>
                ) : null
              }
              tags={
                <>
                  <FarmerStatusTag status={farmer.status} />

                  {farmer.qualityRating !== null ? (
                    <span
                      title="Quality rating (FRD 7.6)"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '2px 8px',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        background: '#fefce8',
                        color: '#a16207',
                        border: '1px solid #fef08a',
                      }}
                    >
                      <StarFilled style={{ fontSize: 11 }} /> {Number(farmer.qualityRating).toFixed(0)}
                    </span>
                  ) : null}

                  {farmer.farmSizeAcres ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '2px 8px',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 500,
                        background: '#f1f5f9',
                        color: '#475569',
                        border: '1px solid #e2e8f0',
                      }}
                    >
                      {farmer.farmSizeAcres} ac
                    </span>
                  ) : null}

                  {!farmer.gpsLocation ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '2px 8px',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        background: '#ffedd5',
                        color: '#c2410c',
                        border: '1px solid #fed7aa',
                      }}
                    >
                      <EnvironmentOutlined style={{ fontSize: 11 }} /> No location
                    </span>
                  ) : null}

                  {blocking.map((gap) => (
                    <span
                      key={gap.key}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '2px 8px',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        background: '#fee2e2',
                        color: '#b91c1c',
                        border: '1px solid #fecaca',
                      }}
                    >
                      <WarningOutlined style={{ fontSize: 11 }} /> {gap.label}
                    </span>
                  ))}
                </>
              }
              meta={
                <div>
                  <div style={{ marginBottom: 4 }}>
                    {farmer.farmerCode ? (
                      <span
                        style={{
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                          fontSize: 12,
                          fontWeight: 600,
                          padding: '2px 7px',
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: 6,
                          color: '#0f172a',
                          letterSpacing: '0.02em',
                        }}
                      >
                        {farmer.farmerCode}
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>
                        {FARMER_STATUS_LABELS[farmer.status]} — no code yet
                      </span>
                    )}
                  </div>
                  <span style={{ color: '#64748b', fontSize: 13 }}>
                    {farmer.mobile} · {farmer.village}, {farmer.district}
                  </span>
                </div>
              }
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 4 }}>
                <Button
                  block
                  type="primary"
                  ghost
                  style={{ fontWeight: 600, borderRadius: 8, height: 38 }}
                  icon={<IdcardOutlined />}
                  onClick={(event) => {
                    event.stopPropagation();
                    setProfileFor(farmer);
                  }}
                >
                  Profile
                </Button>
                <Button
                  block
                  style={{
                    color: '#059669',
                    borderColor: '#a7f3d0',
                    background: '#f0fdf4',
                    fontWeight: 600,
                    borderRadius: 8,
                    height: 38,
                  }}
                  icon={<EnvironmentOutlined style={{ color: '#059669' }} />}
                  onClick={(event) => {
                    event.stopPropagation();
                    setLandFor(farmer);
                  }}
                >
                  Map land
                </Button>
                <Button
                  block
                  style={{
                    color: '#334155',
                    borderColor: '#e2e8f0',
                    background: '#f8fafc',
                    fontWeight: 600,
                    borderRadius: 8,
                    height: 38,
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    setEditing(farmer);
                    setFormOpen(true);
                  }}
                >
                  Details
                </Button>
              </div>
            </FieldCard>
          );
        }}
      />

      {canRegister ? (
        <FieldFab label="Register" onClick={() => setFormOpen(true)} />
      ) : null}

      <FarmerFormModal open={formOpen} farmer={editing} onClose={closeForm} />
      <LandProfileSheet
        farmer={landFor}
        open={Boolean(landFor)}
        onClose={() => setLandFor(null)}
      />
      <FarmerCodesModal farmer={showingCodes} onClose={() => setShowingCodes(null)} />
      <FarmerProfileSheet
        farmer={profileFor}
        open={Boolean(profileFor)}
        onClose={() => setProfileFor(null)}
        onEdit={(f) => {
          setEditing(f);
          setFormOpen(true);
        }}
        onMapLand={(f) => setLandFor(f)}
        onShowCodes={(f) => setShowingCodes(f)}
      />
      <FarmerFilterDrawer
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        value={filters}
        onChange={changeFilters}
        farmers={allFarmers.data?.data ?? []}
      />
    </Space>
  );
}
