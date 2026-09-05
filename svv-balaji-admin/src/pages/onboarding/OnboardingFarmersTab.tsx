import { PlusOutlined, QrcodeOutlined, WarningOutlined } from '@ant-design/icons';
import { Button, Input, Segmented, Space, Tag, Tooltip, Typography } from 'antd';
import { useState } from 'react';
import type { Farmer, FarmerStatus } from '../../api/types';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useFarmers } from '../../hooks/useFarmers';
import { formatDateTime } from '../../utils/format';
import { FarmerCodesModal } from '../farmers/FarmerCodesModal';
import { FarmerDetailDrawer } from '../farmers/FarmerDetailDrawer';
import { FarmerFormModal } from '../farmers/FarmerFormModal';
import { FARMER_STATUS_LABELS, FarmerStatusTag } from '../farmers/farmerStatus';
import { FieldCard, FieldFab, FieldList } from '../field/FieldPieces';
import { farmerGaps } from './readiness';

type Filter = 'all' | 'pending' | 'active' | 'incomplete';

export function OnboardingFarmersTab() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Farmer | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showingCodes, setShowingCodes] = useState<Farmer | null>(null);

  /**
   * Name search goes to the server, which does a case-insensitive `contains`.
   * The status filters are applied here because "incomplete" is not a status
   * the API knows about — it is derived from which fields are blank.
   */
  const statusForQuery: FarmerStatus | undefined =
    filter === 'pending' ? 'PENDING_VERIFICATION' : filter === 'active' ? 'ACTIVE' : undefined;

  const farmers = useFarmers({
    fullName: search || undefined,
    status: statusForQuery,
  });

  const rows = (farmers.data?.data ?? []).filter((farmer) =>
    filter === 'incomplete'
      ? farmerGaps(farmer).some((gap) => gap.severity === 'blocking')
      : true,
  );

  const openEdit = (farmer: Farmer) => {
    setEditing(farmer);
    setFormOpen(true);
  };

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
            { label: 'Pending', value: 'pending' },
            { label: 'Approved', value: 'active' },
            { label: 'Incomplete', value: 'incomplete' },
          ]}
        />
        {!isMobile ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
            Register farmer / supplier
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
          filter === 'incomplete'
            ? 'Every farmer / supplier has bank details — nothing blocking payment'
            : search
              ? `No farmer / supplier matching "${search}"`
              : 'No farmers / suppliers registered yet'
        }
        renderCard={(farmer) => {
          const blocking = farmerGaps(farmer).filter((gap) => gap.severity === 'blocking');

          return (
            <FieldCard
              title={farmer.fullName}
              onOpen={() => setDetailId(farmer.id)}
              extra={
                farmer.farmerCode ? (
                  <Tooltip title="QR and barcode">
                    <Button
                      size="small"
                      icon={<QrcodeOutlined />}
                      onClick={(event) => {
                        event.stopPropagation();
                        setShowingCodes(farmer);
                      }}
                    />
                  </Tooltip>
                ) : null
              }
              tags={
                <>
                  <FarmerStatusTag status={farmer.status} />
                  {blocking.map((gap) => (
                    <Tooltip key={gap.key} title={gap.consequence}>
                      <Tag color="red" icon={<WarningOutlined />}>
                        {gap.label}
                      </Tag>
                    </Tooltip>
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
                      No traceability code — {FARMER_STATUS_LABELS[farmer.status].toLowerCase()}
                    </Typography.Text>
                  )}
                  <br />
                  {farmer.mobile} · {farmer.village}, {farmer.district}
                  <br />
                  Registered {formatDateTime(farmer.createdAt)}
                  {farmer.createdBy?.fullName ? ` by ${farmer.createdBy.fullName}` : ''}
                </>
              }
            >
              <Button
                block
                onClick={(event) => {
                  event.stopPropagation();
                  openEdit(farmer);
                }}
              >
                Complete details
              </Button>
            </FieldCard>
          );
        }}
      />

      <FieldFab label="Register" onClick={() => setFormOpen(true)} />

      <FarmerFormModal open={formOpen} farmer={editing} onClose={closeForm} />
      <FarmerDetailDrawer farmerId={detailId} onClose={() => setDetailId(null)} />
      <FarmerCodesModal farmer={showingCodes} onClose={() => setShowingCodes(null)} />
    </Space>
  );
}
