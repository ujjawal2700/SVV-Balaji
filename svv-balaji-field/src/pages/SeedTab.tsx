import { ArrowLeftOutlined, CalendarOutlined, ExperimentOutlined } from '@ant-design/icons';
import { Button, Space, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SeedDistribution } from '@shared/api/types';
import { useAuth } from '@shared/auth/useAuth';
import { useIsMobile } from '@shared/hooks/useIsMobile';
import { useSeedDistribution } from '@shared/hooks/useSeedDistribution';
import { formatDate, formatQuantity } from '@shared/utils/format';
import { SeedDistributionFormModal } from './SeedDistributionFormModal';
import { FieldCard, FieldFab, FieldList } from './pieces';
import { MineToggle, useMineFilter } from './MineToggle';

export function FieldSeedTab() {
  const navigate = useNavigate();
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
          <Button
            type="text"
            shape="circle"
            icon={<ArrowLeftOutlined style={{ fontSize: 16, color: '#0f172a' }} />}
            onClick={() => navigate('/more')}
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
            }}
          />
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
