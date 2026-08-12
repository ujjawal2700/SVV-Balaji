import { PlusOutlined } from '@ant-design/icons';
import { App as AntApp, Button, Card, Col, Row, Select, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { apiErrorMessage } from '../../api/client';
import { AGREEMENT_STATUSES, type Agreement, type AgreementStatus } from '../../api/types';
import { useCan } from '../../auth/useCan';
import { Can } from '../../components/Can';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { FarmerSelect } from '../../components/pickers';
import { useAgreements, useSetAgreementStatus } from '../../hooks/useAgreements';
import { EM_DASH, formatCurrency, formatDate, formatQuantity } from '../../utils/format';
import { AgreementFormModal } from './AgreementFormModal';

const STATUS_COLOURS: Record<AgreementStatus, string> = {
  PENDING: 'gold',
  ACTIVE: 'green',
  COMPLETED: 'blue',
  CANCELLED: 'default',
};

export function AgreementsPage() {
  const { message } = AntApp.useApp();
  const [farmerId, setFarmerId] = useState<string | undefined>();
  const [formOpen, setFormOpen] = useState(false);

  const agreements = useAgreements(farmerId);
  const setStatus = useSetAgreementStatus();
  const canEdit = useCan('AGREEMENT_CREATE');

  const handleStatusChange = async (agreement: Agreement, status: AgreementStatus) => {
    try {
      await setStatus.mutateAsync({ id: agreement.id, status });
      message.success(`Agreement marked ${status.toLowerCase()}`);
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not change the status'));
    }
  };

  const columns: ColumnsType<Agreement> = [
    {
      title: 'Farmer',
      key: 'farmer',
      render: (_, agreement) => (
        <div>
          <div>{agreement.farmer?.fullName ?? EM_DASH}</div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {agreement.farmer?.farmerCode ?? 'pending approval'}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: 'Crop',
      key: 'crop',
      render: (_, agreement) => (
        <div>
          <div>{agreement.cropName}</div>
          {agreement.variety ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {agreement.variety}
            </Typography.Text>
          ) : null}
        </div>
      ),
    },
    {
      title: 'Expected qty',
      dataIndex: 'expectedQuantity',
      key: 'expectedQuantity',
      align: 'right',
      render: (value: string) => formatQuantity(value, 'KG'),
    },
    {
      title: 'Rate',
      dataIndex: 'purchaseRate',
      key: 'purchaseRate',
      align: 'right',
      render: (value: string) => (
        <span>
          {formatCurrency(value)}
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {' '}
            /KG
          </Typography.Text>
        </span>
      ),
    },
    {
      title: 'Agreed',
      dataIndex: 'agreementDate',
      key: 'agreementDate',
      render: (value: string) => formatDate(value),
      sorter: (a, b) => a.agreementDate.localeCompare(b.agreementDate),
    },
    {
      title: 'Harvest due',
      dataIndex: 'harvestDate',
      key: 'harvestDate',
      render: (value: string | null) => formatDate(value),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 160,
      render: (status: AgreementStatus, agreement) =>
        canEdit ? (
          <Select<AgreementStatus>
            size="small"
            value={status}
            style={{ width: 135 }}
            loading={setStatus.isPending}
            onChange={(next) => void handleStatusChange(agreement, next)}
            options={AGREEMENT_STATUSES.map((value) => ({
              value,
              label: value.charAt(0) + value.slice(1).toLowerCase(),
            }))}
          />
        ) : (
          <Tag color={STATUS_COLOURS[status]}>{status}</Tag>
        ),
    },
  ];

  const toolbar = (
    <Row gutter={[12, 12]}>
      <Col xs={24} md={10}>
        <FarmerSelect
          allowClear
          placeholder="Filter by farmer"
          value={farmerId}
          onChange={setFarmerId}
        />
      </Col>
    </Row>
  );

  return (
    <Card>
      <PageHeader
        title="Agreements"
        subtitle="Pre-season rate, quality and quantity agreements (FRD Section 9). The rate here is what a collection falls back to when none is entered at weighing."
        actions={
          <Can do="AGREEMENT_CREATE">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
              New agreement
            </Button>
          </Can>
        }
      />

      <DataTable<Agreement>
        rows={agreements.data?.data}
        columns={columns}
        rowKey="id"
        isLoading={agreements.isLoading}
        isFetching={agreements.isFetching}
        error={agreements.error}
        onRetry={() => void agreements.refetch()}
        toolbar={toolbar}
        emptyText={farmerId ? 'No agreements for this farmer' : 'No agreements yet'}
      />

      <AgreementFormModal open={formOpen} onClose={() => setFormOpen(false)} />
    </Card>
  );
}
