import { PlusOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import type { Branch, StaffUser } from '../../api/types';
import { ROLE_LABELS } from '../../auth/types';
import { useCan } from '../../auth/useCan';
import { Can } from '../../components/Can';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { useBranches } from '../../hooks/useBranches';
import { useUsers } from '../../hooks/useUsers';
import { UserFormModal } from './UserFormModal';

const STATUS_COLOURS: Record<StaffUser['status'], string> = {
  ACTIVE: 'green',
  INACTIVE: 'default',
  SUSPENDED: 'red',
};

export function UsersPage() {
  const [formOpen, setFormOpen] = useState(false);
  const canView = useCan('USER_VIEW');
  const users = useUsers(canView);
  const branches = useBranches();

  const branchName = useMemo(() => {
    const lookup = new Map<string, Branch>(
      (branches.data?.data ?? []).map((branch) => [branch.id, branch]),
    );
    return (id: string | null) => (id ? (lookup.get(id)?.name ?? id) : null);
  }, [branches.data]);

  const columns: ColumnsType<StaffUser> = [
    {
      title: 'Name',
      dataIndex: 'fullName',
      key: 'fullName',
      sorter: (a, b) => a.fullName.localeCompare(b.fullName),
      render: (name: string) => <Typography.Text strong>{name}</Typography.Text>,
    },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      filters: Object.entries(ROLE_LABELS).map(([value, label]) => ({ text: label, value })),
      onFilter: (value, user) => user.role === value,
      render: (role: StaffUser['role']) => <Tag color="blue">{ROLE_LABELS[role]}</Tag>,
    },
    {
      title: 'Branch',
      dataIndex: 'branchId',
      key: 'branchId',
      render: (id: string | null) =>
        branchName(id) ?? <Typography.Text type="secondary">Organisation-wide</Typography.Text>,
    },
    {
      title: 'Phone',
      dataIndex: 'phone',
      key: 'phone',
      render: (phone: string | null) => phone ?? <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status: StaffUser['status']) => <Tag color={STATUS_COLOURS[status]}>{status}</Tag>,
    },
  ];

  return (
    <Card>
      <PageHeader
        title="Users"
        subtitle="Staff accounts and roles. A user's role decides everything they can reach."
        actions={
          <Can do="USER_CREATE">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
              New user
            </Button>
          </Can>
        }
      />

      {!canView ? (
        <Alert
          type="info"
          showIcon
          message="Your role cannot list users"
          description="Viewing staff accounts is limited to Super Admin and Branch Manager."
        />
      ) : (
        <DataTable<StaffUser>
          rows={users.data?.data}
          columns={columns}
          rowKey="id"
          isLoading={users.isLoading}
          isFetching={users.isFetching}
          error={users.error}
          onRetry={() => void users.refetch()}
          emptyText="No users yet"
        />
      )}

      <UserFormModal open={formOpen} onClose={() => setFormOpen(false)} />
    </Card>
  );
}
