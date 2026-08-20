import { PlusOutlined } from '@ant-design/icons';
import { Button, Card, Col, Row, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import type { SeedDistribution } from '../../api/types';
import { Can } from '../../components/Can';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { FarmerSelect } from '../../components/pickers';
import { useSeedDistribution } from '../../hooks/useSeedDistribution';
import { EM_DASH, formatDate, formatQuantity } from '../../utils/format';
import { RowActions } from '../../components/RowActions';
import { useDeleteSeedDistribution } from '../../hooks/useSeedDistribution';
import { SeedDistributionFormModal } from './SeedDistributionFormModal';

export function SeedDistributionPage() {
  const [farmerId, setFarmerId] = useState<string | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SeedDistribution | null>(null);
  const remove = useDeleteSeedDistribution();

  const openEdit = (record: SeedDistribution) => {
    setEditing(record);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };
  const distributions = useSeedDistribution({ farmerId });

  const columns: ColumnsType<SeedDistribution> = [
    {
      title: 'Date',
      dataIndex: 'distributionDate',
      key: 'distributionDate',
      width: 130,
      render: (value: string) => formatDate(value),
      sorter: (a, b) => a.distributionDate.localeCompare(b.distributionDate),
    },
    {
      title: 'Farmer',
      key: 'farmer',
      render: (_, row) => (
        <div>
          <div>{row.farmer?.fullName ?? EM_DASH}</div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.farmer?.farmerCode ?? 'pending approval'}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: 'Seed / input',
      key: 'seed',
      render: (_, row) => (
        <div>
          <div>{row.seedName}</div>
          {row.seedVariety ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.seedVariety}
            </Typography.Text>
          ) : null}
        </div>
      ),
    },
    {
      title: 'Quantity',
      key: 'quantity',
      align: 'right',
      render: (_, row) => formatQuantity(row.quantity, row.unit),
    },
    {
      title: 'Supplier batch',
      dataIndex: 'batchNumber',
      key: 'batchNumber',
      render: (value: string | null) =>
        value ? <Typography.Text code>{value}</Typography.Text> : EM_DASH,
    },
    {
      title: 'Issued by',
      key: 'distributedBy',
      render: (_, row) => row.distributedBy?.fullName ?? EM_DASH,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      fixed: 'right',
      render: (_, row) => (
        <RowActions
          entity="distribution record"
          label={`the ${row.seedName} handout`}
          can="SEED_DISTRIBUTION_EDIT"
          canDelete="SEED_DISTRIBUTION_DELETE"
          onEdit={() => openEdit(row)}
          onDelete={() => remove.mutateAsync(row.id)}
        />
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
        title="Seed & input distribution"
        subtitle="Certified seed and crop inputs issued to farmers (FRD Section 10). Recorded by the Agriculture Expert after handing stock over at the farm."
        actions={
          <Can do="SEED_DISTRIBUTION_CREATE">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
              Log distribution
            </Button>
          </Can>
        }
      />

      <DataTable<SeedDistribution>
        rows={distributions.data?.data}
        columns={columns}
        rowKey="id"
        isLoading={distributions.isLoading}
        isFetching={distributions.isFetching}
        error={distributions.error}
        onRetry={() => void distributions.refetch()}
        toolbar={toolbar}
        emptyText={farmerId ? 'Nothing issued to this farmer yet' : 'No distributions logged yet'}
      />

      <SeedDistributionFormModal open={formOpen} record={editing} onClose={closeForm} />
    </Card>
  );
}
