import { SafetyCertificateOutlined, WarningOutlined } from '@ant-design/icons';
import { Alert, Button, Space, Tag, Tooltip, Typography } from 'antd';
import { useState } from 'react';
import type { Farmer } from '../../api/types';
import { useCan } from '../../auth/useCan';
import { useFarmers } from '../../hooks/useFarmers';
import { formatDate } from '../../utils/format';
import { FarmerDetailDrawer } from '../farmers/FarmerDetailDrawer';
import { VerifyFarmerModal } from '../farmers/VerifyFarmerModal';
import { FieldCard, FieldList } from '../field/FieldPieces';
import { farmerGaps } from './readiness';

/**
 * The approval queue — the reason this panel exists.
 *
 * Approving a farmer is the single most consequential action in farm sourcing:
 * it mints the `SVV-YYYY-NNNNNN` traceability code from an atomic per-year
 * counter, and until it happens the farmer cannot be inspected, cannot be
 * collected from, and cannot appear on a consumer trace page. A queue nobody
 * can see is a queue nobody clears, so it gets a tab rather than a filter.
 *
 * Note who can act here. Registering a farmer is open to Branch and Procurement
 * Managers; **approving is Super Admin only** (`@Roles(SUPER_ADMIN)` on
 * `PATCH /farmers/:id/verify`, per FRD 5.1). So for most people who open this
 * screen it is a worklist to prepare and hand on, not one they can clear
 * themselves — and the screen says so rather than showing a button that 403s.
 */
export function OnboardingApprovalsTab() {
  const [verifying, setVerifying] = useState<Farmer | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const canApprove = useCan('FARMER_APPROVE');
  const farmers = useFarmers({ status: 'PENDING_VERIFICATION' });
  const rows = farmers.data?.data ?? [];

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {!canApprove ? (
        <Alert
          type="info"
          showIcon
          message="Approval is Super Admin only"
          description="You can register farmers and complete their details here, but the final approval — which issues the traceability code — has to come from a Super Admin (FRD 5.1). Get each record complete and it becomes a one-tap job for them."
        />
      ) : rows.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          message={`${rows.length} farmer${rows.length === 1 ? '' : 's'} waiting`}
          description="Approving issues the traceability code that the whole farm-to-fork chain hangs on. Until then this farmer cannot be inspected or collected from."
        />
      ) : null}

      <FieldList<Farmer>
        rows={rows}
        isLoading={farmers.isLoading}
        error={farmers.error}
        onRetry={() => void farmers.refetch()}
        keyOf={(farmer) => farmer.id}
        emptyText="Nothing waiting — every registered farmer has been through verification"
        renderCard={(farmer) => {
          const gaps = farmerGaps(farmer);
          const blocking = gaps.filter((gap) => gap.severity === 'blocking');

          return (
            <FieldCard
              title={farmer.fullName}
              onOpen={() => setDetailId(farmer.id)}
              tags={
                <>
                  <Tag color="orange">Awaiting approval</Tag>
                  {blocking.map((gap) => (
                    <Tooltip key={gap.key} title={gap.consequence}>
                      <Tag color="red" icon={<WarningOutlined />}>
                        {gap.label}
                      </Tag>
                    </Tooltip>
                  ))}
                  {gaps
                    .filter((gap) => gap.severity === 'advisory')
                    .map((gap) => (
                      <Tooltip key={gap.key} title={gap.consequence}>
                        <Tag>{gap.label}</Tag>
                      </Tooltip>
                    ))}
                </>
              }
              meta={
                <>
                  {farmer.mobile} · {farmer.village}, {farmer.district}
                  <br />
                  Registered {formatDate(farmer.createdAt)}
                  {farmer.branch?.name ? ` · ${farmer.branch.name}` : ''}
                </>
              }
            >
              {canApprove ? (
                <Button
                  type="primary"
                  block
                  size="large"
                  icon={<SafetyCertificateOutlined />}
                  onClick={(event) => {
                    // The card itself opens the detail drawer; stop the tap
                    // reaching it or approving would always open the drawer too.
                    event.stopPropagation();
                    setVerifying(farmer);
                  }}
                >
                  Verify
                </Button>
              ) : (
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                  {blocking.length > 0
                    ? 'Complete the details above, then hand to a Super Admin'
                    : 'Ready for a Super Admin to approve'}
                </Typography.Text>
              )}
            </FieldCard>
          );
        }}
      />

      <VerifyFarmerModal farmer={verifying} onClose={() => setVerifying(null)} />
      <FarmerDetailDrawer farmerId={detailId} onClose={() => setDetailId(null)} />
    </Space>
  );
}
