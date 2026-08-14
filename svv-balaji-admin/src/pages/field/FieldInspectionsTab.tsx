import { CheckCircleOutlined, CloseCircleOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Alert, Button, Segmented, Space, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import type { HarvestInspection, InspectionResult } from '../../api/types';
import { useCan } from '../../auth/useCan';
import { useAuth } from '../../auth/useAuth';
import { useAgreements } from '../../hooks/useAgreements';
import { useHarvestInspections } from '../../hooks/useProcurement';
import { useIsMobile } from '../../hooks/useIsMobile';
import { formatDate, formatQuantity } from '../../utils/format';
import { HarvestInspectionFormModal } from '../procurement/HarvestInspectionFormModal';
import { FieldCard, FieldFab, FieldList } from './FieldPieces';
import { MineToggle, useMineFilter } from './MineToggle';

const RESULT_COLOUR: Record<InspectionResult, string> = {
  APPROVED: 'green',
  REJECTED: 'red',
  HOLD_FOR_REINSPECTION: 'gold',
};

type Filter = 'due' | 'mine' | 'all';

/**
 * Area 6: the pre-procurement gate.
 *
 * This is the most consequential screen in the field app and the copy says so.
 * An APPROVED inspection is what lets procurement collect a harvest; a REJECTED
 * one stops it. Nothing else the Agriculture Expert does has that effect, and
 * an executive who thinks they are filling in a form rather than opening a gate
 * will approve things they should not.
 *
 * The default tab is "Due" — harvests with an agreement date that has arrived
 * and no inspection yet. That is the work; the list of inspections already done
 * is history.
 */
export function FieldInspectionsTab() {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const canInspect = useCan('HARVEST_INSPECTION_CREATE');

  const [filter, setFilter] = useState<Filter>('due');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<HarvestInspection | null>(null);
  const { mineOnly, setMineOnly } = useMineFilter(true);

  const inspections = useHarvestInspections({});
  const agreements = useAgreements();

  const all = inspections.data?.data ?? [];

  /**
   * Harvests waiting on this gate: an agreement whose harvest date has arrived
   * and which has no inspection raised against the farmer yet.
   *
   * Matched on farmer rather than on agreement id because an inspection can be
   * raised without naming its agreement (`agreementId` is optional on the DTO),
   * and treating those as "not inspected" would show the executive work they
   * have already done.
   */
  const due = useMemo(() => {
    const inspectedFarmers = new Set(all.map((inspection) => inspection.farmerId));
    const today = dayjs().startOf('day');

    return (agreements.data?.data ?? [])
      .filter((agreement) => {
        if (!agreement.harvestDate) return false;
        if (agreement.status === 'COMPLETED' || agreement.status === 'CANCELLED') return false;
        if (inspectedFarmers.has(agreement.farmerId)) return false;
        return dayjs(agreement.harvestDate).startOf('day').diff(today, 'day') <= 7;
      })
      .sort((a, b) => dayjs(a.harvestDate!).valueOf() - dayjs(b.harvestDate!).valueOf());
  }, [agreements.data, all]);

  const mine = all.filter((inspection) => inspection.inspectedById === user?.id);
  const history = mineOnly ? mine : all;

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Alert
        type="warning"
        showIcon
        icon={<SafetyCertificateOutlined />}
        message="This is the gate, not a form"
        description="An APPROVED result is what allows procurement to collect this harvest and mint its raw material batch. A REJECTED one stops it. Once a collection has been recorded the inspection is fixed — the server refuses an edit, because that judgement has already been acted on."
      />

      <Segmented<Filter>
        block
        value={filter}
        onChange={setFilter}
        options={[
          { label: `Due (${due.length})`, value: 'due' },
          { label: 'Done', value: 'mine' },
          { label: 'All', value: 'all' },
        ]}
      />

      {filter === 'due' ? (
        <FieldList
          rows={due}
          isLoading={agreements.isLoading || inspections.isLoading}
          error={agreements.error ?? inspections.error}
          onRetry={() => void agreements.refetch()}
          keyOf={(agreement) => agreement.id}
          emptyText="Nothing waiting on the gate. Every harvest due in the next week has been inspected."
          renderCard={(agreement) => {
            const daysLate = dayjs().startOf('day').diff(dayjs(agreement.harvestDate!).startOf('day'), 'day');

            return (
              <FieldCard
                title={agreement.farmer?.fullName ?? 'Farmer'}
                onOpen={canInspect ? () => setFormOpen(true) : undefined}
                tags={
                  <>
                    <Tag>{agreement.cropName}</Tag>
                    {agreement.variety ? <Tag>{agreement.variety}</Tag> : null}
                    <Tag color={daysLate > 0 ? 'red' : daysLate === 0 ? 'gold' : 'blue'}>
                      {daysLate > 0
                        ? `${daysLate} day${daysLate === 1 ? '' : 's'} overdue`
                        : daysLate === 0
                          ? 'Due today'
                          : `Due in ${Math.abs(daysLate)} day${Math.abs(daysLate) === 1 ? '' : 's'}`}
                    </Tag>
                  </>
                }
                meta={
                  <>
                    {formatQuantity(agreement.expectedQuantity, 'KG')} expected · harvest{' '}
                    {formatDate(agreement.harvestDate)}
                    {agreement.farmer?.farmerCode ? (
                      <>
                        <br />
                        {agreement.farmer.farmerCode}
                      </>
                    ) : null}
                  </>
                }
              >
                {daysLate > 0 ? (
                  <Typography.Text type="danger" style={{ fontSize: 13 }}>
                    Procurement cannot collect this until it is inspected, and the crop is losing
                    quality in the meantime.
                  </Typography.Text>
                ) : null}

                {canInspect ? (
                  <Button
                    block
                    type="primary"
                    onClick={(event) => {
                      event.stopPropagation();
                      setEditing(null);
                      setFormOpen(true);
                    }}
                  >
                    Inspect this harvest
                  </Button>
                ) : null}
              </FieldCard>
            );
          }}
        />
      ) : (
        <>
          {filter === 'mine' ? (
            <MineToggle
              mineOnly={mineOnly}
              onChange={setMineOnly}
              total={all.length}
              shown={mine.length}
            />
          ) : null}

          <FieldList<HarvestInspection>
            rows={filter === 'all' ? all : history}
            isLoading={inspections.isLoading}
            error={inspections.error}
            onRetry={() => void inspections.refetch()}
            keyOf={(inspection) => inspection.id}
            emptyText="No inspections recorded yet"
            renderCard={(inspection) => {
              // Non-null means procurement has already acted on this judgement,
              // so the card offers no edit rather than letting the server refuse.
              const collected = Boolean(inspection.collection);

              return (
                <FieldCard
                  title={inspection.farmer?.fullName ?? 'Farmer'}
                  onOpen={
                    collected
                      ? undefined
                      : () => {
                          setEditing(inspection);
                          setFormOpen(true);
                        }
                  }
                  extra={
                    <Tag
                      color={RESULT_COLOUR[inspection.result]}
                      icon={
                        inspection.result === 'APPROVED' ? (
                          <CheckCircleOutlined />
                        ) : inspection.result === 'REJECTED' ? (
                          <CloseCircleOutlined />
                        ) : undefined
                      }
                    >
                      {inspection.result}
                    </Tag>
                  }
                  tags={
                    <>
                      <Tag>{inspection.cropName}</Tag>
                      {collected ? <Tag color="purple">Collected</Tag> : null}
                      {inspection.moistureLevel ? (
                        <Tag>{inspection.moistureLevel}% moisture</Tag>
                      ) : null}
                    </>
                  }
                  meta={
                    <>
                      {formatDate(inspection.inspectionDate)}
                      {inspection.inspectedBy ? ` · ${inspection.inspectedBy.fullName}` : ''}
                      {collected ? (
                        <>
                          <br />
                          Receipt {inspection.collection?.receiptNumber} — this inspection is now
                          fixed.
                        </>
                      ) : null}
                    </>
                  }
                />
              );
            }}
          />
        </>
      )}

      {canInspect && isMobile ? (
        <FieldFab
          label="Inspect"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        />
      ) : null}

      <HarvestInspectionFormModal
        open={formOpen}
        inspection={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />
    </Space>
  );
}
