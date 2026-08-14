import {
  EnvironmentOutlined,
  PlusOutlined,
  QrcodeOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Button, Input, Segmented, Space, Tag, Typography } from 'antd';
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

type Filter = 'all' | 'pending' | 'active' | 'unmapped';

/**
 * Onboarding and land profiling, area 2 of the Agriculture Expert's six.
 *
 * Different emphasis from the onboarding desk at /onboarding, deliberately.
 * That screen is organised around the approval queue, because the desk's job is
 * to clear it. This one is organised around *land*, because the executive is
 * standing on it: the primary action on every card is "map the land", and the
 * filter that matters is which farmers have no plots recorded.
 *
 * Approval is not offered here at all. It is Super Admin only by default, and
 * offering a button that 403s to the person most likely to press it would be
 * worse than its absence.
 */
export function FieldFarmersTab() {
  const isMobile = useIsMobile();
  const canRegister = useCan('FARMER_CREATE');

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Farmer | null>(null);
  const [landFor, setLandFor] = useState<Farmer | null>(null);
  const [showingCodes, setShowingCodes] = useState<Farmer | null>(null);

  const statusForQuery: FarmerStatus | undefined =
    filter === 'pending' ? 'PENDING_VERIFICATION' : filter === 'active' ? 'ACTIVE' : undefined;

  const farmers = useFarmers({ fullName: search || undefined, status: statusForQuery });

  /**
   * "Unmapped" means no GPS on the farmer record. It is a proxy: knowing which
   * farmers have zero plots would need a count on the list endpoint, and asking
   * per farmer would be one request per row. Raised for Ujjawal — a
   * `_count.plots` on GET /farmers makes this exact rather than approximate.
   */
  const rows = (farmers.data?.data ?? []).filter((farmer) =>
    filter === 'unmapped' ? !farmer.gpsLocation : true,
  );

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Input.Search
        allowClear
        size={isMobile ? 'large' : 'middle'}
        placeholder="Search by name"
        onSearch={setSearch}
        enterButton
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <Segmented<Filter>
          size="small"
          value={filter}
          onChange={setFilter}
          options={[
            { label: 'All', value: 'all' },
            { label: 'Waiting', value: 'pending' },
            { label: 'Approved', value: 'active' },
            { label: 'No location', value: 'unmapped' },
          ]}
        />
        {!isMobile && canRegister ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
            Register farmer
          </Button>
        ) : null}
      </div>

      <FieldList<Farmer>
        rows={rows}
        isLoading={farmers.isLoading}
        error={farmers.error}
        onRetry={() => void farmers.refetch()}
        keyOf={(farmer) => farmer.id}
        emptyText={
          filter === 'unmapped'
            ? 'Every farmer has a location recorded'
            : search
              ? `No farmer matching "${search}"`
              : 'No farmers yet — register the first one from the button below'
        }
        renderCard={(farmer) => {
          const blocking = farmerGaps(farmer).filter((gap) => gap.severity === 'blocking');

          return (
            <FieldCard
              title={farmer.fullName}
              onOpen={() => setLandFor(farmer)}
              extra={
                farmer.farmerCode ? (
                  <Button
                    size="small"
                    icon={<QrcodeOutlined />}
                    onClick={(event) => {
                      event.stopPropagation();
                      setShowingCodes(farmer);
                    }}
                  />
                ) : null
              }
              tags={
                <>
                  <FarmerStatusTag status={farmer.status} />
                  {farmer.farmSizeAcres ? <Tag>{farmer.farmSizeAcres} ac</Tag> : null}
                  {!farmer.gpsLocation ? (
                    <Tag color="orange" icon={<EnvironmentOutlined />}>
                      No location
                    </Tag>
                  ) : null}
                  {blocking.map((gap) => (
                    <Tag key={gap.key} color="red" icon={<WarningOutlined />}>
                      {gap.label}
                    </Tag>
                  ))}
                </>
              }
              meta={
                <>
                  {farmer.farmerCode ? (
                    <Typography.Text code style={{ fontSize: 12 }}>
                      {farmer.farmerCode}
                    </Typography.Text>
                  ) : (
                    <Typography.Text type="secondary">
                      {FARMER_STATUS_LABELS[farmer.status]} — no traceability code yet
                    </Typography.Text>
                  )}
                  <br />
                  {farmer.mobile} · {farmer.village}, {farmer.district}
                </>
              }
            >
              <Space size={8} style={{ width: '100%' }}>
                <Button
                  block
                  type="primary"
                  ghost
                  icon={<EnvironmentOutlined />}
                  onClick={(event) => {
                    event.stopPropagation();
                    setLandFor(farmer);
                  }}
                >
                  Map land
                </Button>
                <Button
                  block
                  onClick={(event) => {
                    event.stopPropagation();
                    setEditing(farmer);
                    setFormOpen(true);
                  }}
                >
                  Details
                </Button>
              </Space>
            </FieldCard>
          );
        }}
      />

      {canRegister ? <FieldFab label="Register" onClick={() => setFormOpen(true)} /> : null}

      <FarmerFormModal open={formOpen} farmer={editing} onClose={closeForm} />
      <LandProfileSheet
        farmer={landFor}
        open={Boolean(landFor)}
        onClose={() => setLandFor(null)}
      />
      <FarmerCodesModal farmer={showingCodes} onClose={() => setShowingCodes(null)} />
    </Space>
  );
}
