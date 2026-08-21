import { BarChartOutlined, PlusOutlined, UserOutlined } from '@ant-design/icons';
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
import { AssignManagerModal } from './AssignManagerModal';
import { BranchPerformanceDrawer } from './BranchPerformanceDrawer';
import { BranchComparisonDrawer } from './BranchComparisonDrawer';

export function BranchesPage() {
  const [editing, setEditing] = useState<Branch | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [showInactive, setShowInactive] = useState(true);
  const [assigning, setAssigning] = useState<Branch | null>(null);
  const [performanceOf, setPerformanceOf] = useState<Branch | null>(null);
  const [comparing, setComparing] = useState(false);

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
      /**
       * FRD 6.2. Blank is a real answer here, not missing data — a branch sits
       * between appointments — so it reads "Not assigned" rather than a dash.
       */
      title: 'Branch manager',
      key: 'manager',
      render: (_, branch) =>
        branch.manager ? (
          <Space direction="vertical" size={0}>
            <Typography.Text>{branch.manager.fullName}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {branch.manager.email}
            </Typography.Text>
          </Space>
        ) : (
          <Typography.Text type="secondary">Not assigned</Typography.Text>
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
      width: 320,
      fixed: 'right',
      render: (_, branch) => (
        <Space size={4}>
        <Can do="BRANCH_PERFORMANCE">
          <Button
            size="small"
            icon={<BarChartOutlined />}
            onClick={() => setPerformanceOf(branch)}
          >
            Performance
          </Button>
        </Can>
        <Can do="BRANCH_ASSIGN_MANAGER">
          <Button size="small" icon={<UserOutlined />} onClick={() => setAssigning(branch)}>
            Manager
          </Button>
        </Can>
        <RowActions
          entity="branch"
          label={branch.name}
          can="BRANCH_MANAGE"
          isActive={branch.isActive}
          onEdit={() => openEdit(branch)}
          onSetActive={(isActive) => setActive.mutateAsync({ id: branch.id, isActive })}
          onDelete={() => remove.mutateAsync(branch.id)}
        />
        </Space>
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
          <>
          <Can do="BRANCH_PERFORMANCE">
            <Button icon={<BarChartOutlined />} onClick={() => setComparing(true)}>
              Compare branches
            </Button>
          </Can>
          <Can do="BRANCH_CREATE">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
              New branch
            </Button>
          </Can>
          </>
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

      <BranchComparisonDrawer open={comparing} onClose={() => setComparing(false)} />
      <AssignManagerModal branch={assigning} onClose={() => setAssigning(null)} />
      <BranchPerformanceDrawer branch={performanceOf} onClose={() => setPerformanceOf(null)} />

      <BranchFormModal open={formOpen} branch={editing} onClose={closeForm} />
    </Card>
  );
}
