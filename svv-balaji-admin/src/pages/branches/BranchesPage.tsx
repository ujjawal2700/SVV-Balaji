import { PlusOutlined } from '@ant-design/icons';
import { Button, Card, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import type { Branch } from '../../api/types';
import { Can } from '../../components/Can';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { useBranches } from '../../hooks/useBranches';
import { BranchFormModal } from './BranchFormModal';

const columns: ColumnsType<Branch> = [
  {
    title: 'Branch',
    dataIndex: 'name',
    key: 'name',
    sorter: (a, b) => a.name.localeCompare(b.name),
    render: (name: string) => <Typography.Text strong>{name}</Typography.Text>,
  },
  { title: 'Location', dataIndex: 'location', key: 'location' },
  {
    title: 'Address',
    dataIndex: 'address',
    key: 'address',
    ellipsis: true,
  },
  {
    title: 'Contact',
    key: 'contact',
    render: (_, branch) =>
      branch.contactName || branch.contactPhone ? (
        <>
          {branch.contactName ? <div>{branch.contactName}</div> : null}
          {branch.contactPhone ? (
            <Typography.Text type="secondary">{branch.contactPhone}</Typography.Text>
          ) : null}
        </>
      ) : (
        <Typography.Text type="secondary">—</Typography.Text>
      ),
  },
  {
    title: 'Status',
    dataIndex: 'isActive',
    key: 'isActive',
    width: 110,
    render: (isActive: boolean) =>
      isActive ? <Tag color="green">Active</Tag> : <Tag>Inactive</Tag>,
  },
];

export function BranchesPage() {
  const [formOpen, setFormOpen] = useState(false);
  const branches = useBranches();

  return (
    <Card>
      <PageHeader
        title="Branches"
        subtitle="Operating locations. Every farmer, warehouse and user belongs to one (FRD Section 6)."
        actions={
          <Can do="BRANCH_CREATE">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
              New branch
            </Button>
          </Can>
        }
      />

      <DataTable<Branch>
        rows={branches.data?.data}
        columns={columns}
        rowKey="id"
        isLoading={branches.isLoading}
        isFetching={branches.isFetching}
        error={branches.error}
        onRetry={() => void branches.refetch()}
        emptyText="No branches yet. Create one before registering farmers."
      />

      <BranchFormModal open={formOpen} onClose={() => setFormOpen(false)} />
    </Card>
  );
}
