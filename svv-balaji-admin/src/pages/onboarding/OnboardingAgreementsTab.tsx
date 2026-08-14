import { FileProtectOutlined } from '@ant-design/icons';
import { Alert, Button, Segmented, Space, Tag, Typography } from 'antd';
import { useState } from 'react';
import type { Agreement, AgreementStatus } from '../../api/types';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useAgreements } from '../../hooks/useAgreements';
import { formatCurrency, formatDate, formatQuantity } from '../../utils/format';
import { AgreementFormModal } from '../agreements/AgreementFormModal';
import { FieldCard, FieldFab, FieldList } from '../field/FieldPieces';

const STATUS_COLOURS: Record<AgreementStatus, string> = {
  PENDING: 'gold',
  ACTIVE: 'green',
  COMPLETED: 'blue',
  CANCELLED: 'default',
};

type Filter = 'all' | 'PENDING' | 'ACTIVE';

export function OnboardingAgreementsTab() {
  const isMobile = useIsMobile();
  const [filter, setFilter] = useState<Filter>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Agreement | null>(null);

  const agreements = useAgreements();
  const rows = (agreements.data?.data ?? []).filter((a) => filter === 'all' || a.status === filter);

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Alert
        type="info"
        showIcon
        message="The rate here is what a collection falls back on"
        description="When no rate is entered at the weighbridge, the collection uses the agreed rate from this record. Once a harvest inspection has been raised against an agreement its terms are fixed — the server refuses an edit, because that rate has already been used as the basis of a decision."
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <Segmented<Filter>
          size="small"
          value={filter}
          onChange={setFilter}
          options={[
            { label: 'All', value: 'all' },
            { label: 'Pending', value: 'PENDING' },
            { label: 'Active', value: 'ACTIVE' },
          ]}
        />
        {!isMobile ? (
          <Button type="primary" icon={<FileProtectOutlined />} onClick={() => setFormOpen(true)}>
            New agreement
          </Button>
        ) : null}
      </div>

      <FieldList<Agreement>
        rows={rows}
        isLoading={agreements.isLoading}
        error={agreements.error}
        onRetry={() => void agreements.refetch()}
        keyOf={(agreement) => agreement.id}
        emptyText="No agreements yet — these are signed pre-season, before any harvest"
        renderCard={(agreement) => {
          // Non-zero means the terms are fixed. The list carries the count, so
          // the card can say so rather than the user finding out on submit.
          const used = agreement._count?.harvestInspections ?? 0;

          return (
            <FieldCard
              title={agreement.farmer?.fullName ?? 'Unknown farmer'}
              onOpen={used > 0 ? undefined : () => {
                setEditing(agreement);
                setFormOpen(true);
              }}
              extra={
                <Typography.Text strong style={{ whiteSpace: 'nowrap' }}>
                  {formatCurrency(agreement.purchaseRate)}
                </Typography.Text>
              }
              tags={
                <>
                  <Tag color={STATUS_COLOURS[agreement.status]}>{agreement.status}</Tag>
                  <Tag>{agreement.cropName}</Tag>
                  {agreement.variety ? <Tag>{agreement.variety}</Tag> : null}
                  {used > 0 ? <Tag color="purple">Terms fixed</Tag> : null}
                </>
              }
              meta={
                <>
                  {formatQuantity(agreement.expectedQuantity, 'KG')} expected
                  {agreement.farmer?.farmerCode ? ` · ${agreement.farmer.farmerCode}` : ''}
                  <br />
                  Signed {formatDate(agreement.agreementDate)}
                  {agreement.harvestDate ? ` · harvest due ${formatDate(agreement.harvestDate)}` : ''}
                </>
              }
            >
              {used > 0 ? (
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                  Used for {used} harvest inspection{used === 1 ? '' : 's'} — the rate and quality
                  standards can no longer be changed.
                </Typography.Text>
              ) : null}
            </FieldCard>
          );
        }}
      />

      <FieldFab label="New agreement" onClick={() => setFormOpen(true)} />

      <AgreementFormModal open={formOpen} agreement={editing} onClose={closeForm} />
    </Space>
  );
}
