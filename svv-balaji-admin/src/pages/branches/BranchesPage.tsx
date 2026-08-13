import { PlusOutlined } from '@ant-design/icons';
import { Button, Card, Switch, Space, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import type { Branch } from '../../api/types';
import { Can } from '../../components/Can';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { RowActions } from '../../components/RowActions';
import { useBranches, useDeleteBranch, useSetBranchActive } from '../../hooks/useBranches';
import { BranchFormModal } from './BranchFormModal';

export function BranchesPage() {
  const [editing, setEditing] = useState<Branch | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [showInactive, setShowInactive] = useState(true);

  // The master screen always fetches every branch; the toggle filters the rows
  // already in hand rather than refetching, so flipping it is instant.
  const branches = useBranches();
  const setActive = useSetBranchActive();
  const remove = useDeleteBranch();

  const rows = (branches.data?.data ?? []).filter((b) => showInactive || b.isActive);
  const inactiveCount = (branches.data?.data ?? []).filter((b) => !b.isActive).length;

  const openEdit = (branch: Branch) => {
    setEditing(branch);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const columns: ColumnsType<Branch> = [
    {
      title: 'Branch',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (name: string, branch) => (
        <Typography.Text strong delete={!branch.isActive} type={branch.isActive ? undefined : 'secondary'}>
          {name}
        </Typography.Text>
      ),
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
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      fixed: 'right',
      render: (_, branch) => (
        <RowActions
          entity="branch"
          label={branch.name}
          can="BRANCH_MANAGE"
          isActive={branch.isActive}
          onEdit={() => openEdit(branch)}
          onSetActive={(isActive) => setActive.mutateAsync({ id: branch.id, isActive })}
          onDelete={() => remove.mutateAsync(branch.id)}
        />
      ),
    },
  ];

  const toolbar = (
    <Space>
      <Switch
        size="small"
        checked={showInactive}
        onChange={setShowInactive}
        id="branches-show-inactive"
      />
      <Typography.Text type="secondary">
        Show inactive
        {inactiveCount > 0 ? ` (${inactiveCount})` : ''}
      </Typography.Text>
    </Space>
  );

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
        rows={rows}
        columns={columns}
        rowKey="id"
        isLoading={branches.isLoading}
        isFetching={branches.isFetching}
        error={branches.error}
        onRetry={() => void branches.refetch()}
        toolbar={toolbar}
        emptyText="No branches yet. Create one before registering farmers."
      />

      <BranchFormModal open={formOpen} branch={editing} onClose={closeForm} />
    </Card>
  );
}
