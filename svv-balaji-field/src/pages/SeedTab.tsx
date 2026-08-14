import { CalendarOutlined, ExperimentOutlined } from '@ant-design/icons';
import { Button, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import type { SeedDistribution } from '@shared/api/types';
import { useAuth } from '@shared/auth/useAuth';
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

  const seed = useSeedDistribution();
  const { mineOnly, setMineOnly } = useMineFilter();

  const rows = useMemo(() => {
    const all = seed.data?.data ?? [];
    return mineOnly && user ? all.filter((row) => row.distributedById === user.id) : all;
  }, [seed.data, mineOnly, user]);

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const openEdit = (record: SeedDistribution) => {
    setEditing(record);
    setFormOpen(true);
  };

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <MineToggle
          mineOnly={mineOnly}
          onChange={setMineOnly}
          total={seed.data?.data?.length ?? 0}
          shown={rows.length}
        />
        {!isMobile ? (
          <Button type="primary" icon={<ExperimentOutlined />} onClick={() => setFormOpen(true)}>
            Record a handout
          </Button>
        ) : null}
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
